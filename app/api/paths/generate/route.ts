import { assertAccountRequest, authErrorResponse } from "@/lib/api/assert";
import { clipText, PATH_TOTAL_CHARS } from "@/lib/materials/limits";
import { streamPathDocument } from "@/lib/paths/generate-stream";
import type { PathKind } from "@/types/path";
import { startAiUsageSession, aiUsageErrorResponse } from "@/lib/billing/server";

export const runtime = "nodejs";

function encodeSse(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(request: Request) {
  let session;
  try {
    session = await assertAccountRequest(request);
  } catch (error) {
    return authErrorResponse(error);
  }

  let body: {
    projectTitle?: unknown;
    instruction?: unknown;
    sources?: unknown;
    kind?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const projectTitle = typeof body.projectTitle === "string" ? body.projectTitle : "Project";
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  const kind: PathKind = body.kind === "review" ? "review" : "course";
  const sources = Array.isArray(body.sources)
    ? body.sources.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as { title?: unknown; excerpt?: unknown };
        if (typeof row.title !== "string" || typeof row.excerpt !== "string") return [];
        const excerpt = row.excerpt.trim();
        if (!excerpt) return [];
        return [{ title: row.title.trim() || "Source", excerpt }];
      })
    : [];

  if (sources.length === 0 && !instruction) {
    return Response.json({ error: "Add a syllabus or name the course first." }, { status: 400 });
  }

  let usage;
  try {
    usage = await startAiUsageSession(session.uid);
  } catch (error) {
    return aiUsageErrorResponse(error);
  }

  const compiled = sources
    .map((item) => `# ${item.title}\n${item.excerpt}`.trim())
    .filter(Boolean)
    .join("\n\n");
  const userPrompt = [
    `Project: ${projectTitle}`,
    instruction ? `Request: ${instruction}` : null,
    kind === "review" ? "Mode: exam-prep review path (4–8 high-yield nodes)." : null,
    compiled ? `Sources (outlines only):\n${clipText(compiled, PATH_TOTAL_CHARS)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encodeSse(payload));
      };
      try {
        for await (const event of streamPathDocument(userPrompt, kind, { usage: usage.report })) {
          if (request.signal.aborted) break;
          if (event.type === "status") send({ status: event.status });
          else if (event.type === "title") send({ title: event.title });
          else if (event.type === "draft") send({ title: event.title, courses: event.courses });
          else if (event.type === "done") {
            send({
              done: true,
              title: event.title,
              courses: event.courses,
              currentCourseId: event.currentCourseId,
              currentNodeId: event.currentNodeId,
            });
          } else if (event.type === "error") {
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
