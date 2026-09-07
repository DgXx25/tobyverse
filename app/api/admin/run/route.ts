import { generateTextStream } from "@/lib/ai/gemini";
import { adminErrorResponse, assertAdminRequest } from "@/lib/admin/assert";
import { buildPlaygroundUserMessage } from "@/lib/admin/playground";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeSse(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(request: Request) {
  try {
    await assertAdminRequest(request);
  } catch (error) {
    return adminErrorResponse(error);
  }

  let body: { systemPrompt?: unknown; prompt?: unknown; materials?: unknown };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const materials = typeof body.materials === "string" ? body.materials : "";

  if (!prompt) {
    return Response.json({ error: "prompt is required." }, { status: 400 });
  }

  const userMessage = buildPlaygroundUserMessage(prompt, materials);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const delta of generateTextStream(userMessage, {
          systemInstruction: systemPrompt || "You are a concise tutor.",
        })) {
          controller.enqueue(encodeSse({ delta }));
        }
        controller.enqueue(encodeSse({ done: true }));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Generation failed.";
        controller.enqueue(encodeSse({ error: message }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
