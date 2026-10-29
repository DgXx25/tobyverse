import type { ChatTurn } from "@/types/chat";
import type { AiCallUsage } from "@/types/billing";
import type { AIProvider, GenerateOptions } from "@/lib/ai/types";
import { eligibleChatToolDefinitions, eligibleChatToolNames, isArtifactTool, isInternalTool, parseToolCall, type ChatStreamPart, type ChatToolCall } from "@/lib/ai/tools";
import { chatToolDefinition } from "@/lib/ai/tools";
import type { ChatToolName } from "@/lib/ai/tools";
import { toolFallbackText } from "@/lib/ai/tool-execution";
import { withAnthropicCache } from "@/lib/ai/prompt-cache";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MAX_TOOL_ROUNDS = 4;

type AnthropicBlock = Record<string, unknown> & { type: string };
type AnthropicMessage = { content: AnthropicBlock[]; usage: AiCallUsage; stopReason: string | null };
type AnthropicUsage = {
  input_tokens?: unknown; output_tokens?: unknown;
  cache_read_input_tokens?: unknown; cache_creation_input_tokens?: unknown;
  cache_creation?: { ephemeral_1h_input_tokens?: unknown };
  server_tool_use?: { web_search_requests?: unknown };
};
type StreamEvent = { type?: string; [key: string]: unknown };

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function anthropicCallUsage(model: string, message: { usage?: AnthropicUsage }): AiCallUsage | null {
  if (!message.usage) return null;
  const cacheReadInputTokens = asCount(message.usage.cache_read_input_tokens);
  const cacheWriteInputTokens = asCount(message.usage.cache_creation_input_tokens);
  const cacheWrite1hInputTokens = Math.min(cacheWriteInputTokens, asCount(message.usage.cache_creation?.ephemeral_1h_input_tokens));
  const inputTokens = asCount(message.usage.input_tokens) + cacheReadInputTokens + cacheWriteInputTokens;
  const outputTokens = asCount(message.usage.output_tokens);
  return { provider: "anthropic", model, inputTokens, outputTokens, thinkingTokens: 0, totalTokens: inputTokens + outputTokens,
    cacheReadInputTokens, cacheWriteInputTokens, cacheWrite1hInputTokens,
    webSearchRequests: asCount(message.usage.server_tool_use?.web_search_requests) };
}

