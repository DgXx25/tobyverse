import type { ChatToolCall } from "@/lib/ai/tools";

export const GUEST_ASSISTANT_CAP = 3;
export const GUEST_CAP_CODE = "guest_cap";
export const GUEST_CAP_LINE = "Sign in with Google to continue.";

const TURNS_KEY = "tv.guest-assistant-turns";

export function isGuestUser(user: { isAnonymous?: boolean } | null | undefined): boolean {
  return Boolean(user?.isAnonymous);
}

export function guestAssistantCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const n = Number(localStorage.getItem(TURNS_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function syncGuestAssistantCount(threadCount: number): number {
  const stored = guestAssistantCount();
  const next = Math.max(stored, threadCount);
  if (next !== stored) {
    try {
      localStorage.setItem(TURNS_KEY, String(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}

export function recordGuestAssistantTurn(): number {
  const next = guestAssistantCount() + 1;
  try {
    localStorage.setItem(TURNS_KEY, String(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function guestCapReached(threadAssistantCount = 0): boolean {
  return Math.max(guestAssistantCount(), threadCount(threadAssistantCount)) >= GUEST_ASSISTANT_CAP;
}

function threadCount(threadAssistantCount: number): number {
  return Number.isFinite(threadAssistantCount) && threadAssistantCount > 0
    ? Math.floor(threadAssistantCount)
    : 0;
}

export function gateGuestChatTool(tool: ChatToolCall): ChatToolCall {
  if (
    tool.name === "create_practice" ||
    tool.name === "edit_practice" ||
    tool.name === "append_practice" ||
    tool.name === "create_sheet" ||
    tool.name === "create_note" ||
    tool.name === "edit_note" ||
    tool.name === "edit_sheet" ||
    tool.name === "create_path" ||
    tool.name === "advance_path" ||
    tool.name === "restart_path" ||
    tool.name === "start_path" ||
    tool.name === "suggest_practice" ||
    tool.name === "suggest_sheet" ||
    tool.name === "suggest_path"
  ) {
    return { name: "answer", args: {} };
  }
  return tool;
}

export class GuestCapError extends Error {
  readonly code = GUEST_CAP_CODE;

  constructor() {
    super(GUEST_CAP_LINE);
    this.name = "GuestCapError";
  }
}
