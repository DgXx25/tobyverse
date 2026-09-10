/**
 * Firestore layout (project-scoped subcollections).
 *
 * users/{userId}
 *   displayName, email, photoURL, plan ("free" in beta; not client-writable to other values),
 *   usage { weekStart, chatTurns, practiceGenerated, notesGenerated, storageBytes },
 *     storageBytes is capped at 1 GiB per user (materials), enforced during beta.
 *   preferredModel (optional: gemini | grok | gpt),
 *   createdAt, updatedAt
 *
 *   memories/{memoryId}
 *     id, content (short atomic fact, max 200), createdAt, updatedAt
 *     Model-chosen durable facts only — never chat transcripts or summaries.
 *
 * projects/{projectId}
 *   title, description, userId, goal, recipe, preferredChatMode, createdAt, updatedAt
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
 *     pageCount, hasImages, textChars, images[{page,path,mime}], status, userId, createdAt
 *     Full extracted text lives in Storage as extracted.txt — never in Firestore.
 *
 *   studySheets/{sheetId}
 *     title, blocks (JSON visual blocks), content (legacy), sourceMaterialIds, userId, createdAt
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
 * analyticsEvents/{eventId}         // tiny usage pings (no chat text)
 *   userId, projectId, type, value, createdAt
 *
 * trainingSignals/{signalId}        // optional compact fine-tune breadcrumbs
 *   userId, projectId, contextType, signal, shortHash, itemId, createdAt
 *
 * playgroundSnapshots/{id}          // admin-only compact prompt audits
 *   userId, prompts (truncated), scores, winner, auditSummary, createdAt
 *
 * evalSnapshots/{id}                // admin-only compact chat-tool eval runs
 *   userId, passed, failed, cases (expected/actual/pass/note), createdAt
 *
 * Storage (not Firestore): users/{userId}/projects/{projectId}/materials/{materialId}/{fileName}
 *   original upload + extracted.txt + optional slide-N.jpg / page-N.jpg
 */

export const COLLECTIONS = {
  users: "users",
  memories: "memories",
  projects: "projects",
  lessons: "lessons",
  exercises: "exercises",
  chats: "chats",
  messages: "messages",
  materials: "materials",
  chunks: "chunks",
  studySheets: "studySheets",
  attempts: "attempts",
  progress: "progress",
  knowledgeItems: "knowledgeItems",
  userProgress: "userProgress",
  analyticsEvents: "analyticsEvents",
  trainingSignals: "trainingSignals",
  playgroundSnapshots: "playgroundSnapshots",
  evalSnapshots: "evalSnapshots",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export const firestorePaths = {
  users: () => COLLECTIONS.users,
  user: (userId: string) => `${COLLECTIONS.users}/${userId}`,
  memories: (userId: string) => `${COLLECTIONS.users}/${userId}/${COLLECTIONS.memories}`,
  memory: (userId: string, memoryId: string) =>
    `${COLLECTIONS.users}/${userId}/${COLLECTIONS.memories}/${memoryId}`,

  projects: () => COLLECTIONS.projects,
  project: (projectId: string) => `${COLLECTIONS.projects}/${projectId}`,

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

  attempts: (projectId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.attempts}`,
  progress: (projectId: string) =>
    `${COLLECTIONS.projects}/${projectId}/${COLLECTIONS.progress}`,

  knowledgeItems: () => COLLECTIONS.knowledgeItems,
  knowledgeItem: (itemId: string) => `${COLLECTIONS.knowledgeItems}/${itemId}`,

  userProgress: () => COLLECTIONS.userProgress,
  userProgressDoc: (progressId: string) =>
    `${COLLECTIONS.userProgress}/${progressId}`,

  analyticsEvents: () => COLLECTIONS.analyticsEvents,
  trainingSignals: () => COLLECTIONS.trainingSignals,
  playgroundSnapshots: () => COLLECTIONS.playgroundSnapshots,
  evalSnapshots: () => COLLECTIONS.evalSnapshots,
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
