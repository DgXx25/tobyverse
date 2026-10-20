import { parseMaterialStoragePath, storedObjectName } from "@/lib/materials/storage-path";

/** Public snapshots expose only a relative reference to media from this chat's owner/project. */
export function sharedChatImageRef(path: unknown, ownerId: string, projectId: string): string | undefined {
  if (typeof path !== "string") return undefined;
  const parsed = parseMaterialStoragePath(path);
  if (!parsed || parsed.userId !== ownerId || parsed.projectId !== projectId || !/^chat-image-[A-Za-z0-9_-]+$/.test(parsed.materialId)) return undefined;
  const name = storedObjectName(parsed.name);
  if (!name || !/\.(?:jpe?g|png|webp|gif|heic|heif)$/i.test(name)) return undefined;
  return `${parsed.materialId}/${name}`;
}
