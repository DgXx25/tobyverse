import { assertSignedInRequest, authErrorResponse, readIdToken } from "@/lib/api/assert";
import { downloadGcsObject, hasGcsWriteCredentials, storageBucketName } from "@/lib/storage-gcs";
import { parseMaterialStoragePath } from "@/lib/materials/storage-path";

export const runtime = "nodejs";

function guessContentType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

async function downloadViaUserToken(
  objectPath: string,
  idToken: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const bucket = storageBucketName();
  if (!bucket) throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set.");
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Firebase ${idToken}` },
    });
  } catch {
    throw new Error("Could not read file from Storage.");
  }
  if (!response.ok) {
    throw new Error(`Storage read failed (${response.status}).`);
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || guessContentType(objectPath),
  };
}

export async function GET(request: Request) {
  try {
    const session = await assertSignedInRequest(request);
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() ?? "";
    const materialId = url.searchParams.get("materialId")?.trim() ?? "";
    const name = url.searchParams.get("name")?.trim() ?? "";
    if (!projectId || !materialId || !name || name.includes("/") || name.includes("..")) {
      return Response.json({ error: "Invalid file request." }, { status: 400 });
    }

    const objectPath = `users/${session.uid}/projects/${projectId}/materials/${materialId}/${name}`;
    const parsed = parseMaterialStoragePath(objectPath);
    if (!parsed || parsed.userId !== session.uid) {
      return Response.json({ error: "Invalid storage path." }, { status: 403 });
    }

    let file: { buffer: Buffer; contentType: string };
    try {
      file = hasGcsWriteCredentials()
        ? await downloadGcsObject(objectPath)
        : await downloadViaUserToken(objectPath, await readIdToken(request));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/\b404\b|not found|No such object/i.test(message)) {
        return Response.json({ error: "File not found." }, { status: 404 });
      }
      if (/\b401\b|\b403\b|unauthorized|forbidden|app check/i.test(message)) {
        return Response.json({ error: "Could not read file." }, { status: 403 });
      }
      return Response.json({ error: "Could not read file." }, { status: 502 });
    }

    const bytes = new Uint8Array(file.buffer.byteLength);
    bytes.set(file.buffer);
    return new Response(bytes, {
      headers: {
        "Content-Type": file.contentType || guessContentType(name),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
