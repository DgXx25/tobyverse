import type { UiIconName } from "@/components/workspace/ui-icon";

/** Fallback symbols when a project has not picked one. */
export const PROJECT_ICONS = [
  "book",
  "brain",
  "atom",
  "flask",
  "dna",
  "globe",
  "leaf",
  "heart",
  "lungs",
  "bone",
  "pill",
  "cell",
  "mountain",
  "flame",
  "zap",
  "star",
  "apple",
  "shield",
  "library",
  "deck",
] as const satisfies readonly UiIconName[];

export type ProjectIconName = string;

export function isProjectIcon(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 80;
}

function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) >>> 0;
  return value;
}

/** A stable symbol for notebooks that never picked one, so the grid is not a wall of identical glyphs. */
export function projectIconFor(project: { id: string; icon?: string }): ProjectIconName {
  if (isProjectIcon(project.icon)) return project.icon;
  return PROJECT_ICONS[hash(project.id) % PROJECT_ICONS.length];
}

export const FOLDER_SUGGESTIONS = ["Study", "Work", "Research", "Personal"] as const;

export function normalizeFolder(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
}

/** Folder names in use, most notebooks first, so the filter row shows what matters. */
export function foldersOf(projects: { folder?: string }[]): string[] {
  const counts = new Map<string, number>();
  for (const project of projects) {
    const folder = normalizeFolder(project.folder);
    if (folder) counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
}
