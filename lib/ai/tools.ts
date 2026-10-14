export type ChatToolArgs = {
  topic?: string;
  question?: string;
  options?: string[];
  instruction?: string;
  count?: number;
  id?: string;
  query?: string;
  mode?: "practice" | "exam";
  blocks?: import("@/types/visual").VisualBlock[];
};

export type ChatToolCall = {
  name: ChatToolName;
  args: ChatToolArgs;
};

export type ChatStreamPart = {
  text?: string;
  tool?: ChatToolCall;
};

export type ChatToolJsonProperty =
  | { type: "string"; description?: string; enum?: string[] }
  | { type: "number" | "integer"; description?: string }
  | { type: "array"; description?: string; items: ChatToolJsonProperty }
  | {
      type: "object";
      description?: string;
      properties: Record<string, ChatToolJsonProperty>;
      required?: string[];
    };

export type ChatToolJsonSchema = {
  type: "object";
  properties: Record<string, ChatToolJsonProperty>;
  required?: string[];
};

export type ChatToolDefinition<Name extends string = string> = {
  name: Name;
  description: string;
  parameters: ChatToolJsonSchema;
  /** If true, the client shows a card and the route does not stream body text. */
  card?: boolean;
  execute: (context: ChatToolExecutionContext) => Promise<unknown>;
};

export type ChatToolExecutionContext = {
  call: ChatToolCall;
  invoke: (call: ChatToolCall) => Promise<unknown>;
};

function defineTool<const Name extends string>(
  definition: Omit<ChatToolDefinition<Name>, "execute">,
): ChatToolDefinition<Name> {
  return {
    ...definition,
    execute: async (context: ChatToolExecutionContext) => context.invoke(context.call),
  };
}

