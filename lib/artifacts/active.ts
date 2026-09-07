import type { ChatArtifact } from "@/types/chat";
import type { ActiveArtifact, ActiveArtifactStatus } from "@/types/project";

export function chatArtifactToActive(
  artifact: ChatArtifact,
  status: ActiveArtifactStatus = "ready",
): ActiveArtifact {
  return {
    kind: artifact.kind === "practice" ? "practice_set" : "study_sheet",
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
    };
  }
  return {
    kind: active.title === "Study plan" ? "plan" : "sheet",
    id: active.id,
    title: active.title || "Notes",
    count: active.count,
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
