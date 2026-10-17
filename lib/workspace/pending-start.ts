import type { ComposerIntent } from "@/lib/composer/intent";
import { DEFAULT_COMPOSER_INTENT } from "@/lib/composer/intent";
import { isComposerSkill, type ComposerSkill } from "@/lib/composer/slash";
import { asChatMode } from "@/lib/core/chat-modes";
import type { ChatAttachment, ChatMode } from "@/types/chat";
import { compactChatAttachment } from "@/lib/composer/attach";

export type StartIngestResult = { materialIds: string[]; attachments: ChatAttachment[] };

export type PendingAttachment =
  | { id: string; kind: "file"; file: File }
  | { id: string; kind: "paste"; text: string; title?: string }
  | { id: string; kind: "url"; url: string };

export type PendingStart = {
  prompt: string;
  materialIds: string[];
  attachments?: ChatAttachment[];
  intent?: ComposerIntent;
  skill?: ComposerSkill;
  mode?: ChatMode;
  awaitingIngest?: boolean;
  userMessageId?: string;
};

const STORAGE_PREFIX = "tv.pending.";

type StoredStart = {
  prompt: string;
  intent?: ComposerIntent;
  skill?: ComposerSkill;
  mode?: ChatMode;
  materialIds: string[];
  attachments?: ChatAttachment[];
  awaitingIngest?: boolean;
  userMessageId?: string;
};

function parsePendingStart(raw: string): PendingStart | null {
  const stored = JSON.parse(raw) as StoredStart;
  const prompt = typeof stored.prompt === "string" ? stored.prompt : "";
  const materialIds = Array.isArray(stored.materialIds)
    ? stored.materialIds.filter((id) => typeof id === "string")
    : [];
  const awaitingIngest = stored.awaitingIngest === true;
  const attachments = Array.isArray(stored.attachments)
    ? stored.attachments.flatMap((item) => item && typeof item.title === "string" ? compactChatAttachment(item) ?? [] : [])
    : [];
  const userMessageId = typeof stored.userMessageId === "string" ? stored.userMessageId : undefined;
  if (!prompt.trim() && materialIds.length === 0 && attachments.length === 0 && !awaitingIngest) return null;
  return {
    prompt,
    intent: stored.intent ?? DEFAULT_COMPOSER_INTENT,
    skill: isComposerSkill(stored.skill) ? stored.skill : undefined,
    mode: stored.mode ? asChatMode(stored.mode) : undefined,
    materialIds,
    attachments,
    awaitingIngest,
    userMessageId,
  };
}

export function stashPendingStart(projectId: string, start: PendingStart): void {
  if (typeof window === "undefined") return;
  const stored: StoredStart = {
    prompt: start.prompt,
    intent: start.intent,
    skill: start.skill,
    mode: start.mode,
    materialIds: start.materialIds,
    attachments: start.attachments,
    awaitingIngest: start.awaitingIngest,
    userMessageId: start.userMessageId,
  };
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${projectId}`, JSON.stringify(stored));
  } catch {
    // Ignore quota / private mode.
  }
}

export function peekPendingStart(projectId: string): PendingStart | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
    if (!raw) return null;
    return parsePendingStart(raw);
  } catch {
    return null;
  }
}

export function takePendingStart(projectId: string): PendingStart | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
    window.sessionStorage.removeItem(`${STORAGE_PREFIX}${projectId}`);
    if (!raw) return null;
    return parsePendingStart(raw);
  } catch {
    return null;
  }
}
