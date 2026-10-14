import { generateTextStream } from "@/lib/ai/gemini";
import { studySheetSystemPrompt } from "@/lib/study-sheets/prompt";
import type { AiUsageReporter } from "@/types/billing";

export type NotesStreamEvent =
  | { type: "status"; status: string }
  | { type: "done"; title: string; content: string }
  | { type: "error"; error: string };

function splitTitle(raw: string): { title: string; content: string } {
  const text = raw.replace(/\r/g, "").trim();
  const heading = text.match(/^#{1,3}\s+(.+)\n?([\s\S]*)$/);
  if (!heading) {
    const line = text.split("\n").find((row) => row.trim())?.replace(/^#+\s*/, "").trim() || "Notes";
    return { title: line.slice(0, 80), content: text };
  }
  const title = heading[1].trim().slice(0, 80) || "Notes";
  const body = heading[2].trim();
  return { title, content: body || text };
}

export async function* streamNotesDocument(
  userPrompt: string,
  options: { usage?: AiUsageReporter } = {},
): AsyncGenerator<NotesStreamEvent> {
  yield { type: "status", status: "Creating notes…" };
  let raw = "";
  try {
    for await (const chunk of generateTextStream(userPrompt, {
      systemInstruction: studySheetSystemPrompt(),
      usage: options.usage,
    })) {
      raw += chunk;
    }
  } catch (error) {
    if (!raw.trim()) {
      yield { type: "error", error: error instanceof Error ? error.message : "Generation failed." };
      return;
    }
  }

  const text = raw.trim();
  if (!text) {
    yield { type: "error", error: "Could not write notes." };
    return;
  }
  const note = splitTitle(text);
  yield { type: "done", title: note.title, content: note.content };
}
