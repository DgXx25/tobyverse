import "server-only";

import { getAdminFirestore } from "@/lib/server/firestore-admin";
import { collectThreadReferences } from "@/lib/sharing/thread-references";
import { mapNoteRecord } from "@/lib/notes/compat";
import { storedObjectName } from "@/lib/materials/storage-path";
import { imageGalleryId } from "@/lib/images/galleries";
import type { ChatArtifact, ChatAttachment, ChatImageHit, ChatMessage, ChatMode } from "@/types/chat";
import type { Material, MaterialImage, MaterialStatus, MaterialType } from "@/types/material";
import type { SharedChatSnapshot } from "@/lib/sharing/types";

const SHARE_ID = /^[A-Za-z0-9_-]{32,128}$/;

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function iso(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value) {
    const date = (value as { toDate?: () => Date }).toDate?.();
    if (date instanceof Date && Number.isFinite(date.valueOf())) return date.toISOString();
  }
  return null;
}

function attachments(value: unknown): ChatAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const title = text(row.title).trim();
    if (!title) return [];
    return [{
      title,
      type: text(row.type, "file"),
      ...(text(row.materialId).trim() ? { materialId: text(row.materialId).trim() } : {}),
    }];
  });
}

function images(value: unknown): ChatImageHit[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const materialId = text(row.materialId).trim();
    const url = materialId ? "" : text(row.url).trim();
    const thumb = materialId ? "" : text(row.thumb).trim();
    if (!materialId && !url && !thumb) return [];
    return [{
      url,
      thumb,
      title: text(row.title, "Image"),
      source: text(row.source),
      license: text(row.license),
      credit: text(row.credit),
      ...(imageGalleryId(row.galleryId) ? { galleryId: imageGalleryId(row.galleryId) } : {}),
      ...(materialId ? { materialId, kind: "upload" as const } : {}),
    }];
  });
  return result.length ? result : undefined;
}

function artifact(value: unknown): ChatArtifact | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id).trim();
  const kind = text(row.kind).trim();
  if (!id || !kind) return null;
  return { kind, id, title: text(row.title, "Artifact") };
}

function message(id: string, projectId: string, threadId: string, data: Record<string, unknown>): ChatMessage {
  const role = data.role === "user" ? "user" : data.role === "system" ? "system" : "assistant";
  const mode: ChatMode = data.mode === "fast" || data.mode === "teacher" ? data.mode : "auto";
  return {
    id,
    projectId,
    threadId,
    lessonId: null,
    exerciseId: null,
    role,
    mode,
    content: text(data.content),
    attachments: attachments(data.attachments),
    relatedExerciseType: null,
    intent: null,
    artifact: artifact(data.artifact),
    ...(Array.isArray(data.options) ? { options: data.options.filter((item): item is string => typeof item === "string") } : {}),
    ...(data.promptAsk && typeof data.promptAsk === "object" && text((data.promptAsk as Record<string, unknown>).question).trim()
      ? { promptAsk: { question: text((data.promptAsk as Record<string, unknown>).question) } }
      : {}),
    ...(images(data.images) ? { images: images(data.images) } : {}),
    createdAt: iso(data.createdAt) ?? iso(data.createdAtClient),
  };
}

function materialImages(value: unknown): MaterialImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const name = storedObjectName(text(row.path));
    if (!name) return [];
    return [{
      page: typeof row.page === "number" && row.page > 0 ? Math.floor(row.page) : 1,
      path: name,
      mime: text(row.mime, "image/png"),
      ...(row.kind === "page" || row.kind === "figure" ? { kind: row.kind } : {}),
    }];
  });
}

function material(id: string, projectId: string, data: Record<string, unknown>): Material {
  const type = text(data.type, "txt") as MaterialType;
  const status = text(data.status, "ready") as MaterialStatus;
  const originalName = text(data.originalName).trim() || storedObjectName(text(data.storagePath)) || undefined;
  const previewPagePath = storedObjectName(text(data.previewPagePath)) || undefined;
  return {
    id,
    projectId,
    userId: "",
    title: text(data.title, text(data.name, "Untitled")),
    type,
    originalName,
    originalMime: text(data.originalMime) || undefined,
    originalSizeBytes: typeof data.originalSizeBytes === "number" ? data.originalSizeBytes : undefined,
    originalRemoved: data.originalRemoved === true,
    storagePath: originalName ?? "",
    textPath: storedObjectName(text(data.extractedPath) || text(data.textPath)) || "extracted.txt",
    extractedPath: storedObjectName(text(data.extractedPath) || text(data.textPath)) || undefined,
    extractedTextPreview: text(data.extractedTextPreview).slice(0, 300),
    previewHtml: undefined,
    previewPagePath,
    sizeBytes: typeof data.sizeBytes === "number" ? data.sizeBytes : 0,
    pageCount: typeof data.pageCount === "number" ? data.pageCount : 0,
    hasImages: data.hasImages === true,
    textChars: typeof data.textChars === "number" ? data.textChars : 0,
    images: materialImages([
      ...(Array.isArray(data.images) ? data.images : []),
      ...(Array.isArray(data.imagePaths) ? data.imagePaths : []),
    ]),
    status,
    createdAt: iso(data.createdAt),
  };
}

