import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { asChatMode } from "@/lib/core/chat-modes";
import { DEFAULT_CHAT_THREAD_ID } from "@/lib/core/constants";
import { COLLECTIONS, omitUndefined } from "@/lib/firestore";
import { compactChatAttachment } from "@/lib/composer/attach";
import { discardChatImage } from "@/lib/composer/attach-client";
import { stripArtifactMarkup } from "@/lib/composer/memory";
import { imageGalleryId } from "@/lib/images/galleries";
import { parseChatArtifact, compactChatArtifact } from "@/lib/artifacts/active";
import { getFirebaseDb } from "@/lib/firebase";
import { asString, toIsoDate } from "@/lib/timestamps";
import { isComposerIntent } from "@/lib/composer/intent";
import { chatPath, nestedThreadId, publicChatId } from "@/lib/workspace/routes";
import { parseNoteBlocks } from "@/lib/visuals/validate";
import { collectThreadReferences } from "@/lib/sharing/thread-references";
import type { VisualBlock } from "@/types/visual";
import type { ChatArtifact, ChatAttachment, ChatImageHit, ChatMessage, ChatMode, ChatRole, ChatSourceRef, ChatThread, ChatThreadKind, PendingKind } from "@/types/chat";
import type { ExerciseType } from "@/types/exercise";
import { clearUntouchedNotebook } from "@/lib/workspace/draft-notebook";

function isPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return code === "permission-denied" || code === "firestore/permission-denied" || /insufficient permissions/i.test(message);
}

async function getDocSafe(ref: Parameters<typeof getDoc>[0]) {
  try {
    return await getDoc(ref);
  } catch (error) {
    if (isPermissionDenied(error)) return null;
    throw error;
  }
}

function chatIndexRef(chatId: string) {
  return doc(getFirebaseDb(), COLLECTIONS.chats, chatId);
}

