import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { compactChatArtifact, parseChatArtifact } from "@/lib/artifacts/active";
import { STUDIO_TILES, type StudioSavedArtifact, type StudioTool } from "@/lib/workspace/studio";
import type { ChatArtifact } from "@/types/chat";

function outputsRef(projectId: string) {
  return collection(getFirebaseDb(), "projects", projectId, "studioArtifacts");
}

export async function saveStudioArtifact(
  projectId: string,
  type: StudioTool,
  artifact: ChatArtifact,
  details?: { prompt: string; sourceMaterialIds: string[] },
): Promise<void> {
  await setDoc(doc(outputsRef(projectId), `${artifact.kind}:${artifact.id}`), {
    type,
    artifact: compactChatArtifact(artifact),
    createdAt: new Date().toISOString(),
    ...(details ? { prompt: details.prompt.slice(0, 12_000), sourceMaterialIds: details.sourceMaterialIds.slice(0, 100) } : {}),
  });
}

export async function renameStudioArtifact(projectId: string, artifact: ChatArtifact, title: string): Promise<void> {
  const type = artifact.kind === "practice" ? "quiz" : artifact.kind === "path" ? "path" : "notes";
  await setDoc(doc(outputsRef(projectId), `${artifact.kind}:${artifact.id}`), {
    type,
    artifact: compactChatArtifact({ ...artifact, title }),
  }, { merge: true });
}

/** Keep a tombstone so legacy chat references do not make a removed row reappear. */
export async function removeStudioArtifact(projectId: string, artifact: ChatArtifact): Promise<void> {
  const type = artifact.kind === "practice" ? "quiz" : artifact.kind === "path" ? "path" : "notes";
  await setDoc(doc(outputsRef(projectId), `${artifact.kind}:${artifact.id}`), {
    type,
    artifact: compactChatArtifact(artifact),
    removed: true,
  }, { merge: true });
}

export function subscribeStudioArtifacts(projectId: string, onChange: (items: StudioSavedArtifact[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(outputsRef(projectId), { includeMetadataChanges: true }, (snapshot) => {
    const items = snapshot.docs.filter((item) => !item.metadata.hasPendingWrites).flatMap((item): StudioSavedArtifact[] => {
      const data = item.data();
      const artifact = parseChatArtifact(data.artifact);
      if (!artifact || !STUDIO_TILES.some((tile) => tile.id === data.type)) return [];
      return [{
        type: data.type as StudioTool,
        artifact,
        createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
        ...(typeof data.prompt === "string" ? { prompt: data.prompt } : {}),
        ...(Array.isArray(data.sourceMaterialIds) ? { sourceMaterialIds: data.sourceMaterialIds.filter((id): id is string => typeof id === "string") } : {}),
        ...(data.removed === true ? { removed: true } : {}),
      }];
    });
    onChange(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, onError);
}
