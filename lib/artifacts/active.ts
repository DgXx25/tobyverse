import type { ChatArtifact, ChatArtifactKind } from "@/types/chat";
import type { ActiveArtifact, ActiveArtifactKind, ActiveArtifactStatus } from "@/types/project";

export function parseChatArtifact(value: unknown): ChatArtifact | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.kind !== "string" || !row.kind.trim()) return null;
  if (typeof row.id !== "string" || !row.id || typeof row.title !== "string") return null;
  return compactChatArtifact({
    kind: row.kind.trim() as ChatArtifactKind,
    id: row.id,
    title: row.title,
    count: typeof row.count === "number" ? row.count : undefined,
    ids: Array.isArray(row.ids) ? row.ids.filter((id): id is string => typeof id === "string") : undefined,
    mode: row.mode === "exam" || row.mode === "practice" ? row.mode : undefined,
    step: asArtifactStep(row.step),
  });
}

function asArtifactStep(value: unknown): ChatArtifact["step"] {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const from = typeof row.from === "string" ? row.from.trim() : "";
  const to = typeof row.to === "string" ? row.to.trim() : "";
  const done = typeof row.done === "number" && Number.isFinite(row.done) ? row.done : undefined;
  const total = typeof row.total === "number" && Number.isFinite(row.total) ? row.total : undefined;
  if (!from && !to && done == null && total == null) return undefined;
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(done != null ? { done } : {}),
    ...(total != null ? { total } : {}),
  };
}

export function compactChatArtifact(artifact: ChatArtifact | null | undefined): ChatArtifact | null {
  if (!artifact?.id || !artifact.kind) return null;
  const next: ChatArtifact = {
    kind: artifact.kind,
    id: artifact.id,
    title: artifact.title || artifact.kind,
  };
  if (typeof artifact.count === "number" && Number.isFinite(artifact.count)) next.count = artifact.count;
  if (artifact.ids?.length) next.ids = artifact.ids;
  if (artifact.mode === "exam" || artifact.mode === "practice") next.mode = artifact.mode;
  const step = asArtifactStep(artifact.step);
  if (step) next.step = step;
  return next;
}

export function toActiveKind(kind: string): ActiveArtifactKind {
  if (kind === "practice") return "practice_set";
  if (kind === "sheet" || kind === "plan") return "study_sheet";
  if (kind === "path") return "study_path";
  return kind;
}

export function toChatArtifactKind(kind: string): ChatArtifactKind {
  if (kind === "practice_set") return "practice";
  if (kind === "study_sheet") return "sheet";
  if (kind === "study_path") return "path";
  return kind;
}

export function chatArtifactToActive(
  artifact: ChatArtifact,
  status: ActiveArtifactStatus = "ready",
): ActiveArtifact {
  return {
    kind: toActiveKind(artifact.kind),
    id: artifact.id,
    status,
    title: artifact.title,
    count: artifact.count ?? artifact.ids?.length,
    ids: artifact.ids,
  };
}

export function activeToChatArtifact(active: ActiveArtifact): ChatArtifact {
  if (active.kind === "practice_set") {
    return {
      kind: "practice",
      id: active.id,
      title: active.title || "Practice set",
      count: active.count ?? active.ids?.length,
      ids: active.ids,
      mode: active.title === "Exam" || active.title === "გამოცდა" ? "exam" : "practice",
    };
  }
  if (active.kind === "study_sheet") {
    return {
      kind: active.title === "Study plan" ? "plan" : "sheet",
      id: active.id,
      title: active.title || "Notes",
      count: active.count,
    };
  }
  if (active.kind === "study_path") {
    return {
      kind: "path",
      id: active.id,
      title: active.title || "Path",
      count: active.count,
    };
  }
  return {
    kind: toChatArtifactKind(active.kind),
    id: active.id,
    title: active.title || active.kind,
    count: active.count,
    ids: active.ids,
  };
}

export function compactActiveLine(active: {
  kind: string;
  id: string;
  title: string;
  count?: number;
  status?: string;
  progress?: string;
}): string {
  const title = active.title.replace(/"/g, "");
  const count = active.count != null ? ` count=${active.count}` : "";
  const status = active.status ? ` status=${active.status}` : "";
  const progress = active.progress ? ` progress=${active.progress}` : "";
  return `[active kind=${active.kind} id=${active.id}${count}${status}${progress} title="${title}"]`;
}
