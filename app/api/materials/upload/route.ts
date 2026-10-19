import { assertAccountRequest, authErrorResponse } from "@/lib/api/assert";
import { deleteGcsObject, uploadGcsObject } from "@/lib/storage-gcs";
import { MAX_UPLOAD_BODY_BYTES, MAX_UPLOAD_BYTES, uploadTooLargeMessage } from "@/lib/materials/limits";
import { normalizeImageUpload } from "@/lib/materials/image-normalization";
import { MaterialStorageQuotaError, releaseMaterialStorage, reserveMaterialStorage } from "@/lib/server/material-storage-quota";
import { parseMaterialStoragePath } from "@/lib/materials/storage-path";

export const runtime = "nodejs";

class StorageWriteError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StorageWriteError";
    this.status = status;
  }
}

function logUpload(input: { status: number; bytes: number; mime: string; uidPresent: boolean }) {
  console.info("[materials/upload]", input);
}

export async function POST(request: Request) {
  let observedBytes = 0;
  let observedMime = request.headers.get("content-type") ?? "application/octet-stream";
  let uidPresent = false;
  let reservedUid = "";
  let reservedBytes = 0;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 0) observedBytes = contentLength;
  const respond = (body: Record<string, unknown>, status: number) => {
    logUpload({ status, bytes: observedBytes, mime: observedMime, uidPresent });
    return Response.json(body, { status });
  };

  try {
    const session = await assertAccountRequest(request);
    uidPresent = Boolean(session.uid);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return respond({ error: uploadTooLargeMessage(), maxBytes: MAX_UPLOAD_BYTES }, 413);
    }

    const path = typeof form.get("path") === "string" ? String(form.get("path")).trim() : "";
    const contentType =
      typeof form.get("contentType") === "string" && String(form.get("contentType")).trim()
        ? String(form.get("contentType")).trim()
        : "application/octet-stream";
    const uploadName = typeof form.get("fileName") === "string" && String(form.get("fileName")).trim()
      ? String(form.get("fileName")).trim()
      : "";
    const file = form.get("file");
    const text = typeof form.get("text") === "string" ? String(form.get("text")) : "";
    if (file && typeof file === "object" && typeof (file as Blob).size === "number") {
      observedBytes = (file as Blob).size;
      observedMime = (file as Blob).type || contentType;
    } else if (form.has("text")) {
      observedBytes = Buffer.byteLength(text, "utf8");
      observedMime = contentType;
    }

    const parsedPath = parseMaterialStoragePath(path);
    if (!parsedPath || parsedPath.userId !== session.uid) {
      return respond(
        { error: `Storage path must be users/${session.uid}/projects/{projectId}/materials/{id}/{file}.` },
        403,
      );
    }

    const blob =
      file && typeof file === "object" && typeof (file as Blob).arrayBuffer === "function"
        ? (file as Blob)
        : null;

    let buffer: Buffer;
    let storedName = parsedPath.name;
    let storedType = contentType;
    if (blob) {
      const blobName = "name" in blob && typeof blob.name === "string" ? blob.name : parsedPath.name;
      const normalized = await normalizeImageUpload({
        filename: uploadName || blobName,
        mime: blob.type || contentType,
        buffer: Buffer.from(await blob.arrayBuffer()),
        chatImage: parsedPath.materialId.startsWith("chat-image-"),
      });
      buffer = normalized.buffer;
      if (normalized.converted) storedName = normalized.filename;
      storedType = normalized.mime;
    } else if (form.has("text")) {
      buffer = Buffer.from(text, "utf8");
    } else {
      return respond({ error: "Missing file." }, 400);
    }

    const storedPath = storedName === parsedPath.name
      ? path
      : `${path.slice(0, path.lastIndexOf("/") + 1)}${storedName}`;
    const reservePool = form.get("reservePool") === "true";
    if (reservePool) {
      await reserveMaterialStorage(session.uid, buffer.byteLength);
      reservedUid = session.uid;
      reservedBytes = buffer.byteLength;
    }

    if (buffer.byteLength > MAX_UPLOAD_BYTES || (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BODY_BYTES)) {
      if (reservedBytes > 0) await releaseMaterialStorage(reservedUid, reservedBytes);
      reservedUid = "";
      reservedBytes = 0;
      observedBytes = buffer.byteLength;
      return respond({ error: uploadTooLargeMessage(), maxBytes: MAX_UPLOAD_BYTES }, 413);
    }

    try {
      await uploadGcsObject(storedPath, buffer, storedType);
    } catch (error) {
      if (reservedBytes > 0) {
        await releaseMaterialStorage(reservedUid, reservedBytes).catch(() => undefined);
        reservedUid = "";
        reservedBytes = 0;
      }
      const message = error instanceof Error ? error.message : "Storage upload failed.";
      throw new StorageWriteError(message, 502);
    }

    const completedBytes = reservedBytes;
    reservedUid = "";
    reservedBytes = 0;
    observedBytes = buffer.byteLength;
    observedMime = storedType;
    return respond({ ok: true, path: storedPath, sizeBytes: buffer.byteLength, contentType: storedType, reservedBytes: completedBytes }, 200);
  } catch (error) {
    if (reservedBytes > 0) await releaseMaterialStorage(reservedUid, reservedBytes).catch(() => undefined);
    if (error instanceof MaterialStorageQuotaError) {
      return respond({ error: error.message, remainingBytes: error.remainingBytes }, error.status);
    }
    if (error instanceof SyntaxError) {
      return respond({ error: "Invalid metadata JSON." }, 400);
    }
    if (error instanceof StorageWriteError) {
      return respond({ error: error.message }, error.status);
    }
    const conversionFailure = error instanceof Error && /could not prepare this photo|could not convert this heic\/heif/i.test(error.message);
    const status = conversionFailure ? 400 : error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : 500;
    const message = error instanceof Error ? error.message : "Request failed.";
    return respond({ error: message }, status);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await assertAccountRequest(request);
    const body = (await request.json().catch(() => ({}))) as { path?: unknown; releaseBytes?: unknown };
    const path = typeof body.path === "string" ? body.path.trim() : "";
    const releaseBytes = typeof body.releaseBytes === "number" && Number.isFinite(body.releaseBytes)
      ? Math.max(0, Math.floor(body.releaseBytes))
      : 0;
    const parsedPath = path ? parseMaterialStoragePath(path) : null;
    if ((path && (!parsedPath || parsedPath.userId !== session.uid)) || (!path && releaseBytes <= 0)) {
      return Response.json(
        { error: `Storage path must be users/${session.uid}/projects/{projectId}/materials/{id}/{file}.` },
        { status: 403 },
      );
    }

    if (path) await deleteGcsObject(path);
    if (releaseBytes > 0) await releaseMaterialStorage(session.uid, releaseBytes);
    return Response.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
