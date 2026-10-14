import { assertSignedInRequest, authErrorResponse } from "@/lib/api/assert";
import { downloadGcsObject, listGcsPrefix } from "@/lib/storage-gcs";
import { parseMaterialStoragePath, storedObjectName } from "@/lib/materials/storage-path";

export const runtime = "nodejs";

function guessContentType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "application/octet-stream";
}

function contentDisposition(name: string, attachment: boolean): string {
  const type = attachment ? "attachment" : "inline";
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "file";
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function objectNamesFromList(paths: string[], prefix: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const relative = path.startsWith(prefix) ? path.slice(prefix.length) : path;
    const name = storedObjectName(relative.includes("/") ? path : relative) || storedObjectName(path);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

export async function GET(request: Request) {
  try {
    const session = await assertSignedInRequest(request);
    if (session.anonymous) {
      return Response.json({ error: "Sign in." }, { status: 401 });
    }
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() ?? "";
    const materialId = url.searchParams.get("materialId")?.trim() ?? "";
    const name = url.searchParams.get("name")?.trim() ?? "";
    const list = url.searchParams.get("list") === "1";
    const download = url.searchParams.get("download") === "1";
    const filenameRaw = url.searchParams.get("filename")?.trim() || name;
    if (
      !projectId ||
      !materialId ||
      projectId.includes("..") ||
      materialId.includes("..") ||
      projectId.includes("/") ||
      materialId.includes("/")
    ) {
      return Response.json({ error: "Invalid file request." }, { status: 400 });
    }

    const prefix = `users/${session.uid}/projects/${projectId}/materials/${materialId}/`;
    if (list) {
      let paths: string[];
      try {
        paths = await listGcsPrefix(prefix);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/\b401\b|\b403\b|unauthorized|forbidden|app check/i.test(message)) {
          return Response.json({ error: "Could not list files." }, { status: 403 });
        }
        return Response.json({ error: "Could not list files." }, { status: 502 });
      }
      return Response.json({ names: objectNamesFromList(paths, prefix) });
    }

    if (!name || name.includes("..") || (name.includes("/") && !/^pages\/\d{4,6}\.(?:txt|png)$/.test(name))) {
      return Response.json({ error: "Invalid file request." }, { status: 400 });
    }
    const filename = storedObjectName(filenameRaw) || name;
    if (download && (filename === "extracted.txt" || name === "extracted.txt")) {
      return Response.json({ error: "Invalid file request." }, { status: 400 });
    }

    const objectPath = `${prefix}${name}`;
    const parsed = parseMaterialStoragePath(objectPath);
    if (!parsed || parsed.userId !== session.uid) {
      return Response.json({ error: "Invalid storage path." }, { status: 403 });
    }

    let file: { buffer: Buffer; contentType: string };
    try {
      file = await downloadGcsObject(objectPath);
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
        "Content-Disposition": contentDisposition(filename, download),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
