import type { ChatMode } from "@/types/chat";
import { asChatMode } from "@/lib/core/chat-modes";

const KEY = "tv.chatMode";
/** Fired when the user picks a reply style, so the account can remember it across devices. */
export const CHAT_MODE_EVENT = "tv:chat-mode";

export function loadSavedChatMode(): ChatMode {
  if (typeof window === "undefined") return "auto";
  try {
    return asChatMode(window.localStorage.getItem(KEY), "auto");
  } catch {
    return "auto";
  }
}

/** Local copy only. Used when hydrating from the account, so it does not echo back. */
export function writeLocalChatMode(mode: ChatMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // Ignore quota / private mode.
  }
}

export function saveChatMode(mode: ChatMode): void {
  if (typeof window === "undefined") return;
  writeLocalChatMode(mode);
  window.dispatchEvent(new CustomEvent(CHAT_MODE_EVENT, { detail: mode }));
}
