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
