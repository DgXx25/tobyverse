import { UNTITLED_NOTEBOOK_TITLE } from "@/lib/workspace/title";

const DRAFTS_KEY = "tv.untouched-notebooks";

export function isUntouchedNotebook(project: {
  title: string;
  description: string;
  projectMemory: string[];
  activeArtifact: unknown;
}): boolean {
  return project.title === UNTITLED_NOTEBOOK_TITLE
    && project.description.trim() === ""
    && project.projectMemory.length === 0
    && project.activeArtifact == null;
}

function readDraftIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(DRAFTS_KEY) || "[]") as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function writeDraftIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DRAFTS_KEY, JSON.stringify([...ids]));
  } catch {
    /* private mode */
  }
}

export function markUntouchedNotebook(id: string): void {
  const ids = readDraftIds();
  ids.add(id);
  writeDraftIds(ids);
}

export function isMarkedUntouchedNotebook(id: string): boolean {
  return readDraftIds().has(id);
}

export function clearUntouchedNotebook(id: string): void {
  const ids = readDraftIds();
  ids.delete(id);
  writeDraftIds(ids);
}
