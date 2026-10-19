import type { ChatTurn } from "@/types/chat";

export const MAX_PLAIN_NOTE_CHARS = 120_000;
export const NOTE_HISTORY_CHARS = 24_000;

export function isNoteEditRequest(prompt: string): boolean {
  return /^(?:(?:please|can you|could you)\s+)?(?:update|edit|change|append|add\s+(?:this|that|it)\s+to|remove|replace)\b|^(?:გთხოვ\s+)?(?:განაახლე|ჩაამატე|შეცვალე|წაშალე)/i.test(prompt.trim());
}

export function requiresNoteReference(prompt: string): boolean {
  return /^(?:please\s+)?(?:save|note|jot)(?:\s+down)?\s+(?:this|that|it)(?:\s+down)?(?:\s+as\s+(?:a\s+)?note)?[.!?\s]*$|^(?:ეს\s+)?(?:ჩაინიშნე|ჩამინიშნე|ჩამიწერე)(?:\s+ეს)?[.!?\s]*$/i.test(prompt.trim());
}

/** Whole recent turns only; a referenced reply is never silently truncated. */
export function plainNoteHistory(messages: Array<{ role?: string; content?: string }> = []): ChatTurn[] {
  let lastAssistant = messages.length - 1;
  while (lastAssistant >= 0 && (messages[lastAssistant].role !== "assistant" || !messages[lastAssistant].content?.trim())) lastAssistant--;
  if (lastAssistant < 0) return [];
  const result: ChatTurn[] = [];
  let size = 0;
  for (let i = lastAssistant; i >= 0 && result.length < 4; i--) {
    const item = messages[i];
    if ((item.role !== "assistant" && item.role !== "user") || !item.content?.trim()) continue;
    if (size + item.content.length > NOTE_HISTORY_CHARS) break;
    result.unshift({ role: item.role, content: item.content });
    size += item.content.length;
  }
  return result;
}

/** Exact unique replacements leave every unselected byte of the note intact. */
export function applyPlainNoteEdits(content: string, changes: unknown): string {
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 20) throw new Error("Could not apply the note edit.");
  let next = content;
  for (const change of changes) {
    if (!change || typeof change !== "object") throw new Error("Invalid note edit.");
    const { oldText, newText } = change as { oldText?: unknown; newText?: unknown };
    if (typeof oldText !== "string" || !oldText || typeof newText !== "string") throw new Error("Invalid note edit.");
    const offset = next.indexOf(oldText);
    if (offset < 0 || next.indexOf(oldText, offset + 1) >= 0) throw new Error("Note edit must match one unique passage.");
    next = next.slice(0, offset) + newText + next.slice(offset + oldText.length);
  }
  if (!next.trim() || next.length > MAX_PLAIN_NOTE_CHARS) throw new Error("Could not apply the note edit.");
  return next;
}
