import {
  FunctionCallingMode,
  GoogleGenerativeAI,
  SchemaType,
  type Content,
  type FunctionDeclaration,
  type FunctionDeclarationSchemaProperty,
  type Part,
} from "@google/generative-ai";
import type { ChatTurn } from "@/types/chat";
import { historyWithoutCurrentPrompt } from "@/lib/composer/memory";
import type { AIProvider, GenerateOptions } from "@/lib/ai/types";
import {
  CHAT_TOOL_DEFINITIONS,
  INTERCEPT_ONLY_CHAT_TOOLS,
  parseToolCall,
  type ChatStreamPart,
  type ChatToolName,
} from "@/lib/ai/tools";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

function toContents(prompt: string, history: ChatTurn[] = [], images: GenerateOptions["images"] = []): Content[] {
  const contents: Content[] = historyWithoutCurrentPrompt(history, prompt)
    .filter((turn) => turn.content.trim().length > 0)
    .map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    }));

  const parts: Part[] = [{ text: prompt }];
  for (const image of images ?? []) {
    if (!image.data || !image.mimeType.startsWith("image/")) continue;
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }
  contents.push({ role: "user", parts });

  return contents;
}

const INTERCEPT_ONLY = new Set<ChatToolName>(INTERCEPT_ONLY_CHAT_TOOLS);

function allowedToolNames(tools: GenerateOptions["tools"]): ChatToolName[] | null {
  if (!tools) return null;
  if (tools === true) {
    return CHAT_TOOL_DEFINITIONS.map((def) => def.name).filter((name) => !INTERCEPT_ONLY.has(name));
  }
  const names = tools.filter((name) => name !== "answer" && !INTERCEPT_ONLY.has(name));
  return names.length > 0 ? [...names] : null;
}

function toGeminiDeclarations(allowed: readonly ChatToolName[]): FunctionDeclaration[] {
  return CHAT_TOOL_DEFINITIONS.filter((def) => allowed.includes(def.name)).map((def) => {
    const properties: Record<string, FunctionDeclarationSchemaProperty> = {};
    for (const [key, spec] of Object.entries(def.parameters.properties)) {
      if (spec.type === "integer") {
        properties[key] = { type: SchemaType.INTEGER, description: spec.description };
      } else if (spec.type === "array") {
        properties[key] = {
          type: SchemaType.ARRAY,
          description: spec.description,
          items: { type: SchemaType.STRING },
        };
      } else {
        properties[key] = { type: SchemaType.STRING, description: spec.description };
      }
    }
    const declaration: FunctionDeclaration = {
      name: def.name,
      description: def.description,
    };
    if (Object.keys(properties).length > 0) {
      declaration.parameters = {
        type: SchemaType.OBJECT,
        properties,
        required: def.parameters.required,
      };
    }
    return declaration;
  });
}

function partsFromChunk(chunk: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args: object } }> } }>;
}): ChatStreamPart {
  const parts = chunk.candidates?.[0]?.content?.parts ?? [];
  let text = "";
  let tool: ChatStreamPart["tool"];
  for (const part of parts) {
    if (part.text) text += part.text;
    if (part.functionCall && !tool) {
      tool = parseToolCall(part.functionCall.name, part.functionCall.args) ?? undefined;
    }
  }
  return { text: text || undefined, tool };
}

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  readonly name = "Google Gemini";

  private getModel(options: GenerateOptions = {}) {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();

    if (!apiKey) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set.");
    }

    const allowed = allowedToolNames(options.tools);
    const declarations = allowed ? toGeminiDeclarations(allowed) : [];
    const useTools = declarations.length > 0;
    return new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: options.model ?? DEFAULT_GEMINI_MODEL,
      systemInstruction: options.systemInstruction,
      tools: useTools ? [{ functionDeclarations: declarations }] : undefined,
      toolConfig: useTools
        ? { functionCallingConfig: { mode: FunctionCallingMode.AUTO } }
        : undefined,
      generationConfig: options.json ? { responseMimeType: "application/json" } : undefined,
    });
  }

  async generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
    const result = await this.getModel(options).generateContent({
      contents: toContents(prompt, options.history, options.images),
    });
    const text = result.response.text();

    if (!text) {
      throw new Error("Gemini returned an empty response.");
    }

    return text;
  }

  async *generateTextStream(prompt: string, options: GenerateOptions = {}): AsyncIterable<string> {
    const result = await this.getModel(options).generateContentStream({
      contents: toContents(prompt, options.history, options.images),
    });

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
  }

  async *generateToolStream(prompt: string, options: GenerateOptions = {}): AsyncIterable<ChatStreamPart> {
    const result = await this.getModel(options).generateContentStream({
      contents: toContents(prompt, options.history, options.images),
    });

    let used: ChatStreamPart["tool"];
    for await (const chunk of result.stream) {
      const part = partsFromChunk(chunk);
      if (part.text) yield { text: part.text };
      if (part.tool && !used) {
        used = part.tool;
        yield { tool: used };
      }
    }
  }
}

let currentProvider: AIProvider = new GeminiProvider();

export function getAIProvider(): AIProvider {
  return currentProvider;
}

export function setAIProvider(provider: AIProvider): void {
  currentProvider = provider;
}

let generateTextCalls = 0;

export function getGenerateTextCallCount(): number {
  return generateTextCalls;
}

export async function generateText(prompt: string, options?: GenerateOptions): Promise<string> {
  generateTextCalls += 1;
  return getAIProvider().generateText(prompt, options);
}

export async function* generateTextStream(
  prompt: string,
  options?: GenerateOptions,
): AsyncIterable<string> {
  yield* getAIProvider().generateTextStream(prompt, options);
}

export async function* generateToolStream(
  prompt: string,
  options?: GenerateOptions,
): AsyncIterable<ChatStreamPart> {
  const provider = getAIProvider();
  if (!provider.generateToolStream) {
    throw new Error("This provider has no tools.");
  }
  yield* provider.generateToolStream(prompt, options);
}