export const CHAT_TOOL_DEFINITIONS = [
  defineTool({
    name: "answer",
    description:
      "Answer an ordinary question or complete a direct text task in the user's language. Use it when no more specific action tool is needed. Pass question only when the user explicitly asked for a check or to move on. After an explanation, pass 1–2 options that are the next questions the user would type. Do not add chips or a quiz to a simple request.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "Only when they asked to practice or to move on. One short markdown heading they can answer. A table or display math may follow in the same string. Not a restatement of the explanation.",
        },
        options: {
          type: "array",
          description: "1–2 questions the user would type next, in their voice and language, each ending with ?. Not a summary, not a statement of the answer, not a question from you to them. Omit on a one-step fact. On a real check, these are candidate forms instead.",
          items: { type: "string" },
        },
      },
    },
  }),
  defineTool({
    name: "clarify",
    description:
      "Ask one concrete question when an action tool lacks its required topic and there are no usable materials. Use the user's language and include two to four short options when helpful. Do not clarify an ordinary question or ask a second confirmation after a slash, chip, or direct creation request.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The one concrete question, in the user's language." },
        options: {
          type: "array",
          description: "2-4 short options the user can tap. Same language as the question. Do not include Other/სხვა.",
          items: { type: "string" },
        },
      },
      required: ["question"],
    },
  }),
  defineTool({
    name: "illustrate",
    description:
      "Emit one or more typed catalog blocks under a short answer when the idea is clearer visually. Use it for a shape or curve, a comparison, a formula, ordered steps, or a cycle. Use only graph, compare_vs, formula_card, steps, flow, or cycle blocks and keep labels in the user's language. Do not use it for yes/no questions, one-line definitions, study sheets, or image generation.",
    parameters: {
      type: "object",
      properties: {
        blocks: {
          type: "array",
          description: "One to four in-thread catalog blocks.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["graph", "compare_vs", "formula_card", "steps", "flow", "cycle"],
                description: "Catalog block type.",
              },
              title: { type: "string", description: "Optional short heading." },
              text: { type: "string", description: "Optional plain-language explanation." },
              formula: { type: "string", description: "Formula source for formula_card." },
              slope: { type: "number", description: "Line slope for graph." },
              intercept: { type: "number", description: "Line intercept for graph." },
              points: {
                type: "array",
                description: "Y values for a curve when slope is insufficient.",
                items: { type: "number" },
              },
              caption: { type: "string", description: "Short graph caption." },
              items: {
                type: "array",
                description: "Ordered labels for steps or a cycle/flow.",
                items: { type: "string" },
              },
              left: {
                type: "object",
                description: "Left comparison side.",
                properties: {
                  title: { type: "string" },
                  text: { type: "string" },
                },
                required: ["title", "text"],
              },
              right: {
                type: "object",
                description: "Right comparison side.",
                properties: {
                  title: { type: "string" },
                  text: { type: "string" },
                },
                required: ["title", "text"],
              },
            },
            required: ["type"],
          },
        },
      },
      required: ["blocks"],
    },
  }),
  defineTool({
    name: "suggest_practice",
    description:
      "Offer a Studio quiz chip after an explanation when working the idea would help. Do not write the quiz, a question, or a check in the chat. Do not use it for a one-line fact, a simple task, or Fast. Use create_practice for a slash, accepted chip, or direct request.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic for the chip." },
        mode: { type: "string", description: "practice or exam." },
      },
    },
  }),
  defineTool({
    name: "suggest_sheet",
    description:
      "Offer a note chip when the user expresses interest in notes without directly asking you to create them. Teacher may also offer it after a substantial explanation. Do not use on Fast or for a one-line fact. Use create_sheet for a slash, accepted chip, or direct creation request.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "Topic for the chip." } },
    },
  }),
  defineTool({
    name: "suggest_path",
    description:
      "Offer a path chip after a short briefing when the user is considering a course or exam-review plan. Use it only in Teacher mode and only with a usable topic or material. Do not create the path or dump a week list in chat. Use create_path for an explicit accepted plan action.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "Course or exam-review topic for the chip." } },
    },
  }),
  defineTool({
    name: "create_practice",
    description:
      "Create a practice or exam card when the user used /practice, accepted a chip, or directly asked you to make the set. Call it immediately when a topic or material exists; do not ask for confirmation again. Pass mode exam when they asked to be tested. Never dump quiz items into chat or use it for form-writing.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Practice or exam topic, including the latest user topic." },
        mode: { type: "string", description: "practice (retry mistakes until they finish) or exam (one check, 50% counts as a pass)." },
      },
      required: ["topic"],
    },
    card: true,
  }),
  defineTool({
    name: "edit_practice",
    description: "Change the active practice set according to the user's instruction. Use it only when a practice card is active. Keep the same id and return the updated card. Never dump the items into chat.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Active practice set id." },
        instruction: { type: "string", description: "How to change the items." },
      },
      required: ["instruction"],
    },
    card: true,
  }),
  defineTool({
    name: "append_practice",
    description: "Append new items to the active practice set. Use the requested count when present and otherwise add a small relevant batch. Keep the same id and return the updated card. Never dump the items into chat.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Active practice set id." },
        count: { type: "integer", description: "How many items to add (1–10)." },
        instruction: { type: "string", description: "What to add." },
      },
    },
    card: true,
  }),
  defineTool({
    name: "create_sheet",
    description:
      "Create a study sheet when the user used /note, accepted a note chip, or directly asked for notes or a კონსპექტი. Call it immediately when a topic or material exists; do not ask for confirmation again. Return a card and never write the sheet body as chat text. Do not create one for a one-line definition.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "Specific sheet topic." } },
      required: ["topic"],
    },
    card: true,
  }),
  defineTool({
    name: "edit_sheet",
    description:
      "Rewrite the active study sheet according to the user's instruction. Use it only when a sheet is active. Keep the same id and preserve meaning-first explanations. Never dump the rewritten notes into chat.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Active sheet id." },
        instruction: { type: "string", description: "How to rewrite the sheet." },
      },
      required: ["instruction"],
    },
    card: true,
  }),
  defineTool({
    name: "create_path",
    description:
      "Create a course or exam-review path card from an explicit plan action and a usable topic or material. Use it only in Teacher mode; Fast must ignore /path. Start with the first real topic and keep exam review to a short high-yield track. Never dump the syllabus in chat or use it for a plain explanation.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "Course or semester name, if known." } },
    },
    card: true,
  }),
  defineTool({
    name: "advance_path",
    description:
      "Advance an already-started Teacher path when the user explicitly says the topic is done or asks for the next topic. It may also follow a completed check. Do not use it after your own explanation, a greeting, or thanks. Keep the same path card and do not reveal the remaining syllabus.",
    parameters: { type: "object", properties: {} },
    card: true,
  }),
  defineTool({
    name: "restart_path",
    description:
      "Reset an existing draft path to its first open topic when the user explicitly asks to start over. Use it only before teaching has started. Keep the same path and return its card. Do not create a replacement path or expose artifact markup.",
    parameters: { type: "object", properties: {} },
    card: true,
  }),
  defineTool({
    name: "start_path",
    description:
      "Start a confirmed Teacher path and open its child thread. Use it only after the user confirms the draft plan. Keep the parent chat free and do not alter the map. Do not teach the first topic in the parent thread.",
    parameters: { type: "object", properties: {} },
    card: true,
  }),
  defineTool({
    name: "search_images",
    description:
      "Find external photos, maps, charts, or diagrams only when the user explicitly asks for them or refers to an attached figure. Pass the full topic in the user's language and optionally cap the result count. Add one short introductory line, while results render separately. Do not invent URLs, dump link lists, or use this when illustrate catalog blocks are the better fit.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Image search query." },
        count: { type: "integer", description: "Upper bound, max 8. Omit to let search keep only the closest matches." },
      },
      required: ["query"],
    },
  }),
];

