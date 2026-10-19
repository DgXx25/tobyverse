import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { compactChatArtifact, parseChatArtifact } from "@/lib/artifacts/active";
import { STUDIO_TILES, type StudioSavedArtifact, type StudioTool } from "@/lib/workspace/studio";
import type { ChatArtifact } from "@/types/chat";

function outputsRef(projectId: string) {
  return collection(getFirebaseDb(), "projects", projectId, "studioArtifacts");
}

export async function saveStudioArtifact(projectId: string, type: StudioTool, artifact: ChatArtifact): Promise<void> {
  await setDoc(doc(outputsRef(projectId), `${artifact.kind}:${artifact.id}`), {
    type,
    artifact: compactChatArtifact(artifact),
    createdAt: new Date().toISOString(),
  });
}

export function subscribeStudioArtifacts(projectId: string, onChange: (items: StudioSavedArtifact[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(outputsRef(projectId), { includeMetadataChanges: true }, (snapshot) => {
    const items = snapshot.docs.filter((item) => !item.metadata.hasPendingWrites).flatMap((item): StudioSavedArtifact[] => {
      const data = item.data();
      const artifact = parseChatArtifact(data.artifact);
      if (!artifact || !STUDIO_TILES.some((tile) => tile.id === data.type)) return [];
      return [{ type: data.type as StudioTool, artifact, createdAt: typeof data.createdAt === "string" ? data.createdAt : "" }];
    });
    onChange(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, onError);
}
