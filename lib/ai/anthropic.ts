import type { ChatTurn } from "@/types/chat";
import type { AiCallUsage } from "@/types/billing";
import type { AIProvider, GenerateOptions } from "@/lib/ai/types";
import { eligibleChatToolDefinitions, eligibleChatToolNames, isArtifactTool, isInternalTool, parseToolCall, type ChatStreamPart, type ChatToolCall } from "@/lib/ai/tools";
import { chatToolDefinition } from "@/lib/ai/tools";
import type { ChatToolName } from "@/lib/ai/tools";
import { toolFallbackText } from "@/lib/ai/tool-execution";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MAX_TOOL_ROUNDS = 4;

type AnthropicBlock = Record<string, unknown> & { type: string };
type AnthropicMessage = { content: AnthropicBlock[]; inputTokens: number; outputTokens: number };
type StreamEvent = { type?: string; [key: string]: unknown };

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function anthropicCallUsage(model: string, message: { usage?: { input_tokens?: unknown; output_tokens?: unknown } }): AiCallUsage | null {
  if (!message.usage) return null;
  const inputTokens = asCount(message.usage.input_tokens);
  const outputTokens = asCount(message.usage.output_tokens);
  return { provider: "anthropic", model, inputTokens, outputTokens, thinkingTokens: 0, totalTokens: inputTokens + outputTokens };
}

function toHistory(history: ChatTurn[] = [], prompt: string): Array<{ role: "user" | "assistant"; content: string }> {
  return history
    .filter((turn) => turn.content.trim() && turn.content.trim() !== prompt.trim())
    .slice(-20)
    .map((turn) => ({ role: turn.role, content: turn.content }));
}

function toolNames(options: GenerateOptions): ChatToolName[] {
  const eligible = eligibleChatToolNames(options.mode ?? "auto");
  if (!options.tools) return [];
  if (options.tools === true) return eligible;
  const requested = new Set(options.tools);
  return eligible.filter((name) => requested.has(name));
}

function jsonResult(value: unknown): string {
  try { return JSON.stringify(value ?? null); } catch { return "null"; }
}

