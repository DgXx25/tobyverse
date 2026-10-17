import { requireSignedInUser } from "@/lib/auth";
import { authHeaders } from "@/lib/api/client";
import { newChipId, isImageAttachment } from "@/lib/composer/attach";
import { ingestMaterialFile } from "@/lib/materials/ingest-client";
import { originalStoragePath, uploadMaterialBytes } from "@/lib/materials/storage";
import { parseMaterialStoragePath } from "@/lib/materials/storage-path";
import { inferMaterialType, materialFileName, mimeFromName } from "@/lib/materials/types";
import { clearUntouchedNotebook } from "@/lib/workspace/draft-notebook";
import type { ChatAttachment } from "@/types/chat";

type FileInput = { projectId: string; userId: string; file: File };

/** Uses the existing private blob/quota infrastructure without creating a material or index. */
export async function uploadChatImage({ projectId, file }: FileInput): Promise<ChatAttachment> {
  if (inferMaterialType(file.name, file.type) !== "image") throw new Error("Expected an image.");
  const user = await requireSignedInUser();
  clearUntouchedNotebook(projectId);
  const storagePath = originalStoragePath(user.uid, projectId, `chat-image-${newChipId()}`, materialFileName("image", file.name));
  const uploaded = await uploadMaterialBytes(storagePath, file, file.type || mimeFromName(file.name), {
    reservePool: true,
    originalName: file.name,
  });
  return { title: file.name, type: "image", storagePath: uploaded.path, sizeBytes: uploaded.sizeBytes };
}

/** Only composer photos bypass material ingestion. Add sources keeps using ingestMaterialFile. */
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
