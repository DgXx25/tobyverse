import { generateJson } from "@/lib/ai/json";
import { generateTextStream } from "@/lib/ai/gemini";
import { extractJsonArrayItems, extractOpenArrayObject, peekJsonString } from "@/lib/ai/json-stream";
import { parseJsonLoose } from "@/lib/schema/json";
import { hydrateCourses, PATH_REVIEW_MAX_NODES } from "@/lib/paths/model";
import { pathSystemPrompt } from "@/lib/paths/prompt";
import { pathDraftSchema } from "@/lib/paths/schema";
import type { PathCourse, PathKind } from "@/types/path";

export type PathStreamEvent =
  | { type: "status"; status: string }
  | { type: "title"; title: string }
  | { type: "draft"; title: string; courses: PathCourse[] }
  | { type: "done"; title: string; courses: PathCourse[]; currentCourseId: string; currentNodeId: string }
  | { type: "error"; error: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function visibleCount(courses: PathCourse[]): number {
  return courses.reduce(
    (sum, course) => sum + course.units.reduce((units, unit) => units + 1 + unit.nodes.length, 0),
    0,
  );
}

function asUnitish(value: unknown): { title?: string; teach?: string; nodes?: Array<{ title?: string; teach?: string; outcome?: string }> } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { title?: unknown; teach?: unknown; nodes?: unknown };
  return {
    title: typeof row.title === "string" ? row.title : undefined,
    teach: typeof row.teach === "string" ? row.teach : undefined,
    nodes: Array.isArray(row.nodes)
      ? row.nodes.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const node = item as { title?: string; teach?: string; outcome?: string };
          return node.title ? [node] : [];
        })
      : undefined,
  };
}

function asCourseish(value: unknown): { title?: string; units?: Array<{ title?: string; teach?: string; nodes?: Array<{ title?: string; teach?: string; outcome?: string }> }> } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { title?: unknown; units?: unknown };
  return {
    title: typeof row.title === "string" ? row.title : undefined,
    units: Array.isArray(row.units)
      ? row.units.flatMap((item) => {
          const unit = asUnitish(item);
          return unit ? [unit] : [];
        })
      : undefined,
  };
}

function unitsFromObject(raw: string): Array<{ title?: string; teach?: string; nodes?: Array<{ title?: string; teach?: string; outcome?: string }> }> {
  const units = extractJsonArrayItems(raw, "units").flatMap((item) => {
    const unit = asUnitish(item);
    return unit ? [unit] : [];
  });
  const open = extractOpenArrayObject(raw, "units");
  if (!open) return units;
  const title = peekJsonString(open, "title")?.trim();
  const teach = peekJsonString(open, "teach")?.trim();
  const nodes = extractJsonArrayItems(open, "nodes").flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const node = item as { title?: string; teach?: string; outcome?: string };
    return node.title ? [node] : [];
  });
  const openNode = extractOpenArrayObject(open, "nodes");
  if (openNode) {
    const nodeTitle = peekJsonString(openNode, "title")?.trim();
    const nodeTeach = peekJsonString(openNode, "teach")?.trim();
    if (nodeTitle) nodes.push({ title: nodeTitle, teach: nodeTeach });
  }
  if (!title && nodes.length === 0) return units;
  return [...units, { title: title || undefined, teach: teach || undefined, nodes }];
}

function coursesFromRaw(raw: string, fallbackTitle: string): Array<{ title?: string; units?: Array<{ title?: string; teach?: string; nodes?: Array<{ title?: string; teach?: string; outcome?: string }> }> }> {
  const complete = extractJsonArrayItems(raw, "courses").flatMap((item) => {
    const course = asCourseish(item);
    return course ? [course] : [];
  });
  const open = extractOpenArrayObject(raw, "courses");
  if (open) {
    const title = peekJsonString(open, "title")?.trim();
    const units = unitsFromObject(open);
    if (title || units.length > 0) {
      complete.push({ title: title || fallbackTitle || "Course", units });
    }
  }
  if (complete.length > 0) return complete;
  const units = unitsFromObject(raw);
  if (units.length === 0) return [];
  return [{ title: fallbackTitle || "Course", units }];
}

