import type { ComposerIntent } from "@/lib/composer/intent";
import { DEFAULT_COMPOSER_INTENT } from "@/lib/composer/intent";

export type PendingAttachment =
  | { id: string; kind: "file"; file: File }
  | { id: string; kind: "paste"; text: string; title?: string }
  | { id: string; kind: "url"; url: string };

export type PendingStart = {
  prompt: string;
  materialIds: string[];
  intent?: ComposerIntent;
  awaitingIngest?: boolean;
};

const STORAGE_PREFIX = "tv.pending.";

type StoredStart = {
  prompt: string;
  intent?: ComposerIntent;
  materialIds: string[];
  awaitingIngest?: boolean;
};

export function stashPendingStart(projectId: string, start: PendingStart): void {
  if (typeof window === "undefined") return;
  const stored: StoredStart = {
    prompt: start.prompt,
    intent: start.intent,
    materialIds: start.materialIds,
    awaitingIngest: start.awaitingIngest,
  };
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${projectId}`, JSON.stringify(stored));
  } catch {
    // Ignore quota / private mode.
  }
}

export function takePendingStart(projectId: string): PendingStart | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
    window.sessionStorage.removeItem(`${STORAGE_PREFIX}${projectId}`);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredStart;
    const prompt = typeof stored.prompt === "string" ? stored.prompt : "";
    const materialIds = Array.isArray(stored.materialIds)
      ? stored.materialIds.filter((id) => typeof id === "string")
      : [];
    const awaitingIngest = stored.awaitingIngest === true;
    if (!prompt.trim() && materialIds.length === 0 && !awaitingIngest) return null;
    return {
      prompt,
      intent: stored.intent ?? DEFAULT_COMPOSER_INTENT,
      materialIds,
      awaitingIngest,
    };
  } catch {
    return null;
  }
}
