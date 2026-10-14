"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth-provider";
import { useUserProfile } from "@/components/account/use-user-profile";
import { updateUserChatMode } from "@/lib/account/store";
import { isGuestUser } from "@/lib/guest";
import { CHAT_MODE_EVENT, loadSavedChatMode, writeLocalChatMode } from "@/lib/workspace/chat-mode";
import type { ChatMode } from "@/types/chat";

/**
 * Keeps the reply style in the account, like the theme: pick it once and it stays until you
 * change it, on every device. localStorage remains the fast local copy.
 */
export function ChatModeSync() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const stored = profile?.chatMode ?? null;
  const storedRef = useRef<ChatMode | null>(null);
  storedRef.current = stored;

  useEffect(() => {
    if (stored && stored !== loadSavedChatMode()) writeLocalChatMode(stored);
  }, [stored]);

  useEffect(() => {
    if (!user || isGuestUser(user)) return;
    const uid = user.uid;
    function onPick(event: Event) {
      const mode = (event as CustomEvent<ChatMode>).detail;
      if (mode && mode !== storedRef.current) void updateUserChatMode(uid, mode);
    }
    window.addEventListener(CHAT_MODE_EVENT, onPick);
    return () => window.removeEventListener(CHAT_MODE_EVENT, onPick);
  }, [user]);

  return null;
}
