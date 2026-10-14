import { inferMaterialType } from "@/lib/materials/types";
import { uploadTooLargeMessage } from "@/lib/materials/limits";

const SKIP_BASENAMES = new Set([".ds_store", "thumbs.db", "desktop.ini"]);

export type FolderUploadFile = { file: File; relativePath: string };
export type UploadFailure = { name: string; reason: unknown };

export function fileRelativePath(file: File): string {
  const rel = (typeof file.webkitRelativePath === "string" ? file.webkitRelativePath : "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
  return rel || file.name;
}

export function shouldSkipUploadPath(relativePath: string): boolean {
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length === 0) return true;
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (part.startsWith(".")) return true;
    if (SKIP_BASENAMES.has(lower)) return true;
    if (lower === "__macosx") return true;
  }
  return false;
}

export function folderChipTitle(name: string, count: number): string {
  return `${name} · ${count} ${count === 1 ? "file" : "files"}`;
}

export function collectFolderUpload(list: FileList | File[]): {
  name: string;
  files: FolderUploadFile[];
  picked: number;
} {
  const all = [...list];
  const root =
    fileRelativePath(all[0] ?? new File([], "folder")).split("/")[0]?.trim() || "folder";
  const files: FolderUploadFile[] = [];
  for (const file of all) {
    const relativePath = fileRelativePath(file);
    if (shouldSkipUploadPath(relativePath)) continue;
    if (!inferMaterialType(relativePath, file.type) && !inferMaterialType(file.name, file.type)) {
      continue;
    }
    files.push({ file, relativePath });
  }
  return { name: root, files, picked: all.length };
}

function failureField(reason: unknown, key: string): unknown {
  return reason && typeof reason === "object" ? (reason as Record<string, unknown>)[key] : undefined;
}

function failureMessage(reason: unknown): string {
  const status = failureField(reason, "status");
  const phase = failureField(reason, "phase");
  const kind = failureField(reason, "kind");
  const storageSaved = failureField(reason, "storageSaved") === true;
  const message = reason instanceof Error
    ? reason.message
    : typeof reason === "string"
      ? reason
      : typeof failureField(reason, "message") === "string"
        ? String(failureField(reason, "message"))
        : "";

  if (status === 401 || /sign in required|invalid session/i.test(message)) return "Sign in required";
  if (status === 413 || /too large|larger than/i.test(message)) return message || uploadTooLargeMessage();
  if (phase === "extract" || storageSaved) return "Saved, but text could not be read";
  if (kind === "network" || /network|failed to fetch|load failed/i.test(message)) {
    return "Network error. Try again.";
  }
  return message || "Upload failed.";
}

export function uploadFailureMessage(reason: unknown): string {
  return failureMessage(reason);
}

export function formatUploadFailure(failure: UploadFailure): string {
  const label = failure.name.split("/").pop() || failure.name;
  return `${label}: ${failureMessage(failure.reason)}`;
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (items.length === 0) return [];
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, () => worker()));
  return results;
}