function hydrateDraft(courses: Parameters<typeof hydrateCourses>[0], kind: PathKind) {
  return hydrateCourses(courses, kind === "review" ? { maxNodes: PATH_REVIEW_MAX_NODES } : undefined);
}

function draftFromRaw(raw: string, fallbackTitle: string, kind: PathKind): { title: string; courses: PathCourse[] } | null {
  const title = peekJsonString(raw, "title")?.trim() || fallbackTitle;
  const courses = coursesFromRaw(raw, title || "Path");
  if (courses.length === 0) return null;
  const hydrated = hydrateDraft(courses, kind);
  if (hydrated.courses.length === 0) return null;
  return { title, courses: hydrated.courses };
}

function growingCourses(courses: PathCourse[]): PathCourse[][] {
  const frames: PathCourse[][] = [];
  const acc = courses.map((course) => ({ ...course, units: [] as typeof course.units }));
  for (let ci = 0; ci < courses.length; ci += 1) {
    acc[ci] = { ...courses[ci], units: [] };
    for (const unit of courses[ci].units) {
      acc[ci] = { ...acc[ci], units: [...acc[ci].units, unit] };
      frames.push(acc.map((course, index) => (index === ci ? acc[ci] : { ...course, units: [...course.units] })));
    }
  }
  return frames;
}

export async function* streamPathDocument(userPrompt: string, kind: PathKind = "course"): AsyncGenerator<PathStreamEvent> {
  let raw = "";
  let title = "";
  let emittedUnits = 0;

  try {
    for await (const chunk of generateTextStream(userPrompt, {
      json: true,
      systemInstruction: pathSystemPrompt(kind),
    })) {
      raw += chunk;
      const nextTitle = peekJsonString(raw, "title");
      if (nextTitle?.trim() && nextTitle !== title) {
        title = nextTitle.trim().slice(0, 80);
        yield { type: "title", title };
      }
      const draft = draftFromRaw(raw, title || "Path", kind);
      if (!draft) continue;
      const nextCount = visibleCount(draft.courses);
      if (nextCount > emittedUnits) {
        emittedUnits = nextCount;
        title = draft.title || title;
        yield { type: "draft", title: title || "Path", courses: draft.courses };
      }
    }
  } catch (error) {
    if (!raw.trim()) {
      yield { type: "error", error: error instanceof Error ? error.message : "Generation failed." };
      return;
    }
  }

  let parsed: unknown = null;
  try {
    const result = pathDraftSchema.safeParse(parseJsonLoose(raw));
    if (result.success) parsed = result.data;
  } catch {
    parsed = null;
  }

  if (!parsed) {
    const repaired = await generateJson(userPrompt, pathDraftSchema, {
      systemInstruction: pathSystemPrompt(kind),
    });
    if (!repaired.ok) {
      yield { type: "error", error: repaired.error };
      return;
    }
    parsed = repaired.data;
  }

  const draft = pathDraftSchema.parse(parsed);
  const hydrated = hydrateDraft(draft.courses, kind);
  if (hydrated.courses.length === 0) {
    yield { type: "error", error: "Could not build a path from that." };
    return;
  }
  const finalTitle = (typeof draft.title === "string" && draft.title.trim() ? draft.title.trim() : title) || "Path";

  if (emittedUnits === 0) {
    for (const frame of growingCourses(hydrated.courses)) {
      yield { type: "draft", title: finalTitle, courses: frame };
      await sleep(80);
    }
  } else if (visibleCount(hydrated.courses) > emittedUnits) {
    yield { type: "draft", title: finalTitle, courses: hydrated.courses };
  }

  yield {
    type: "done",
    title: finalTitle,
    courses: hydrated.courses,
    currentCourseId: hydrated.currentCourseId,
    currentNodeId: hydrated.currentNodeId,
  };
}
