import { authHeaders } from "@/lib/api/client";
import { createStudySheet, updateStudySheet } from "@/lib/study-sheets/store";
import { collectProjectSources } from "@/lib/composer/sources";
import { normalizeNoteBlocks } from "@/lib/notes/blocks";
import type { Material } from "@/types/material";
import { NOTES_SCHEMA_VERSION } from "@/types/study-sheet";
import type { VisualBlock } from "@/types/visual";

export async function generateStudySheetFromPrompt(input: {
  projectId: string;
  userId: string;
  projectTitle: string;
  materials: Material[];
  prompt: string;
  title?: string;
}): Promise<{ id: string; title: string }> {
  const generated = await requestNotes(input);
  const title = input.title?.trim() || generated.title || "Notes";
  const id = await createStudySheet({
    projectId: input.projectId,
    userId: input.userId,
    title,
    blocks: generated.blocks,
    sourceMaterialIds: input.materials.map((item) => item.id),
  });
  return { id, title };
}

export async function rewriteStudySheetFromPrompt(input: {
  projectId: string;
  sheetId: string;
  projectTitle: string;
  materials: Material[];
  prompt: string;
  currentBlocks?: VisualBlock[];
  currentTitle?: string;
  currentContent?: string;
}): Promise<{ title: string }> {
  const generated = await requestNotes({
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    materials: input.materials,
    prompt: input.prompt,
    currentBlocks: input.currentBlocks,
    currentTitle: input.currentTitle,
    currentContent: input.currentContent,
  });
  const title = generated.title || input.currentTitle || "Notes";
  await updateStudySheet(input.projectId, input.sheetId, {
    title,
    blocks: generated.blocks,
    schemaVersion: NOTES_SCHEMA_VERSION,
  });
  return { title };
}

async function requestNotes(input: {
  projectId: string;
  projectTitle: string;
  materials: Material[];
  prompt: string;
  currentBlocks?: VisualBlock[];
  currentTitle?: string;
  currentContent?: string;
}): Promise<{ title: string; blocks: VisualBlock[] }> {
  const sources = await collectProjectSources({
    projectId: input.projectId,
    materials: input.materials,
    prompt: input.prompt,
  });
  if (sources.length === 0 && !input.currentBlocks?.length && !input.currentContent?.trim() && !input.prompt.trim()) {
    throw new Error("Add a file or say a bit more about the topic first.");
  }

  const response = await fetch("/api/study-sheets/generate", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      projectTitle: input.projectTitle,
      sources,
      instruction: input.prompt,
      currentBlocks: input.currentBlocks,
      currentTitle: input.currentTitle,
      currentContent: input.currentContent,
    }),
  });
  const data = (await response.json()) as {
    title?: string;
    blocks?: VisualBlock[];
    error?: string;
  };
  if (!response.ok || !Array.isArray(data.blocks) || data.blocks.length === 0) {
    throw new Error(data.error ?? "Could not update the notes.");
  }
  return { title: data.title?.trim() || "Notes", blocks: normalizeNoteBlocks(data.blocks) };
}
