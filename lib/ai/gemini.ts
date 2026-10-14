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
import { DEFAULT_GEMINI_MODEL } from "@/lib/ai/catalog";
import type { AiCallUsage } from "@/types/billing";
import {
  chatToolDefinition,
  eligibleChatToolDefinitions,
  toGeminiTools,
  type ChatStreamPart,
  type ChatToolJsonProperty,
  type ChatToolName,
} from "@/lib/ai/tools";
import { runToolLoop } from "@/lib/ai/tool-loop";

type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
};

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function geminiCallUsage(
  model: string,
  modelVersion: string | undefined,
  metadata: GeminiUsageMetadata | null | undefined,
): AiCallUsage | null {
  if (!metadata) return null;
  return {
    provider: "gemini",
    model,
    ...(modelVersion ? { modelVersion } : {}),
    inputTokens: count(metadata.promptTokenCount),
    outputTokens: count(metadata.candidatesTokenCount),
    thinkingTokens: count(metadata.thoughtsTokenCount),
    totalTokens: count(metadata.totalTokenCount),
  };
}

function reportGeminiResponse(options: GenerateOptions, model: string, response: { modelVersion?: string; usageMetadata?: GeminiUsageMetadata }) {
  const usage = geminiCallUsage(model, response.modelVersion, response.usageMetadata);
  if (usage) options.usage?.(usage);
}

function toHistory(prompt: string, history: ChatTurn[] = []): Content[] {
  return historyWithoutCurrentPrompt(history, prompt)
    .filter((turn) => turn.content.trim().length > 0)
    .map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    }));

}

function toPromptParts(prompt: string, images: GenerateOptions["images"] = []): Part[] {
  const parts: Part[] = [{ text: prompt }];
  for (const image of images ?? []) {
    if (!image.data || !image.mimeType.startsWith("image/")) continue;
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }
  return parts;
}

function allowedToolNames(tools: GenerateOptions["tools"], mode: GenerateOptions["mode"]): ChatToolName[] {
  const eligible = eligibleChatToolDefinitions(mode ?? "auto").map((definition) => definition.name);
  if (!tools) return [];
  if (tools === true) return eligible;
  const requested = new Set(tools);
  return eligible.filter((name) => requested.has(name));
}

function toGeminiProperty(spec: ChatToolJsonProperty): FunctionDeclarationSchemaProperty {
  if (spec.type === "integer") return { type: SchemaType.INTEGER, description: spec.description };
  if (spec.type === "number") return { type: SchemaType.NUMBER, description: spec.description };
  if (spec.type === "array") {
    return { type: SchemaType.ARRAY, description: spec.description, items: toGeminiProperty(spec.items) };
  }
  if (spec.type === "object") {
    return {
      type: SchemaType.OBJECT,
      description: spec.description,
      properties: Object.fromEntries(
        Object.entries(spec.properties).map(([name, property]) => [name, toGeminiProperty(property)]),
      ),
      required: spec.required,
    };
  }
  if (spec.type === "string") {
    if (spec.enum) {
      return { type: SchemaType.STRING, format: "enum", description: spec.description, enum: spec.enum };
    }
    return { type: SchemaType.STRING, description: spec.description };
  }
  return { type: SchemaType.NUMBER, description: spec.description };
}

function toGeminiDeclarations(allowed: readonly ChatToolName[]): FunctionDeclaration[] {
  const names = new Set(allowed);
  return toGeminiTools(eligibleChatToolDefinitions("teacher").filter((definition) => names.has(definition.name))).map(
    (definition) => ({
      name: definition.name,
      description: definition.description,
      parameters: {
        type: SchemaType.OBJECT,
        properties: Object.fromEntries(
          Object.entries(definition.parameters.properties).map(([name, property]) => [name, toGeminiProperty(property)]),
        ),
        required: definition.parameters.required,
      },
    }),
  );
}

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  readonly name = "Google Gemini";

  private getModel(options: GenerateOptions = {}) {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();

    if (!apiKey) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set.");
    }

    const allowed = allowedToolNames(options.tools, options.mode);
    const declarations = toGeminiDeclarations(allowed);
    const useTools = declarations.length > 0;
    return new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: options.model ?? DEFAULT_GEMINI_MODEL,
      systemInstruction: options.systemInstruction,
      tools: useTools ? [{ functionDeclarations: declarations }] : undefined,
      toolConfig: useTools
        ? {
            functionCallingConfig: options.toolChoice
              ? { mode: FunctionCallingMode.ANY, allowedFunctionNames: [options.toolChoice] }
              : { mode: FunctionCallingMode.AUTO },
          }
        : undefined,
      generationConfig: options.json ? { responseMimeType: "application/json" } : undefined,
    });
  }

  async generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
    const model = options.model ?? DEFAULT_GEMINI_MODEL;
    const result = await this.getModel(options).generateContent({
      contents: [...toHistory(prompt, options.history), { role: "user", parts: toPromptParts(prompt, options.images) }],
    });
    reportGeminiResponse(options, model, result.response);
    const text = result.response.text();

    if (!text) {
      throw new Error("Gemini returned an empty response.");
    }

    return text;
  }

  async *generateTextStream(prompt: string, options: GenerateOptions = {}): AsyncIterable<string> {
    const model = options.model ?? DEFAULT_GEMINI_MODEL;
    const result = await this.getModel(options).generateContentStream({
      contents: [...toHistory(prompt, options.history), { role: "user", parts: toPromptParts(prompt, options.images) }],
    });

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
    reportGeminiResponse(options, model, await result.response);
  }

  async *generateToolStream(prompt: string, options: GenerateOptions = {}): AsyncIterable<ChatStreamPart> {
    const model = options.model ?? DEFAULT_GEMINI_MODEL;
    const chat = this.getModel(options).startChat({ history: toHistory(prompt, options.history) });
    const firstParts = toPromptParts(prompt, options.images);
    const result = await runToolLoop({
      maxRounds: options.toolChoice ? 1 : 3,
      callModel: async ({ round, functionResponses }) => {
        const outgoing: Part[] =
          round === 1
            ? firstParts
            : functionResponses.map(({ name, response }) => ({
                functionResponse: {
                  name,
                  response:
                    response && typeof response === "object"
                      ? (response as object)
                      : { result: response ?? null },
                },
              }));
        const turn = await chat.sendMessageStream(outgoing);
        const parts: Array<{ text?: string; functionCall?: { name: string; args?: unknown } }> = [];
        for await (const chunk of turn.stream) {
          for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
            if (part.text) parts.push({ text: part.text });
            if (part.functionCall) parts.push({ functionCall: part.functionCall });
          }
        }
        reportGeminiResponse(options, model, await turn.response);
        return { parts };
      },
      execute: async (call) =>
        chatToolDefinition(call.name).execute({
          call,
          invoke: async (current) => ({ ok: true, tool: current.name }),
        }),
    });
    if (result.tool) yield { tool: result.tool };
    if (result.text) yield { text: result.text };
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
