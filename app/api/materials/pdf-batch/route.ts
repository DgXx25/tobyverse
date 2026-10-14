import { assertAccountRequest, authErrorResponse } from "@/lib/api/assert";
import { COLLECTIONS } from "@/lib/firestore";
import { parseMaterialStoragePath } from "@/lib/materials/storage-path";
import { indexPdfStep } from "@/lib/rag/ingest";
import { getAdminFirestore } from "@/lib/server/firestore-admin";
import { aiUsageErrorResponse, startAiUsageSession } from "@/lib/billing/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Leaves headroom under maxDuration for the last window to finish and the response to leave. */
const BUDGET_MS = 38_000;

/**
 * Reads a PDF once per call, extracts text (OCR only for scanned pages), chunks, embeds and stores
 * as many pages as the budget allows, then returns a cursor. The client repeats until `done`.
 * No page images or per-page files are stored.
 */
export async function POST(request: Request) {
  let uid = "";
  try {
    uid = (await assertAccountRequest(request)).uid;
  } catch (error) {
    return authErrorResponse(error);
  }

  let usage;
  try {
    usage = await startAiUsageSession(uid);
  } catch (error) {
    return aiUsageErrorResponse(error);
  }

  try {
    const body = (await request.json()) as { path?: unknown; projectId?: unknown; materialId?: unknown };
    const path = typeof body.path === "string" ? body.path.trim() : "";
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    const materialId = typeof body.materialId === "string" ? body.materialId.trim() : "";
    const parsed = parseMaterialStoragePath(path);
    if (
      !parsed ||
      parsed.userId !== uid ||
      parsed.projectId !== projectId ||
      parsed.materialId !== materialId ||
      !parsed.name.toLowerCase().endsWith(".pdf")
    ) {
      return Response.json({ error: "Invalid PDF material." }, { status: 400 });
    }

    const ref = getAdminFirestore()
      .collection(COLLECTIONS.projects)
      .doc(projectId)
      .collection(COLLECTIONS.materials)
      .doc(materialId);
    const snapshot = await ref.get();
    const material = snapshot.data();
    if (!snapshot.exists || material?.userId !== uid || material?.storagePath !== path) {
      return Response.json({ error: "Material not found." }, { status: 404 });
    }

    const progress = await indexPdfStep({
      uid,
      projectId,
      materialId,
      path,
      ref,
      budgetMs: BUDGET_MS,
      usage: usage.report,
    });
    return Response.json(progress);
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid request." }, { status: 400 });
    if (error instanceof Error && /password|encrypt/i.test(error.message)) {
      return Response.json({ error: "This PDF is password protected." }, { status: 422 });
    }
    return authErrorResponse(error);
  } finally {
    await usage.commit().catch((error) => console.error("[ai-usage] commit failed", error));
  }
}
