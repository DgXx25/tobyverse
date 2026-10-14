import { downloadGcsObject, listGcsPrefix } from "@/lib/storage-gcs";
import { storedObjectName } from "@/lib/materials/storage-path";
import { safeInlineMime } from "@/lib/sharing/file-response";
import { sharedMaterialAccess } from "@/lib/sharing/server";

export const runtime = "nodejs";

function disposition(name: string, download: boolean): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "file";
  return `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(request: Request, context: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await context.params;
  const url = new URL(request.url);
  const materialId = url.searchParams.get("materialId")?.trim() ?? "";
  const name = url.searchParams.get("name")?.trim() ?? "";
  const list = url.searchParams.get("list") === "1";
  const download = url.searchParams.get("download") === "1";
  if (!materialId || materialId.includes("/") || materialId.includes("..")) {
    return Response.json({ error: "Invalid file request." }, { status: 400 });
  }
  const access = await sharedMaterialAccess(shareId, materialId).catch(() => null);
  if (!access) return Response.json({ error: "Shared file not found." }, { status: 404 });
  const prefix = `users/${access.ownerId}/projects/${access.projectId}/materials/${materialId}/`;
  if (list) {
    const paths = await listGcsPrefix(prefix).catch(() => []);
    return Response.json({ names: paths.flatMap((path) => storedObjectName(path) ?? []) });
  }
  if (!name || name.includes("/") || name.includes("..")) {
    return Response.json({ error: "Invalid file request." }, { status: 400 });
  }
  try {
    const file = await downloadGcsObject(`${prefix}${name}`);
    const inlineType = safeInlineMime(file.contentType);
    const forceDownload = download || !inlineType;
    const bytes = new Uint8Array(file.buffer.byteLength);
    bytes.set(file.buffer);
    return new Response(bytes, {
      headers: {
        "Content-Type": inlineType ?? "application/octet-stream",
        "Content-Disposition": disposition(url.searchParams.get("filename")?.trim() || name, forceDownload),
        "Cache-Control": "private, max-age=60",
        "Content-Security-Policy": "sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Shared file not found." }, { status: 404 });
  }
}
