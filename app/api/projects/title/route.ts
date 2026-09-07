import { generateText } from "@/lib/ai/gemini";
import { assertSignedInRequest, authErrorResponse } from "@/lib/api/assert";
import { sanitizeChatTitle } from "@/lib/workspace/title";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await assertSignedInRequest(request);
  } catch (error) {
    return authErrorResponse(error);
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
          "Write a short chat title for a learning app. 3 to 7 words. Same language as the user. No quotes, no period, no emoji. Title only.",
      },
    );
    const title = sanitizeChatTitle(raw);
    if (!title) {
      return Response.json({ error: "Could not title this chat." }, { status: 422 });
    }
    return Response.json({ title });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not title this chat.";
    return Response.json({ error: message }, { status: 500 });
  }
}
