import { authHeaders } from "@/lib/api/client";
import { createStudySheet, updateStudySheet } from "@/lib/study-sheets/store";
import { collectProjectSources } from "@/lib/composer/sources";
import type { Material } from "@/types/material";
import type { ChatTurn } from "@/types/chat";
import { NOTES_SCHEMA_VERSION } from "@/types/study-sheet";
import { reserveArtifactTitle } from "@/lib/artifacts/title-store";
import type { VisualBlock } from "@/types/visual";

export type NotesGenerateEvent = {
  status?: string | null;
  title?: string;
  content?: string;
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
  input.signal?.throwIfAborted();
  const title = await reserveArtifactTitle(input.projectId, input.title?.trim() || generated.title || "Notes", input.materials[0]?.title || input.projectTitle, "Study notes", input.signal);
  const id = await createStudySheet({
    projectId: input.projectId,
    userId: input.userId,
    title,
    blocks: generated.blocks,
    content: generated.content,
    sourceMaterialIds: input.materials.map((item) => item.id),
  });
  input.onEvent?.({ title, content: generated.content, blocks: [], sheetId: id });
  return { id, title, blocks: [] };
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
  input.signal?.throwIfAborted();
  await updateStudySheet(input.projectId, input.sheetId, {
    title,
    blocks: [],
    content: generated.content,
    schemaVersion: NOTES_SCHEMA_VERSION,
  });
  input.onEvent?.({ title, content: generated.content, blocks: [], sheetId: input.sheetId });
  return { title, blocks: [] };
}

async function requestNotes(input: {
  history?: ChatTurn[];
  kind?: "note" | "study";
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
      kind: input.kind,
      sources,
      instruction: input.prompt,
      currentBlocks: input.currentBlocks,
      currentTitle: input.currentTitle,
      currentContent: input.currentContent,
      history: input.history,
    }),
    signal: input.signal,
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const data = (await response.json().catch(() => null)) as {
      title?: string;
      content?: string;
      error?: string;
    } | null;
    const content = typeof data?.content === "string" ? data.content.trim() : "";
    if (!response.ok || !content) {
      throw new Error(data?.error ?? "Could not update the notes.");
    }
    const title = data?.title?.trim() || "Notes";
    return { title, blocks: [], content };
  }

  return readNotesSse(response, input.onEvent);
}

/** Plain notes have a dedicated prompt and never enter the Study notes workflow. */
export async function generatePlainNote(input: {
  history?: ChatTurn[];
  projectId: string;
  projectTitle: string;
  materials: Material[];
  prompt: string;
  currentTitle?: string;
  currentContent?: string;
  signal?: AbortSignal;
}): Promise<{ title: string; content: string }> {
  return requestNotes({ ...input, kind: "note" });
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
  let content = "";

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
        content?: string;
        error?: string;
        done?: boolean;
      };
      if (payload.error) throw new Error(payload.error);
      if (payload.status) onEvent?.({ status: payload.status });
      if (payload.done && typeof payload.content === "string" && payload.content.trim()) {
        content = payload.content.trim();
        title = payload.title?.trim() || title;
      }
    }
  }

  if (!content) throw new Error("Could not update the notes.");
  return { title, blocks: [], content };
}
