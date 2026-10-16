import { CORE_SYSTEM_INSTRUCTION } from "@/lib/ai/core-instruction";

/** Less variable context precedes turn-specific data; keep the core byte-for-byte first. */
export type ChatSystemPromptSlots = {
  project?: string | null;
  subject?: string | null;
  path?: string | null;
  memory?: string | null;
  turn?: string | null;
  materials?: string | null;
};

export function assembleChatSystemPrompt(slots: ChatSystemPromptSlots): string {
  // Cache-friendly order: core → project → subject → active path → memory → turn → RAG.
  // Provider cache controls/minimum sizes belong in adapters, not this string builder.
  const ordered = [
    ["project_context", slots.project],
    ["subject_skill", slots.subject],
    ["active_path", slots.path],
    ["user_memory", slots.memory],
    ["turn_context", slots.turn],
    ["turn_materials", slots.materials],
  ] as const;
  return [
    CORE_SYSTEM_INSTRUCTION,
    ...ordered.flatMap(([tag, text]) => text?.trim() ? [`<${tag}>\n${text.trim()}\n</${tag}>`] : []),
  ].join("\n\n");
}