async function* sseEvents(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
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
          try { yield JSON.parse(data) as StreamEvent; } catch { /* Ignore malformed keepalive frames. */ }
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic Claude";

  private async *streamMessage(body: Record<string, unknown>, model: string, signal?: AbortSignal): AsyncGenerator<string | { done: AnthropicMessage }> {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) throw new Error("Claude is not configured yet. Add ANTHROPIC_API_KEY to the server environment.");
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({ ...body, model, stream: true }),
      signal,
    });
    if (!response.ok || !response.body) {
      // Avoid returning provider response bodies, which can contain sensitive request data.
      throw new Error(`Claude request failed (HTTP ${response.status}).`);
    }
    let inputTokens = 0;
    let outputTokens = 0;
    const blocks = new Map<number, AnthropicBlock>();
    const jsonArguments = new Map<number, string>();
    for await (const event of sseEvents(response.body, signal)) {
      if (event.type === "message_start") {
        const usage = (event.message as { usage?: { input_tokens?: unknown } } | undefined)?.usage;
        inputTokens = asCount(usage?.input_tokens);
      } else if (event.type === "content_block_start") {
        const index = asCount(event.index);
        const block = event.content_block as AnthropicBlock | undefined;
        if (block) {
          blocks.set(index, { ...block });
          if (block.type === "tool_use") jsonArguments.set(index, "");
        }
      } else if (event.type === "content_block_delta") {
        const index = asCount(event.index);
        const delta = event.delta as { type?: string; text?: string; partial_json?: string } | undefined;
        if (delta?.type === "text_delta" && delta.text) {
          const block = blocks.get(index);
          if (block?.type === "text") blocks.set(index, { ...block, text: `${typeof block.text === "string" ? block.text : ""}${delta.text}` });
          yield delta.text;
        }
        if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
          jsonArguments.set(index, (jsonArguments.get(index) ?? "") + delta.partial_json);
        }
      } else if (event.type === "message_delta") {
        const usage = event.usage as { output_tokens?: unknown } | undefined;
        outputTokens = asCount(usage?.output_tokens);
      }
    }
    const content = [...blocks.entries()].sort(([a], [b]) => a - b).map(([index, block]) => {
      const partial = jsonArguments.get(index);
      if (block.type !== "tool_use" || !partial) return block;
      try { return { ...block, input: JSON.parse(partial) as unknown }; }
      catch { return { ...block, input: {} }; }
    });
    yield { done: { content, inputTokens, outputTokens } };
  }

  async generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
    let answer = "";
    for await (const delta of this.generateTextStream(prompt, options)) answer += delta;
    if (!answer) throw new Error("Claude returned an empty response.");
    return answer;
  }

  async *generateTextStream(prompt: string, options: GenerateOptions = {}): AsyncIterable<string> {
    const model = options.model ?? "claude-haiku-5-5";
    this.rejectImages(options);
    const messages = [...toHistory(options.history, prompt), { role: "user" as const, content: prompt }];
    const stream = this.streamMessage({ max_tokens: options.maxOutputTokens ?? 8192, system: options.systemInstruction, messages }, model, options.signal);
    for await (const item of stream) {
      if (typeof item === "string") yield item;
      else options.usage?.({ provider: "anthropic", model, inputTokens: item.done.inputTokens, outputTokens: item.done.outputTokens, thinkingTokens: 0, totalTokens: item.done.inputTokens + item.done.outputTokens });
    }
  }

  private rejectImages(options: GenerateOptions): void {
    if (options.images?.some((image) => image.data && image.mimeType.startsWith("image/"))) {
      throw new Error("Image input is temporarily unavailable. Remove the image and try again.");
    }
  }

  async *generateToolStream(prompt: string, options: GenerateOptions = {}): AsyncIterable<ChatStreamPart> {
    const model = options.model ?? "claude-haiku-5-5";
    this.rejectImages(options);
    const names = toolNames(options);
    const tools = eligibleChatToolDefinitions(options.mode ?? "auto")
      .filter(({ name }) => names.includes(name))
      .map(({ name, description, parameters }) => ({ name, description, input_schema: parameters }));
    const messages: Array<Record<string, unknown>> = [
      ...toHistory(options.history, prompt),
      { role: "user", content: prompt },
    ];
    let selectedTool: ChatToolCall | null = null;
    let lastUsage: AnthropicMessage | null = null;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const body: Record<string, unknown> = {
        max_tokens: options.maxOutputTokens ?? 8192,
        system: options.systemInstruction,
        messages,
        ...(tools.length ? { tools } : {}),
        ...(options.toolChoice ? { tool_choice: { type: "tool", name: options.toolChoice } } : {}),
      };
      let turn: AnthropicMessage | null = null;
      const stream = this.streamMessage(body, model, options.signal);
      for await (const item of stream) {
        if (typeof item === "string") yield { text: item };
        else turn = item.done;
      }
      if (!turn) throw new Error("Claude returned an incomplete response.");
      lastUsage = turn;
      options.usage?.({ provider: "anthropic", model, inputTokens: turn.inputTokens, outputTokens: turn.outputTokens, thinkingTokens: 0, totalTokens: turn.inputTokens + turn.outputTokens });
      const calls = turn.content.filter((block) => block.type === "tool_use");
      if (!calls.length) break;

      messages.push({ role: "assistant", content: turn.content });
      const results: Array<Record<string, unknown>> = [];
      let stopAfterArtifact = false;
      for (const block of calls) {
        const call = parseToolCall(String(block.name ?? ""), block.input);
        if (!call) {
          results.push({ type: "tool_result", tool_use_id: block.id, content: "Invalid tool arguments.", is_error: true });
          continue;
        }
        if (!isInternalTool(call.name) && (!selectedTool || (selectedTool.name === "answer" && call.name !== "answer"))) selectedTool = call;
        const outcome = await chatToolDefinition(call.name).execute({
          call,
          invoke: async (current) => options.executeTool
            ? options.executeTool(current, { signal: options.signal ?? new AbortController().signal })
            : { ok: true, tool: current.name },
        });
        results.push({ type: "tool_result", tool_use_id: block.id, content: jsonResult(outcome) });
        if (isArtifactTool(call.name)) stopAfterArtifact = true;
      }
      if (stopAfterArtifact) {
        if (selectedTool) yield { tool: selectedTool };
        return;
      }
      messages.push({ role: "user", content: results });
    }

    if (selectedTool) yield { tool: selectedTool };
    if (!lastUsage?.content.some((block) => block.type === "text" && typeof block.text === "string" && block.text.trim())) {
      yield { text: toolFallbackText(/[\u10A0-\u10FF]/.test(prompt)) };
    }
  }
}
