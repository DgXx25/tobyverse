import { generateJson } from "@/lib/ai/json";
import { clipText, PATH_TOTAL_CHARS } from "@/lib/materials/limits";
import { clipPathText, hydrateCourses, PATH_REVIEW_MAX_NODES, PATH_TITLE_MAX } from "@/lib/paths/model";
import { pathSystemPrompt } from "@/lib/paths/prompt";
import { pathDraftSchema } from "@/lib/paths/schema";
import type { PathCourse, PathKind } from "@/types/path";

export type PathSource = {
  title: string;
  excerpt: string;
};

export async function generatePathDocument(input: {
  projectTitle: string;
  instruction: string;
  sources: PathSource[];
  kind?: PathKind;
}): Promise<{ title: string; courses: PathCourse[]; currentCourseId: string; currentNodeId: string }> {
  const compiled = input.sources
    .map((item) => `# ${item.title}\n${item.excerpt}`.trim())
    .filter(Boolean)
    .join("\n\n");
  const kind = input.kind ?? "course";
  const userPrompt = [
    `Project: ${input.projectTitle}`,
    input.instruction ? `Request: ${input.instruction}` : null,
    kind === "review" ? "Mode: exam-prep review path (4–8 high-yield nodes)." : null,
    compiled ? `Sources (outlines only):\n${clipText(compiled, PATH_TOTAL_CHARS)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await generateJson(userPrompt, pathDraftSchema, {
    systemInstruction: pathSystemPrompt(kind),
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  const draft = pathDraftSchema.parse(result.data);
  const hydrated = hydrateCourses(draft.courses, kind === "review" ? { maxNodes: PATH_REVIEW_MAX_NODES } : undefined);
  if (hydrated.courses.length === 0) {
    throw new Error("Could not build a path from that.");
  }
  return {
    title: clipPathText(draft.title.trim() || input.projectTitle || "Path", PATH_TITLE_MAX),
    ...hydrated,
  };
}
