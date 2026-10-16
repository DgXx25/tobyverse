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

/** Every mode sends the same registry filtered only by eligibility. */
export function chatModeSendsToolDeclarations(_mode: ChatMode): boolean {
  return true;
}

/** Compatibility exports for consumers such as the admin inventory. Modes add no prompt text. */
export const CHAT_MODE_INSTRUCTIONS: Record<ChatMode, string> = { auto: "", fast: "", teacher: "" };

export function chatSystemInstruction(_mode: ChatMode, extra?: string): string {
  return extra ?? "";
}
