import { z } from "zod";
import { assertAccountRequest, authErrorResponse } from "@/lib/api/assert";
import { controlAdaptiveState, listKnowledgeProjects, publicAdaptiveState, readAdaptiveState, readKnowledgeGraph, requireOwnedProject } from "@/lib/adaptation/server";
import { readAccountAccess } from "@/lib/billing/account-server";
import { memoryLimitsForPlan } from "@/lib/memory/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const controlSchema = z.object({
  clear: z.boolean().optional(), removeKey: z.string().max(220).optional(), removeTopicKey: z.string().max(64).optional(),
  projectId: z.string().max(150).optional(), clearGraph: z.boolean().optional(),
}).strict();

export async function GET(request: Request) {
  try {
    const { uid } = await assertAccountRequest(request);
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (projectId) await requireOwnedProject(uid, projectId);
    const [state, access] = await Promise.all([readAdaptiveState(uid), readAccountAccess(uid)]);
    const graph = projectId ? await readKnowledgeGraph(uid, projectId) : undefined;
    const projects = projectId ? undefined : await listKnowledgeProjects(uid);
    const limits = memoryLimitsForPlan(access.plan);
    return Response.json({ ...publicAdaptiveState(state), graph, projects, plan: access.plan, limits, usage: { inferredPatterns: state.patterns.length, topics: graph?.nodes.length ?? 0 } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return authErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const { uid } = await assertAccountRequest(request);
    const raw = await request.text();
    if (raw.length > 2000) return Response.json({ error: "Request too large." }, { status: 413 });
    const input = controlSchema.safeParse(JSON.parse(raw));
    if (!input.success || ((input.data.clearGraph || input.data.removeTopicKey) && !input.data.projectId)) return Response.json({ error: "Invalid change." }, { status: 400 });
    if (input.data.projectId) await requireOwnedProject(uid, input.data.projectId);
    const state = await controlAdaptiveState(uid, input.data);
    return Response.json(publicAdaptiveState(state));
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await assertAccountRequest(request);
    // Old clients may still call this endpoint. Personal memory now captures only
    // clearly shared lasting facts; no project map or behavioral observer runs.
    return Response.json({ updated: false });
  } catch (error) { return authErrorResponse(error); }
}
