import { isImageAttachment } from "@/lib/composer/attach";
import { CHAT_IMAGE_LIMIT, CHAT_IMAGE_MAX_BYTES } from "@/lib/materials/limits";
import { pickRelevantMaterials } from "@/lib/materials/relevance";
import { isMissingMaterialFile, readStorageBytes } from "@/lib/materials/storage";
import { storedObjectName } from "@/lib/materials/storage-path";
import { mimeFromName } from "@/lib/materials/types";
import type { ChatAttachment } from "@/types/chat";
import type { Material, MaterialImage } from "@/types/material";

export type ChatFigure = {
  name: string;
  page: number;
  path: string;
  mime: string;
  data: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function askedPages(query: string): number[] {
  const pages: number[] = [];
  const patterns = [
    /(?:slide|page|სლაიდ(?:ი|ზე)?|გვერდ(?:ი|ზე)?)\s*(\d+)/gi,
    /\b(\d+)\s*(?:slide|page)\b/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(query))) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > 0) pages.push(Math.floor(n));
    }
  }
  return [...new Set(pages)];
}

function wantsFigure(query: string): boolean {
  return /\b(figure|diagram|image|photo|picture)s?\b|სურათ|ფოტო|ფიგურ/i.test(query);
}

function imageLabel(material: Pick<Material, "title">, image: MaterialImage): string {
  return `${material.title} · slide ${image.page}`;
}

function originalObjectName(material: Material): string | null {
  const name = storedObjectName(material.storagePath);
  return name && name !== "extracted.txt" ? name : null;
}

/** Paths actually stored on the material. Never invents slide-N.png from pageCount. */
export function existingMaterialImages(material: Material): MaterialImage[] {
  const original = originalObjectName(material);
  const seen = new Set<string>();
  const next: MaterialImage[] = [];
  for (const image of material.images ?? []) {
    const name = storedObjectName(image.path);
    if (!name || name === "extracted.txt") continue;
    if (material.type !== "image" && original && name === original) continue;
    if (isMissingMaterialFile(image.path)) continue;
    const key = name;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(image);
  }
  return next;
}

export function promptAsksForVisual(query: string): boolean {
  return askedPages(query).length > 0 || wantsFigure(query);
}

/** Reinspect the latest photo in this thread only when a follow-up refers to a visual. */
export function figureAttachmentsForTurn(
  query: string,
  attachments: ChatAttachment[],
  messages: { role: string; attachments: ChatAttachment[] }[],
): ChatAttachment[] {
  if (attachments.some((item) => isImageAttachment(item.type, item.title)) || !wantsFigure(query) || askedPages(query).length > 0) return attachments;
  const previous = [...messages].slice(-20).reverse().find((message) =>
    message.role === "user" && message.attachments.some((item) => isImageAttachment(item.type, item.title)),
  );
  return [...attachments, ...(previous?.attachments.filter((item) => isImageAttachment(item.type, item.title)) ?? [])];
}

export function shouldAttachChatFigures(
  query: string,
  materials: Material[],
  attachments: ChatAttachment[] = [],
): boolean {
  if (promptAsksForVisual(query)) return true;
  const attachedImages = attachments.filter((item) => isImageAttachment(item.type, item.title));
  return attachedImages.length > 0;
}

export function pickFigureTargets(
  query: string,
  materials: Material[],
  attachments: ChatAttachment[] = [],
): { material: Pick<Material, "title">; image: MaterialImage }[] {
  if (!shouldAttachChatFigures(query, materials, attachments)) return [];

  const ranked = pickRelevantMaterials(query, materials, 4);
  const pages = askedPages(query);
  const picks: { material: Pick<Material, "title">; image: MaterialImage }[] = [];
  const attachedImages = attachments.filter((item) => isImageAttachment(item.type, item.title));

  if (attachedImages.length > 0) {
    for (const attached of attachedImages) {
      const material = materials.find((item) => item.id === attached.materialId);
      const path = attached.storagePath || material?.storagePath;
      const name = storedObjectName(path);
      if (path && name && name !== "extracted.txt" && !isMissingMaterialFile(path)) {
        picks.push({ material: material ?? { title: attached.title }, image: { page: 1, path, mime: mimeFromName(name, "image/jpeg") } });
      }
    }
  } else if (pages.length > 0) {
    for (const material of ranked) {
      const images = existingMaterialImages(material);
      for (const page of pages) {
        const match = images.find((item) => item.page === page);
        if (match) picks.push({ material, image: match });
      }
    }
  } else if (wantsFigure(query)) {
    const material = ranked.find((item) => existingMaterialImages(item).length > 0);
    const image = material ? existingMaterialImages(material)[0] : undefined;
    if (material && image) picks.push({ material, image });
  }

  const unique: { material: Pick<Material, "title">; image: MaterialImage }[] = [];
  const seen = new Set<string>();
  for (const pick of picks) {
    if (seen.has(pick.image.path)) continue;
    seen.add(pick.image.path);
    unique.push(pick);
    if (unique.length >= CHAT_IMAGE_LIMIT) break;
  }
  return unique;
}

export async function pickChatFigures(
  query: string,
  materials: Material[],
  attachments: ChatAttachment[] = [],
): Promise<{ figures: ChatFigure[]; fileGets: number }> {
  const targets = pickFigureTargets(query, materials, attachments);
  if (targets.length === 0) return { figures: [], fileGets: 0 };

  const figures: ChatFigure[] = [];
  let fileGets = 0;
  for (const pick of targets) {
    if (isMissingMaterialFile(pick.image.path)) continue;
    try {
      fileGets += 1;
      const bytes = await readStorageBytes(pick.image.path);
      if (bytes.byteLength > CHAT_IMAGE_MAX_BYTES) continue;
      figures.push({
        name: imageLabel(pick.material, pick.image),
        page: pick.image.page,
        path: pick.image.path,
        mime: pick.image.mime,
        data: bytesToBase64(bytes),
      });
    } catch {
      // Missing sidecar — cached as 404. Do not invent another name.
    }
  }
  return { figures, fileGets };
}
