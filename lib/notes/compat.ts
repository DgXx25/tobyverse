import { readNoteBlocks } from "@/lib/notes/blocks";
import type { NoteSchemaVersion, StudySheet } from "@/types/study-sheet";

const V1_TEXT_KEYS = [
  "content",
  "markdown",
  "body",
  "text",
  "keyIdeas",
  "definitions",
  "remember",
  "summary",
] as const;

export function collectNoteProse(data: Record<string, unknown>): { content: string; sections: Record<string, string>; prose: string } {
  const content = typeof data.content === "string" ? data.content : "";
  const sections: Record<string, string> = {};
  const rawSections = data.sections;
  if (rawSections && typeof rawSections === "object" && !Array.isArray(rawSections)) {
    for (const [key, value] of Object.entries(rawSections as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) sections[key] = value.trim();
    }
  } else if (Array.isArray(rawSections)) {
    rawSections.forEach((item, index) => {
      if (typeof item === "string" && item.trim()) {
        sections[`section ${index + 1}`] = item.trim();
        return;
      }
      if (!item || typeof item !== "object") return;
      const row = item as { title?: unknown; heading?: unknown; body?: unknown; content?: unknown; text?: unknown };
      const heading =
        [row.title, row.heading].find((entry) => typeof entry === "string" && entry.trim()) as string | undefined;
      const body = [row.body, row.content, row.text].find((entry) => typeof entry === "string" && entry.trim());
      if (typeof body === "string") sections[heading?.trim() || `section ${index + 1}`] = body.trim();
    });
  }

  const chunks: string[] = [];
  if (content.trim()) chunks.push(content.trim());
  for (const [key, value] of Object.entries(sections)) {
    chunks.push(`## ${key}\n${value}`);
  }
  for (const key of V1_TEXT_KEYS) {
    if (key === "content") continue;
    const value = data[key];
    if (typeof value === "string" && value.trim()) chunks.push(value.trim());
  }

  return { content, sections, prose: chunks.join("\n\n").trim() };
}

export function readNoteSchemaVersion(raw: unknown, hasBlocks: boolean): NoteSchemaVersion {
  if (raw === 10 || raw === "10") return 10;
  if (raw === 9 || raw === "9") return 9;
  if (raw === 8 || raw === "8") return 8;
  if (raw === 7 || raw === "7") return 7;
  if (raw === 6 || raw === "6") return 6;
  if (raw === 5 || raw === "5") return 5;
  if (raw === 4 || raw === "4") return 4;
  if (raw === 3 || raw === "3") return 3;
  if (raw === 2 || raw === "2") return 2;
  if (raw === 1 || raw === "1") return 1;
  return hasBlocks ? 2 : 1;
}

export function mapNoteRecord(
  id: string,
  projectId: string,
  data: Record<string, unknown>,
  extras: Pick<StudySheet, "userId" | "title" | "sourceMaterialIds" | "createdAt">,
): StudySheet {
  const rawBlocks = Array.isArray(data.blocks) ? data.blocks : data.visuals;
  const { content, sections, prose } = collectNoteProse(data);
  const blocks = readNoteBlocks(rawBlocks);
  return {
    id,
    projectId,
    ...extras,
    schemaVersion: readNoteSchemaVersion(data.schemaVersion, blocks.length > 0),
    blocks,
    content,
    sections,
    prose,
  };
}
