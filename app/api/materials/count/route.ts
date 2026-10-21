import { assertAccountRequest, authErrorResponse } from "@/lib/api/assert";
import { COLLECTIONS } from "@/lib/firestore";
import { getAdminFirestore } from "@/lib/server/firestore-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { uid } = await assertAccountRequest(request);
    const body = (await request.json()) as { projectId?: unknown };
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId || projectId.length > 150 || projectId.includes("/")) {
      return Response.json({ error: "Invalid project." }, { status: 400 });
    }

    const projectRef = getAdminFirestore().collection(COLLECTIONS.projects).doc(projectId);
    const project = await projectRef.get();
    const data = project.data();
    if (!project.exists || (data?.userId !== uid && data?.ownerId !== uid)) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    const snapshot = await projectRef.collection(COLLECTIONS.materials).count().get();
    return Response.json({ count: snapshot.data().count });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid request." }, { status: 400 });
    return authErrorResponse(error);
  }
}