function newShareId(): string {
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    throw new Error("Secure sharing is unavailable in this browser.");
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function setChatSharing(
  projectId: string,
  threadId: string | undefined,
  enabled: boolean,
): Promise<{ public: boolean; shareId?: string }> {
  const ref = chatIndexRef(publicChatId(projectId, threadId ?? DEFAULT_CHAT_THREAD_ID));
  const actualThreadId = threadId ?? DEFAULT_CHAT_THREAD_ID;
  const indexSnapshot = await getDoc(ref);
  const indexData = indexSnapshot.data() ?? {};
  const messageDocs = await getDocs(messagesCollection(projectId, actualThreadId));
  const references = collectThreadReferences(messageDocs.docs.map((message) => message.data()));
  const priorMaterials = Array.isArray(indexData.sharedMaterialIds)
    ? indexData.sharedMaterialIds.filter((id): id is string => typeof id === "string") : references.materialIds;
  const priorSheets = Array.isArray(indexData.sharedSheetIds)
    ? indexData.sharedSheetIds.filter((id): id is string => typeof id === "string") : references.sheetIds;
  const syncMetadata = async (materialIds: string[], sheetIds: string[], shareId: string, operation: "add" | "remove") => {
    const metadataRefs = [
      ...materialIds.map((id) => doc(getFirebaseDb(), COLLECTIONS.projects, projectId, COLLECTIONS.materials, id)),
      ...sheetIds.map((id) => doc(getFirebaseDb(), COLLECTIONS.projects, projectId, COLLECTIONS.studySheets, id)),
    ];
    const metadata = await Promise.all(metadataRefs.map((item) => getDoc(item)));
    await Promise.all(metadata.flatMap((item, index) => item.exists()
      ? [updateDoc(metadataRefs[index], { sharedShareIds: operation === "add" ? arrayUnion(shareId) : arrayRemove(shareId) })]
      : []));
  };
  if (!enabled) {
    const priorShareId = indexData.shareId;
    if (typeof priorShareId === "string") {
      await syncMetadata(priorMaterials, priorSheets, priorShareId, "remove");
    }
    await updateDoc(ref, {
      public: false,
      shareId: deleteField(),
      sharedMaterialIds: deleteField(),
      sharedSheetIds: deleteField(),
    });
    return { public: false };
  }
  if (references.materialIds.length > 250 || references.sheetIds.length > 250) {
    throw new Error("This chat references too many files to share.");
  }
  const existingShareId = indexData.public === true && typeof indexData.shareId === "string"
    && /^[A-Za-z0-9_-]{32,128}$/.test(indexData.shareId) ? indexData.shareId : null;
  const shareId = existingShareId ?? newShareId();
  if (existingShareId) {
    const nextMaterials = new Set(references.materialIds);
    const nextSheets = new Set(references.sheetIds);
    await syncMetadata(priorMaterials.filter((id) => !nextMaterials.has(id)), priorSheets.filter((id) => !nextSheets.has(id)), shareId, "remove");
  }
  await syncMetadata(references.materialIds, references.sheetIds, shareId, "add");
  await updateDoc(ref, {
    public: true,
    shareId,
    sharedMaterialIds: references.materialIds,
    sharedSheetIds: references.sheetIds,
  });
  return { public: true, shareId };
}

function chatRef(projectId: string, threadId = DEFAULT_CHAT_THREAD_ID) {
  return doc(
    getFirebaseDb(),
    COLLECTIONS.projects,
    projectId,
    COLLECTIONS.chats,
    threadId,
  );
}

function messagesCollection(projectId: string, threadId = DEFAULT_CHAT_THREAD_ID) {
  return collection(
    getFirebaseDb(),
    COLLECTIONS.projects,
    projectId,
    COLLECTIONS.chats,
    threadId,
    COLLECTIONS.messages,
  );
}

function asMode(value: unknown, fallback: ChatMode): ChatMode {
  return asChatMode(value, fallback);
}

function asRole(value: unknown): ChatRole {
  if (value === "assistant" || value === "system") {
    return value;
  }

  return "user";
}

function mapMessage(
  id: string,
  projectId: string,
  threadId: string,
  data: Record<string, unknown>,
): ChatMessage {
  return {
    id,
    projectId,
    threadId,
    lessonId: typeof data.lessonId === "string" ? data.lessonId : null,
    exerciseId: typeof data.exerciseId === "string" ? data.exerciseId : null,
    role: asRole(data.role),
    mode: asMode(data.mode, "auto"),
    content:
      asRole(data.role) === "user"
        ? asString(data.content)
        : stripArtifactMarkup(asString(data.content)),
    attachments: asAttachments(data.attachments),
    relatedExerciseType:
      typeof data.relatedExerciseType === "string"
        ? (data.relatedExerciseType as ExerciseType)
        : null,
    intent: isComposerIntent(data.intent) ? data.intent : null,
    artifact: asArtifact(data.artifact),
    promptAsk: asPromptAsk(data.promptAsk),
    options: asOptions(data.options, data.clarify),
    pendingKind:
      data.pendingKind === "sheet" ||
      data.pendingKind === "practice" ||
      data.pendingKind === "images" ||
      data.pendingKind === "path"
        ? data.pendingKind
        : undefined,
    images: asImages(data.images),
    blocks: parseNoteBlocks(data.blocks),
    sources: asSources(data.sources),
    activity: Array.isArray(data.activity)
      ? data.activity.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 100)).filter(Boolean).slice(0, 5)
      : undefined,
    memorized: data.memorized === true ? true : undefined,
    responseStatus: data.responseStatus === "stopped" || data.responseStatus === "failed" ? data.responseStatus : undefined,
    createdAt: toIsoDate(data.createdAt) ?? toIsoDate(data.createdAtClient),
  };
}

function asAttachments(value: unknown): ChatAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const next = compactChatAttachment({
      title: typeof row.title === "string" ? row.title : "",
      type: typeof row.type === "string" ? row.type : "file",
      materialId: typeof row.materialId === "string" ? row.materialId : undefined,
      storagePath: typeof row.storagePath === "string" ? row.storagePath : undefined,
      sizeBytes: typeof row.sizeBytes === "number" ? row.sizeBytes : undefined,
    });
    return next ? [next] : [];
  });
}

function asOptions(value: unknown, clarify: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  }
  if (clarify === true) return [];
  return undefined;
}

function asPromptAsk(value: unknown): ChatMessage["promptAsk"] {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const question = typeof row.question === "string" ? row.question.trim() : "";
  if (!question) return undefined;
  const options = Array.isArray(row.options)
    ? row.options.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : undefined;
  return { question, options: options?.length ? options : undefined };
}

