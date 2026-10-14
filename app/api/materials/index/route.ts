import { assertAccountRequest, authErrorResponse } from "@/lib/api/assert";
import { COLLECTIONS } from "@/lib/firestore";
import { parseMaterialStoragePath } from "@/lib/materials/storage-path";
import { indexTextStep } from "@/lib/rag/ingest";
import { getAdminFirestore } from "@/lib/server/firestore-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUDGET_MS = 40_000;

/** Indexes a non-PDF material from its stored plain text. Resumable like pdf-batch. */
export async function POST(request: Request) {
  try {
    const { uid } = await assertAccountRequest(request);
    const body = (await request.json()) as { projectId?: unknown; materialId?: unknown };
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    const materialId = typeof body.materialId === "string" ? body.materialId.trim() : "";
    if (!projectId || !materialId) return Response.json({ error: "Invalid material." }, { status: 400 });

    const ref = getAdminFirestore()
      .collection(COLLECTIONS.projects)
      .doc(projectId)
      .collection(COLLECTIONS.materials)
      .doc(materialId);
    const snapshot = await ref.get();
    const material = snapshot.data();
    if (!snapshot.exists || material?.userId !== uid) {
      return Response.json({ error: "Material not found." }, { status: 404 });
    }
    const textPath = typeof material.textPath === "string" ? material.textPath : "";
    const parsed = parseMaterialStoragePath(textPath);
    if (!parsed || parsed.userId !== uid || parsed.materialId !== materialId) {
      return Response.json({ error: "This material has no readable text." }, { status: 400 });
    }

    const progress = await indexTextStep({ uid, projectId, materialId, textPath, ref, budgetMs: BUDGET_MS });
    return Response.json(progress);
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid request." }, { status: 400 });
    return authErrorResponse(error);
  }
}
