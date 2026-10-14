import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { mapNoteRecord } from "@/lib/notes/compat";
import { collectThreadReferences } from "@/lib/sharing/thread-references";
import type { SharedChatSnapshot } from "@/lib/sharing/types";
import type { ChatMessage, ChatMode } from "@/types/chat";
import type { Material, MaterialStatus, MaterialType } from "@/types/material";
import type { StudySheet } from "@/types/study-sheet";

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function iso(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || !("toDate" in value)) return null;
  const date = (value as { toDate?: () => Date }).toDate?.();
  return date instanceof Date && Number.isFinite(date.valueOf()) ? date.toISOString() : null;
}

function mapMessage(id: string, projectId: string, threadId: string, raw: Record<string, unknown>): ChatMessage {
  const role = raw.role === "user" ? "user" : raw.role === "system" ? "system" : "assistant";
  const attachments = Array.isArray(raw.attachments) ? raw.attachments.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const title = str(item.title).trim();
    if (!title) return [];
    return [{ title, type: str(item.type, "file"), ...(str(item.materialId).trim() ? { materialId: str(item.materialId).trim() } : {}) }];
  }) : [];
  const images = Array.isArray(raw.images) ? raw.images.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const materialId = str(item.materialId).trim();
    const url = materialId ? "" : str(item.url).trim();
    const thumb = materialId ? "" : str(item.thumb).trim();
    if (!materialId && !url && !thumb) return [];
    return [{ url, thumb, title: str(item.title, "Image"), source: str(item.source), license: str(item.license), credit: str(item.credit), ...(materialId ? { materialId, kind: "upload" as const } : {}) }];
  }) : [];
  const artifact = raw.artifact && typeof raw.artifact === "object" ? raw.artifact as Record<string, unknown> : null;
  const artifactId = str(artifact?.id).trim();
  const artifactKind = str(artifact?.kind).trim();
  return {
    id,
    projectId,
    threadId,
    lessonId: null,
    exerciseId: null,
    role,
    mode: (raw.mode === "fast" || raw.mode === "teacher" ? raw.mode : "auto") as ChatMode,
    content: str(raw.content),
    attachments,
    relatedExerciseType: null,
    intent: null,
    artifact: artifactId && artifactKind ? { id: artifactId, kind: artifactKind, title: str(artifact?.title, "Artifact") } : null,
    ...(Array.isArray(raw.options) ? { options: raw.options.filter((value): value is string => typeof value === "string") } : {}),
    ...(images.length ? { images } : {}),
    createdAt: iso(raw.createdAt) ?? iso(raw.createdAtClient),
  };
}

function mapMaterial(id: string, projectId: string, raw: Record<string, unknown>): Material {
  const storagePath = str(raw.storagePath);
  const extractedPath = str(raw.extractedPath) || str(raw.textPath) || "extracted.txt";
  return {
    id,
    projectId,
    userId: "",
    title: str(raw.title, str(raw.name, "Untitled")),
    type: str(raw.type, "txt") as MaterialType,
    originalName: str(raw.originalName).trim() || storagePath || undefined,
    storagePath,
    textPath: extractedPath,
    extractedPath,
    extractedTextPreview: str(raw.extractedTextPreview).slice(0, 300),
    sizeBytes: typeof raw.sizeBytes === "number" ? raw.sizeBytes : 0,
    pageCount: typeof raw.pageCount === "number" ? raw.pageCount : 0,
    hasImages: raw.hasImages === true,
    textChars: typeof raw.textChars === "number" ? raw.textChars : 0,
    images: [],
    status: str(raw.status, "ready") as MaterialStatus,
    createdAt: iso(raw.createdAt),
  };
}

export async function loadSharedChatClient(shareId: string): Promise<SharedChatSnapshot | null> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(shareId)) return null;
  const db = getFirebaseDb();
  const matches = await getDocs(query(
    collection(db, "chats"),
    where("shareId", "==", shareId),
    where("public", "==", true),
    limit(1),
  ));
  const index = matches.docs[0];
  if (!index) return null;
  const indexData = index.data();
  const projectId = str(indexData.projectId).trim();
  const threadId = str(indexData.nestedId, projectId === index.id ? "main" : index.id).trim();
  if (!projectId || !threadId) return null;

  const threadRef = doc(db, "projects", projectId, "chats", threadId);
  const messagesRef = collection(threadRef, "messages");
  const [threadSnap, messageSnaps] = await Promise.all([getDoc(threadRef), getDocs(messagesRef)]);
  if (!threadSnap.exists()) return null;
  const messages = messageSnaps.docs
    .map((item) => mapMessage(item.id, projectId, threadId, item.data()))
    .filter((item) => item.role !== "system")
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const refs = collectThreadReferences(messages);
  const [materialSnaps, sheetSnaps] = await Promise.all([
    Promise.all(refs.materialIds.map((id) => getDoc(doc(db, "projects", projectId, "materials", id)))),
    Promise.all(refs.sheetIds.map((id) => getDoc(doc(db, "projects", projectId, "studySheets", id)))),
  ]);
  const materials = materialSnaps.flatMap((item) => item.exists() ? [mapMaterial(item.id, projectId, item.data())] : []);
  const sheets = sheetSnaps.flatMap((item) => {
    if (!item.exists()) return [];
    const data = item.data();
    return [mapNoteRecord(item.id, projectId, data, {
      userId: "",
      title: str(data.title, "Notes"),
      sourceMaterialIds: [],
      createdAt: iso(data.createdAt),
    }) as StudySheet];
  });
  return {
    chatId: index.id,
    shareId,
    project: { id: projectId, title: str(indexData.projectTitle, "Shared chat") },
    thread: { id: threadId, title: str(threadSnap.data().title, str(indexData.title, "Shared chat")) },
    messages,
    materials,
    sheets,
  };
}
