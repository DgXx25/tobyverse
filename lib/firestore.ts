/**
 * Firestore layout (project-scoped subcollections).
 *
 * users/{userId}
 *   displayName, email, photoURL, plan ("free" in beta; not client-writable to other values),
 *   usage { weekStart, chatTurns, practiceGenerated, notesGenerated, storageBytes },
 *     storageBytes is capped at 1 GiB per user (materials), enforced during beta.
 *   preferredModel (optional Gemini model id; admin-only models are authorized by the server),
 *   chatMode (optional: auto | fast | teacher), theme (optional: light | dark),
 *   themeAccents (optional: light/dark accent ids), highContrast (optional: boolean),
 *   createdAt, updatedAt
 *
 *   memories/{memoryId}
 *     id, content (short standing instruction, max 200), createdAt, updatedAt
 *     How Toby should respond — not a biography, not a learning-style dump.
 *
 *   profile/learning
 *     text (one edited paragraph, max 800), updatedAt
 *     How this student learns. Rewritten in place, never a list of facts.
 *
 * projects/{projectId}
 *   title, description, userId, goal, recipe, preferredChatMode,
 *   projectMemory (string[], max 12 × 200), icon, folder,
 *   createdAt, updatedAt
 *   A project is a notebook. Its conversation is the main thread. Materials live here.
 *
 * chats/{chatId}                 // URL index for /c/:chatId
 *   projectId, nestedId, userId, title, kind, public?, shareId?, createdAt, updatedAt
 *   First/legacy thread: chatId === projectId, nestedId === "main".
 *
 *   lessons/{lessonId}
 *     title, topic, status, recipe, exerciseIds, userId, createdAt, updatedAt
 *
 *   exercises/{exerciseId}
 *     type, category, templateVersion, payload (JSON per template), lessonId, userId
 *
 *   chats/{chatId}
 *     mode, userId, lessonId, exerciseId, createdAt, updatedAt
 *     messages/{messageId}
 *       role, mode, content, relatedExerciseType, createdAt
 *
 *   materials/{materialId}
 *     title, type, storagePath, textPath, extractedTextPreview (max 300), sizeBytes,
 *     pageCount, hasImages, textChars, images[{page,path,mime}], status, userId, createdAt,
 *     index{status, chunks, nextPage|nextChunk, textChars, version}  (server-written indexing cursor)
 *     Full extracted text lives in Storage as extracted.txt — never in Firestore.
 *
 *     chunks/{chunkId}              // written by the server only (owner-scoped by the project rules): the retrieval index
 *       userId, projectId, materialId, page, pageEnd, section, text, terms[], tokens,
 *       embedding (vector 768), v. Needs the indexes in firestore.indexes.json.
 *
 *   studySheets/{sheetId}
 *     title, blocks (JSON visual blocks), content (legacy), sourceMaterialIds, userId, createdAt
 *
 *   paths/{pathId}
 *     title, courses[{id,title,units[{id,title,nodes[{id,title,teach,outcome,status,practiceSetId?,sheetId?}]}]}],
 *     currentCourseId, currentNodeId, started, sourceMaterialIds, userId, createdAt, updatedAt
 *     Titles + a short tutor brief per node — not a lesson. Chat sees the current node only.
 *
 *   exercises/{exerciseId}
 *     type, category, data (typed JSON), sourceMaterialIds, knowledgeItemId, userId, createdAt
 *
 *   attempts/{attemptId}            // progress tracking
 *     userId, lessonId, exerciseId, answer, isCorrect, score, createdAt
 *
 *   progress/{progressId}           // per-lesson rollup
 *     userId, lessonId, completedExerciseIds, score, status, updatedAt
 *
 * knowledgeItems/{itemId}           // global or per-project facts
 *   projectId (null = global), category, type, prompt, answer, metadata, createdAt
 *
 * userProgress/{progressId}         // id = {userId}_{knowledgeItemId}
 *   userId, knowledgeItemId, projectId, status, correctCount, incorrectCount,
 *   lastSeen, nextReview, easeFactor, updatedAt
 *
 * trainingSignals/{signalId}        // compact fine-tune breadcrumb or assistant dislike
 *   Legacy: userId, projectId, contextType, signal, shortHash, itemId, createdAt
 *   Dislike: chatId, messageId, reason, snippet, createdAt (reason/snippet <= 240)
 *
 * playgroundSnapshots/{id}          // admin-only compact prompt audits
 *   userId, prompts (truncated), scores, winner, auditSummary, createdAt
 *
 * evalSnapshots/{id}                // admin-only compact chat-tool eval runs
 *   userId, passed, failed, cases (expected/actual/pass/note), createdAt
 *
 * Storage (not Firestore): users/{userId}/projects/{projectId}/materials/{materialId}/...
 *   original upload plus extracted.txt for non-PDF types. No page or slide images are produced.
 */

