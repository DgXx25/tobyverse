import { generateText } from "@/lib/ai/gemini";
import { adminErrorResponse, assertAdminRequest } from "@/lib/admin/assert";
import { auditSystemPrompt, parsePlaygroundAudit } from "@/lib/admin/audit";
import { clipPrompt } from "@/lib/admin/playground";
import { startAiUsageSession, aiUsageErrorResponse } from "@/lib/billing/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let uid = "";
  try {
    uid = await assertAdminRequest(request);
  } catch (error) {
    return adminErrorResponse(error);
  }

  let body: {
    prompt?: unknown;
    versions?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const userPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const versions = Array.isArray(body.versions) ? body.versions : [];

  if (!userPrompt || versions.length !== 3) {
    return Response.json({ error: "Need the user prompt and 3 versions." }, { status: 400 });
  }

  const compact = versions.map((item, index) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return [
      `VERSION ${index + 1}`,
      `system: ${clipPrompt(String(row.systemPrompt ?? ""), 400)}`,
      `materials: ${clipPrompt(String(row.materials ?? ""), 280) || "(none)"}`,
      `output: ${clipPrompt(String(row.output ?? ""), 900)}`,
    ].join("\n");
  });

  let usage;
  try {
    usage = await startAiUsageSession(uid);
    const text = await generateText(
      `User prompt: ${clipPrompt(userPrompt, 400)}\n\n${compact.join("\n\n")}`,
      { systemInstruction: auditSystemPrompt(), usage: usage.report },
    );
    await usage.commit();
    return Response.json({ audit: parsePlaygroundAudit(text) });
  } catch (error) {
    if (usage) await usage.commit().catch((commitError) => console.error("[ai-usage] commit failed", commitError));
    const message = error instanceof Error ? error.message : "Audit failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
