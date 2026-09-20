import { authHeaders } from "@/lib/api/client";
import { incrementUsage } from "@/lib/account/store";
import {
  choosePracticeSetSize,
  createExercise,
  deleteExercise,
  exerciseStem,
  isGenerableExerciseType,
  planPracticeSet,
  practiceFamilyForTopic,
  practiceFamilyFromTypes,
  practiceSetBounds,
  CLICK_FIRST_TYPES,
  listExercises,
  PAPER_SET_CAP,
  type PracticeFamily,
  type ProjectExercise,
} from "@/lib/exercises";
import { selectEligibleKnowledgeItems } from "@/lib/knowledge/selection";
import { listKnowledgeForProject } from "@/lib/knowledge/store";
import { goalOrDefault } from "@/lib/composer/goal";
import { collectProjectSources } from "@/lib/composer/sources";
import type { Material } from "@/types/material";
import type { Project } from "@/types/project";
import type { ExerciseCategory, ExerciseType } from "@/types/exercise";

export async function generatePracticeSet(input: {
  project: Project;
  userId: string;
  materials: Material[];
  prompt?: string;
  count?: number;
  family?: PracticeFamily;
  onStatus?: (status: string) => void;
}): Promise<{ ids: string[]; count: number }> {
  const sources = await collectProjectSources({
    projectId: input.project.id,
    materials: input.materials,
    prompt: input.prompt,
  });
  const knowledgeItems = selectEligibleKnowledgeItems(
    await listKnowledgeForProject(input.project.id),
    new Map(),
    { userId: input.userId, projectId: input.project.id, excludeAcquired: true },
  ).slice(0, 8);

  const existing = await listExercises(input.project.id);
  const avoid = existing.map(exerciseStem);
  const goal = goalOrDefault(input.prompt ?? "", input.project.goal);
  const topic = input.prompt?.trim() || input.project.title;
  const family =
    input.family ??
    (existing.length > 0 && !input.prompt?.trim()
      ? practiceFamilyFromTypes(existing.map((item) => item.type))
      : practiceFamilyForTopic(topic));
  if (sources.length === 0 && knowledgeItems.length === 0 && family !== "form") {
    throw new Error("Add a file or describe the topic first.");
  }
  const { requested, minAccept } = practiceSetBounds(
    input.count ?? (family === "form" ? PAPER_SET_CAP : choosePracticeSetSize({ goal })),
  );
  const plan = planPracticeSet(family, requested).filter((item) => {
    if (!isGenerableExerciseType(item.type)) return false;
    if (family === "recall" && !CLICK_FIRST_TYPES.includes(item.type)) return false;
    return true;
  });
  if (plan.length < minAccept) {
    throw new Error("Could not create a practice set.");
  }

  const response = await fetch("/api/exercises/generate", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      types: plan.map((item) => item.type),
      projectTitle: input.project.title,
      sources,
      knowledge: knowledgeItems.map((item) => ({
        id: item.id,
        prompt: item.prompt,
        answer: item.answer,
      })),
      avoid,
    }),
  });
  const data = (await response.json()) as {
    items?: Array<{ type?: ExerciseType; category?: ExerciseCategory; data?: ProjectExercise["data"] }>;
    error?: string;
    geminiCalls?: number;
  };
  const geminiCalls = typeof data.geminiCalls === "number" ? data.geminiCalls : 0;
  console.info(`[practice-generate] geminiCalls before=${plan.length} after=${geminiCalls}`);

  const items = (data.items ?? []).flatMap((item) => {
    if (!item.type || !item.data || !isGenerableExerciseType(item.type)) return [];
    return [{ type: item.type, category: item.category ?? "theory", data: item.data }];
  });
  if (!response.ok || items.length < minAccept) {
    throw new Error(data.error ?? "Could not create a practice set.");
  }

  const ids: string[] = [];
  try {
    for (const item of items.slice(0, requested)) {
      const id = await createExercise({
        projectId: input.project.id,
        userId: input.userId,
        type: item.type,
        category: item.category,
        data: item.data,
        sourceMaterialIds: input.materials.map((row) => row.id),
        knowledgeItemId: knowledgeItems[0]?.id ?? null,
      });
      ids.push(id);
    }
  } catch (error) {
    await Promise.all(ids.map((id) => deleteExercise(input.project.id, id).catch(() => undefined)));
    throw error;
  }

  await incrementUsage(input.userId, "practiceGenerated");
  return { ids, count: ids.length };
}
