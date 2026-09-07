import { collection, getDocs, query, where } from "firebase/firestore";
import { COLLECTIONS } from "@/lib/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { asString, toIsoDate } from "@/lib/timestamps";
import type { KnowledgeItem } from "@/types/knowledge";

function mapItem(id: string, data: Record<string, unknown>): KnowledgeItem {
  return {
    id,
    projectId: typeof data.projectId === "string" ? data.projectId : null,
    category: asString(data.category),
    type: asString(data.type, "fact"),
    prompt: asString(data.prompt),
    answer: asString(data.answer),
    metadata: typeof data.metadata === "object" && data.metadata ? (data.metadata as KnowledgeItem["metadata"]) : {},
    createdAt: toIsoDate(data.createdAt),
  };
}

export async function listKnowledgeForProject(projectId: string): Promise<KnowledgeItem[]> {
  try {
    const ref = collection(getFirebaseDb(), COLLECTIONS.knowledgeItems);
    const [scoped, global] = await Promise.all([
      getDocs(query(ref, where("projectId", "==", projectId))),
      getDocs(query(ref, where("projectId", "==", null))),
    ]);
    return [
      ...scoped.docs.map((item) => mapItem(item.id, item.data())),
      ...global.docs.map((item) => mapItem(item.id, item.data())),
    ].filter((item) => item.prompt);
  } catch {
    return [];
  }
}
