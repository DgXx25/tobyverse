import { assertAccountRequest, authErrorResponse } from "@/lib/api/assert";
import { getAdminFirestore } from "@/lib/server/firestore-admin";
import { MaterialStorageQuotaError, userStorageCap } from "@/lib/server/material-storage-quota";
import { MAX_UPLOAD_BYTES, uploadTooLargeMessage } from "@/lib/materials/limits";
import { UPLOAD_CHUNK_BYTES } from "@/lib/materials/resumable-upload";
import { parseMaterialStoragePath } from "@/lib/materials/storage-path";
import { normalizeImageUpload } from "@/lib/materials/image-normalization";
import { startGcsResumableUpload, writeGcsUploadChunk, cancelGcsUpload, deleteGcsObject, downloadGcsObject, uploadGcsObject } from "@/lib/storage-gcs";

export const runtime = "nodejs";

type UploadSession = {
  path: string;
  sessionUrl: string;
  sizeBytes: number;
  uploadBytes: number;
  contentType: string;
  originalName: string;
  normalized?: boolean;
  reservedBytes: number;
  reservePool: boolean;
  createdAt: number;
  state: "uploading" | "complete" | "cancelling" | "cancelled";
};

function sessions(uid: string) {
  return getAdminFirestore().collection("users").doc(uid).collection("materialUploads");
}

