import { assertAccountRequest, authErrorResponse } from "@/lib/api/assert";
import { deleteGcsObject, uploadGcsObject } from "@/lib/storage-gcs";
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

export async function POST(request: Request) {
  try {
    const session = await assertAccountRequest(request);

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

    try {
      await uploadGcsObject(path, buffer, contentType);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Storage upload failed.";
      throw new StorageWriteError(message, 502);
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

export async function DELETE(request: Request) {
  try {
    const session = await assertAccountRequest(request);
    const body = (await request.json().catch(() => ({}))) as { path?: unknown };
    const path = typeof body.path === "string" ? body.path.trim() : "";
    const match = PATH_PATTERN.exec(path);
    if (!match || match[1] !== session.uid) {
      return Response.json(
        { error: `Storage path must be users/${session.uid}/projects/{projectId}/materials/{id}/{file}.` },
        { status: 403 },
      );
    }

    await deleteGcsObject(path);
    return Response.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