export const COLLECTIONS = {
  users: "users",
  memories: "memories",
  profile: "profile",
  projects: "projects",
  lessons: "lessons",
  exercises: "exercises",
  chats: "chats",
  messages: "messages",
  materials: "materials",
  chunks: "chunks",
  studySheets: "studySheets",
  paths: "paths",
  attempts: "attempts",
  progress: "progress",
  knowledgeItems: "knowledgeItems",
  userProgress: "userProgress",
  trainingSignals: "trainingSignals",
  playgroundSnapshots: "playgroundSnapshots",
  evalSnapshots: "evalSnapshots",
  aiUsageWeeks: "aiUsageWeeks",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export const firestorePaths = {
  users: () => COLLECTIONS.users,
  user: (userId: string) => `${COLLECTIONS.users}/${userId}`,
  memories: (userId: string) => `${COLLECTIONS.users}/${userId}/${COLLECTIONS.memories}`,
  memory: (userId: string, memoryId: string) =>
    `${COLLECTIONS.users}/${userId}/${COLLECTIONS.memories}/${memoryId}`,
  learningProfile: (userId: string) => `${COLLECTIONS.users}/${userId}/${COLLECTIONS.profile}/learning`,

  projects: () => COLLECTIONS.projects,
  project: (projectId: string) => `${COLLECTIONS.projects}/${projectId}`,
  rootChat: (chatId: string) => `${COLLECTIONS.chats}/${chatId}`,

  lessons: (projectId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.lessons}`,
  lesson: (projectId: string, lessonId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.lessons}/${lessonId}`,

  exercises: (projectId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.exercises}`,
  exercise: (projectId: string, exerciseId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.exercises}/${exerciseId}`,

  chats: (projectId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.chats}`,
  chat: (projectId: string, chatId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.chats}/${chatId}`,
  messages: (projectId: string, chatId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.chats}/${chatId}/${COLLECTIONS.messages}`,

  materials: (projectId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.materials}`,
  material: (projectId: string, materialId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.materials}/${materialId}`,
  chunks: (projectId: string, materialId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.materials}/${materialId}/${COLLECTIONS.chunks}`,

  studySheets: (projectId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.studySheets}`,
  studySheet: (projectId: string, sheetId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.studySheets}/${sheetId}`,

  paths: (projectId: string) => `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.paths}`,
  path: (projectId: string, pathId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.paths}/${pathId}`,

  attempts: (projectId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.attempts}`,
  progress: (projectId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.progress}`,

  knowledgeItems: () => COLLECTIONS.knowledgeItems,
  knowledgeItem: (itemId: string) => `${COLLECTIONS.knowledgeItems}/${itemId}`,

  userProgress: () => COLLECTIONS.userProgress,
  userProgressDoc: (progressId: string) =>
    `${COLLECTIONS.userProgress}/${progressId}`,

  trainingSignals: () => COLLECTIONS.trainingSignals,
  playgroundSnapshots: () => COLLECTIONS.playgroundSnapshots,
  evalSnapshots: () => COLLECTIONS.evalSnapshots,
  aiUsageWeeks: (userId: string) => `${COLLECTIONS.users}/${userId}/${COLLECTIONS.aiUsageWeeks}`,
  aiUsageWeek: (userId: string, weekStart: string) =>
    `${COLLECTIONS.users}/${userId}/${COLLECTIONS.aiUsageWeeks}/${weekStart}`,
} as const;

export function materialStoragePath(
  userId: string,
  projectId: string,
  materialId: string,
  fileName: string,
): string {
  return `users/${userId}/projects/${projectId}/materials/${materialId}/${fileName}`;
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Firestore rejects `undefined`. Drop those keys; keep null and real values. */
export function omitUndefined<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => omitUndefined(item)) as T;
  }
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (nested === undefined) continue;
    out[key] = omitUndefined(nested);
  }
  return out as T;
}
