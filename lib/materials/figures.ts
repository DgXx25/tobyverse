import { CHAT_IMAGE_LIMIT, CHAT_IMAGE_MAX_BYTES } from "@/lib/materials/limits";
import { pickRelevantMaterials } from "@/lib/materials/relevance";
import { readStorageBytes } from "@/lib/materials/storage";
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
  return /figure|diagram|image|photo|picture|სურათ|ფოტო|ფიგურ/i.test(query);
}

function imageLabel(material: Material, image: MaterialImage): string {
  return `${material.title} · slide ${image.page}`;
}

export function materialImageIndex(material: Material): string {
  if (!material.hasImages || material.images.length === 0) {
    return material.pageCount > 1 ? `${material.pageCount} slides` : "";
  }
  const pages = [...new Set(material.images.map((item) => item.page))].sort((a, b) => a - b);
  return `${material.pageCount || pages.length} slides; images on ${pages.join(", ")}`;
}

export function promptAsksForVisual(query: string): boolean {
  return askedPages(query).length > 0 || wantsFigure(query);
}

export async function pickChatFigures(query: string, materials: Material[]): Promise<ChatFigure[]> {
  const imageOnly = materials.filter((item) => item.type === "image");
  if (!promptAsksForVisual(query) && imageOnly.length === 0) return [];

  const ranked = pickRelevantMaterials(query, materials, 4);
  const pages = askedPages(query);
  const picks: { material: Material; image: MaterialImage }[] = [];

  if (pages.length > 0) {
    for (const material of ranked) {
      for (const page of pages) {
        const match = material.images.find((item) => item.page === page);
        if (match) picks.push({ material, image: match });
      }
    }
  } else if (wantsFigure(query)) {
    const material = ranked.find((item) => item.images.length > 0);
    if (material?.images[0]) picks.push({ material, image: material.images[0] });
  } else if (imageOnly[0]?.images[0]) {
    picks.push({ material: imageOnly[0], image: imageOnly[0].images[0] });
  }

  const unique: { material: Material; image: MaterialImage }[] = [];
  const seen = new Set<string>();
  for (const pick of picks) {
    if (seen.has(pick.image.path)) continue;
    seen.add(pick.image.path);
    unique.push(pick);
    if (unique.length >= CHAT_IMAGE_LIMIT) break;
  }

  const figures: ChatFigure[] = [];
  for (const pick of unique) {
    try {
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
      // Skip missing sidecars.
    }
  }
  return figures;
}
