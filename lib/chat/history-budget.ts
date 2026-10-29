import type { ChatTurn } from "@/types/chat";

/** Keep prior chat context bounded; it is resent on every model/tool call. */
export const CHAT_HISTORY_MAX_MESSAGES = 20;
export const CHAT_HISTORY_MAX_CHARS = 12_000;
export const CHAT_HISTORY_MAX_MESSAGE_CHARS = 6_000;

const OMITTED_CONTEXT = "[Earlier context omitted to limit repeated prompt size.]";

function compactMessage(content: string, role: ChatTurn["role"], maxChars: number): string {
  const text = content.trim();
  if (text.length <= maxChars) return text;
  const available = Math.max(0, maxChars - OMITTED_CONTEXT.length - 2);
  if (role === "assistant") {
    const headLength = Math.ceil(available * 0.65);
    const tailLength = available - headLength;
    return `${text.slice(0, headLength)}\n${OMITTED_CONTEXT}\n${tailLength ? text.slice(-tailLength) : ""}`;
  }
  return `${text.slice(0, available)}\n${OMITTED_CONTEXT}`;
}

/**
 * Preserve the newest conversational context while bounding the text resent to providers.
 * User prompts keep their start; oversized assistant answers keep their start and conclusion.
 */
export function trimChatHistory(history: readonly ChatTurn[], currentPrompt = ""): ChatTurn[] {
  const current = currentPrompt.trim();
  const recent = history
    .filter((turn) => (turn.role === "user" || turn.role === "assistant") && turn.content.trim())
    .filter((turn, index, turns) => !(index === turns.length - 1 && turn.role === "user" && turn.content.trim() === current))
    .slice(-CHAT_HISTORY_MAX_MESSAGES);

  const kept: ChatTurn[] = [];
  let remainingChars = CHAT_HISTORY_MAX_CHARS;
  for (let index = recent.length - 1; index >= 0 && remainingChars > 0; index -= 1) {
    const turn = recent[index]!;
    const content = turn.content.trim();
    const allowed = Math.min(CHAT_HISTORY_MAX_MESSAGE_CHARS, remainingChars);
    if (content.length <= allowed) {
      kept.push({ ...turn, content });
      remainingChars -= content.length;
      continue;
    }

    // Compact the oldest message that crosses the budget, preserving the newest turns intact.
    if (allowed > OMITTED_CONTEXT.length + 2) {
      const compacted = compactMessage(content, turn.role, allowed);
      kept.push({ ...turn, content: compacted });
      remainingChars -= compacted.length;
    }
    break;
  }
  return kept.reverse();
}
