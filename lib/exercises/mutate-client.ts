import { authHeaders } from "@/lib/api/client";
import { generatePracticeSet } from "@/lib/exercises/generate-set";
import {
  exerciseStem,
  getExercise,
  listExercises,
  updateExercise,
  type ProjectExercise,
} from "@/lib/exercises/store";
import { collectProjectSources } from "@/lib/composer/sources";
import type { Material } from "@/types/material";
import type { Project } from "@/types/project";
import type { ExerciseCategory, ExerciseType } from "@/types/exercise";

async function generateOne(input: {
  projectTitle: string;
  type: ExerciseType;
  sources: { title: string; excerpt: string }[];
  avoid: string[];
  instruction?: string;
  current?: ProjectExercise["data"];
}): Promise<{ type: ExerciseType; category: ExerciseCategory; data: ProjectExercise["data"] }> {
  const response = await fetch("/api/exercises/generate", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      type: input.type,
      projectTitle: input.projectTitle,
      sources: input.sources,
      avoid: input.avoid,
      instruction: input.instruction,
      current: input.current,
    }),
  });
  const data = (await response.json()) as {
    type?: ExerciseType;
    category?: ExerciseCategory;
    data?: ProjectExercise["data"];
    error?: string;
  };
  if (!response.ok || !data.type || !data.data) {
    throw new Error(data.error ?? "Could not update this item.");
  }
  return { type: data.type, category: data.category ?? "theory", data: data.data };
}

export async function rewritePracticeItems(input: {
  project: Project;
  userId: string;
  ids: string[];
  instruction: string;
  materials: Material[];
  onStatus?: (status: string) => void;
}): Promise<number> {
  const existing = await listExercises(input.project.id);
  const byId = new Map(existing.map((item) => [item.id, item]));
  const items = input.ids.map((id) => byId.get(id)).filter((item): item is ProjectExercise => Boolean(item));
  if (items.length === 0) throw new Error("No items in this practice set.");

  const sources = await collectProjectSources({
    projectId: input.project.id,
    materials: input.materials,
    prompt: input.instruction,
  });
  if (sources.length === 0) {
    sources.push({
      title: "Current set",
      excerpt: items.map((item) => JSON.stringify(item.data)).join("\n").slice(0, 4000),
    });
  }

  const avoid: string[] = [];
  let updated = 0;
  for (const [index, item] of items.entries()) {
    if (item.type === "unsupported") continue;
    input.onStatus?.(`Updating practice · ${index + 1}/${items.length}`);
    try {
      const next = await generateOne({
        projectTitle: input.project.title,
        type: item.type,
        sources,
        avoid,
        instruction: input.instruction,
        current: item.data,
      });
      await updateExercise(input.project.id, item.id, {
        type: next.type,
        category: next.category,
        data: next.data,
      });
      avoid.push(exerciseStem({ ...item, data: next.data }));
      updated += 1;
    } catch {
      avoid.push(exerciseStem(item));
    }
  }
  if (updated === 0) throw new Error("Could not update the practice set.");
  return items.length;
}

export async function appendPracticeItems(input: {
  project: Project;
  userId: string;
  materials: Material[];
  prompt: string;
  count: number;
  onStatus?: (status: string) => void;
}): Promise<string[]> {
  const extra = await generatePracticeSet({
    project: input.project,
    userId: input.userId,
    materials: input.materials,
    prompt: input.prompt,
    count: input.count,
    onStatus: input.onStatus,
  });
  return extra.ids;
}

export async function regenerateOneItem(input: {
  project: Project;
  exerciseId: string;
  instruction: string;
  materials: Material[];
}): Promise<void> {
  const item = await getExercise(input.project.id, input.exerciseId);
  if (!item) throw new Error("That question is gone.");
  if (item.type === "unsupported") throw new Error("This item type isn’t supported yet.");
  const sources = await collectProjectSources({
    projectId: input.project.id,
    materials: input.materials,
    prompt: input.instruction,
  });
  if (sources.length === 0) {
    sources.push({ title: "Current item", excerpt: JSON.stringify(item.data).slice(0, 4000) });
  }
  const next = await generateOne({
    projectTitle: input.project.title,
    type: item.type,
    sources,
    avoid: [],
    instruction: input.instruction,
    current: item.data,
  });
  await updateExercise(input.project.id, item.id, {
    type: next.type,
    category: next.category,
    data: next.data,
  });
}
