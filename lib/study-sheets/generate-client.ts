import { authHeaders } from "@/lib/api/client";
import { createStudySheet, updateStudySheet } from "@/lib/study-sheets/store";
import { collectProjectSources } from "@/lib/composer/sources";
import type { Material } from "@/types/material";
import { NOTES_SCHEMA_VERSION } from "@/types/study-sheet";
import type { VisualBlock } from "@/types/visual";

export type NotesGenerateEvent = {
  status?: string | null;
  title?: string;
  block?: VisualBlock;
  blocks?: VisualBlock[];
  sheetId?: string;
};

export async function generateStudySheetFromPrompt(input: {
  projectId: string;
  userId: string;
  projectTitle: string;
  materials: Material[];
  prompt: string;
  title?: string;
  signal?: AbortSignal;
  onEvent?: (event: NotesGenerateEvent) => void;
}): Promise<{ id: string; title: string; blocks: VisualBlock[] }> {
  const generated = await requestNotes(input);
  const title = input.title?.trim() || generated.title || "Notes";
  const id = await createStudySheet({
    projectId: input.projectId,
    userId: input.userId,
    title,
    blocks: generated.blocks,
    content: generated.content,
    sourceMaterialIds: input.materials.map((item) => item.id),
  });
  input.onEvent?.({ title, blocks: generated.blocks, sheetId: id });
  return { id, title, blocks: generated.blocks };
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
  signal?: AbortSignal;
  onEvent?: (event: NotesGenerateEvent) => void;
}): Promise<{ title: string; blocks: VisualBlock[] }> {
  const generated = await requestNotes({
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    materials: input.materials,
    prompt: input.prompt,
    currentBlocks: input.currentBlocks,
    currentTitle: input.currentTitle,
    currentContent: input.currentContent,
    signal: input.signal,
    onEvent: input.onEvent,
  });
  const title = generated.title || input.currentTitle || "Notes";
  await updateStudySheet(input.projectId, input.sheetId, {
    title,
    blocks: generated.blocks,
    content: generated.content,
    schemaVersion: NOTES_SCHEMA_VERSION,
  });
  input.onEvent?.({ title, blocks: generated.blocks, sheetId: input.sheetId });
  return { title, blocks: generated.blocks };
}

async function requestNotes(input: {
  projectId: string;
  projectTitle: string;
  materials: Material[];
  prompt: string;
  currentBlocks?: VisualBlock[];
  currentTitle?: string;
  currentContent?: string;
  signal?: AbortSignal;
  onEvent?: (event: NotesGenerateEvent) => void;
}): Promise<{ title: string; blocks: VisualBlock[]; content: string }> {
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
    signal: input.signal,
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const data = (await response.json().catch(() => null)) as {
      title?: string;
      blocks?: VisualBlock[];
      error?: string;
    } | null;
    const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
    if (!response.ok || blocks.length === 0) {
      throw new Error(data?.error ?? "Could not update the notes.");
    }
    const title = data?.title?.trim() || "Notes";
    for (const block of blocks) input.onEvent?.({ block });
    input.onEvent?.({ title, blocks });
    return { title, blocks, content: "" };
  }

  return readNotesSse(response, input.onEvent);
}

async function readNotesSse(
  response: Response,
  onEvent?: (event: NotesGenerateEvent) => void,
): Promise<{ title: string; blocks: VisualBlock[]; content: string }> {
  if (!response.body) throw new Error("No response stream.");
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Could not update the notes.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let title = "Notes";
  let blocks: VisualBlock[] = [];

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
        block?: VisualBlock;
        blocks?: VisualBlock[];
        error?: string;
        done?: boolean;
      };
      if (payload.error) throw new Error(payload.error);
      if (payload.status) onEvent?.({ status: payload.status });
      if (payload.title?.trim()) {
        title = payload.title.trim();
        onEvent?.({ title });
      }
      if (payload.block) {
        blocks = [...blocks, payload.block];
        onEvent?.({ block: payload.block });
      }
      if (payload.done && Array.isArray(payload.blocks) && payload.blocks.length > 0) {
        blocks = payload.blocks;
        title = payload.title?.trim() || title;
        onEvent?.({ title, blocks });
      }
    }
  }

  if (blocks.length === 0) throw new Error("Could not update the notes.");
  return { title, blocks, content: "" };
}
