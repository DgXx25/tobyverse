import { generateJson } from "@/lib/ai/json";
import { assertSignedInRequest, authErrorResponse } from "@/lib/api/assert";
import { payloadSchemaFor } from "@/lib/exercises/schemas";
import { exerciseSystemPrompt, knowledgeSystemNote } from "@/lib/exercises/prompt";
import { clipText, SHEET_TOTAL_CHARS } from "@/lib/materials/limits";
import { EXERCISE_CATEGORIES, PROBLEM_EXERCISE_TYPES, THEORY_EXERCISE_TYPES, type ExerciseType } from "@/types/exercise";
import { isProblemType } from "@/lib/exercises/templates";

export const runtime = "nodejs";

function asType(value: unknown): ExerciseType | null {
  if (typeof value !== "string") return null;
  if (
    (THEORY_EXERCISE_TYPES as readonly string[]).includes(value) ||
    (PROBLEM_EXERCISE_TYPES as readonly string[]).includes(value)
  ) {
    return value as ExerciseType;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    await assertSignedInRequest(request);
  } catch (error) {
    return authErrorResponse(error);
  }

  let body: {
    type?: unknown;
    projectTitle?: unknown;
    sources?: unknown;
    knowledge?: unknown;
    avoid?: unknown;
    instruction?: unknown;
    current?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const type = asType(body.type);
  if (!type) {
    return Response.json({ error: "Unknown exercise type." }, { status: 400 });
  }

  const sources = Array.isArray(body.sources) ? body.sources : [];
  const compiled = sources
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { title?: unknown; excerpt?: unknown; images?: unknown };
      if (typeof row.title !== "string") return [];
      const excerpt = typeof row.excerpt === "string" ? row.excerpt.trim() : "";
      const images = Array.isArray(row.images)
        ? row.images.flatMap((image) => {
            if (!image || typeof image !== "object") return [];
            const cell = image as { slide?: unknown; path?: unknown };
            if (typeof cell.path !== "string") return [];
            return [`- slide ${typeof cell.slide === "number" ? cell.slide : 1}: ${cell.path}`];
          })
        : [];
      if (!excerpt && images.length === 0) return [];
      return [
        `# ${row.title}\n${excerpt}${images.length ? `\nImages (cite path exactly, do not invent):\n${images.join("\n")}` : ""}`,
      ];
    })
    .join("\n\n");

  const knowledge = Array.isArray(body.knowledge)
    ? body.knowledge.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as { prompt?: unknown; answer?: unknown };
        if (typeof row.prompt !== "string") return [];
        return [`- ${row.prompt}${typeof row.answer === "string" ? ` → ${row.answer.slice(0, 200)}` : ""}`];
      })
    : [];

  const avoid = Array.isArray(body.avoid)
    ? body.avoid.filter((item): item is string => typeof item === "string").slice(0, 12)
    : [];

  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  const currentJson =
    body.current && typeof body.current === "object" ? JSON.stringify(body.current).slice(0, 4000) : "";

  if (!compiled.trim() && knowledge.length === 0 && !currentJson) {
    return Response.json({ error: "Add materials or knowledge first." }, { status: 400 });
  }

  const projectTitle = typeof body.projectTitle === "string" ? body.projectTitle : "Project";
  const prompt = [
    `Project: ${projectTitle}`,
    `Type: ${type}`,
    knowledge.length ? `Unseen facts:\n${knowledge.slice(0, 8).join("\n")}` : null,
    avoid.length ? `Do not repeat:\n${avoid.map((item) => `- ${item}`).join("\n")}` : null,
    instruction ? `Rewrite instruction: ${instruction}` : null,
    currentJson ? `Current item JSON (replace this, same type, keep the same skill):\n${currentJson}` : null,
    compiled.trim() ? `Sources:\n${clipText(compiled, SHEET_TOTAL_CHARS)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await generateJson(prompt, payloadSchemaFor(type), {
    systemInstruction: `${exerciseSystemPrompt(type)}${knowledge.length ? `\n${knowledgeSystemNote()}` : ""}`,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  return Response.json({
    type,
    category: isProblemType(type) ? EXERCISE_CATEGORIES[1] : EXERCISE_CATEGORIES[0],
    data: result.data,
  });
}
