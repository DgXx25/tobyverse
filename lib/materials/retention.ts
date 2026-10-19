import "server-only";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { AuthError } from "@/lib/api/assert";
import { COLLECTIONS } from "@/lib/firestore";
import { parseMaterialStoragePath, storedObjectName } from "@/lib/materials/storage-path";
import { mimeFromName } from "@/lib/materials/types";
import { getAdminFirestore } from "@/lib/server/firestore-admin";
import { deleteGcsObject, downloadGcsObject } from "@/lib/storage-gcs";

const bytes = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

/** The persisted text is the source of truth. Never remove a binary before verifying its replacement. */
export async function retainMaterialText(input: { uid: string; projectId: string; materialId: string; ref: DocumentReference }): Promise<void> {
  const material = (await input.ref.get()).data();
  if (!material || material.userId !== input.uid) throw new AuthError("Material not found.", 404);
  if (material.originalRemoved === true) return;
  const originalPath = typeof material.storagePath === "string" ? material.storagePath : "";
  const textPath = typeof material.textPath === "string" ? material.textPath : "";
  for (const path of [originalPath, textPath]) {
    const parsed = parseMaterialStoragePath(path);
    if (!parsed || parsed.userId !== input.uid || parsed.projectId !== input.projectId || parsed.materialId !== input.materialId) {
      throw new AuthError("Invalid material storage path.", 400);
    }
  }
  if (storedObjectName(textPath) !== "extracted.txt") throw new AuthError("Invalid extracted text path.", 400);
  const { buffer } = await downloadGcsObject(textPath);
  if (!buffer.toString("utf8").trim() || !bytes(material.textChars)) {
    throw new AuthError("No text was extracted. The original file has been kept.", 422);
  }

  // Deletion is idempotent (a missing object is success). If the following transaction fails,
  // the old document still points to this path, so a retry completes accounting exactly once.
  if (originalPath !== textPath) await deleteGcsObject(originalPath);
  const db = getAdminFirestore();
  const userRef = db.collection(COLLECTIONS.users).doc(input.uid);
  await db.runTransaction(async transaction => {
    const [snapshot, user] = await Promise.all([transaction.get(input.ref), transaction.get(userRef)]);
    const current = snapshot.data();
    if (!current || current.userId !== input.uid || current.originalRemoved === true) return;
    if (current.storagePath !== originalPath || current.textPath !== textPath) throw new Error("Material changed. Retry processing.");
    const originalName = current.originalName || storedObjectName(originalPath) || current.title || "File";
    const chargedBytes = bytes(current.sizeBytes);
    const usage = user.data()?.usage ?? {};
    transaction.set(input.ref, {
      originalName,
      originalMime: current.originalMime || mimeFromName(originalName),
      originalSizeBytes: bytes(current.originalSizeBytes) || chargedBytes,
      originalStoragePath: originalPath,
      originalRemoved: true,
      storagePath: textPath,
      textPath,
      extractedPath: textPath,
      sizeBytes: buffer.byteLength,
      images: [], imagePaths: [], hasImages: false,
      previewPagePath: FieldValue.delete(), previewHtml: FieldValue.delete(),
    }, { merge: true });
    transaction.set(userRef, {
      usage: { ...usage, storageBytes: Math.max(0, bytes(usage.storageBytes) - chargedBytes) + buffer.byteLength },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}
