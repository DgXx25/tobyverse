import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { DEFAULT_CHAT_THREAD_ID } from "@/lib/core/constants";
import { COLLECTIONS, omitUndefined } from "@/lib/firestore";
import { compactChatAttachment } from "@/lib/composer/attach";
import { parseChatArtifact, compactChatArtifact } from "@/lib/artifacts/active";
import { getFirebaseDb } from "@/lib/firebase";
import { asString, toIsoDate } from "@/lib/timestamps";
import { isComposerIntent } from "@/lib/composer/intent";
import type { ChatArtifact, ChatAttachment, ChatImageHit, ChatMessage, ChatMode, ChatRole } from "@/types/chat";
import type { ExerciseType } from "@/types/exercise";

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
  return value === "socratic" || value === "normal" ? value : fallback;
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
    mode: asMode(data.mode, "normal"),
    content: asString(data.content),
    attachments: asAttachments(data.attachments),
    relatedExerciseType:
      typeof data.relatedExerciseType === "string"
        ? (data.relatedExerciseType as ExerciseType)
        : null,
    intent: isComposerIntent(data.intent) ? data.intent : null,
    artifact: asArtifact(data.artifact),
    options: asOptions(data.options, data.clarify),
    pendingKind: data.pendingKind === "sheet" || data.pendingKind === "practice" ? data.pendingKind : undefined,
    images: asImages(data.images),
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

function asImages(value: unknown): ChatImageHit[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const hits = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url.trim() : "";
    if (!url) return [];
    return [
      {
        url,
        title: typeof row.title === "string" && row.title.trim() ? row.title.trim() : url,
        source: typeof row.source === "string" && row.source.trim() ? row.source.trim() : "web",
        pageUrl: typeof row.pageUrl === "string" ? row.pageUrl.trim() || undefined : undefined,
        thumb: typeof row.thumb === "string" ? row.thumb.trim() || undefined : undefined,
      },
    ];
  });
  return hits.length ? hits : undefined;
}

function asArtifact(value: unknown): ChatArtifact | null {
  return parseChatArtifact(value);
}

export async function ensureChatThread(input: {
  projectId: string;
  userId: string;
  mode: ChatMode;
}): Promise<void> {
  await setDoc(
    chatRef(input.projectId),
    {
      projectId: input.projectId,
      userId: input.userId,
      lessonId: null,
      exerciseId: null,
      mode: input.mode,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
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
}

export async function addChatMessage(input: {
  projectId: string;
  userId?: string;
  role: ChatRole;
  mode: ChatMode;
  content: string;
  threadId?: string;
  intent?: ChatMessage["intent"];
  artifact?: ChatArtifact | null;
  attachments?: ChatAttachment[];
  options?: string[];
  pendingKind?: "practice" | "sheet";
  images?: ChatImageHit[];
}): Promise<string> {
  const threadId = input.threadId ?? DEFAULT_CHAT_THREAD_ID;
  const createdAtClient = new Date().toISOString();
  const attachments = (input.attachments ?? []).flatMap((item) => {
    const next = compactChatAttachment(item);
    return next ? [next] : [];
  });
  const ref = await addDoc(
    messagesCollection(input.projectId, threadId),
    omitUndefined({
      projectId: input.projectId,
      threadId,
      lessonId: null,
      exerciseId: null,
      role: input.role,
      mode: input.mode,
      content: input.content,
      attachments,
      intent: input.intent ?? null,
      artifact: compactChatArtifact(input.artifact),
      relatedExerciseType: null,
      createdAt: createdAtClient,
      createdAtClient,
      ...(input.options !== undefined ? { options: input.options, clarify: true } : {}),
      ...(input.pendingKind ? { pendingKind: input.pendingKind } : {}),
      ...(input.images?.length ? { images: input.images } : {}),
    }),
  );

  await updateDoc(chatRef(input.projectId, threadId), {
    updatedAt: serverTimestamp(),
  }).catch(() => undefined);

  return ref.id;
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
  return onSnapshot(
    messagesCollection(projectId, threadId),
    (snapshot) => {
      const messages = snapshot.docs
        .map((item) => mapMessage(item.id, projectId, threadId, item.data()))
        .sort((a, b) => {
          const time = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
          return time !== 0 ? time : a.id.localeCompare(b.id);
        });
      onChange(messages);
    },
    (error) => onError?.(error),
  );
}

export async function deleteChatMessages(
  projectId: string,
  threadId = DEFAULT_CHAT_THREAD_ID,
): Promise<void> {
  const snapshot = await getDocs(messagesCollection(projectId, threadId));
  await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
  await deleteDoc(chatRef(projectId, threadId)).catch(() => undefined);
}