function asSources(value: unknown): ChatSourceRef[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.flatMap((item): ChatSourceRef[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.n !== "number" || typeof row.materialId !== "string" || !row.materialId) return [];
    return [
      {
        n: row.n,
        materialId: row.materialId,
        title: typeof row.title === "string" ? row.title : "Source",
        page: typeof row.page === "number" ? row.page : 0,
        pageEnd: typeof row.pageEnd === "number" ? row.pageEnd : 0,
        section: typeof row.section === "string" ? row.section : "",
        snippet: typeof row.snippet === "string" ? row.snippet : "",
      },
    ];
  });
  return list.length > 0 ? list : undefined;
}

function asImages(value: unknown): ChatImageHit[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const hits = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url.trim() : "";
    const thumbnail = typeof row.thumbnail === "string" ? row.thumbnail.trim() : "";
    const thumb = (typeof row.thumb === "string" ? row.thumb.trim() : "") || thumbnail;
    const storagePath = typeof row.storagePath === "string" ? row.storagePath.trim() : "";
    if (!url && !thumb && !storagePath) return [];
    const kind: ChatImageHit["kind"] =
      row.kind === "upload" ? "upload" : row.kind === "web" ? "web" : storagePath ? "upload" : "web";
    const alt = typeof row.alt === "string" ? row.alt.trim() : "";
    const title =
      typeof row.title === "string" && row.title.trim() ? row.title.trim() : alt || url || "Image";
    return [
      {
        url: url || storagePath || thumb,
        thumb: thumb || storagePath || url,
        thumbnail: thumbnail || thumb || undefined,
        title,
        alt: alt || title,
        source: typeof row.source === "string" && row.source.trim() ? row.source.trim() : kind === "upload" ? "upload" : "web",
        license: typeof row.license === "string" ? row.license.trim() : "",
        credit: typeof row.credit === "string" ? row.credit.trim() : "",
        pageUrl: typeof row.pageUrl === "string" ? row.pageUrl.trim() || undefined : undefined,
        kind,
        materialId: typeof row.materialId === "string" ? row.materialId.trim() || undefined : undefined,
        storagePath: storagePath || undefined,
        galleryId: imageGalleryId(row.galleryId),
      },
    ];
  });
  return hits;
}

function asArtifact(value: unknown): ChatArtifact | null {
  return parseChatArtifact(value);
}

export function pathThreadId(pathId: string): string {
  return `path-${pathId}`;
}

export function pathThreadTitle(path: { title?: string; kind?: string }): string {
  const title = (path.title || "").trim() || "გეგმა";
  return path.kind === "review" ? `გამეორება: ${title}` : `გეგმა: ${title}`;
}

function asThreadKind(value: unknown): ChatThreadKind {
  return value === "path" || value === "practice" ? value : "main";
}

function mapThread(id: string, projectId: string, data: Record<string, unknown>): ChatThread {
  return {
    id,
    projectId,
    userId: asString(data.userId),
    lessonId: typeof data.lessonId === "string" ? data.lessonId : null,
    exerciseId: typeof data.exerciseId === "string" ? data.exerciseId : null,
    mode: asMode(data.mode, "auto"),
    kind: asThreadKind(data.kind ?? (id === DEFAULT_CHAT_THREAD_ID ? "main" : undefined)),
    title: typeof data.title === "string" ? data.title : undefined,
    pathId: typeof data.pathId === "string" ? data.pathId : null,
    createdAt: toIsoDate(data.createdAt),
    updatedAt: toIsoDate(data.updatedAt) ?? toIsoDate(data.createdAt),
  };
}

function threadsCollection(projectId: string) {
  return collection(getFirebaseDb(), COLLECTIONS.projects, projectId, COLLECTIONS.chats);
}

