import { assertAccountRequest, authErrorResponse } from "@/lib/api/assert";
import { COLLECTIONS } from "@/lib/firestore";
import { getAdminFirestore } from "@/lib/server/firestore-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROJECTS_PER_REQUEST = 100;
const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  try {
    const { uid } = await assertAccountRequest(request);
    const payload: unknown = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return Response.json({ error: "Invalid request." }, { status: 400, headers: PRIVATE_NO_STORE });
    }
    const body = payload as { projectId?: unknown; projectIds?: unknown };
    const isBatch = Array.isArray(body.projectIds);
    const rawIds: unknown[] = isBatch
      ? body.projectIds as unknown[]
      : typeof body.projectId === "string"
        ? [body.projectId]
        : [];
    if (rawIds.length === 0 || rawIds.length > MAX_PROJECTS_PER_REQUEST) {
      return Response.json({ error: "Invalid project list." }, { status: 400, headers: PRIVATE_NO_STORE });
    }

    const projectIds: string[] = [];
    const seen = new Set<string>();
    for (const value of rawIds) {
      if (typeof value !== "string") {
        return Response.json({ error: "Invalid project." }, { status: 400, headers: PRIVATE_NO_STORE });
      }
      const projectId = value.trim();
      if (!projectId || projectId.length > 150 || projectId.includes("/")) {
        return Response.json({ error: "Invalid project." }, { status: 400, headers: PRIVATE_NO_STORE });
      }
      if (!seen.has(projectId)) {
        seen.add(projectId);
        projectIds.push(projectId);
      }
    }

    const db = getAdminFirestore();
    const projectRefs = projectIds.map((projectId) => db.collection(COLLECTIONS.projects).doc(projectId));
    const projects = await db.getAll(...projectRefs);
    if (projects.some((project) => {
      const data = project.data();
      return !project.exists || (data?.userId !== uid && data?.ownerId !== uid);
    })) {
      return Response.json({ error: "Project not found." }, { status: 404, headers: PRIVATE_NO_STORE });
    }

    const counts = await Promise.all(projectRefs.map(async (projectRef) => {
      const snapshot = await projectRef.collection(COLLECTIONS.materials).count().get();
      return [projectRef.id, snapshot.data().count] as const;
    }));
    if (!isBatch) return Response.json({ count: counts[0][1] }, { headers: PRIVATE_NO_STORE });
    return Response.json({ counts: Object.fromEntries(counts) }, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid request." }, { status: 400 });
    return authErrorResponse(error);
  }
}