export type ChatToolName = (typeof CHAT_TOOL_DEFINITIONS)[number]["name"];
export const CHAT_TOOLS = CHAT_TOOL_DEFINITIONS.map((definition) => definition.name) as ChatToolName[];

/** Backward-compatible inventory field. Native tool calling has no intercept-only tools. */
export const INTERCEPT_ONLY_CHAT_TOOLS = [] as const satisfies readonly ChatToolName[];

export function isChatToolName(value: unknown): value is ChatToolName {
  return typeof value === "string" && (CHAT_TOOLS as readonly string[]).includes(value);
}

export function toolStreamsText(name: ChatToolName): boolean {
  return !isArtifactTool(name);
}

export function isArtifactTool(name: ChatToolName): boolean {
  return CHAT_TOOL_DEFINITIONS.some((def) => def.name === name && def.card);
}

export function parseClarifyOptions(value: unknown): string[] | undefined {
  let raw: unknown[] = [];
  if (Array.isArray(value)) raw = value;
  else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) raw = [];
    else if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        raw = Array.isArray(parsed) ? parsed : [trimmed];
      } catch {
        raw = trimmed.split(/[,|;]/);
      }
    } else raw = trimmed.split(/[,|;]/);
  } else if (value && typeof value === "object") raw = Object.values(value);

  const items = raw
    .map((item) => (typeof item === "string" ? item : item != null ? String(item) : ""))
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) return false;
      const lower = item.toLowerCase();
      return lower !== "სხვა" && lower !== "other";
    });
  const unique = [...new Set(items)].slice(0, 4);
  return unique.length ? unique : undefined;
}