export async function ensureChatThread(input: {
  projectId: string;
  userId: string;
  mode: ChatMode;
  threadId?: string;
  kind?: ChatThreadKind;
  title?: string;
  pathId?: string | null;
  created?: boolean;
}): Promise<void> {
  const threadId = input.threadId ?? DEFAULT_CHAT_THREAD_ID;
  const kind = input.kind ?? (threadId === DEFAULT_CHAT_THREAD_ID ? "main" : "path");
  await setDoc(
    chatRef(input.projectId, threadId),
    omitUndefined({
      projectId: input.projectId,
      userId: input.userId,
      lessonId: null,
      exerciseId: null,
      mode: input.mode,
      kind,
      title: input.title,
      pathId: input.pathId ?? null,
      ...(input.created ? { createdAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    }),
    { merge: true },
  );
  await upsertChatIndex({
    projectId: input.projectId,
    threadId,
    userId: input.userId,
    kind,
    title: input.title,
    created: input.created,
  }).catch(() => undefined);
}

async function upsertChatIndex(input: {
  projectId: string;
  threadId: string;
  userId: string;
  kind: ChatThreadKind;
  title?: string;
  created?: boolean;
}): Promise<void> {
  const chatId = publicChatId(input.projectId, input.threadId);
  await setDoc(
    chatIndexRef(chatId),
    omitUndefined({
      projectId: input.projectId,
      nestedId: input.threadId,
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      ...(input.created ? { createdAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    }),
    { merge: true },
  );
}

export function reserveChatId(projectId: string): string {
  return doc(threadsCollection(projectId)).id;
}

export async function createChatThread(input: {
  projectId: string;
  userId: string;
  mode: ChatMode;
  title?: string;
  kind?: ChatThreadKind;
  pathId?: string | null;
}): Promise<string> {
  const threadId = reserveChatId(input.projectId);
  await ensureChatThread({
    ...input,
    threadId,
    kind: input.kind ?? "main",
    created: true,
  });
  return threadId;
}

export async function updateChatTitle(
  projectId: string,
  threadId: string,
  title: string,
): Promise<void> {
  const next = title.trim();
  if (!next) return;
  await setDoc(
    chatRef(projectId, threadId),
    { title: next, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await setDoc(
    chatIndexRef(publicChatId(projectId, threadId)),
    { title: next, updatedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => undefined);
}

export async function resolveChatRoute(
  chatId: string,
  userId: string,
): Promise<{ projectId: string; threadId: string } | null> {
  const index = await getDocSafe(chatIndexRef(chatId));
  if (index?.exists()) {
    const data = (index.data() ?? {}) as Record<string, unknown>;
    if (asString(data.userId) !== userId) return null;
    const projectId = asString(data.projectId);
    if (!projectId) return null;
    const nestedId = asString(data.nestedId) || nestedThreadId(projectId, chatId);
    return { projectId, threadId: nestedId };
  }
  const projectSnap = await getDocSafe(doc(getFirebaseDb(), COLLECTIONS.projects, chatId));
  if (projectSnap?.exists()) {
    const data = (projectSnap.data() ?? {}) as Record<string, unknown>;
    const owner = asString(data.userId) || asString(data.ownerId);
    if (owner !== userId) return null;
    return { projectId: chatId, threadId: DEFAULT_CHAT_THREAD_ID };
  }
  const owned = await getDocs(
    query(collection(getFirebaseDb(), COLLECTIONS.projects), where("userId", "==", userId)),
  );
  for (const item of owned.docs) {
    const threads = await listChatThreads(item.id);
    const hit = threads.find((thread) => thread.id === chatId);
    if (hit) return { projectId: item.id, threadId: hit.id };
  }
  return null;
}

export async function latestChatPath(projectId: string): Promise<string | null> {
  const threads = await listChatThreads(projectId);
  if (threads.length === 0) return null;
  const latest = [...threads].sort((a, b) => {
    const left = a.updatedAt ?? a.createdAt ?? "";
    const right = b.updatedAt ?? b.createdAt ?? "";
    return right.localeCompare(left);
  })[0];
  return chatPath(publicChatId(projectId, latest.id));
}

export type ChatIndexRow = {
  id: string;
  projectId: string;
  nestedId: string;
  userId: string;
  title?: string;
  kind?: ChatThreadKind;
  createdAt: string | null;
  updatedAt: string | null;
};

function mapIndex(id: string, data: Record<string, unknown>): ChatIndexRow {
  const projectId = asString(data.projectId);
  return {
    id,
    projectId,
    nestedId: asString(data.nestedId) || nestedThreadId(projectId, id),
    userId: asString(data.userId),
    title: typeof data.title === "string" ? data.title : undefined,
    kind: asThreadKind(data.kind),
    createdAt: toIsoDate(data.createdAt),
    updatedAt: toIsoDate(data.updatedAt) ?? toIsoDate(data.createdAt),
  };
}

export function subscribeChatsForUser(
  userId: string,
  onChange: (chats: ChatIndexRow[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(getFirebaseDb(), COLLECTIONS.chats), where("userId", "==", userId)),
    (snapshot) => {
      const chats = snapshot.docs
        .map((item) => mapIndex(item.id, item.data()))
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
      onChange(chats);
    },
    (error) => onError?.(error),
  );
}

export async function listChatThreads(projectId: string): Promise<ChatThread[]> {
  const snapshot = await getDocs(threadsCollection(projectId));
  return snapshot.docs
    .map((item) => mapThread(item.id, projectId, item.data()))
    .sort((a, b) => {
      if (a.id === DEFAULT_CHAT_THREAD_ID) return -1;
      if (b.id === DEFAULT_CHAT_THREAD_ID) return 1;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });
}

export function subscribeChatThreads(
  projectId: string,
  onChange: (threads: ChatThread[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    threadsCollection(projectId),
    (snapshot) => {
      const threads = snapshot.docs
        .map((item) => mapThread(item.id, projectId, item.data()))
        .sort((a, b) => {
          if (a.id === DEFAULT_CHAT_THREAD_ID) return -1;
          if (b.id === DEFAULT_CHAT_THREAD_ID) return 1;
          return (a.createdAt ?? a.updatedAt ?? "").localeCompare(b.createdAt ?? b.updatedAt ?? "");
        });
      onChange(threads);
    },
    (error) => onError?.(error),
  );
}

export async function deleteAllChatThreads(projectId: string): Promise<void> {
  const threads = await listChatThreads(projectId);
  const ids = new Set(threads.map((item) => item.id));
  ids.add(DEFAULT_CHAT_THREAD_ID);
  await Promise.all([...ids].map((id) => deleteChatMessages(projectId, id)));
}

export async function setChatThreadMode(
  projectId: string,
  mode: ChatMode,
): Promise<void> {
  await setDoc(
    chatRef(projectId),
    {
      mode,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  clearUntouchedNotebook(projectId);
}

export function allocateChatMessageId(
  projectId: string,
  threadId = DEFAULT_CHAT_THREAD_ID,
): string {
  return doc(messagesCollection(projectId, threadId)).id;
}

export async function addChatMessage(input: {
  projectId: string;
  userId?: string;
  role: ChatRole;
  mode: ChatMode;
  content: string;
  threadId?: string;
  id?: string;
  intent?: ChatMessage["intent"];
  artifact?: ChatArtifact | null;
  attachments?: ChatAttachment[];
  options?: string[];
  promptAsk?: ChatMessage["promptAsk"];
  pendingKind?: PendingKind;
  images?: ChatImageHit[];
  blocks?: VisualBlock[];
  sources?: ChatSourceRef[];
  activity?: string[];
  memorized?: boolean;
  responseStatus?: ChatMessage["responseStatus"];
}): Promise<string> {
  const threadId = input.threadId ?? DEFAULT_CHAT_THREAD_ID;
  const createdAtClient = new Date().toISOString();
  const attachments = (input.attachments ?? []).flatMap((item) => {
    const next = compactChatAttachment(item);
    return next ? [next] : [];
  });
  const images = input.images?.map((item) => omitUndefined(item));
  const ref = input.id
    ? doc(messagesCollection(input.projectId, threadId), input.id)
    : doc(messagesCollection(input.projectId, threadId));
  await setDoc(
    ref,
    omitUndefined({
      projectId: input.projectId,
      threadId,
      lessonId: null,
      exerciseId: null,
      role: input.role,
      mode: input.mode,
      content:
        input.role === "assistant" ? stripArtifactMarkup(input.content) : input.content,
      attachments,
      intent: input.intent ?? null,
      artifact: compactChatArtifact(input.artifact),
      relatedExerciseType: null,
      createdAt: createdAtClient,
      createdAtClient,
      ...(input.options !== undefined ? { options: input.options, clarify: true } : {}),
      ...(input.promptAsk ? { promptAsk: input.promptAsk } : {}),
      ...(input.pendingKind ? { pendingKind: input.pendingKind } : {}),
      ...(images !== undefined ? { images } : {}),
      ...(input.blocks?.length ? { blocks: input.blocks } : {}),
      ...(input.sources?.length ? { sources: input.sources } : {}),
      ...(input.activity?.length ? { activity: input.activity.slice(0, 5).map((item) => item.trim().slice(0, 100)).filter(Boolean) } : {}),
      ...(input.memorized ? { memorized: true } : {}),
      ...(input.responseStatus ? { responseStatus: input.responseStatus } : {}),
    }),
  );
  clearUntouchedNotebook(input.projectId);

  // Recency metadata is best effort; a reconnect must not hold up an already saved message.
  void updateDoc(chatRef(input.projectId, threadId), {
    updatedAt: serverTimestamp(),
  }).catch(() => undefined);
  void setDoc(
    chatIndexRef(publicChatId(input.projectId, threadId)),
    { updatedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => undefined);

  return ref.id;
}

export async function patchChatMessage(
  projectId: string,
  messageId: string,
  patch: { content?: string; images?: ChatImageHit[]; attachments?: ChatAttachment[]; memorized?: boolean; activity?: string[] },
  threadId = DEFAULT_CHAT_THREAD_ID,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (patch.content !== undefined) payload.content = stripArtifactMarkup(patch.content);
  if (patch.images !== undefined) payload.images = patch.images.map((item) => omitUndefined(item));
  if (patch.attachments !== undefined) {
    payload.attachments = patch.attachments.flatMap((item) => {
      const next = compactChatAttachment(item);
      return next ? [next] : [];
    });
  }
  if (patch.memorized) payload.memorized = true;
  if (patch.activity !== undefined) payload.activity = patch.activity.slice(0, 5).map((item) => item.trim().slice(0, 100)).filter(Boolean);
  if (Object.keys(payload).length === 0) return;
  await updateDoc(doc(messagesCollection(projectId, threadId), messageId), omitUndefined(payload));
}

export async function listChatMessages(
  projectId: string,
  threadId = DEFAULT_CHAT_THREAD_ID,
): Promise<ChatMessage[]> {
  const snapshot = await getDocs(messagesCollection(projectId, threadId));
  return snapshot.docs
    .map((item) => mapMessage(item.id, projectId, threadId, item.data()))
    .sort((a, b) => {
      const time = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
      return time !== 0 ? time : a.id.localeCompare(b.id);
    });
}

export function subscribeChatMessages(
  projectId: string,
  onChange: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void,
  threadId = DEFAULT_CHAT_THREAD_ID,
): Unsubscribe {
  const cached = new Map<string, ChatMessage>();
  return onSnapshot(
    query(messagesCollection(projectId, threadId), orderBy("createdAt", "desc"), limit(40)),
    (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === "removed") cached.delete(change.doc.id);
        else cached.set(change.doc.id, mapMessage(change.doc.id, projectId, threadId, change.doc.data()));
      }
      const messages = snapshot.docs
        .map((item) => cached.get(item.id)!)
        .sort((a, b) => {
          const time = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
          return time !== 0 ? time : a.id.localeCompare(b.id);
        });
      onChange(messages);
    },
    (error) => onError?.(error),
  );
}

/** Fetch a single older page using the same decoder and ordering as the live page. */
export async function listEarlierChatMessages(projectId: string, threadId: string, beforeId: string): Promise<ChatMessage[]> {
  const messages = messagesCollection(projectId, threadId);
  const cursor = await getDoc(doc(messages, beforeId));
  if (!cursor.exists()) return [];
  const snapshot = await getDocs(query(messages, orderBy("createdAt", "desc"), startAfter(cursor), limit(40)));
  return snapshot.docs.reverse().map((item) => mapMessage(item.id, projectId, threadId, item.data()));
}

export async function deleteChatMessages(
  projectId: string,
  threadId = DEFAULT_CHAT_THREAD_ID,
): Promise<void> {
  const snapshot = await getDocs(messagesCollection(projectId, threadId));
  const chatImages = new Map<string, ChatAttachment>();
  for (const message of snapshot.docs) {
    for (const attachment of asAttachments(message.data().attachments)) {
      if (!attachment.materialId && attachment.storagePath) chatImages.set(attachment.storagePath, attachment);
    }
  }
  await Promise.all([...chatImages.values()].map((image) => discardChatImage(image).catch(() => undefined)));
  await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
  await deleteDoc(chatRef(projectId, threadId)).catch(() => undefined);
  await deleteDoc(chatIndexRef(publicChatId(projectId, threadId))).catch(() => undefined);
}
