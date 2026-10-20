import { requireSignedInUser } from "@/lib/auth";
import { authHeaders } from "@/lib/api/client";
import { newChipId, isImageAttachment } from "@/lib/composer/attach";
import { ingestMaterialFile } from "@/lib/materials/ingest-client";
import { originalStoragePath, uploadMaterialBytes } from "@/lib/materials/storage";
import { compressImageForUpload } from "@/lib/materials/compress-image";
import { parseMaterialStoragePath } from "@/lib/materials/storage-path";
import { inferMaterialType } from "@/lib/materials/types";
import { clearUntouchedNotebook } from "@/lib/workspace/draft-notebook";
import type { ChatAttachment } from "@/types/chat";

type FileInput = { projectId: string; userId: string; file: File };

/** Private chat media uses compressed storage without creating a Source or vector index. */
export async function uploadChatImage(input: FileInput): Promise<ChatAttachment> {
  const { projectId, file } = input;
  if (inferMaterialType(file.name, file.type) !== "image") throw new Error("Expected an image.");
  clearUntouchedNotebook(projectId);
  const user = await requireSignedInUser();
  const compressed = await compressImageForUpload(file);
  const path = originalStoragePath(user.uid, projectId, `chat-image-${newChipId()}`, compressed.name);
  const uploaded = await uploadMaterialBytes(path, compressed.blob, compressed.mime, { reservePool: true, originalName: compressed.name });
  return { title: file.name, type: "image", storagePath: uploaded.path, sizeBytes: uploaded.sizeBytes };
}

/** Add source continues to use material ingestion; composer photos stay in chat only. */
export async function ingestComposerFile(input: FileInput): Promise<string | ChatAttachment> {
  return inferMaterialType(input.file.name, input.file.type) === "image"
    ? uploadChatImage(input)
    : ingestMaterialFile(input);
}

/** Ignore real sources; delete only the standalone chat images owned by this account. */
export async function discardChatImage(attachment: ChatAttachment): Promise<void> {
  if (attachment.materialId || !isImageAttachment(attachment.type, attachment.title)) return;
  const parsed = parseMaterialStoragePath(attachment.storagePath ?? "");
  if (!parsed?.materialId.startsWith("chat-image-")) return;
  const user = await requireSignedInUser();
  if (parsed.userId !== user.uid) return;
  const response = await fetch("/api/materials/upload", {
    method: "DELETE",
    headers: await authHeaders(),
    body: JSON.stringify({ path: attachment.storagePath, releaseBytes: attachment.sizeBytes ?? 0 }),
  });
  if (!response.ok) throw new Error("Could not remove the chat image.");
}
