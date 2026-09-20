import type { ChatMode } from "@/types/chat";
import { asChatMode } from "@/lib/core/chat-modes";

const KEY = "tv.chatMode";

export function loadSavedChatMode(): ChatMode {
  if (typeof window === "undefined") return "auto";
  try {
    return asChatMode(window.localStorage.getItem(KEY), "auto");
  } catch {
    return "auto";
  }
}

export function saveChatMode(mode: ChatMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // Ignore quota / private mode.
  }
}
