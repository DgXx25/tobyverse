export const MATERIAL_PATH_PATTERN =
  /^users\/([^/]+)\/projects\/([^/]+)\/materials\/([^/]+)\/([^/]+)$/;

export function parseMaterialStoragePath(path: string): {
  userId: string;
  projectId: string;
  materialId: string;
  name: string;
} | null {
  const match = MATERIAL_PATH_PATTERN.exec(path.trim());
  if (!match) return null;
  return {
    userId: match[1],
    projectId: match[2],
    materialId: match[3],
    name: match[4],
  };
}

/** Last path segment only. Never invents slide-N-N names. */
export function storedObjectName(path: string | undefined | null): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  const parsed = parseMaterialStoragePath(trimmed);
  const raw = parsed?.name ?? trimmed.split("/").filter(Boolean).pop()?.split("?")[0] ?? "";
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {
    name = raw;
  }
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) return null;
  return name;
}
