import { z } from "zod";
import { generateJson } from "@/lib/ai/json";
import { assertSignedInRequest, authErrorResponse } from "@/lib/api/assert";
import { FREE_CAPS } from "@/lib/account/plan";
import { PERSONALIZATION_MAX } from "@/lib/memory/constants";
import { asMemoryFacts, parseMemoryOps, parsePersonalizationPatch, sanitizePersonalization, shouldExtractMemory } from "@/lib/memory/normalize";
import { parseProjectFacts } from "@/lib/memory/project";
import { MEMORY_EXTRACT_SYSTEM, memoryExtractPrompt } from "@/lib/memory/prompt";
import type { ChatTurn } from "@/types/chat";
import { startAiUsageSession, aiUsageErrorResponse } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  personalization: z.string().max(PERSONALIZATION_MAX).nullable().optional(),
  projectMemory: z.array(z.string().max(200)).max(4).optional(),
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
  let session;
  try {
    session = await assertSignedInRequest(request);
  } catch (error) {
    return authErrorResponse(error);
  }

  if (session.anonymous) {
    return Response.json({ operations: [], personalization: null, projectMemory: [] });
  }

  let body: {
    prompt?: unknown;
    memories?: unknown;
    history?: unknown;
    personalization?: unknown;
    projectMemory?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || !shouldExtractMemory(prompt)) {
    return Response.json({ operations: [], personalization: null, projectMemory: [] });
  }

  const memories = asMemoryFacts(body.memories, FREE_CAPS.memories);
  const personalization = sanitizePersonalization(body.personalization);
  const projectMemory = Array.isArray(body.projectMemory)
    ? body.projectMemory.filter((item): item is string => typeof item === "string")
    : [];
  let usage;
  try {
    usage = await startAiUsageSession(session.uid);
  } catch (error) {
    return aiUsageErrorResponse(error);
  }
  const result = await generateJson(
    memoryExtractPrompt({ prompt, memories, personalization, history: asHistory(body.history), projectMemory }),
    extractSchema,
    { systemInstruction: MEMORY_EXTRACT_SYSTEM, usage: usage.report },
  );
  await usage.commit().catch((error) => console.error("[ai-usage] commit failed", error));

  if (!result.ok) {
    return Response.json({ operations: [], personalization: null, projectMemory: [] });
  }

  const known = new Set(memories.map((item) => item.id));
  return Response.json({
    operations: parseMemoryOps(result.data, known),
    personalization: parsePersonalizationPatch(result.data, personalization) ?? null,
    projectMemory: parseProjectFacts(result.data),
  });
}
