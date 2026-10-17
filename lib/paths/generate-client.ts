import { authHeaders } from "@/lib/api/client";
import { clipText, PATH_EXCERPT_CHARS, PATH_SOURCE_LIMIT, PATH_TOTAL_CHARS } from "@/lib/materials/limits";
import { loadMaterialText } from "@/lib/materials/storage";
import { excerptForPath } from "@/lib/paths/excerpt";
import { saveStudyPath } from "@/lib/paths/store";
import type { Material } from "@/types/material";
import type { PathCourse, PathKind } from "@/types/path";

export type PathGenerateEvent = {
  status?: string | null;
  title?: string;
  courses?: PathCourse[];
  pathId?: string;
};

export async function collectPathSources(input: {
  materials: Material[];
  prompt?: string;
}): Promise<{ title: string; excerpt: string }[]> {
  const excerpts: { title: string; excerpt: string }[] = [];
  let used = 0;
  const prompt = input.prompt?.trim();
  if (prompt) {
    const excerpt = clipText(prompt, 800);
    excerpts.push({ title: "Request", excerpt });
    used += excerpt.length;
  }
  for (const material of input.materials.slice(0, PATH_SOURCE_LIMIT)) {
    if (used >= PATH_TOTAL_CHARS) break;
    const text = await loadMaterialText(material);
    const excerpt = excerptForPath(text || material.extractedTextPreview, PATH_EXCERPT_CHARS);
    if (!excerpt) continue;
    used += excerpt.length;
    excerpts.push({ title: material.title, excerpt });
  }
  return excerpts;
}

export async function generatePathFromPrompt(input: {
  projectId: string;
  userId: string;
  projectTitle: string;
  materials: Material[];
  prompt: string;
  kind?: PathKind;
  signal?: AbortSignal;
  onEvent?: (event: PathGenerateEvent) => void;
}): Promise<{ id: string; title: string; courses: PathCourse[]; currentCourseId: string; currentNodeId: string }> {
  const sources = await collectPathSources({
    materials: input.materials,
    prompt: input.prompt,
  });
  if (sources.length === 0) {
    throw new Error("Add a syllabus or name the course first.");
  }

  const kind = input.kind ?? "course";
  const response = await fetch("/api/paths/generate", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      projectTitle: input.projectTitle,
      instruction: input.prompt,
      sources,
      kind,
    }),
    signal: input.signal,
  });

  const generated = await readPathSse(response, input.onEvent);
  input.signal?.throwIfAborted();
  const title = generated.title.trim() || "Path";
  const id = await saveStudyPath({
    projectId: input.projectId,
    userId: input.userId,
    title,
    kind,
    courses: generated.courses,
    currentCourseId: generated.currentCourseId,
    currentNodeId: generated.currentNodeId,
    sourceMaterialIds: input.materials.map((item) => item.id),
    started: false,
    signal: input.signal,
  });
  input.onEvent?.({ title, courses: generated.courses, pathId: id, status: null });
  return {
    id,
    title,
    courses: generated.courses,
    currentCourseId: generated.currentCourseId,
    currentNodeId: generated.currentNodeId,
  };
}

async function readPathSse(
  response: Response,
  onEvent?: (event: PathGenerateEvent) => void,
): Promise<{ title: string; courses: PathCourse[]; currentCourseId: string; currentNodeId: string }> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const data = (await response.json().catch(() => null)) as {
      title?: string;
      courses?: PathCourse[];
      currentCourseId?: string;
      currentNodeId?: string;
      error?: string;
    } | null;
    if (!response.ok || !data?.courses?.length || !data.currentCourseId || !data.currentNodeId) {
      throw new Error(data?.error ?? "Could not build a path.");
    }
    const title = data.title?.trim() || "Path";
    onEvent?.({ title, courses: data.courses });
    return {
      title,
      courses: data.courses,
      currentCourseId: data.currentCourseId,
      currentNodeId: data.currentNodeId,
    };
  }

  if (!response.body) throw new Error("No response stream.");
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Could not build a path.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let title = "Path";
  let courses: PathCourse[] = [];
  let currentCourseId = "";
  let currentNodeId = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const line = event.split("\n").find((entry) => entry.startsWith("data: "));
      if (!line) continue;
      const payload = JSON.parse(line.slice(6)) as {
        status?: string;
        title?: string;
        courses?: PathCourse[];
        currentCourseId?: string;
        currentNodeId?: string;
        error?: string;
        done?: boolean;
      };
      if (payload.error) throw new Error(payload.error);
      if (payload.status) onEvent?.({ status: payload.status });
      if (payload.title?.trim()) {
        title = payload.title.trim();
        onEvent?.({ title });
      }
      if (Array.isArray(payload.courses) && payload.courses.length > 0) {
        courses = payload.courses;
        onEvent?.({ title, courses });
      }
      if (payload.done) {
        title = payload.title?.trim() || title;
        if (Array.isArray(payload.courses) && payload.courses.length > 0) courses = payload.courses;
        currentCourseId = payload.currentCourseId || currentCourseId;
        currentNodeId = payload.currentNodeId || currentNodeId;
        onEvent?.({ title, courses });
      }
    }
  }

  if (!courses.length) throw new Error("Could not build a path.");
  const first = courses[0]?.units[0]?.nodes[0];
  return {
    title,
    courses,
    currentCourseId: currentCourseId || courses[0]?.id || "",
    currentNodeId: currentNodeId || first?.id || "",
  };
}