export async function POST(request: Request) {
  let sessionUrl = "";
  try {
    const { uid } = await assertAccountRequest(request);
    const body = await request.json();
    const parsed = typeof body.path === "string" ? parseMaterialStoragePath(body.path) : null;
    if (!parsed || parsed.userId !== uid) return Response.json({ error: "Invalid storage path." }, { status: 403 });
    const bytes = body.sizeBytes;
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_UPLOAD_BYTES) {
      return Response.json({ error: uploadTooLargeMessage(), maxBytes: MAX_UPLOAD_BYTES }, { status: 413 });
    }
    const contentType = typeof body.contentType === "string" && body.contentType.length <= 200
      ? body.contentType : "application/octet-stream";
    if (body.reservePool === true) {
      const user = await getAdminFirestore().collection("users").doc(uid).get();
      const used = Math.max(0, Number(user.data()?.usage?.storageBytes) || 0);
      const capBytes = await userStorageCap(uid);
      const remaining = capBytes == null ? Number.MAX_SAFE_INTEGER : Math.max(0, capBytes - used);
      if (capBytes != null && bytes > remaining) throw new MaterialStorageQuotaError(remaining, bytes, capBytes);
    }
    const ref = sessions(uid).doc();
    // Every session owns a distinct object, including a retry of the same file.
    const objectPath = `${body.path.slice(0, body.path.lastIndexOf("/") + 1)}${ref.id}-${parsed.name}`;
    sessionUrl = await startGcsResumableUpload(objectPath, bytes, contentType);
    const originalName = typeof body.originalName === "string" ? body.originalName.slice(0, 240) : parsed.name;
    await ref.set({ path: objectPath, sessionUrl, sizeBytes: bytes, uploadBytes: bytes, contentType, originalName, reservedBytes: 0, reservePool: body.reservePool === true, createdAt: Date.now(), state: "uploading" } satisfies UploadSession);
    return Response.json({ id: ref.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (sessionUrl) await cancelGcsUpload(sessionUrl).catch(() => undefined);
    if (error instanceof MaterialStorageQuotaError) return Response.json({ error: error.message, remainingBytes: error.remainingBytes }, { status: error.status });
    return authErrorResponse(error);
  }
}

async function handleSession(request: Request, action: "write" | "status" | "cancel") {
  try {
    const { uid } = await assertAccountRequest(request);
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^[A-Za-z0-9]{20}$/.test(id)) return Response.json({ error: "Invalid upload id." }, { status: 400 });
    const ref = sessions(uid).doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return Response.json({ error: "Upload not found." }, { status: 404 });
    let session = snapshot.data() as UploadSession;
    if (session.state === "cancelled") return Response.json({ error: "Upload was cancelled." }, { status: 410 });
    if (action === "cancel") {
      session = await getAdminFirestore().runTransaction(async (transaction) => {
        const current = await transaction.get(ref);
        const data = current.data() as UploadSession;
        if (data.state !== "cancelled") transaction.update(ref, { state: "cancelling" });
        return data;
      });
      // Cancel before releasing quota, so late chunks cannot produce uncounted files.
      if (session.state !== "complete") await cancelGcsUpload(session.sessionUrl);
      await deleteGcsObject(session.path);
      // Claim release once even if cancellation was retried after a lost response.
      await getAdminFirestore().runTransaction(async (transaction) => {
        const current = await transaction.get(ref);
        if (current.data()?.state === "cancelled") return;
        const reservedBytes = Number(current.data()?.reservedBytes) || 0;
        if (reservedBytes > 0) {
          const userRef = getAdminFirestore().collection("users").doc(uid);
          const user = await transaction.get(userRef);
          const used = Number(user.data()?.usage?.storageBytes) || 0;
          transaction.update(userRef, { "usage.storageBytes": Math.max(0, used - reservedBytes) });
        }
        transaction.update(ref, { state: "cancelled" });
      });
      return Response.json({ ok: true });
    }
    if (session.state === "cancelling") return Response.json({ error: "Upload was cancelled." }, { status: 410 });
    if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
      return Response.json({ error: "Upload expired. Retry the file." }, { status: 410 });
    }
    let progress = { offset: session.uploadBytes, done: true };
    if (session.state !== "complete") {
      if (action === "write") {
        const offset = Number(request.headers.get("x-upload-offset"));
        const length = Number(request.headers.get("content-length"));
        if (!Number.isSafeInteger(offset) || offset < 0 ||
            length > UPLOAD_CHUNK_BYTES) {
          return Response.json({ error: "Invalid upload chunk." }, { status: 400 });
        }
        // Bound reads even when Content-Length is absent or inaccurate.
        const reader = request.body?.getReader();
        if (!reader) return Response.json({ error: "Missing upload chunk." }, { status: 400 });
        const parts: Uint8Array[] = [];
        let bytes = 0;
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > UPLOAD_CHUNK_BYTES || offset + bytes > session.uploadBytes) {
            await reader.cancel();
            return Response.json({ error: "Upload chunk too large." }, { status: 413 });
          }
          parts.push(part.value);
        }
        if (!bytes || (offset + bytes < session.uploadBytes && bytes % (256 * 1024) !== 0)) {
          return Response.json({ error: "Invalid upload chunk size." }, { status: 400 });
        }
        progress = await writeGcsUploadChunk(session.sessionUrl, session.uploadBytes, { bytes: Buffer.concat(parts), offset });
      } else {
        progress = await writeGcsUploadChunk(session.sessionUrl, session.uploadBytes);
      }
      if (progress.done) {
        // Large HEIC files use the same bounded transport, then convert on the
        // server where the original bytes no longer cross the hosting proxy.
        const chatImage = parseMaterialStoragePath(session.path)?.materialId.startsWith("chat-image-") === true;
        if (!session.normalized && (chatImage || /^image\//i.test(session.contentType) || /\.(png|jpe?g|webp|heic|heif)$/i.test(session.originalName))) {
          const original = await downloadGcsObject(session.path);
          const normalized = await normalizeImageUpload({ filename: session.originalName, mime: session.contentType, buffer: original.buffer, chatImage });
          if (normalized.buffer.byteLength > MAX_UPLOAD_BYTES) {
            return Response.json({ error: uploadTooLargeMessage() }, { status: 413 });
          }
          const normalizedPath = `${session.path.slice(0, session.path.lastIndexOf("/") + 1)}${id}-${normalized.filename}`;
          await uploadGcsObject(normalizedPath, normalized.buffer, normalized.mime);
          try {
            await getAdminFirestore().runTransaction(async (transaction) => {
              const current = await transaction.get(ref);
              if (["cancelling", "cancelled"].includes(current.data()?.state)) throw new Error("Upload was cancelled.");
              transaction.update(ref, { normalized: true, path: normalizedPath, sizeBytes: normalized.buffer.byteLength, contentType: normalized.mime });
            });
          } catch (error) {
            await deleteGcsObject(normalizedPath).catch(() => undefined);
            throw error;
          }
          if (session.path !== normalizedPath) await deleteGcsObject(session.path).catch(() => undefined);
          session.path = normalizedPath;
          session.sizeBytes = normalized.buffer.byteLength;
          session.contentType = normalized.mime;
        }
        // Count only finished objects, once. Interrupted sessions hold no quota.
        try {
          const capBytes = session.reservePool ? await userStorageCap(uid) : null;
          session.reservedBytes = await getAdminFirestore().runTransaction(async (transaction) => {
            const current = await transaction.get(ref);
            if (["cancelling", "cancelled"].includes(current.data()?.state)) throw new Error("Upload was cancelled.");
            if (current.data()?.state === "complete") return Number(current.data()?.reservedBytes) || 0;
            const reserved = session.reservePool ? session.sizeBytes : 0;
            if (reserved > 0) {
              const userRef = getAdminFirestore().collection("users").doc(uid);
              const user = await transaction.get(userRef);
              const used = Math.max(0, Number(user.data()?.usage?.storageBytes) || 0);
              const remaining = capBytes == null ? Number.MAX_SAFE_INTEGER : Math.max(0, capBytes - used);
              if (capBytes != null && reserved > remaining) throw new MaterialStorageQuotaError(remaining, reserved, capBytes);
              transaction.update(userRef, { "usage.storageBytes": used + reserved });
            }
            transaction.update(ref, { state: "complete", reservedBytes: reserved, path: session.path, sizeBytes: session.sizeBytes, contentType: session.contentType });
            return reserved;
          });
        } catch (error) {
          if (error instanceof MaterialStorageQuotaError) {
            await deleteGcsObject(session.path);
            await ref.update({ state: "cancelled" });
          }
          throw error;
        }
      }
    }
    return Response.json({ ...progress, path: session.path, sizeBytes: session.sizeBytes, contentType: session.contentType, reservedBytes: session.reservedBytes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MaterialStorageQuotaError) return Response.json({ error: error.message, remainingBytes: error.remainingBytes }, { status: error.status });
    return authErrorResponse(error);
  }
}

export const PUT = (request: Request) => handleSession(request, "write");
export const GET = (request: Request) => handleSession(request, "status");
export const DELETE = (request: Request) => handleSession(request, "cancel");
