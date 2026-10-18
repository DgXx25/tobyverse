import { createHash } from "node:crypto";
import { getAdminFirestore } from "@/lib/server/firestore-admin";
import { AuthError } from "@/lib/api/assert";
import { asAdaptiveState, asKnowledgeGraph, canObserve, formatAdaptiveContext, mergeObservations, type AdaptiveState, type KnowledgeGraph, type ObservationPatch, type ObservationTurn } from "@/lib/adaptation/model";

const profileRef = (uid: string) => getAdminFirestore().collection("users").doc(uid).collection("profile").doc("adaptation");
const graphRef = (uid: string, projectId: string) => getAdminFirestore().collection("users").doc(uid).collection("knowledgeMaps").doc(projectId);
const emptyGraph = (): KnowledgeGraph => ({ nodes: [], links: [] });
export const insightHash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);

export async function requireOwnedProject(uid: string, projectId: string): Promise<void> {
  if (!projectId || projectId.length > 150 || projectId.includes("/") || projectId === "." || projectId === "..") throw new AuthError("Invalid project.", 400);
  const snap = await getAdminFirestore().collection("projects").doc(projectId).get();
  const data = snap.data();
  if (!data || (data.userId !== uid && data.ownerId !== uid)) throw new AuthError("Project not found.", 404);
}

export async function readAdaptiveState(uid: string): Promise<AdaptiveState> {
  return asAdaptiveState((await profileRef(uid).get()).data());
}
export async function readKnowledgeGraph(uid: string, projectId: string): Promise<KnowledgeGraph> {
  return asKnowledgeGraph((await graphRef(uid, projectId).get()).data());
}

export async function listKnowledgeProjects(uid: string): Promise<{ id: string; title: string }[]> {
  const db = getAdminFirestore();
  const maps = await db.collection("users").doc(uid).collection("knowledgeMaps").limit(30).select().get();
  if (!maps.docs.length) return [];
  const projects = await db.getAll(...maps.docs.map(map => db.collection("projects").doc(map.id)));
  return projects.flatMap(project => {
    const row = project.data();
    if (!row || (row.userId !== uid && row.ownerId !== uid)) return [];
    return [{ id: project.id, title: typeof row.title === "string" ? row.title.slice(0, 160) : "Untitled project" }];
  });
}

/** A missing/slow optional store never holds up the response. It cannot change the core. */
export async function adaptiveContextForChat(uid: string, projectId: string, prompt: string): Promise<string | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const state = await readAdaptiveState(uid);
        if (!state.enabled) return undefined;
        // Graphs live under this account, so a client-supplied project ID cannot expose another account's data.
        const graph = projectId && !projectId.includes("/") ? await readKnowledgeGraph(uid, projectId) : emptyGraph();
        return formatAdaptiveContext(state.patterns, graph, prompt, projectId) ?? undefined;
      })(),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 350); }),
    ]);
  } catch {
    return undefined;
  } finally { if (timer) clearTimeout(timer); }
}

export async function reserveObservation(uid: string, batch: string): Promise<AdaptiveState | null> {
  const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
  const state = await getAdminFirestore().runTransaction(async tx => {
    const ref = profileRef(uid), current = asAdaptiveState((await tx.get(ref)).data());
    if (!canObserve(current, batch, now)) return null;
    const dailyRuns = current.day === day ? current.dailyRuns : 0;
    const next = { ...current, lastRunAt: now, lastBatch: batch, day, dailyRuns: dailyRuns + 1 };
    tx.set(ref, next);
    return next;
  });
  return state;
}

export async function saveObservation(uid: string, projectId: string, revision: number, patch: ObservationPatch, sample: ObservationTurn[]): Promise<boolean> {
  const result = await getAdminFirestore().runTransaction(async tx => {
    const pRef = profileRef(uid), gRef = graphRef(uid, projectId);
    const [pSnap, gSnap, project] = await Promise.all([tx.get(pRef), tx.get(gRef), tx.get(getAdminFirestore().collection("projects").doc(projectId))]);
    const state = asAdaptiveState(pSnap.data());
    const owner = project.data();
    if (!state.enabled || state.revision !== revision || !owner || (owner.userId !== uid && owner.ownerId !== uid)) return null;
    const now = Date.now();
    const merged = mergeObservations(state.patterns, asKnowledgeGraph(gSnap.data()), patch, sample, projectId, now);
    const next = { ...state, patterns: merged.patterns, updatedAt: now };
    tx.set(pRef, next);
    tx.set(gRef, merged.graph);
    return { state: next, graph: merged.graph };
  });
  if (!result) return false;
  return true;
}

export async function controlAdaptiveState(uid: string, input: { enabled?: boolean; clear?: boolean; removeKey?: string; projectId?: string; clearGraph?: boolean }) {
  const next = await getAdminFirestore().runTransaction(async tx => {
    const ref = profileRef(uid), state = asAdaptiveState((await tx.get(ref)).data());
    const next: AdaptiveState = {
      ...state, enabled: input.enabled ?? state.enabled, revision: state.revision + 1,
      patterns: input.clear ? [] : state.patterns.filter(p => !input.removeKey || `${p.projectId ?? "general"}:${p.key}` !== input.removeKey),
      updatedAt: Date.now(),
    };
    tx.set(ref, next);
    if (input.clearGraph && input.projectId) tx.delete(graphRef(uid, input.projectId));
    return next;
  });
  return next;
}

export function publicAdaptiveState(state: AdaptiveState) {
  return { enabled: state.enabled, patterns: state.patterns, updatedAt: state.updatedAt };
}
