import { assertAdminRequest, adminErrorResponse } from "@/lib/admin/assert";
import { generateText, getAIProvider } from "@/lib/ai/gemini";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await assertAdminRequest(request);
  } catch (error) {
    return adminErrorResponse(error);
  }

  let body: { prompt?: unknown; systemInstruction?: unknown };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const systemInstruction =
    typeof body.systemInstruction === "string" ? body.systemInstruction : undefined;

  if (!prompt) {
    return Response.json({ error: "prompt is required." }, { status: 400 });
  }

  try {
    const text = await generateText(prompt, { systemInstruction });
    return Response.json({ text, provider: getAIProvider().id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
