import { z } from "zod";
import { generateJson } from "@/lib/ai/json";
import { assertAccountRequest, authErrorResponse } from "@/lib/api/assert";
import { PERSONALIZATION_MAX } from "@/lib/memory/constants";
import { asMemoryFacts, parseMemoryOps, shouldExtractMemory, isForgetAllMemoryRequest } from "@/lib/memory/normalize";
import { MEMORY_EXTRACT_SYSTEM, memoryExtractPrompt } from "@/lib/memory/prompt";
import type { ChatTurn } from "@/types/chat";
import { startAiUsageSession, aiUsageErrorResponse } from "@/lib/billing/server";
import { memoryLimitsForPlan } from "@/lib/memory/limits";
import { readAccountAccess } from "@/lib/billing/account-server";
import { memoryStatus, persistMemoryChanges, replacePersonalMemory } from "@/lib/memory/personal-server";
import { formatPersonalMemory, MEMORY_SUMMARY_MAX } from "@/lib/memory/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { uid } = await assertAccountRequest(request);
    const status = await memoryStatus(uid);
    return Response.json(status, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return authErrorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const { uid } = await assertAccountRequest(request);
    const raw = await request.text();
    if (raw.length > MEMORY_SUMMARY_MAX + 10_000) return Response.json({ error: "Request too large." }, { status: 413 });
    const parsed = z.object({ summary: z.string().max(MEMORY_SUMMARY_MAX), revision: z.number().int().nonnegative() }).strict().safeParse(JSON.parse(raw));
    if (!parsed.success) return Response.json({ error: "Invalid memory summary." }, { status: 400 });
    return Response.json(await replacePersonalMemory(uid, parsed.data.summary, parsed.data.revision));
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON." }, { status: 400 });
    if (error instanceof Error && /each memory|private information|summary is too long/i.test(error.message)) return Response.json({ error: error.message }, { status: 400 });
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { uid } = await assertAccountRequest(request);
    const raw = await request.text();
    if (raw.length > 3000) return Response.json({ error: "Request too large." }, { status: 413 });
    const body = z.union([
      z.object({ operation: z.enum(["add", "update"]), id: z.string().max(150).optional(), content: z.string().max(200) }).strict(),
      z.object({ personalization: z.string().max(PERSONALIZATION_MAX) }).strict(),
    ]).safeParse(JSON.parse(raw));
    if (!body.success || ("operation" in body.data && body.data.operation === "update" && !body.data.id)) return Response.json({ error: "Invalid memory change." }, { status: 400 });
    const access = await readAccountAccess(uid);
    const limits = memoryLimitsForPlan(access.plan);
    if ("personalization" in body.data) {
      const current = await memoryStatus(uid);
      const next = await replacePersonalMemory(uid, formatPersonalMemory(current.memories, body.data.personalization), current.revision);
      return Response.json({ saved: true, usage: next.usage, limits });
    }
    const operations = "operation" in body.data ? body.data.operation === "add" ? [{ op: "add" as const, content: body.data.content }] : [{ op: "update" as const, id: body.data.id!, content: body.data.content }] : [];
    const result = await persistMemoryChanges({ uid, operations, limits });
    if ("operation" in body.data && !result.savedFacts) return Response.json({ error: body.data.operation === "add" ? `Memory is full for your ${access.plan} plan. Remove an item or upgrade your plan.` : "Could not update this memory." }, { status: body.data.operation === "add" ? 403 : 404 });
    return Response.json({ saved: true, id: result.createdId, usage: { savedFacts: result.factCount }, limits });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON." }, { status: 400 });
    return authErrorResponse(error);
  }
}

const extractSchema = z.object({
  operations: z
    .array(
      z.object({
        op: z.enum(["add", "update", "delete"]),
        id: z.string().optional(),
        content: z.string().optional(),
      }),
    )
    .max(4),
});

function asHistory(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { role?: unknown; content?: unknown };
    if ((row.role === "user" || row.role === "assistant") && typeof row.content === "string") {
      return [{ role: row.role, content: row.content }];
    }
    return [];
  });
}

export async function POST(request: Request) {
  try { return await extractMemory(request); }
  catch (error) { return authErrorResponse(error); }
}

async function extractMemory(request: Request) {
  let session;
  try {
    session = await assertAccountRequest(request);
  } catch (error) {
    return authErrorResponse(error);
  }

  let body: { prompt?: unknown; history?: unknown; projectId?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > 24_000) return Response.json({ error: "Request too large." }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || !shouldExtractMemory(prompt)) {
    return Response.json({ saved: false });
  }
  const status = await memoryStatus(session.uid);
  const limits = status.limits;
  const memories = asMemoryFacts(status.memories, 320);
  const personalization = "";
  if (isForgetAllMemoryRequest(prompt)) {
    await replacePersonalMemory(session.uid, "", status.revision);
    return Response.json({ saved: true });
  }
  let usage;
  try {
    usage = await startAiUsageSession(session.uid);
  } catch (error) {
    return aiUsageErrorResponse(error);
  }
  const result = await generateJson(
    memoryExtractPrompt({ prompt, memories, personalization, history: asHistory(body.history) }),
    extractSchema,
    { systemInstruction: MEMORY_EXTRACT_SYSTEM, usage: usage.report },
  ).finally(() => usage.commit().catch((error) => console.error("[ai-usage] commit failed", error)));

  if (!result.ok) {
    return Response.json({ saved: false });
  }

  const known = new Set(memories.map((item) => item.id));
  const operations = parseMemoryOps(result.data, known);
  const persisted = await persistMemoryChanges({ uid: session.uid, operations, limits, expectedRevision: status.revision });
  return Response.json({ saved: persisted.savedFacts, stale: persisted.stale });
}
