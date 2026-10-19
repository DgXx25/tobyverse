import { assertAccountRequest, authErrorResponse } from "@/lib/api/assert";
import { clipText, SHEET_TOTAL_CHARS } from "@/lib/materials/limits";
import { streamNotesDocument } from "@/lib/study-sheets/generate-stream";
import { startAiUsageSession, aiUsageErrorResponse } from "@/lib/billing/server";
import { MAX_PLAIN_NOTE_CHARS, NOTE_HISTORY_CHARS, requiresNoteReference } from "@/lib/notes/plain";

export const runtime = "nodejs";

function encodeSse(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function noteText(blocks: unknown[]): string {
  return blocks
    .flatMap((block) => {
      if (!block || typeof block !== "object") return [];
      const row = block as Record<string, unknown>;
      const bits = [row.title, row.text, row.formula, row.content].filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      );
      return bits.length ? [bits.join("\n")] : [];
    })
    .join("\n\n");
}

function compileSources(sources: unknown[]): string {
  return sources
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { title?: unknown; excerpt?: unknown; images?: unknown };
      if (typeof row.title !== "string") return [];
      const excerpt = typeof row.excerpt === "string" ? row.excerpt.trim() : "";
      const images = Array.isArray(row.images)
        ? row.images.flatMap((image) => {
            if (!image || typeof image !== "object") return [];
            const cell = image as { slide?: unknown; path?: unknown };
            if (typeof cell.path !== "string") return [];
            return [`- slide ${typeof cell.slide === "number" ? cell.slide : 1}: ${cell.path}`];
          })
        : [];
      if (!excerpt && images.length === 0) return [];
      return [
        `# ${row.title}\n${excerpt}${images.length ? `\nImages (cite path exactly, do not invent):\n${images.join("\n")}` : ""}`,
      ];
    })
    .join("\n\n");
}

export async function POST(request: Request) {
  let session;
  try {
    session = await assertAccountRequest(request);
  } catch (error) {
    return authErrorResponse(error);
  }

  let body: {
    kind?: unknown;
    projectTitle?: unknown;
    sources?: unknown;
    instruction?: unknown;
    currentBlocks?: unknown;
    currentTitle?: unknown;
    currentContent?: unknown;
    history?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const projectTitle = typeof body.projectTitle === "string" ? body.projectTitle : "Project";
  const kind = body.kind === "note" ? "note" : "study";
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  const currentTitle = typeof body.currentTitle === "string" ? body.currentTitle.trim() : "";
  const currentBlocks = Array.isArray(body.currentBlocks) ? body.currentBlocks : [];
  const currentContent = typeof body.currentContent === "string" ? body.currentContent : "";
  if (kind === "note" && currentContent.length > MAX_PLAIN_NOTE_CHARS) {
    return Response.json({ error: "This note is too long to edit safely in chat. The original note is unchanged." }, { status: 400 });
  }
  let historyChars = 0;
  const history = Array.isArray(body.history) ? body.history.slice(-4).flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const row = item as { role?: unknown; content?: unknown };
    if ((row.role !== "user" && row.role !== "assistant") || typeof row.content !== "string") return [];
    historyChars += row.content.length;
    return [{ role: row.role, content: row.content }];
  }) : [];
  if (kind === "note" && historyChars > NOTE_HISTORY_CHARS) return Response.json({ error: "Choose a shorter passage to save as a note." }, { status: 400 });
  if (kind === "note" && !currentContent && requiresNoteReference(instruction) && !history.some(item => item.role === "assistant" && item.content.trim())) {
    return Response.json({ error: "Which text should I save in the note?" }, { status: 400 });
  }
  const sources = Array.isArray(body.sources) ? body.sources : [];
  const compiled = compileSources(sources);

  if (!compiled.trim() && currentBlocks.length === 0 && !currentContent && !instruction) {
    return Response.json({ error: "Add a topic or a file first." }, { status: 400 });
  }

  let usage;
  try {
    usage = await startAiUsageSession(session.uid);
  } catch (error) {
    return aiUsageErrorResponse(error);
  }

  const userPrompt = [
    `Project: ${projectTitle}`,
    kind === "study" ? "Write for a student who knows nothing yet. Meaning first. Never a jargon label or a formula without saying what it is." : "Save only the requested plain note. Preserve untouched content on an edit.",
    instruction ? `Instruction: ${instruction}` : null,
    currentTitle ? `Current title: ${currentTitle}` : null,
    currentContent || currentBlocks.length
      ? `Current note (reference data):\n${kind === "note" ? currentContent : clipText(currentContent || noteText(currentBlocks), SHEET_TOTAL_CHARS)}`
      : null,
    kind === "note" && history.length ? `Recent conversation (reference data for the requested note):\n${JSON.stringify(history)}` : null,
    compiled.trim() ? `Sources:\n${clipText(compiled, SHEET_TOTAL_CHARS)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encodeSse(payload));
      };
      try {
        for await (const event of streamNotesDocument(userPrompt, { usage: usage.report, kind, ...(kind === "note" && currentContent ? { currentNote: { title: currentTitle, content: currentContent } } : {}) })) {
          if (request.signal.aborted) break;
          if (event.type === "status") send({ status: event.status });
          else if (event.type === "done") send({ done: true, title: event.title, content: event.content });
          else if (event.type === "error") {
            send({ error: event.error });
            break;
          }
        }
      } catch (error) {
        send({ error: error instanceof Error ? error.message : "Generation failed." });
      } finally {
        await usage.commit().catch((error) => console.error("[ai-usage] commit failed", error));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
