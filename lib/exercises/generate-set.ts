import { authHeaders } from "@/lib/api/client";
import { incrementUsage } from "@/lib/account/store";
import {
  choosePracticeSetSize,
  createExercise,
  exerciseStem,
  planPracticeSet,
  practiceFamilyForTopic,
  practiceFamilyFromTypes,
  CLICK_FIRST_TYPES,
  listExercises,
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

  if (sources.length === 0 && knowledgeItems.length === 0) {
    throw new Error("Add a file or describe the topic first.");
  }

  const existing = await listExercises(input.project.id);
  const avoid = existing.map(exerciseStem);
  const goal = goalOrDefault(input.prompt ?? "", input.project.goal);
  const count = input.count ?? choosePracticeSetSize({ goal });
  const topic = input.prompt?.trim() || input.project.title;
  const family =
    input.family ??
    (existing.length > 0 && !input.prompt?.trim()
      ? practiceFamilyFromTypes(existing.map((item) => item.type))
      : practiceFamilyForTopic(topic));
  input.onStatus?.(`Generating practice · ${count} items`);
  const plan = planPracticeSet(family, count).filter((item) => {
    if (item.type === "true_false") return false;
    if (family === "recall" && !CLICK_FIRST_TYPES.includes(item.type)) return false;
    return true;
  });
  const created: string[] = [];
  const ids: string[] = [];
  const failures: string[] = [];

  for (const planned of plan) {
    const response = await fetch("/api/exercises/generate", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        type: planned.type,
        projectTitle: input.project.title,
        sources,
        knowledge: knowledgeItems.map((item) => ({
          id: item.id,
          prompt: item.prompt,
          answer: item.answer,
        })),
        avoid: [...avoid, ...created],
      }),
    });
    const data = (await response.json()) as {
      type?: ExerciseType;
      category?: ExerciseCategory;
      data?: ProjectExercise["data"];
      error?: string;
    };
    if (!response.ok || !data.type || !data.data) {
      failures.push(`${planned.type}: ${data.error ?? "invalid JSON"}`);
      continue;
    }
    if (data.type === "true_false") {
      failures.push("true_false: skipped");
      continue;
    }
    if (family === "recall" && !CLICK_FIRST_TYPES.includes(data.type)) {
      failures.push(`${data.type}: skipped for recall`);
      continue;
    }
    const id = await createExercise({
      projectId: input.project.id,
      userId: input.userId,
      type: data.type,
      category: data.category ?? planned.category,
      data: data.data,
      sourceMaterialIds: input.materials.map((item) => item.id),
      knowledgeItemId: knowledgeItems[0]?.id ?? null,
    });
    ids.push(id);
    created.push(typeof data.data === "object" ? JSON.stringify(data.data).slice(0, 80) : data.type);
  }

  if (ids.length === 0) {
    throw new Error(failures[0] ?? "Could not create a practice set.");
  }
  await incrementUsage(input.userId, "practiceGenerated");
  return { ids, count: ids.length };
}
