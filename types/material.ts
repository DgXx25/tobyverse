import type { EntityId, IsoDateString } from "@/types/common";

export const MATERIAL_TYPES = ["pdf", "docx", "pptx", "txt", "md", "image", "paste", "url"] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];

export type MaterialStatus = "uploading" | "processing" | "ready" | "failed";

export type MaterialImage = {
  page: number;
  path: string;
  mime: string;
};

export type Material = {
  id: EntityId;
  projectId: EntityId;
  userId: EntityId;
  title: string;
  type: MaterialType;
  originalName?: string;
  storagePath: string;
  textPath: string;
  extractedPath?: string;
  extractedTextPreview: string;
  previewHtml?: string;
  sizeBytes: number;
  pageCount: number;
  hasImages: boolean;
  textChars: number;
  images: MaterialImage[];
  status: MaterialStatus;
  createdAt: IsoDateString | null;
};

export type MaterialChunk = {
  id: EntityId;
  materialId: EntityId;
  projectId: EntityId;
  index: number;
  content: string;
  embeddingId: string | null;
  createdAt: IsoDateString | null;
};
