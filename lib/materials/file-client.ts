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

const memory = new Map<string, Promise<MaterialFileResult>>();
const missing = new Set<string>();
const blobUrls = new Map<string, string>();
const listed = new Map<string, Promise<{ ok: boolean; names: string[] }>>();

export function cacheKey(projectId: string, materialId: string, name: string): string {
  return `${projectId}/${materialId}/${name}`;
}

export function storedFileName(path: string | undefined | null): string | null {
  return storedObjectName(path);
}

export function isMissingMaterialName(projectId: string, materialId: string, name: string): boolean {
  return missing.has(cacheKey(projectId, materialId, name));
}

function markMissing(key: string) {
  missing.add(key);
}

export async function listMaterialFiles(
  projectId: string,
  materialId: string,
): Promise<{ ok: boolean; names: string[] }> {
  const key = `${projectId}/${materialId}`;
  const pending = listed.get(key);
  if (pending) return pending;

  const request = (async (): Promise<{ ok: boolean; names: string[] }> => {
    const query = new URLSearchParams({ projectId, materialId, list: "1" });
    let response: Response;
    try {
      response = await fetch(`/api/materials/file?${query}`, {
        headers: await authHeaders(false),
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
  if (!result.ok) listed.delete(key);
  return result;
}

export async function getMaterialFile(
  projectId: string,
  materialId: string,
  name: string,
): Promise<MaterialFileResult> {
  if (!name || name.includes("/") || name.includes("..")) {
    return { ok: false, status: 400, message: "ფაილი ვერ მოიძებნა" };
  }
  const key = cacheKey(projectId, materialId, name);
  if (missing.has(key)) {
    return { ok: false, status: 404, message: "ფაილი ვერ მოიძებნა" };
  }
  const pending = memory.get(key);
  if (pending) return pending;

  const request = (async (): Promise<MaterialFileResult> => {
    const query = new URLSearchParams({ projectId, materialId, name });
    let response: Response;
    try {
      response = await fetch(`/api/materials/file?${query}`, {
        headers: await authHeaders(false),
      });
    } catch {
      return { ok: false, status: 0, message: "Could not read file." };
    }
    if (response.status === 401) {
      return { ok: false, status: 401, message: "Sign in." };
    }
    if (response.status === 404) {
      markMissing(key);
      return { ok: false, status: 404, message: "ფაილი ვერ მოიძებნა" };
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
  if (!result.ok && result.status !== 404 && result.status !== 401) {
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
): Promise<MaterialFileErr | null> {
  if (!name || name === "extracted.txt") {
    return { ok: false, status: 400, message: "ფაილი ვერ მოიძებნა" };
  }
  const saveAs = (downloadAs && downloadAs !== "extracted.txt" ? downloadAs : name) || name;
  const key = cacheKey(projectId, materialId, name);
  if (missing.has(key)) {
    return { ok: false, status: 404, message: "ფაილი ვერ მოიძებნა" };
  }
  const pending = memory.get(key);
  if (pending) {
    const cached = await pending;
    if (!cached.ok) return cached;
    saveBlob(cached.bytes, cached.contentType, saveAs);
    return null;
  }

  const query = new URLSearchParams({ projectId, materialId, name, download: "1", filename: saveAs });
  const request = (async (): Promise<MaterialFileResult> => {
    let response: Response;
    try {
      response = await fetch(`/api/materials/file?${query}`, {
        headers: await authHeaders(false),
      });
    } catch {
      return { ok: false, status: 0, message: "Could not read file." };
    }
    if (response.status === 401) return { ok: false, status: 401, message: "Sign in." };
    if (response.status === 404) {
      markMissing(key);
      return { ok: false, status: 404, message: "ფაილი ვერ მოიძებნა" };
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
    if (result.status !== 404 && result.status !== 401) memory.delete(key);
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
