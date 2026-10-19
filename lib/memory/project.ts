import { stripArtifactMarkup } from "@/lib/composer/memory";
import { memoryKey, sanitizeMemoryContent } from "@/lib/memory/normalize";

export const PROJECT_MEMORY_MAX = 12;

const JUNK =
  /\[artifact\b|chip_|<\/?(?:tool|function)|```toby|"op"\s*:\s*"(?:add|update)"|correct answer|quiz answer/i;

export function sanitizeProjectMemoryLine(value: unknown): string {
  const stripped = stripArtifactMarkup(typeof value === "string" ? value : "");
  const line = sanitizeMemoryContent(stripped);
  if (!line || JUNK.test(line)) return "";
  return line;
}

export function asProjectMemory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const item of value) {
    if (lines.length >= PROJECT_MEMORY_MAX) break;
    const line = sanitizeProjectMemoryLine(item);
    if (!line) continue;
    const key = memoryKey(line);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return lines;
}

export function parseProjectFacts(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const row = value as { projectMemory?: unknown };
  return asProjectMemory(row.projectMemory);
}

export function mergeProjectMemory(current: string[], additions: string[]): string[] {
  const next = asProjectMemory(current);
  const seen = new Set(next.map((line) => memoryKey(line)));
  for (const raw of additions) {
    const line = sanitizeProjectMemoryLine(raw);
    if (!line) continue;
    const key = memoryKey(line);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(line);
  }
  return next.slice(-PROJECT_MEMORY_MAX);
}