export function isValidShareId(value: string): boolean {
  return SHARE_ID.test(value);
}

export async function loadSharedChat(shareId: string): Promise<SharedChatSnapshot | null> {
  if (!isValidShareId(shareId)) return null;
  const db = getAdminFirestore();
  const hit = await db.collection("chats").where("shareId", "==", shareId).where("public", "==", true).limit(1).get();
  const index = hit.docs[0];
  if (!index) return null;
  const indexData = index.data() as Record<string, unknown>;
  const ownerId = text(indexData.userId).trim();
  const projectId = text(indexData.projectId).trim();
  const threadId = text(indexData.nestedId, projectId === index.id ? "main" : index.id).trim();
  if (!ownerId || !projectId || !threadId) return null;

  const projectRef = db.collection("projects").doc(projectId);
  const threadRef = projectRef.collection("chats").doc(threadId);
  const [projectDoc, threadDoc, messageDocs] = await Promise.all([
    projectRef.get(),
    threadRef.get(),
    threadRef.collection("messages").get(),
  ]);
  if (!projectDoc.exists || !threadDoc.exists) return null;
  const projectData = projectDoc.data() as Record<string, unknown>;
  const projectOwnerId = text(projectData.userId) || text(projectData.ownerId);
  const threadOwnerId = text((threadDoc.data() as Record<string, unknown>).userId);
  if (projectOwnerId !== ownerId || (threadOwnerId && threadOwnerId !== ownerId)) return null;

  const messages = messageDocs.docs
    .map((doc) => message(doc.id, projectId, threadId, doc.data() as Record<string, unknown>))
    .filter((item) => item.role !== "system")
    .sort((left, right) => (left.createdAt ?? "").localeCompare(right.createdAt ?? ""));
  const refs = collectThreadReferences(messages);

  const materialDocs = await Promise.all(refs.materialIds.map((id) => projectRef.collection("materials").doc(id).get()));
  const sheetDocs = await Promise.all(refs.sheetIds.map((id) => projectRef.collection("studySheets").doc(id).get()));
  const materials = materialDocs.flatMap((doc) => doc.exists ? [material(doc.id, projectId, doc.data() as Record<string, unknown>)] : []);
  const sheets = sheetDocs.flatMap((doc) => {
    if (!doc.exists) return [];
    const data = doc.data() as Record<string, unknown>;
    const mapped = mapNoteRecord(doc.id, projectId, data, {
      userId: "",
      title: text(data.title, "Notes"),
      sourceMaterialIds: [],
      createdAt: iso(data.createdAt),
    });
    return [mapped];
  });
  const threadData = threadDoc.data() as Record<string, unknown>;
  return {
    chatId: index.id,
    shareId,
    project: { id: projectId, title: text(projectData.title, "Shared chat") },
    thread: { id: threadId, title: text(threadData.title, text(indexData.title, "Shared chat")) },
    messages,
    materials,
    sheets,
  };
}

export async function sharedMaterialAccess(shareId: string, materialId: string) {
  const snapshot = await loadSharedChat(shareId);
  if (!snapshot) return null;
  const material = snapshot.materials.find((item) => item.id === materialId);
  if (!material) return null;
  const db = getAdminFirestore();
  const [index, source] = await Promise.all([
    db.collection("chats").doc(snapshot.chatId).get(),
    db.collection("projects").doc(snapshot.project.id).collection("materials").doc(materialId).get(),
  ]);
  if (!index.exists || !source.exists) return null;
  const indexData = index.data() as Record<string, unknown>;
  const ownerId = text(indexData.userId).trim();
  if (
    !ownerId
    || indexData.public !== true
    || text(indexData.shareId) !== shareId
    || text(indexData.projectId) !== snapshot.project.id
    || text(indexData.nestedId, snapshot.project.id === index.id ? "main" : index.id) !== snapshot.thread.id
  ) return null;
  return { ownerId, projectId: snapshot.project.id, materialId };
}
