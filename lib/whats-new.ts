import type { UiIconName } from "@/components/workspace/ui-icon";

export const WHATS_NEW_KEY = "tv.whatsnew";

/** Bump this when there is a new announcement. Seen users see it once more. */
export const WHATS_NEW_ID = "study-2026-09";

export type WhatsNewItem = {
  icon: UiIconName;
  title: string;
  body: string;
  badge?: string;
};

export const WHATS_NEW = {
  id: WHATS_NEW_ID,
  eyebrow: "What's new",
  title: "Study the way you learn",
  lead: "TobyVerse already makes notes and practice. Now it also notices how you understand — and teaches that way.",
  items: [
    {
      icon: "notes",
      title: "Study notes",
      body: "Short visual notes for a topic — a conspectus you can actually study from.",
    },
    {
      icon: "practice",
      title: "Practice",
      body: "Questions on what you are studying, when you are ready.",
    },
    {
      icon: "brain",
      title: "Learns how you learn",
      badge: "New",
      body: "Notices how you get it and why you ask, then slowly adapts to that.",
    },
    {
      icon: "file",
      title: "Your materials",
      body: "Bring a PDF, slides, or a photo. We study from what you bring.",
    },
  ] satisfies WhatsNewItem[],
};

export function readSeenWhatsNew(): string | null {
  try {
    return window.localStorage.getItem(WHATS_NEW_KEY);
  } catch {
    return WHATS_NEW_ID;
  }
}

export function markWhatsNewSeen(): void {
  try {
    window.localStorage.setItem(WHATS_NEW_KEY, WHATS_NEW_ID);
  } catch {
    // Private mode: still dismiss for this session.
  }
}

export function shouldShowWhatsNew(): boolean {
  return readSeenWhatsNew() !== WHATS_NEW_ID;
}
