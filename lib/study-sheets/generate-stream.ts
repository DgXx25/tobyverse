import { generateJson } from "@/lib/ai/json";
import { generateTextStream } from "@/lib/ai/gemini";
import { extractJsonArrayItems, peekJsonString } from "@/lib/ai/json-stream";
import { parseJsonLoose } from "@/lib/schema/json";
import { parseRawNoteBlock, splitNotePayload } from "@/lib/notes/blocks";
import { collectNoteProse } from "@/lib/notes/compat";
import { studySheetSystemPrompt } from "@/lib/study-sheets/prompt";
import { notesDocumentSchema } from "@/lib/visuals/schemas";
import type { VisualBlock } from "@/types/visual";
import type { AiUsageReporter } from "@/types/billing";

export type NotesStreamEvent =
  | { type: "status"; status: string }
  | { type: "title"; title: string }
  | { type: "block"; block: VisualBlock }
  | { type: "done"; title: string; blocks: VisualBlock[] }
  | { type: "error"; error: string };

function finalize(data: unknown): { title: string; blocks: VisualBlock[] } | null {
  const sheet = data as { title?: unknown; blocks?: unknown; content?: unknown; sections?: unknown };
  const title = typeof sheet.title === "string" && sheet.title.trim() ? sheet.title.trim().slice(0, 80) : "Notes";
  const fallback = collectNoteProse({
    content: sheet.content,
    sections: sheet.sections,
  }).prose;
  const { blocks } = splitNotePayload(sheet.blocks, fallback);
  if (blocks.length === 0) return null;
  return { title, blocks };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function* streamNotesDocument(userPrompt: string, options: { usage?: AiUsageReporter } = {}): AsyncGenerator<NotesStreamEvent> {
  let raw = "";
  let emitted = 0;
  let title = "";

  try {
    for await (const chunk of generateTextStream(userPrompt, {
      json: true,
      systemInstruction: studySheetSystemPrompt(),
      usage: options.usage,
    })) {
      raw += chunk;
      const nextTitle = peekJsonString(raw, "title");
      if (nextTitle?.trim() && nextTitle !== title) {
        title = nextTitle.trim().slice(0, 80);
        yield { type: "title", title };
      }
      const items = extractJsonArrayItems(raw, "blocks");
      while (emitted < items.length) {
        const block = parseRawNoteBlock(items[emitted]);
        emitted += 1;
        if (block) yield { type: "block", block };
      }
    }
  } catch (error) {
    raw = raw.trim() ? raw : "";
    if (!raw) {
      yield { type: "error", error: error instanceof Error ? error.message : "Generation failed." };
      return;
    }
  }

  let parsed: unknown = null;
  try {
    const result = notesDocumentSchema.safeParse(parseJsonLoose(raw));
    if (result.success) parsed = result.data;
  } catch {
    parsed = null;
  }

  if (!parsed) {
    const repaired = await generateJson(userPrompt, notesDocumentSchema, {
      systemInstruction: studySheetSystemPrompt(),
      usage: options.usage,
    });
    if (!repaired.ok) {
      yield { type: "error", error: repaired.error };
      return;
    }
    parsed = repaired.data;
  }

  const final = finalize(parsed);
  if (!final) {
    yield { type: "error", error: "Notes JSON was invalid." };
    return;
  }

  if (emitted === 0) {
    for (const block of final.blocks) {
      yield { type: "block", block };
      await sleep(90);
    }
  }

  yield { type: "done", title: final.title || title || "Notes", blocks: final.blocks };
}
