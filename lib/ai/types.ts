import type { ChatMode, ChatTurn } from "@/types/chat";
import type { ChatStreamPart } from "@/lib/ai/tools";

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
  tools?: boolean;
  images?: GenerateImagePart[];
};

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  generateText(prompt: string, options?: GenerateOptions): Promise<string>;
  generateTextStream(prompt: string, options?: GenerateOptions): AsyncIterable<string>;
  generateToolStream?(prompt: string, options?: GenerateOptions): AsyncIterable<ChatStreamPart>;
}
