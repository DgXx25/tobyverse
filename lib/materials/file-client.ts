import { authHeaders } from "@/lib/api/client";
import { storedObjectName } from "@/lib/materials/storage-path";

export type MaterialFileOk = {
  ok: true;
  bytes: ArrayBuffer;
  contentType: string;
};

export type MaterialFileErr = {
  ok: false;
  status: number;
  message: string;
};

export type MaterialFileResult = MaterialFileOk | MaterialFileErr;
export type MaterialFileAccess = { shareId: string };

const memory = new Map<string, Promise<MaterialFileResult>>();
const missing = new Map<string, number>();
const blobUrls = new Map<string, string>();
const listed = new Map<string, Promise<{ ok: boolean; names: string[] }>>();

export function cacheKey(projectId: string, materialId: string, name: string, access?: MaterialFileAccess): string {
  return `${access?.shareId ? `share:${access.shareId}/` : ""}${projectId}/${materialId}/${name}`;
}

export function storedFileName(path: string | undefined | null): string | null {
  return storedObjectName(path);
}

export function isMissingMaterialName(projectId: string, materialId: string, name: string, access?: MaterialFileAccess): boolean {
  const key = cacheKey(projectId, materialId, name, access);
  const expires = missing.get(key);
  if (expires && expires > Date.now()) return true;
  missing.delete(key);
  return false;
}

function markMissing(key: string) {
  missing.set(key, Date.now() + 5000);
}

export async function listMaterialFiles(
  projectId: string,
  materialId: string,
  access?: MaterialFileAccess,
): Promise<{ ok: boolean; names: string[] }> {
  const key = cacheKey(projectId, materialId, "__list__", access);
  const pending = listed.get(key);
  if (pending) return pending;

  const request = (async (): Promise<{ ok: boolean; names: string[] }> => {
    const query = new URLSearchParams({ projectId, materialId, list: "1" });
    const endpoint = access?.shareId
      ? `/api/share/${encodeURIComponent(access.shareId)}/file?${query}`
      : `/api/materials/file?${query}`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: access?.shareId ? undefined : await authHeaders(false),
      });
    } catch {
      return { ok: false, names: [] };
    }
    if (!response.ok) return { ok: false, names: [] };
    const body = (await response.json().catch(() => ({}))) as { names?: unknown };
    if (!Array.isArray(body.names)) return { ok: false, names: [] };
    const names: string[] = [];
    const seen = new Set<string>();
    for (const item of body.names) {
      const name = typeof item === "string" ? storedObjectName(item) : null;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    return { ok: true, names };
  })();

  listed.set(key, request);
  const result = await request;
  listed.delete(key);
  return result;
}

export async function getMaterialFile(
  projectId: string,
  materialId: string,
  name: string,
  access?: MaterialFileAccess,
): Promise<MaterialFileResult> {
  if (!name || name.includes("/") || name.includes("..")) {
    return { ok: false, status: 400, message: "File not found." };
  }
  const key = cacheKey(projectId, materialId, name, access);
  if (isMissingMaterialName(projectId, materialId, name, access)) {
    return { ok: false, status: 404, message: "File not found." };
  }
  const pending = memory.get(key);
  if (pending) return pending;

  const request = (async (): Promise<MaterialFileResult> => {
    const query = new URLSearchParams({ projectId, materialId, name });
    const endpoint = access?.shareId
      ? `/api/share/${encodeURIComponent(access.shareId)}/file?${query}`
      : `/api/materials/file?${query}`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: access?.shareId ? undefined : await authHeaders(false),
      });
    } catch {
      return { ok: false, status: 0, message: "Could not read file." };
    }
    if (response.status === 401) {
      return { ok: false, status: 401, message: "Sign in." };
    }
    if (response.status === 404) {
      markMissing(key);
      return { ok: false, status: 404, message: "File not found." };
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        status: response.status,
        message: body.error?.trim() || "Could not read file.",
      };
    }
    return {
      ok: true,
      bytes: await response.arrayBuffer(),
      contentType: response.headers.get("content-type") || "application/octet-stream",
    };
  })();

  memory.set(key, request);
  const result = await request;
  if (!result.ok) {
    memory.delete(key);
  }
  return result;
}

export function materialFileObjectUrl(result: MaterialFileOk, key: string): string {
  const existing = blobUrls.get(key);
  if (existing) return existing;
  const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], { type: result.contentType }));
  blobUrls.set(key, url);
  return url;
}

export async function downloadMaterialFile(
  projectId: string,
  materialId: string,
  name: string,
  downloadAs?: string,
  access?: MaterialFileAccess,
): Promise<MaterialFileErr | null> {
  if (!name) {
    return { ok: false, status: 400, message: "File not found." };
  }
  const saveAs = downloadAs || name;
  const key = cacheKey(projectId, materialId, name, access);
  if (isMissingMaterialName(projectId, materialId, name, access)) {
    return { ok: false, status: 404, message: "File not found." };
  }
  const pending = memory.get(key);
  if (pending) {
    const cached = await pending;
    if (!cached.ok) return cached;
    saveBlob(cached.bytes, cached.contentType, saveAs);
    return null;
  }

  const query = new URLSearchParams({ projectId, materialId, name, download: "1", filename: saveAs });
  const endpoint = access?.shareId
    ? `/api/share/${encodeURIComponent(access.shareId)}/file?${query}`
    : `/api/materials/file?${query}`;
  const request = (async (): Promise<MaterialFileResult> => {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: access?.shareId ? undefined : await authHeaders(false),
      });
    } catch {
      return { ok: false, status: 0, message: "Could not read file." };
    }
    if (response.status === 401) return { ok: false, status: 401, message: "Sign in." };
    if (response.status === 404) {
      markMissing(key);
      return { ok: false, status: 404, message: "File not found." };
    }
    if (!response.ok) {
      return { ok: false, status: response.status, message: "Could not read file." };
    }
    return {
      ok: true,
      bytes: await response.arrayBuffer(),
      contentType: response.headers.get("content-type") || "application/octet-stream",
    };
  })();
  memory.set(key, request);
  const result = await request;
  if (!result.ok) {
    memory.delete(key);
    return result;
  }
  saveBlob(result.bytes, result.contentType, saveAs);
  return null;
}

function saveBlob(bytes: ArrayBuffer, contentType: string, name: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: contentType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
