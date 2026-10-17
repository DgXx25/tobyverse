import type { ChatMode, ChatTurn } from "@/types/chat";
import type { ChatStreamPart, ChatToolCall, ChatToolName } from "@/lib/ai/tools";
import type { AiUsageReporter } from "@/types/billing";

export type GenerateImagePart = {
  mimeType: string;
  data: string;
};

export type GenerateOptions = {
  model?: string;
  systemInstruction?: string;
  mode?: ChatMode;
  history?: ChatTurn[];
  json?: boolean;
  /** `true` = non-intercept tools. An array is that turn’s mode allowlist. Omit / false = no declarations. */
  tools?: boolean | readonly ChatToolName[];
  /** Force one function only for an explicit slash/chip selection. */
  toolChoice?: ChatToolName;
  /** Server-owned tool execution; artifact tools still dispatch on the client. */
  executeTool?: (call: ChatToolCall, options?: { signal: AbortSignal }) => Promise<unknown>;
  signal?: AbortSignal;
  images?: GenerateImagePart[];
  usage?: AiUsageReporter;
};

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  generateText(prompt: string, options?: GenerateOptions): Promise<string>;
  generateTextStream(prompt: string, options?: GenerateOptions): AsyncIterable<string>;
  generateToolStream?(prompt: string, options?: GenerateOptions): AsyncIterable<ChatStreamPart>;
}
