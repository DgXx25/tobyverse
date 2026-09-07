export const CHAT_TOOLS = [
  "answer",
  "clarify",
  "suggest_practice",
  "suggest_sheet",
  "create_practice",
  "edit_practice",
  "append_practice",
  "create_sheet",
  "edit_sheet",
] as const;

export type ChatToolName = (typeof CHAT_TOOLS)[number];

export type ChatToolArgs = {
  topic?: string;
  question?: string;
  instruction?: string;
  count?: number;
  id?: string;
};

export type ChatToolCall = {
  name: ChatToolName;
  args: ChatToolArgs;
};

export type ChatStreamPart = {
  text?: string;
  tool?: ChatToolCall;
};

type JsonSchemaType = "string" | "integer";

export type ChatToolJsonSchema = {
  type: "object";
  properties: Record<string, { type: JsonSchemaType; description: string }>;
  required?: string[];
};

export type ChatToolDefinition = {
  name: ChatToolName;
  description: string;
  parameters: ChatToolJsonSchema;
};

export const CHAT_TOOL_DEFINITIONS: ChatToolDefinition[] = [
  {
    name: "answer",
    description: "Ordinary question. Write the reply as message text. No chips.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "clarify",
    description: "User wants practice or a sheet but the topic is too broad. Ask one short question.",
    parameters: {
      type: "object",
      properties: { question: { type: "string", description: "The one question to ask." } },
      required: ["question"],
    },
  },
  {
    name: "suggest_practice",
    description: "After a full explanation only. Offer a practice chip. Do not create the set.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "Topic for the chip." } },
    },
  },
  {
    name: "suggest_sheet",
    description: "After a full explanation only. Offer a notes chip. Do not create the note.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "Topic for the chip." } },
    },
  },
  {
    name: "create_practice",
    description: "User wants practice and the topic is specific enough, or they accepted a suggestion.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "Specific practice topic." } },
      required: ["topic"],
    },
  },
  {
    name: "edit_practice",
    description: "Change the current practice set. Keep the same id. Never dump items into chat.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Active practice set id." },
        instruction: { type: "string", description: "How to change the items." },
      },
      required: ["instruction"],
    },
  },
  {
    name: "append_practice",
    description: "Add items to the current practice set. Same id. Never dump items into chat.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Active practice set id." },
        count: { type: "integer", description: "How many items to add (1–10)." },
        instruction: { type: "string", description: "What to add." },
      },
    },
  },
  {
    name: "create_sheet",
    description:
      "User wants notes (კონსპექტი). Create visual blocks (compare_vs, formula_card, steps, term_card). Never essay cards or long paragraphs.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "Specific sheet topic." } },
      required: ["topic"],
    },
  },
  {
    name: "edit_sheet",
    description:
      "Rewrite the current notes as visual blocks (compare_vs, formula_card, steps). Keep the same id. Never dump essays into chat or into rounded article cards.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Active sheet id." },
        instruction: { type: "string", description: "How to rewrite the sheet." },
      },
      required: ["instruction"],
    },
  },
];

export function isChatToolName(value: unknown): value is ChatToolName {
  return typeof value === "string" && (CHAT_TOOLS as readonly string[]).includes(value);
}

export function toolStreamsText(name: ChatToolName): boolean {
  return name === "answer" || name === "clarify" || name === "suggest_practice" || name === "suggest_sheet";
}

export function isArtifactTool(name: ChatToolName): boolean {
  return (
    name === "create_practice" ||
    name === "edit_practice" ||
    name === "append_practice" ||
    name === "create_sheet" ||
    name === "edit_sheet"
  );
}

export function parseToolArgs(value: unknown): ChatToolArgs {
  if (!value || typeof value !== "object") return {};
  const row = value as Record<string, unknown>;
  const count = typeof row.count === "number" ? row.count : typeof row.count === "string" ? Number(row.count) : NaN;
  return {
    topic: typeof row.topic === "string" ? row.topic.trim() || undefined : undefined,
    question: typeof row.question === "string" ? row.question.trim() || undefined : undefined,
    instruction: typeof row.instruction === "string" ? row.instruction.trim() || undefined : undefined,
    id: typeof row.id === "string" ? row.id.trim() || undefined : undefined,
    count: Number.isFinite(count) ? Math.min(10, Math.max(1, Math.floor(count))) : undefined,
  };
}

export function parseToolCall(name: unknown, args?: unknown): ChatToolCall | null {
  if (!isChatToolName(name)) return null;
  return { name, args: parseToolArgs(args) };
}

/** OpenAI Chat Completions tool list. Unused until that provider is wired. */
export function toOpenAITools(defs: ChatToolDefinition[] = CHAT_TOOL_DEFINITIONS) {
  return defs.map((def) => ({
    type: "function" as const,
    function: {
      name: def.name,
      description: def.description,
      parameters: def.parameters,
    },
  }));
}

/** Anthropic Messages tool list. Unused until that provider is wired. */
export function toAnthropicTools(defs: ChatToolDefinition[] = CHAT_TOOL_DEFINITIONS) {
  return defs.map((def) => ({
    name: def.name,
    description: def.description,
    input_schema: def.parameters,
  }));
}
