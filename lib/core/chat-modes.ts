import type { ChatMode } from "@/types/chat";
import type { ProjectGoal } from "@/types/goals";

export function preferredChatModeForGoal(_goal: ProjectGoal): ChatMode {
  return "normal";
}

export const CHAT_MODE_INSTRUCTIONS: Record<ChatMode, string> = {
  normal:
    "Answer clearly. If they name a topic, teach it. Do not interview them or bounce the topic back as a question.",
  socratic:
    "Teach by default. If they name a topic or ask what something is, explain it. Only hint — do not withhold the idea — when they are mid-problem and clearly trying to solve it themselves.",
};

export function chatSystemInstruction(mode: ChatMode, extra?: string): string {
  const base = CHAT_MODE_INSTRUCTIONS[mode];
  return extra ? `${base}\n\n${extra}` : base;
}
