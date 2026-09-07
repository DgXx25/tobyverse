import type { ChatMode } from "@/types/chat";
import type { ProjectGoal } from "@/types/goals";

const SOCRATIC_GOALS: ProjectGoal[] = ["exam_prep", "practice", "deep_understanding"];

export function preferredChatModeForGoal(goal: ProjectGoal): ChatMode {
  return SOCRATIC_GOALS.includes(goal) ? "socratic" : "normal";
}

export const CHAT_MODE_INSTRUCTIONS: Record<ChatMode, string> = {
  normal:
    "Answer clearly and completely. You may give final answers when the student asks for them.",
  socratic:
    "Hint mode. Never give the final answer. Ask a guiding question or give the smallest possible hint so the student can solve it themselves. Especially while solving problems, withhold the solution.",
};

export function chatSystemInstruction(mode: ChatMode, extra?: string): string {
  const base = CHAT_MODE_INSTRUCTIONS[mode];
  return extra ? `${base}\n\n${extra}` : base;
}
