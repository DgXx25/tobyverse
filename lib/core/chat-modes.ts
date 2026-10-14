import { eligibleChatToolNames, type ChatToolName } from "@/lib/ai/tools";
import type { ChatMode } from "@/types/chat";
import type { ProjectGoal } from "@/types/goals";

export const CHAT_MODE_TOOLS: Record<ChatMode, readonly ChatToolName[]> = {
  fast: eligibleChatToolNames("fast"),
  auto: eligibleChatToolNames("auto"),
  teacher: eligibleChatToolNames("teacher"),
};

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

export function chatModeTools(mode: ChatMode): readonly ChatToolName[] {
  return eligibleChatToolNames(asChatMode(mode));
}

/** Every reply style sends the same registry filtered only by eligibility. */
export function chatModeSendsToolDeclarations(_mode: ChatMode): boolean {
  return true;
}

export const CHAT_MODE_INSTRUCTIONS: Record<ChatMode, string> = {
  auto:
    "Answer clearly. Match what they asked. Chips under the answer are questions the user would type next, not a recap. Do not interview them or add a check they did not ask for.",
  fast:
    "Keep replies short and plain. Direct answer first. No chips. No extra structure.",
  teacher:
    "One hint before answers when they are learning. Do not lecture. Never add a quiz they did not ask for.",
};

export function chatSystemInstruction(mode: ChatMode, extra?: string): string {
  const base = CHAT_MODE_INSTRUCTIONS[asChatMode(mode)];
  return extra ? `${base}\n\n${extra}` : base;
}
