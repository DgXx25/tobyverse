import type { ChatAttachment } from "@/types/chat";
import type { Material } from "@/types/material";

export function newChipId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `chip-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function attachFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function fileTypeBadge(type: string, title = ""): string {
  const hay = `${type} ${title}`.toLowerCase();
  if (hay.includes("ppt")) return "PPT";
  if (hay.includes("pdf")) return "PDF";
  if (hay.includes("doc")) return "DOC";
  if (isImageAttachment(type, title)) return "IMG";
  if (hay.includes("txt") || hay.includes("md") || hay.includes("paste")) return "TXT";
  if (hay.includes("url")) return "URL";
  const ext = type.replace(/^\./, "").slice(0, 3);
  return ext ? ext.toUpperCase() : "FILE";
}

export function isImageAttachment(type: string, title = ""): boolean {
  const kind = type.toLowerCase();
  if (
    kind === "pptx" ||
    kind === "ppt" ||
    kind === "pdf" ||
    kind === "docx" ||
    kind === "txt" ||
    kind === "md" ||
    kind === "paste" ||
    kind === "url"
  ) {
    return false;
  }
  if (kind === "image" || kind.startsWith("image/")) return true;
  const hay = `${type} ${title}`.toLowerCase();
  return /\.(png|jpe?g|jpg|webp|gif)$/i.test(hay) || kind === "img";
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Firestore rejects `undefined` fields. Only keep strings that exist. */
export function compactChatAttachment(input: {
  title: string;
  type?: string;
  materialId?: string;
  storagePath?: string;
  sizeBytes?: number;
}): ChatAttachment | null {
  const title = input.title.trim();
  if (!title) return null;
  const attachment: ChatAttachment = {
    title,
    type: optionalText(input.type) || "file",
  };
  const materialId = optionalText(input.materialId);
  const storagePath = optionalText(input.storagePath);
  if (materialId) attachment.materialId = materialId;
  if (storagePath) attachment.storagePath = storagePath;
  if (typeof input.sizeBytes === "number" && Number.isFinite(input.sizeBytes) && input.sizeBytes > 0) {
    attachment.sizeBytes = Math.ceil(input.sizeBytes);
  }
  return attachment;
}

export function attachmentFromMaterial(material: Material): ChatAttachment {
  const image = isImageAttachment(material.type, material.title);
  return compactChatAttachment({
    title: material.title,
    type: image ? "image" : material.type,
    materialId: material.id,
    storagePath: material.storagePath,
  }) ?? { title: material.title, type: image ? "image" : material.type, materialId: material.id };
}

export function attachmentsFromMaterials(materialIds: string[], materials: Material[]): ChatAttachment[] {
  return materialIds.flatMap((id) => {
    const material = materials.find((item) => item.id === id);
    return material ? [attachmentFromMaterial(material)] : [];
  });
}

export function snapshotChatAttachments(
  chips: Array<{
    title: string;
    type: string;
    status: string;
    size?: number;
    materialId?: string;
    storagePath?: string;
  }>,
  materials: Material[],
): ChatAttachment[] {
  return chips.flatMap((chip) => {
    if (chip.status !== "ready") return [];
    const material = materials.find((item) => item.id === chip.materialId);
    const type = material?.type || chip.type;
    const image = isImageAttachment(type, chip.title);
    const attachment = compactChatAttachment({
      title: chip.title,
      type: image ? "image" : type,
      materialId: chip.materialId || material?.id,
      storagePath: chip.storagePath || material?.storagePath,
      sizeBytes: chip.size,
    });
    return attachment ? [attachment] : [];
  });
}