export function parseToolArgs(value: unknown): ChatToolArgs {
  if (!value || typeof value !== "object") return {};
  const row = value as Record<string, unknown>;
  const count = typeof row.count === "number" ? row.count : typeof row.count === "string" ? Number(row.count) : NaN;
  return {
    topic: typeof row.topic === "string" ? row.topic.trim() || undefined : undefined,
    question: typeof row.question === "string" ? row.question.trim() || undefined : undefined,
    options: parseClarifyOptions(row.options),
    instruction: typeof row.instruction === "string" ? row.instruction.trim() || undefined : undefined,
    id: typeof row.id === "string" ? row.id.trim() || undefined : undefined,
    query: typeof row.query === "string" ? row.query.trim() || undefined : undefined,
    count: Number.isFinite(count) ? Math.min(8, Math.max(1, Math.floor(count))) : undefined,
    mode: row.mode === "exam" || row.mode === "practice" ? row.mode : undefined,
    blocks: parseIllustrationBlocks(row.blocks),
  };
}

function parseIllustrationBlocks(value: unknown): import("@/types/visual").VisualBlock[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const allowed = new Set(["graph", "compare_vs", "formula_card", "steps", "flow"]);
  const blocks = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (row.type === "cycle") {
      const items = Array.isArray(row.items)
        ? row.items.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        : [];
      if (items.length < 2) return [];
      return [{
        type: "flow" as const,
        title: typeof row.title === "string" ? row.title : undefined,
        items: [...items, items[0]],
      }];
    }
    if (typeof row.type !== "string" || !allowed.has(row.type)) return [];
    return [item as import("@/types/visual").VisualBlock];
  }).slice(0, 4);
  return blocks.length ? blocks : undefined;
}

export function parseToolCall(name: unknown, args?: unknown): ChatToolCall | null {
  if (!isChatToolName(name)) return null;
  return { name, args: parseToolArgs(args) };
}

const FAST_EXCLUDED = new Set<ChatToolName>([
  "suggest_path",
  "create_path",
  "advance_path",
  "restart_path",
  "start_path",
]);
const NON_TEACHER_EXCLUDED = new Set<ChatToolName>([
  "suggest_path",
  "create_path",
  "advance_path",
  "restart_path",
  "start_path",
]);

export function eligibleChatToolNames(mode: import("@/types/chat").ChatMode = "auto"): ChatToolName[] {
  return CHAT_TOOL_DEFINITIONS.map((definition) => definition.name).filter((name) => {
    if (mode === "fast") return !FAST_EXCLUDED.has(name);
    if (mode !== "teacher") return !NON_TEACHER_EXCLUDED.has(name);
    return true;
  });
}

export function eligibleChatToolDefinitions(
  mode: import("@/types/chat").ChatMode = "auto",
): Array<(typeof CHAT_TOOL_DEFINITIONS)[number]> {
  const allowed = new Set(eligibleChatToolNames(mode));
  return CHAT_TOOL_DEFINITIONS.filter((definition) => allowed.has(definition.name));
}

/** OpenAI Chat Completions mapper stub. No OpenAI provider is live yet. */
export function toOpenAITools(defs: ChatToolDefinition[] = eligibleChatToolDefinitions("auto")) {
  return defs.map((def) => ({
    type: "function" as const,
    function: {
      name: def.name,
      description: def.description,
      parameters: def.parameters,
    },
  }));
}

/** Anthropic Messages mapper stub. No Claude provider is live yet. */
export function toAnthropicTools(defs: ChatToolDefinition[] = eligibleChatToolDefinitions("auto")) {
  return defs.map((def) => ({
    name: def.name,
    description: def.description,
    input_schema: def.parameters,
  }));
}

/** Gemini functionDeclarations mapper. GeminiProvider is the only live provider. */
export function toGeminiTools(defs: ChatToolDefinition[] = eligibleChatToolDefinitions("auto")) {
  return defs.map((def) => ({
    name: def.name,
    description: def.description,
    parameters: def.parameters,
  }));
}

export function chatToolDefinition(name: ChatToolName): ChatToolDefinition {
  const definition = CHAT_TOOL_DEFINITIONS.find((item) => item.name === name);
  if (!definition) throw new Error(`Unknown chat tool: ${name}`);
  return definition;
}
