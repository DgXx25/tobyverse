import type { ChatMode, ChatTurn } from "@/types/chat";
import type { ChatStreamPart, ChatToolCall, ChatToolName } from "@/lib/ai/tools";
import type { AiUsageReporter } from "@/types/billing";
import type { AiEffort } from "@/lib/ai/catalog";

export type GenerateImagePart = {
  mimeType: string;
  data: string;
};

export type GenerateOptions = {
  model?: string;
  effort?: AiEffort;
  systemInstruction?: string;
  mode?: ChatMode;
  history?: ChatTurn[];
  json?: boolean;
  /** Optional output budget for bounded background tasks; ordinary chat keeps provider defaults. */
  maxOutputTokens?: number;
  /** Tool chat caches by default; repeated text workflows may opt in. One-off text transformations do not write cache. */
  cache?: boolean;
  /** `true` = non-intercept tools. An array is that turn’s mode allowlist. Omit / false = no declarations. */
  tools?: boolean | readonly ChatToolName[];
  /** Force one function only for an explicit slash/chip selection. */
  toolChoice?: ChatToolName;
  /** Server-owned tool execution; artifact tools still dispatch on the client. */
  executeTool?: (call: ChatToolCall, options?: { signal: AbortSignal }) => Promise<unknown>;
  signal?: AbortSignal;
  images?: GenerateImagePart[];
  usage?: AiUsageReporter;
  /** Include Anthropic's native, metered web search tool for this turn. */
  webSearch?: boolean;
  /** Require Anthropic's native web search on round one when a current lookup needs live evidence. */
  webSearchRequired?: boolean;
};

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  generateText(prompt: string, options?: GenerateOptions): Promise<string>;
  generateTextStream(prompt: string, options?: GenerateOptions): AsyncIterable<string>;
  generateToolStream?(prompt: string, options?: GenerateOptions): AsyncIterable<ChatStreamPart>;
}
