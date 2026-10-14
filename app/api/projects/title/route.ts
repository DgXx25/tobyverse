import { generateText } from "@/lib/ai/gemini";
import { assertSignedInRequest, authErrorResponse } from "@/lib/api/assert";
import { sanitizeChatTitle } from "@/lib/workspace/title";
import { startAiUsageSession, aiUsageErrorResponse } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let session;
  try {
    session = await assertSignedInRequest(request);
  } catch (error) {
    return authErrorResponse(error);
  }

  let usage;
  try {
    usage = await startAiUsageSession(session.uid);
  } catch (error) {
    return aiUsageErrorResponse(error);
  }

  let prompt = "";
  try {
    const body = (await request.json()) as { prompt?: unknown };
    prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!prompt) {
    return Response.json({ error: "prompt is required." }, { status: 400 });
  }

  try {
    const raw = await generateText(
      `User message:\n${prompt.slice(0, 800)}`,
      {
        systemInstruction:
          "Name what they are learning, not the request. 2 to 5 words. Same language as the user. A full course → the subject. One skill → the skill. One topic → the topic. Never copy the first sentence of the prompt. No quotes, no period, no emoji. Title only.",
        usage: usage.report,
      },
    );
    await usage.commit().catch((error) => console.error("[ai-usage] commit failed", error));
    const title = sanitizeChatTitle(raw);
    if (!title) {
      return Response.json({ error: "Could not title this chat." }, { status: 422 });
    }
    return Response.json({ title });
  } catch (error) {
    await usage.commit().catch((commitError) => console.error("[ai-usage] commit failed", commitError));
    const message = error instanceof Error ? error.message : "Could not title this chat.";
    return Response.json({ error: message }, { status: 500 });
  }
}
