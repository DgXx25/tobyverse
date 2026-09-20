import type { ChatToolName } from "@/lib/ai/tools";
import type { ChatMode } from "@/types/chat";
import type { ProjectGoal } from "@/types/goals";

export function preferredChatModeForGoal(_goal: ProjectGoal): ChatMode {
  return "auto";
}

export function isChatMode(value: unknown): value is ChatMode {
  return value === "auto" || value === "fast" || value === "teacher";
}

export function asChatMode(value: unknown, fallback: ChatMode = "auto"): ChatMode {
  if (isChatMode(value)) return value;
  if (value === "normal") return "auto";
  if (value === "socratic") return "teacher";
  return fallback;
}

const AUTO_CHAT_TOOLS = [
  "answer",
  "clarify",
  "suggest_practice",
  "suggest_sheet",
  "suggest_path",
  "search_images",
] as const satisfies readonly ChatToolName[];

/** Gemini function-calling allowlist. create_* / edit_* are intercept-only — never listed here. */
export const CHAT_MODE_TOOLS: Record<ChatMode, readonly ChatToolName[]> = {
  fast: ["answer"],
  auto: AUTO_CHAT_TOOLS,
  teacher: [...AUTO_CHAT_TOOLS, "start_path", "advance_path", "restart_path"],
};

export function chatModeTools(mode: ChatMode): readonly ChatToolName[] {
  return CHAT_MODE_TOOLS[asChatMode(mode)];
}

/** Fast is text-only. Omit function declarations when the list is only `answer`. */
export function chatModeSendsToolDeclarations(mode: ChatMode): boolean {
  return chatModeTools(mode).some((name) => name !== "answer");
}

export const CHAT_MODE_INSTRUCTIONS: Record<ChatMode, string> = {
  auto:
    "Answer clearly. Match what they asked. Do not interview them or add a check they did not ask for.",
  fast:
    "Keep replies short and plain. Direct answer first. No chips. No extra structure.",
  teacher:
    "One hint before answers when they are learning. Do not lecture. Never add a quiz they did not ask for.",
};

export function chatSystemInstruction(mode: ChatMode, extra?: string): string {
  const base = CHAT_MODE_INSTRUCTIONS[asChatMode(mode)];
  return extra ? `${base}\n\n${extra}` : base;
}
