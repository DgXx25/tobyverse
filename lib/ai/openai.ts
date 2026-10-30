import type { ChatTurn } from "@/types/chat";
import type { AiCallUsage } from "@/types/billing";
import type { AIProvider, GenerateOptions } from "@/lib/ai/types";
import {
  chatToolDefinition,
  eligibleChatToolDefinitions,
  eligibleChatToolNames,
  isArtifactTool,
  isInternalTool,
  parseToolCall,
  toOpenAITools,
  type ChatStreamPart,
  type ChatToolCall,
  type ChatToolName,
} from "@/lib/ai/tools";
import { toolFallbackText } from "@/lib/ai/tool-execution";

const DEFAULT_MODEL = "gpt-6-luna";
const MAX_TOOL_ROUNDS = 4;

type OpenAIUsage = {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  total_tokens?: unknown;
  prompt_tokens_details?: { cached_tokens?: unknown };
  completion_tokens_details?: { reasoning_tokens?: unknown };
  prompt_cache_hit_tokens?: unknown;
  reasoning_tokens?: unknown;
};

type CompatibleProviderConfig = {
  id: "openai" | "deepseek";
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  defaultModel: string;
  maxTokensField: "max_completion_tokens" | "max_tokens";
};

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function openAICallUsage(model: string, usage?: OpenAIUsage, provider: "openai" | "deepseek" = "openai"): AiCallUsage | null {
  if (!usage) return null;
  const totalInput = count(usage.prompt_tokens);
  const cached = Math.min(totalInput, count(usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens));
  const completion = count(usage.completion_tokens);
  const reasoning = Math.min(completion, count(usage.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens));
  const inputTokens = totalInput;
  const outputTokens = completion - reasoning;
  return {
    provider,
    model,
    inputTokens,
    outputTokens,
    thinkingTokens: reasoning,
    totalTokens: count(usage.total_tokens) || inputTokens + completion,
    ...(cached ? { cacheReadInputTokens: cached } : {}),
  };
}

function toHistory(history: ChatTurn[] = [], prompt: string): Array<{ role: "user" | "assistant"; content: string }> {
  return history
    .filter((turn, index, turns) => turn.content.trim() && !(index === turns.length - 1 && turn.role === "user" && turn.content.trim() === prompt.trim()))
    .map(({ role, content }) => ({ role, content }));
}

function toolNames(options: GenerateOptions): ChatToolName[] {
  const eligible = eligibleChatToolNames(options.mode ?? "auto");
  if (!options.tools) return [];
  if (options.tools === true) return eligible;
  const requested = new Set(options.tools);
  return eligible.filter((name) => requested.has(name));
}

function imageUrl(mimeType: string, data: string): string {
  return data.startsWith("data:") ? data : `data:${mimeType};base64,${data}`;
}

function userContent(prompt: string, options: GenerateOptions): string | Array<Record<string, unknown>> {
  const images = options.images?.filter((image) => image.data && image.mimeType.startsWith("image/")) ?? [];
  if (!images.length) return prompt;
  return [
    { type: "text", text: prompt },
    ...images.map((image) => ({ type: "image_url", image_url: { url: imageUrl(image.mimeType, image.data), detail: "auto" } })),
  ];
}

