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

const SKIP_THOUGHT_SIGNATURE = "skip_thought_signature_validator";

type SignedPart = Part & { thoughtSignature?: string; thought?: boolean };

function partSignature(part: object): string | undefined {
  const record = part as { thoughtSignature?: unknown; thought_signature?: unknown };
  const value = record.thoughtSignature ?? record.thought_signature;
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * Gemini 3 requires the original thoughtSignature on the first functionCall of
 * each tool step. The installed SDK drops that field while merging a stream,
 * so tool turns use the raw response and this replay keeps the signature.
 */
export function partsForReplay(parts: readonly object[]): SignedPart[] {
  const copied: SignedPart[] = parts.map((part) => {
    const next = { ...(part as SignedPart) };
    delete (next as { thought_signature?: string }).thought_signature;
    const signature = partSignature(part);
    if (signature) next.thoughtSignature = signature;
    return next;
  });
  const carried = copied.find((part) => part.thoughtSignature)?.thoughtSignature;
  let signed = false;
  return copied.map((part) => {
    if (!part.functionCall) return part;
    if (part.thoughtSignature || signed) {
      signed = true;
      return part;
    }
    signed = true;
    return { ...part, thoughtSignature: carried || SKIP_THOUGHT_SIGNATURE };
  });
}

function loopParts(parts: readonly SignedPart[]): Array<{ text?: string; functionCall?: { name: string; args?: unknown } }> {
  const visible: Array<{ text?: string; functionCall?: { name: string; args?: unknown } }> = [];
  for (const part of parts) {
    if (part.thought) continue;
    if (part.text) visible.push({ text: part.text });
    if (part.functionCall) visible.push({ functionCall: part.functionCall });
  }
  return visible;
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
    const generative = this.getModel(options);
    const contents: Content[] = [...toHistory(prompt, options.history)];
    const firstParts = toPromptParts(prompt, options.images);
    const result = await runToolLoop({
      maxRounds: options.toolChoice ? 1 : 3,
      stopAfterTool: (call) => call.name === "search_images",
      callModel: async ({ round, functionResponses }) => {
        const message: Content =
          round === 1
            ? { role: "user", parts: firstParts }
            : {
                role: "user",
                parts: functionResponses.map(({ name, response }) => ({
                  functionResponse: {
                    name,
                    response:
                      response && typeof response === "object"
                        ? (response as object)
                        : { result: response ?? null },
                  },
                })),
              };
        const turn = await generative.generateContent({ contents: [...contents, message] });
        const replay = partsForReplay(turn.response.candidates?.[0]?.content?.parts ?? []);
        contents.push(message);
        if (replay.length) contents.push({ role: "model", parts: replay });
        reportGeminiResponse(options, model, turn.response);
        return { parts: loopParts(replay) };
      },
      execute: async (call) =>
        chatToolDefinition(call.name).execute({
          call,
          invoke: options.executeTool ?? (async (current) => ({ ok: true, tool: current.name })),
        }),
    });
    if (result.tool) yield { tool: result.tool };
    if (result.tool?.name === "search_images") {
      // Keep the raw signed function-call replay, then supply the actual result.
      // Override ANY from an explicit image selection so this call can answer in text.
      const answer = await generative.generateContentStream({
        contents: [
          ...contents,
          {
            role: "user",
            parts: [
              ...result.functionResponses.map(({ name, response }) => ({
                functionResponse: {
                  name,
                  response: response && typeof response === "object" ? response as object : { result: response ?? null },
                },
              })),
            ],
          },
        ],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.NONE } },
      });
      for await (const chunk of answer.stream) {
        const text = loopParts(chunk.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
        if (text) yield { text };
      }
      reportGeminiResponse(options, model, await answer.response);
      return;
    }
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
