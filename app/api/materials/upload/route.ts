import { assertSignedInRequest, authErrorResponse, readIdToken } from "@/lib/api/assert";
import { hasGcsWriteCredentials, uploadGcsObject } from "@/lib/storage-gcs";
import { MAX_UPLOAD_BODY_BYTES, MAX_UPLOAD_BYTES, uploadTooLargeMessage } from "@/lib/materials/limits";

export const runtime = "nodejs";

const PATH_PATTERN = /^users\/([^/]+)\/projects\/([^/]+)\/materials\/([^/]+)\/[^/]+$/;

class StorageWriteError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StorageWriteError";
    this.status = status;
  }
}

function storageBucket(): string {
  return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || "";
}

function messageFromStorageBody(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string };
    const detail = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
    if (typeof detail === "string" && detail.trim()) {
      if (/app check/i.test(detail)) {
        return "Storage App Check blocked this upload.";
      }
      return detail.trim();
    }
  } catch {
    // Use the raw body below.
  }
  const trimmed = body.replace(/\s+/g, " ").trim();
  if (trimmed) return `Storage upload failed (${status}). ${trimmed.slice(0, 180)}`;
  return `Storage upload failed (${status}).`;
}

async function writeViaAdmin(objectPath: string, buffer: Buffer, contentType: string): Promise<void> {
  await uploadGcsObject(objectPath, buffer, contentType);
}

async function writeViaUserToken(
  path: string,
  buffer: Buffer,
  contentType: string,
  idToken: string,
  appCheckToken: string,
): Promise<void> {
  const bucket = storageBucket();
  if (!bucket) throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set.");
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodeURIComponent(path)}&uploadType=media`;
  const headers: Record<string, string> = {
    Authorization: `Firebase ${idToken}`,
    "Content-Type": contentType || "application/octet-stream",
  };
  if (appCheckToken) headers["X-Firebase-AppCheck"] = appCheckToken;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: new Uint8Array(buffer),
    });
  } catch {
    throw new StorageWriteError("Storage upload failed. Could not reach Firebase Storage.", 502);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const status = response.status === 401 || response.status === 403 ? response.status : 502;
    throw new StorageWriteError(messageFromStorageBody(response.status, text), status);
  }
}

export async function POST(request: Request) {
  try {
    const session = await assertSignedInRequest(request);

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BODY_BYTES) {
      return Response.json({ error: uploadTooLargeMessage() }, { status: 413 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json(
        { error: "Could not read upload. File may be too large." },
        { status: 413 },
      );
    }

    const path = typeof form.get("path") === "string" ? String(form.get("path")).trim() : "";
    const contentType =
      typeof form.get("contentType") === "string" && String(form.get("contentType")).trim()
        ? String(form.get("contentType")).trim()
        : "application/octet-stream";
    const file = form.get("file");
    const text = typeof form.get("text") === "string" ? String(form.get("text")) : "";

    const match = PATH_PATTERN.exec(path);
    if (!match || match[1] !== session.uid) {
      return Response.json(
        { error: `Storage path must be users/${session.uid}/projects/{projectId}/materials/{id}/{file}.` },
        { status: 403 },
      );
    }

    const blob =
      file && typeof file === "object" && typeof (file as Blob).arrayBuffer === "function"
        ? (file as Blob)
        : null;

    let buffer: Buffer;
    if (blob) {
      if (blob.size > MAX_UPLOAD_BYTES) {
        return Response.json({ error: uploadTooLargeMessage() }, { status: 413 });
      }
      buffer = Buffer.from(await blob.arrayBuffer());
    } else if (text) {
      buffer = Buffer.from(text, "utf8");
      if (buffer.byteLength > MAX_UPLOAD_BYTES) {
        return Response.json({ error: uploadTooLargeMessage() }, { status: 413 });
      }
    } else {
      return Response.json({ error: "Missing file." }, { status: 400 });
    }

    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      return Response.json({ error: uploadTooLargeMessage() }, { status: 413 });
    }

    if (hasGcsWriteCredentials()) {
      try {
        await writeViaAdmin(path, buffer, contentType);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Storage upload failed.";
        throw new StorageWriteError(message, 502);
      }
    } else {
      const appCheck =
        request.headers.get("x-firebase-appcheck")?.trim() ||
        (typeof form.get("appCheck") === "string" ? String(form.get("appCheck")).trim() : "");
      await writeViaUserToken(path, buffer, contentType, await readIdToken(request), appCheck);
    }

    return Response.json({ ok: true, path });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Invalid metadata JSON." }, { status: 400 });
    }
    if (error instanceof StorageWriteError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return authErrorResponse(error);
  }
}
