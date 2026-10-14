import { assertAccountRequest, authErrorResponse } from "@/lib/api/assert";
import { COLLECTIONS } from "@/lib/firestore";
import { deleteMaterialIndex } from "@/lib/rag/server";
import { getAdminFirestore } from "@/lib/server/firestore-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Removes a material's vector chunks. Chunks are server-only data, so the client cannot do this itself. */
export async function POST(request: Request) {
  try {
    const { uid } = await assertAccountRequest(request);
    const body = (await request.json()) as { projectId?: unknown; materialId?: unknown };
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    const materialId = typeof body.materialId === "string" ? body.materialId.trim() : "";
    if (!projectId || !materialId) return Response.json({ error: "Invalid material." }, { status: 400 });

    const snapshot = await getAdminFirestore()
      .collection(COLLECTIONS.projects)
      .doc(projectId)
      .collection(COLLECTIONS.materials)
      .doc(materialId)
      .get();
    if (snapshot.exists && snapshot.data()?.userId !== uid) {
      return Response.json({ error: "Material not found." }, { status: 404 });
    }
    await deleteMaterialIndex(projectId, materialId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid request." }, { status: 400 });
    return authErrorResponse(error);
  }
}