async function* events(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
        if (data && data !== "[DONE]") {
          try { yield JSON.parse(data) as Record<string, unknown>; } catch { /* Ignore malformed keepalive frames. */ }
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id: CompatibleProviderConfig["id"];
  readonly name: string;

  constructor(private readonly config: CompatibleProviderConfig) {
    this.id = config.id;
    this.name = config.name;
  }

  private usage(model: string, usage?: OpenAIUsage) {
    return openAICallUsage(model, usage, this.config.id);
  }

  private requestFields(model: string, options: GenerateOptions, toolsEnabled = false): Record<string, unknown> {
    const maxTokens = options.maxOutputTokens ? { [this.config.maxTokensField]: options.maxOutputTokens } : {};
    if (this.config.id === "deepseek") {
      const effort = options.effort === "xhigh" ? "high" : options.effort === "max" ? "max" : options.effort === "medium" ? "high" : options.effort ?? "high";
      return {
        ...maxTokens,
        thinking: { type: toolsEnabled ? "disabled" : "enabled" },
        ...(!toolsEnabled ? { reasoning_effort: effort } : {}),
      };
    }
    return {
      ...maxTokens,
      ...(model === "gpt-6-luna" && toolsEnabled
        ? { reasoning_effort: "none" }
        : options.effort && (model.startsWith("gpt-5") || model === "gpt-6-luna")
          ? { reasoning_effort: model.startsWith("gpt-5") && options.effort === "max" ? "xhigh" : options.effort }
          : {}),
    };
  }

  private async *streamMessage(body: Record<string, unknown>, model: string, options: GenerateOptions): AsyncGenerator<string | { done: AiCallUsage | null } | { call: { index: number; id?: string; name?: string; arguments: string } }> {
    const apiKey = process.env[this.config.apiKeyEnv]?.trim();
    if (!apiKey) throw new Error(`${this.name} is not configured yet. Add ${this.config.apiKeyEnv} to the server environment.`);
    const endpoint = `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ ...body, model, stream: true, stream_options: { include_usage: true } }),
      signal: options.signal,
    });
    if (!response.ok || !response.body) {
      const error = await response.clone().json().catch(() => null) as { error?: { type?: unknown; code?: unknown }; request_id?: unknown } | null;
      const safe = (value: unknown) => typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, 100) : undefined;
      console.warn(`[${this.config.id}] request rejected`, JSON.stringify({ status: response.status, type: safe(error?.error?.type), code: safe(error?.error?.code), requestId: safe(error?.request_id ?? response.headers.get("x-request-id")) }));
      throw new Error(`${this.name} request failed (HTTP ${response.status}).`);
    }

    const calls = new Map<number, { index: number; id?: string; name?: string; arguments: string }>();
    let usage: AiCallUsage | null = null;
    for await (const event of events(response.body, options.signal)) {
      const choice = (event.choices as Array<{ delta?: { content?: unknown; tool_calls?: Array<{ index?: unknown; id?: unknown; function?: { name?: unknown; arguments?: unknown } }> } }> | undefined)?.[0];
      const delta = choice?.delta;
      if (typeof delta?.content === "string" && delta.content) yield delta.content;
      for (const fragment of delta?.tool_calls ?? []) {
        const index = count(fragment.index);
        const call = calls.get(index) ?? { index, arguments: "" };
        if (typeof fragment.id === "string") call.id = fragment.id;
        if (typeof fragment.function?.name === "string") call.name = (call.name ?? "") + fragment.function.name;
        if (typeof fragment.function?.arguments === "string") call.arguments += fragment.function.arguments;
        calls.set(index, call);
      }
      usage = this.usage(model, event.usage as OpenAIUsage | undefined) ?? usage;
    }
    yield { done: usage };
    for (const call of [...calls.values()].sort((a, b) => a.index - b.index)) yield { call };
  }

  async generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
    let text = "";
    for await (const part of this.generateTextStream(prompt, options)) text += part;
    if (!text) throw new Error("OpenAI returned an empty response.");
    return text;
  }

  async *generateTextStream(prompt: string, options: GenerateOptions = {}): AsyncIterable<string> {
    const model = options.model ?? this.config.defaultModel;
    const messages: Array<Record<string, unknown>> = [
      ...(options.systemInstruction ? [{ role: "system", content: options.systemInstruction }] : []),
      ...toHistory(options.history, prompt),
      { role: "user", content: userContent(prompt, options) },
    ];
    const body: Record<string, unknown> = {
      messages,
      ...this.requestFields(model, options),
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    };
    for await (const part of this.streamMessage(body, model, options)) {
      if (typeof part === "string") yield part;
      else if ("done" in part && part.done) options.usage?.(part.done);
    }
  }

  async *generateToolStream(prompt: string, options: GenerateOptions = {}): AsyncIterable<ChatStreamPart> {
    const model = options.model ?? this.config.defaultModel;
    const names = toolNames(options);
    const definitions = eligibleChatToolDefinitions(options.mode ?? "auto").filter(({ name }) => names.includes(name));
    const tools = definitions.length ? toOpenAITools(definitions) : [];
    const messages: Array<Record<string, unknown>> = [
      ...(options.systemInstruction ? [{ role: "system", content: options.systemInstruction }] : []),
      ...toHistory(options.history, prompt),
      { role: "user", content: userContent(prompt, options) },
    ];
    let selectedTool: ChatToolCall | null = null;
    let emittedText = false;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const body: Record<string, unknown> = {
        messages,
        ...this.requestFields(model, options, tools.length > 0),
        ...(tools.length ? { tools, tool_choice: round === 0 && options.toolChoice ? { type: "function", function: { name: options.toolChoice } } : "auto" } : {}),
      };
      const assistantText: string[] = [];
      const toolCalls: Array<{ id?: string; name?: string; arguments: string }> = [];
      for await (const part of this.streamMessage(body, model, options)) {
        if (typeof part === "string") {
          assistantText.push(part);
          emittedText = true;
          yield { text: part };
        } else if ("done" in part) {
          if (part.done) options.usage?.(part.done);
        } else if ("call" in part) {
          toolCalls[part.call.index] = { id: part.call.id, name: part.call.name, arguments: part.call.arguments };
        }
      }
      if (!toolCalls.length) break;

      messages.push({
        role: "assistant",
        content: assistantText.join("") || null,
        tool_calls: toolCalls.map((call, index) => ({ id: call.id ?? `call_${round}_${index}`, type: "function", function: { name: call.name ?? "", arguments: call.arguments } })),
      });
      let stopAfterArtifact = false;
      for (let index = 0; index < toolCalls.length; index += 1) {
        const raw = toolCalls[index];
        let args: unknown = {};
        try { args = JSON.parse(raw.arguments || "{}"); } catch { args = {}; }
        const call = parseToolCall(raw.name, args);
        if (!call) {
          messages.push({ role: "tool", tool_call_id: raw.id ?? `call_${round}_${index}`, content: "Invalid tool arguments." });
          continue;
        }
        if (!isInternalTool(call.name) && (!selectedTool || (selectedTool.name === "answer" && call.name !== "answer"))) selectedTool = call;
        const outcome = await chatToolDefinition(call.name).execute({
          call,
          invoke: async (current) => options.executeTool
            ? options.executeTool(current, { signal: options.signal ?? new AbortController().signal })
            : { ok: true, tool: current.name },
        });
        messages.push({ role: "tool", tool_call_id: raw.id ?? `call_${round}_${index}`, content: JSON.stringify(outcome ?? null) });
        if (isArtifactTool(call.name)) stopAfterArtifact = true;
      }
      if (stopAfterArtifact) {
        if (selectedTool) yield { tool: selectedTool };
        return;
      }
    }

    if (selectedTool) yield { tool: selectedTool };
    if (!emittedText && !selectedTool) yield { text: toolFallbackText(/[\u10A0-\u10FF]/.test(prompt)) };
  }
}

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor() {
    super({ id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY", defaultModel: DEFAULT_MODEL, maxTokensField: "max_completion_tokens" });
  }
}

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor() {
    super({ id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com", apiKeyEnv: "DEEPSEEK_API_KEY", defaultModel: "deepseek-flash", maxTokensField: "max_tokens" });
  }
}
