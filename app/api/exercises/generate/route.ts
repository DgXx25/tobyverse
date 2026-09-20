import { generateJson } from "@/lib/ai/json";
import { getGenerateTextCallCount } from "@/lib/ai/gemini";
import { assertAccountRequest, authErrorResponse } from "@/lib/api/assert";
import { payloadSchemaFor, practiceSetEnvelopeSchema } from "@/lib/exercises/schemas";
import { exerciseSetSystemPrompt, exerciseSystemPrompt, knowledgeSystemNote } from "@/lib/exercises/prompt";
import { isGenerableExerciseType, practiceSetBounds } from "@/lib/exercises/plan";
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

function compileSources(sources: unknown): string {
  if (!Array.isArray(sources)) return "";
  return sources
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
}

function compileKnowledge(knowledge: unknown): string[] {
  if (!Array.isArray(knowledge)) return [];
  return knowledge.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { prompt?: unknown; answer?: unknown };
    if (typeof row.prompt !== "string") return [];
    return [`- ${row.prompt}${typeof row.answer === "string" ? ` → ${row.answer.slice(0, 200)}` : ""}`];
  });
}

function compileAvoid(avoid: unknown): string[] {
  if (!Array.isArray(avoid)) return [];
  return avoid.filter((item): item is string => typeof item === "string").slice(0, 12);
}

function sourcePrompt(input: {
  projectTitle: string;
  knowledge: string[];
  avoid: string[];
  instruction: string;
  currentJson: string;
  compiled: string;
}): string {
  return [
    `Project: ${input.projectTitle}`,
    input.knowledge.length ? `Unseen facts:\n${input.knowledge.slice(0, 8).join("\n")}` : null,
    input.avoid.length ? `Do not repeat:\n${input.avoid.map((item) => `- ${item}`).join("\n")}` : null,
    input.instruction ? `Rewrite instruction: ${input.instruction}` : null,
    input.currentJson ? `Current item JSON (replace this, same type, keep the same skill):\n${input.currentJson}` : null,
    input.compiled.trim() ? `Sources:\n${clipText(input.compiled, SHEET_TOTAL_CHARS)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function categoryFor(type: ExerciseType) {
  return isProblemType(type) ? EXERCISE_CATEGORIES[1] : EXERCISE_CATEGORIES[0];
}

export async function POST(request: Request) {
  try {
    await assertAccountRequest(request);
  } catch (error) {
    return authErrorResponse(error);
  }

  let body: {
    type?: unknown;
    types?: unknown;
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

  const compiled = compileSources(body.sources);
  const knowledge = compileKnowledge(body.knowledge);
  const avoid = compileAvoid(body.avoid);
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  const currentJson =
    body.current && typeof body.current === "object" ? JSON.stringify(body.current).slice(0, 4000) : "";

  if (!compiled.trim() && knowledge.length === 0 && !currentJson) {
    const formOnly =
      (typeof body.type === "string" && body.type === "paper") ||
      (Array.isArray(body.types) && body.types.length > 0 && body.types.every((item) => item === "paper"));
    if (!formOnly) {
      return Response.json({ error: "Add materials or knowledge first." }, { status: 400 });
    }
  }

  const projectTitle = typeof body.projectTitle === "string" ? body.projectTitle : "Project";
  const shared = sourcePrompt({
    projectTitle,
    knowledge,
    avoid,
    instruction,
    currentJson,
    compiled,
  });
  const knowledgeNote = knowledge.length ? `\n${knowledgeSystemNote()}` : "";

  const requestedTypes = Array.isArray(body.types)
    ? body.types.flatMap((item) => {
        const type = asType(item);
        return type && isGenerableExerciseType(type) ? [type] : [];
      })
    : [];

  if (requestedTypes.length > 0) {
    const { requested, minAccept } = practiceSetBounds(requestedTypes.length);
    const types = requestedTypes.slice(0, requested);
    const before = getGenerateTextCallCount();
    const result = await generateJson(shared, practiceSetEnvelopeSchema(minAccept, requested), {
      systemInstruction: `${exerciseSetSystemPrompt(types)}${knowledgeNote}`,
    });
    const geminiCalls = getGenerateTextCallCount() - before;

    if (!result.ok) {
      console.info(`[practice-generate] geminiCalls before=${types.length} after=${geminiCalls} items=0`);
      return Response.json({ error: result.error, geminiCalls }, { status: 422 });
    }

    const envelope = result.data as { items: { type: ExerciseType; data: unknown }[] };
    const items = envelope.items.flatMap((item) => {
      if (!isGenerableExerciseType(item.type)) return [];
      const parsed = payloadSchemaFor(item.type).safeParse(item.data);
      if (!parsed.success) return [];
      return [
        {
          type: item.type,
          category: categoryFor(item.type),
          data: parsed.data,
        },
      ];
    });

    if (items.length < minAccept) {
      console.info(`[practice-generate] geminiCalls before=${types.length} after=${geminiCalls} items=${items.length}`);
      return Response.json({ error: "Practice set was too small.", geminiCalls }, { status: 422 });
    }

    const capped = items.slice(0, requested);
    console.info(`[practice-generate] geminiCalls before=${types.length} after=${geminiCalls} items=${capped.length}`);
    return Response.json({ items: capped, geminiCalls });
  }

  const type = asType(body.type);
  if (!type) {
    return Response.json({ error: "Unknown exercise type." }, { status: 400 });
  }

  const result = await generateJson(`${shared}\n\nType: ${type}`, payloadSchemaFor(type), {
    systemInstruction: `${exerciseSystemPrompt(type)}${knowledgeNote}`,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  return Response.json({
    type,
    category: categoryFor(type),
    data: result.data,
  });
}
