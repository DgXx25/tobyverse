import { z } from "zod";
import { assertAccountRequest, authErrorResponse, AuthError } from "@/lib/api/assert";
import { generateText } from "@/lib/ai/gemini";
import { startAiUsageSession } from "@/lib/billing/server";
import { parseJsonLoose } from "@/lib/schema/json";
import { observationSample, observationSchema } from "@/lib/adaptation/model";
import { OBSERVATION_SYSTEM, observationPrompt } from "@/lib/adaptation/prompt";
import { controlAdaptiveState, insightHash, listKnowledgeProjects, publicAdaptiveState, readAdaptiveState, readKnowledgeGraph, requireOwnedProject, reserveObservation, saveObservation } from "@/lib/adaptation/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const controlSchema = z.object({
  enabled: z.boolean().optional(), clear: z.boolean().optional(), removeKey: z.string().max(220).optional(),
  projectId: z.string().max(150).optional(), clearGraph: z.boolean().optional(),
});
const batchSchema = z.object({
  projectId: z.string().min(1).max(150), threadId: z.string().min(1).max(150),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1000) })).max(14),
});

export async function GET(request: Request) {
  try {
    const { uid } = await assertAccountRequest(request);
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (projectId) await requireOwnedProject(uid, projectId);
    const state = await readAdaptiveState(uid);
    const graph = projectId ? await readKnowledgeGraph(uid, projectId) : undefined;
    const projects = projectId ? undefined : await listKnowledgeProjects(uid);
    return Response.json({ ...publicAdaptiveState(state), graph, projects }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return authErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const { uid } = await assertAccountRequest(request);
    const raw = await request.text();
    if (raw.length > 2000) return Response.json({ error: "Request too large." }, { status: 413 });
    const input = controlSchema.safeParse(JSON.parse(raw));
    if (!input.success || (input.data.clearGraph && !input.data.projectId)) return Response.json({ error: "Invalid change." }, { status: 400 });
    if (input.data.projectId) await requireOwnedProject(uid, input.data.projectId);
    const state = await controlAdaptiveState(uid, input.data);
    return Response.json(publicAdaptiveState(state));
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request) {
  let usage: Awaited<ReturnType<typeof startAiUsageSession>> | undefined;
  try {
    const { uid } = await assertAccountRequest(request);
    const raw = await request.text();
    if (raw.length > 18_000) return Response.json({ error: "Request too large." }, { status: 413 });
    const parsed = batchSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return Response.json({ error: "Invalid conversation sample." }, { status: 400 });
    const { projectId, threadId } = parsed.data;
    await requireOwnedProject(uid, projectId);
    const conversation = observationSample(parsed.data.history, "");
    if (conversation.filter(t => t.role === "user").length < 4) return Response.json({ updated: false });
    const sample = conversation.map(t => ({
      ...t, id: insightHash(`${projectId}:${threadId}:${t.role}:${t.content}`),
    }));
    const batch = insightHash(sample.filter(t => t.role === "user").map(t => t.id).join(":"));
    const state = await reserveObservation(uid, batch);
    if (!state) return Response.json({ updated: false });
    const graph = await readKnowledgeGraph(uid, projectId);
    usage = await startAiUsageSession(uid);
    // One bounded call. Optional analysis never invokes a repair loop or the user's expensive model.
    const result = await generateText(observationPrompt(sample, state.patterns.filter(p => !p.projectId || p.projectId === projectId), graph), {
      json: true, systemInstruction: OBSERVATION_SYSTEM, maxOutputTokens: 3072, usage: usage.report,
    });
    const patch = observationSchema.safeParse(parseJsonLoose(result));
    if (!patch.success) {
      console.warn("[insights] invalid observation shape", patch.error.issues.map(issue => issue.path.join(".")).join(", "));
      return Response.json({ updated: false });
    }
    const updated = await saveObservation(uid, projectId, state.revision, patch.data, sample);
    return Response.json({ updated });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON." }, { status: 400 });
    // A failed optional observer neither blocks nor alters the completed answer.
    console.warn("[insights] observation skipped", error instanceof Error ? error.message : "unknown error");
    return Response.json({ updated: false });
  } finally {
    await usage?.commit().catch(error => console.error("[ai-usage] insights commit failed", error));
  }
}
