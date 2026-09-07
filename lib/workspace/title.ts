export const PLACEHOLDER_CHAT_TITLE = "New chat";

const PLACEHOLDERS = new Set(["new chat", "new project", "untitled"]);

export function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function sanitizeChatTitle(raw: string): string | null {
  const cleaned = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”«»]+|["'“”«»]+$/g, "")
    .replace(/[.!?…]+$/g, "");
  if (!cleaned) return null;
  const words = cleaned.split(" ").filter(Boolean).slice(0, 7);
  if (words.length === 0) return null;
  const title = words.join(" ");
  if (title.length > 48) return `${title.slice(0, 48).trim()}`;
  return title;
}

/** Local 3–7 word title from a prompt. Never returns the full long prompt. */
export function fallbackChatTitle(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return PLACEHOLDER_CHAT_TITLE;
  const words = cleaned.split(" ").filter(Boolean);
  const take = Math.min(7, Math.max(words.length > 7 ? 7 : words.length, 1));
  return sanitizeChatTitle(words.slice(0, take).join(" ")) ?? PLACEHOLDER_CHAT_TITLE;
}

export function needsAutoTitle(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return true;
  if (PLACEHOLDERS.has(trimmed.toLowerCase())) return true;
  if (wordCount(trimmed) > 7) return true;
  if (trimmed.length > 42) return true;
  return false;
}

/** Sidebar/header safety net so a long raw prompt never shows as the chat name. */
export function displayProjectTitle(title: string): string {
  if (!needsAutoTitle(title)) return title.trim();
  return fallbackChatTitle(title);
}

export function titleFromStart(input: { prompt: string; fileName?: string }): string {
  const prompt = input.prompt.replace(/\s+/g, " ").trim();
  if (prompt) {
    if (!needsAutoTitle(prompt)) return prompt;
    return fallbackChatTitle(prompt);
  }
  if (input.fileName) {
    const base = input.fileName.replace(/\.[^.]+$/, "");
    return sanitizeChatTitle(base) || PLACEHOLDER_CHAT_TITLE;
  }
  return PLACEHOLDER_CHAT_TITLE;
}

export const DEFAULT_FIRST_PROMPT = "Help me learn from this.";

/** Auto-title only after the user actually typed a prompt — not file-only or the old default. */
export function isRealUserPrompt(value: string): boolean {
  const prompt = value.replace(/\s+/g, " ").trim();
  if (!prompt) return false;
  return prompt !== DEFAULT_FIRST_PROMPT;
}
