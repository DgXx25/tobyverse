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
  const hay = `${type} ${title}`.toLowerCase();
  return type === "image" || type.startsWith("image/") || /\b(png|jpe?g|jpg|webp|gif|img)\b/.test(hay);
}

export function attachmentFromMaterial(material: Material): ChatAttachment {
  const image = isImageAttachment(material.type, material.title);
  return {
    title: material.title,
    type: image ? "image" : material.type,
    materialId: material.id,
    storagePath: image ? material.storagePath : undefined,
  };
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
    materialId?: string;
    storagePath?: string;
  }>,
  materials: Material[],
): ChatAttachment[] {
  return chips
    .filter((chip) => chip.status === "ready")
    .map((chip) => {
      const material = materials.find((item) => item.id === chip.materialId);
      const type = material?.type || chip.type;
      const image = isImageAttachment(type, chip.title);
      return {
        title: chip.title,
        type: image ? "image" : type,
        materialId: chip.materialId,
        storagePath: image ? chip.storagePath || material?.storagePath : undefined,
      };
    });
}