function toHistory(history: ChatTurn[] = [], prompt: string): Array<{ role: "user" | "assistant"; content: string }> {
  return history
    .filter((turn, index, turns) => turn.content.trim() && !(index === turns.length - 1 && turn.role === "user" && turn.content.trim() === prompt.trim()))
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
      // Log only a small, structured error summary. The full provider body is
      // deliberately never returned to the browser and may contain request data.
      const providerError = await response.clone().json().catch(() => null) as {
        error?: { type?: unknown; message?: unknown };
        request_id?: unknown;
      } | null;
      const safeText = (value: unknown, limit: number) => typeof value === "string"
        ? value.replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, limit)
        : undefined;
      console.warn("[anthropic] request rejected", JSON.stringify({
        status: response.status,
        type: safeText(providerError?.error?.type, 80),
        message: safeText(providerError?.error?.message, 240),
        requestId: safeText(providerError?.request_id ?? response.headers.get("request-id"), 96),
      }));
      throw new Error(`Claude request failed (HTTP ${response.status}).`);
    }
    let usage: AnthropicUsage = {};
    let stopReason: string | null = null;
    const blocks = new Map<number, AnthropicBlock>();
    const jsonArguments = new Map<number, string>();
    for await (const event of sseEvents(response.body, signal)) {
      if (event.type === "message_start") {
        usage = { ...(event.message as { usage?: AnthropicUsage } | undefined)?.usage };
      } else if (event.type === "content_block_start") {
        const index = asCount(event.index);
        const block = event.content_block as AnthropicBlock | undefined;
        if (block) {
          blocks.set(index, { ...block });
          if (block.type === "tool_use" || block.type === "server_tool_use") jsonArguments.set(index, "");
        }
      } else if (event.type === "content_block_delta") {
        const index = asCount(event.index);
        const delta = event.delta as { type?: string; text?: string; thinking?: string; signature?: string; partial_json?: string; citation?: unknown } | undefined;
        if (delta?.type === "text_delta" && delta.text) {
          const block = blocks.get(index);
          if (block?.type === "text") blocks.set(index, { ...block, text: `${typeof block.text === "string" ? block.text : ""}${delta.text}` });
          yield delta.text;
        }
        if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
          const block = blocks.get(index);
          if (block?.type === "thinking") {
            blocks.set(index, { ...block, thinking: `${typeof block.thinking === "string" ? block.thinking : ""}${delta.thinking}` });
          }
        }
        if (delta?.type === "signature_delta" && typeof delta.signature === "string") {
          const block = blocks.get(index);
          if (block?.type === "thinking") {
            blocks.set(index, { ...block, signature: `${typeof block.signature === "string" ? block.signature : ""}${delta.signature}` });
          }
        }
        if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
          jsonArguments.set(index, (jsonArguments.get(index) ?? "") + delta.partial_json);
        }
        if (delta?.type === "citations_delta" && delta.citation && typeof delta.citation === "object") {
          const block = blocks.get(index);
          if (block?.type === "text") {
            const citations = Array.isArray(block.citations) ? block.citations : [];
            blocks.set(index, { ...block, citations: [...citations, delta.citation] });
          }
        }
      } else if (event.type === "message_delta") {
        // message_delta usage is cumulative; merge it, never sum start/delta events.
        const deltaUsage = event.usage as AnthropicUsage | undefined;
        usage = { ...usage, ...deltaUsage, server_tool_use: {
          web_search_requests: Math.max(asCount(usage.server_tool_use?.web_search_requests), asCount(deltaUsage?.server_tool_use?.web_search_requests)),
        } };
        const delta = event.delta as { stop_reason?: unknown } | undefined;
        if (typeof delta?.stop_reason === "string") stopReason = delta.stop_reason;
      }
    }
    const content = [...blocks.entries()].sort(([a], [b]) => a - b).map(([index, block]) => {
      const partial = jsonArguments.get(index);
      if ((block.type !== "tool_use" && block.type !== "server_tool_use") || !partial) return block;
      try { return { ...block, input: JSON.parse(partial) as unknown }; }
      catch { return { ...block, input: {} }; }
    });
    const callUsage = anthropicCallUsage(model, { usage })!;
    console.info("[ai-cache]", JSON.stringify({ model, input: callUsage.inputTokens,
      read: callUsage.cacheReadInputTokens, write: callUsage.cacheWriteInputTokens, output: callUsage.outputTokens }));
    yield { done: { content, usage: callUsage, stopReason } };
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
    // One-off transformations do not benefit from writing their unique input to
    // cache. Repeated text workflows can opt in; conversational history opts in.
    const stream = this.streamMessage(withAnthropicCache({ max_tokens: options.maxOutputTokens ?? 8192, system: options.systemInstruction, messages, ...(options.effort ? { output_config: { effort: options.effort } } : {}) }, options.cache ?? Boolean(options.history?.length), Boolean(options.history?.length)), model, options.signal);
    for await (const item of stream) {
      if (typeof item === "string") yield item;
      else options.usage?.(item.done.usage);
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
    const tools: Array<Record<string, unknown>> = eligibleChatToolDefinitions(options.mode ?? "auto")
      .filter(({ name }) => names.includes(name))
      .map(({ name, description, parameters }) => ({ name, description, input_schema: parameters }));
    if (options.webSearch !== false) {
      const weatherTurn = /For (?:a request about )?current or future weather/i.test(options.systemInstruction ?? "");
      const georgianWeatherTurn = /For a Georgian city, the first search must target amindige\.com/i.test(options.systemInstruction ?? "");
      tools.push({
        type: "web_search_20250305",
        name: "web_search",
        max_uses: weatherTurn ? 2 : 1,
        ...(georgianWeatherTurn ? { allowed_domains: ["meteo.gov.ge", "amindige.com", "amindi.net"] } : {}),
      });
    }
    const messages: Array<Record<string, unknown>> = [
      ...toHistory(options.history, prompt),
      { role: "user", content: prompt },
    ];
    let selectedTool: ChatToolCall | null = null;
    let lastUsage: AnthropicMessage | null = null;
    const citationBlocks: AnthropicBlock[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const body: Record<string, unknown> = {
        max_tokens: options.maxOutputTokens ?? 8192,
        system: options.systemInstruction,
        messages,
        ...(options.effort ? { output_config: { effort: options.effort } } : {}),
        ...(tools.length ? { tools } : {}),
        ...(round === 0 && options.webSearchRequired
          ? { tool_choice: { type: "tool", name: "web_search" } }
          : round === 0 && options.toolChoice
            ? { tool_choice: { type: "tool", name: options.toolChoice } }
            : {}),
      };
      let turn: AnthropicMessage | null = null;
      const stream = this.streamMessage(withAnthropicCache(body, options.cache !== false), model, options.signal);
      for await (const item of stream) {
        if (typeof item === "string") yield { text: item };
        else turn = item.done;
      }
      if (!turn) throw new Error("Claude returned an incomplete response.");
      lastUsage = turn;
      citationBlocks.push(...turn.content);
      options.usage?.(turn.usage);
      const calls = turn.content.filter((block) => block.type === "tool_use");
      if (!calls.length) {
        if (turn.stopReason === "pause_turn") {
          messages.push({ role: "assistant", content: turn.content });
          continue;
        }
        break;
      }

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

    const citations = searchCitationLinks(citationBlocks);
    if (citations) yield { text: citations };
    if (selectedTool) yield { tool: selectedTool };
    if (!lastUsage?.content.some((block) => block.type === "text" && typeof block.text === "string" && block.text.trim())) {
      yield { text: toolFallbackText(/[\u10A0-\u10FF]/.test(prompt)) };
    }
  }
}

function searchCitationLinks(blocks: AnthropicBlock[]): string {
  const links = new Map<string, string>();
  // Cite the evidence actually used in the answer first. Earlier raw search
  // hits must not crowd a cited primary source out of the five-site UI limit.
  const ordered = [...blocks.filter(block => block.type === "text"), ...blocks.filter(block => block.type !== "text")];
  for (const block of ordered) {
    const values = block.type === "text" && Array.isArray(block.citations)
      ? block.citations
      : block.type === "web_search_tool_result" && Array.isArray(block.content)
        ? block.content
        : [];
    for (const value of values) {
      if (!value || typeof value !== "object") continue;
      const citation = value as { type?: unknown; url?: unknown; title?: unknown };
      if (
        (citation.type !== "web_search_result_location" && citation.type !== "web_search_result") ||
        typeof citation.url !== "string"
      ) continue;
      try {
        const url = new URL(citation.url);
        if (url.protocol !== "https:" && url.protocol !== "http:") continue;
        const title = typeof citation.title === "string" && citation.title.trim() ? citation.title.trim() : url.hostname;
        links.set(url.toString(), title.replace(/[\[\]\\]/g, "\\$&").replace(/[\r\n]+/g, " "));
      } catch { /* Ignore malformed citation URLs. */ }
    }
  }
  const rows = [...links.entries()].slice(0, 5).map(([url, title]) => `- [${title}](${url})`);
  return rows.length ? `\n\nSources:\n${rows.join("\n")}` : "";
}
