import type { EntityId, IsoDateString } from "@/types/common";
import type { ExerciseType } from "@/types/exercise";
import type { ChatMemoryContext } from "@/types/memory";

export const CHAT_MODES = ["auto", "fast", "teacher"] as const;

export type ChatMode = (typeof CHAT_MODES)[number];

export type AcceptedChatTool =
  | "create_practice"
  | "create_sheet"
  | "create_path"
  | "start_path"
  | "search_images";

export type ChatRole = "user" | "assistant" | "system";

export const PENDING_KINDS = ["practice", "sheet", "images", "path"] as const;

export type PendingKind = (typeof PENDING_KINDS)[number];

export const CHAT_THREAD_KINDS = ["main", "path", "practice"] as const;

export type ChatThreadKind = (typeof CHAT_THREAD_KINDS)[number];

export const CHAT_ARTIFACT_KINDS = ["plan", "path", "sheet", "practice"] as const;

export type KnownChatArtifactKind = (typeof CHAT_ARTIFACT_KINDS)[number];
/** Known kinds plus any future tool card (append to CHAT_ARTIFACT_KINDS when it ships). */
export type ChatArtifactKind = KnownChatArtifactKind | (string & {});

export type ChatArtifactStep = {
  from?: string;
  to?: string;
  done?: number;
  total?: number;
};

export type ChatArtifact = {
  kind: ChatArtifactKind;
  id: string;
  title: string;
  count?: number;
  ids?: string[];
  /** Practice card: practice (retry mistakes) or exam (scored, ~50% counts). */
  mode?: "practice" | "exam";
  /** Path card: the step that just completed → the one now open. */
  step?: ChatArtifactStep;
};

export type ChatThread = {
  id: EntityId;
  projectId: EntityId;
  userId: EntityId;
  lessonId: EntityId | null;
  exerciseId: EntityId | null;
  mode: ChatMode;
  kind?: ChatThreadKind;
  title?: string;
  pathId?: EntityId | null;
  createdAt: IsoDateString | null;
  updatedAt: IsoDateString | null;
};

export type ChatMessage = {
  id: EntityId;
  projectId: EntityId;
  threadId: EntityId;
  lessonId: EntityId | null;
  exerciseId: EntityId | null;
  role: ChatRole;
  mode: ChatMode;
  content: string;
  attachments: ChatAttachment[];
  /** Exercise the message is about, when tutoring a specific item. */
  relatedExerciseType: ExerciseType | null;
  intent: "ask" | "plan" | "study" | "practice" | "edit" | "append" | "regenerate_one" | "rewrite_sheet" | null;
  artifact: ChatArtifact | null;
  /** Content check rendered as its own exam message. Not a clarify. */
  promptAsk?: { question: string; options?: string[] };
  /** Present on a clarify turn, including []. */
  options?: string[];
  pendingKind?: PendingKind;
  images?: ChatImageHit[];
  /** True when this turn saved a long-term memory fact. */
  memorized?: boolean;
  createdAt: IsoDateString | null;
};

export type ChatImageHit = {
  url: string;
  thumb: string;
  title: string;
  source: string;
  license: string;
  credit: string;
  thumbnail?: string;
  alt?: string;
  pageUrl?: string;
  kind?: "web" | "upload";
  materialId?: string;
  storagePath?: string;
};

export type ChatAttachment = {
  title: string;
  type: string;
  materialId?: string;
  storagePath?: string;
};

/** Context the model can use later (materials, knowledge bank). */
export type ChatMaterialContext = {
  id: EntityId;
  name: string;
  excerpt: string;
};

export type ChatFigureContext = {
  name: string;
  page: number;
  path: string;
  mime: string;
  data: string;
};

export type ChatKnowledgeContext = {
  id: EntityId;
  prompt: string;
  answer?: string;
};

export type ChatGenerationContext = {
  projectId: EntityId;
  projectTitle: string;
  projectDescription: string;
  goal: string;
  mode: ChatMode;
  intent?: "ask" | "plan" | "study" | "practice" | "edit" | "append" | "regenerate_one" | "rewrite_sheet";
  artifacts?: ChatArtifact[];
  latestArtifact?: ChatArtifact | null;
  activeArtifact?: {
    kind: string;
    id: string;
    title: string;
    count?: number;
    status?: string;
    progress?: string;
  } | null;
  hasMaterials?: boolean;
  confirmed?: boolean;
  acceptedTool?: AcceptedChatTool;
  priorClarify?: boolean;
  pendingTopic?: string;
  pendingKind?: PendingKind;
  pathTopic?: string;
  hasPath?: boolean;
  inPathThread?: boolean;
  path?: {
    title: string;
    courseTitle: string;
    nodeTitle: string;
    teach?: string;
    outcome: string;
    done: number;
    total: number;
    courseCount: number;
    started?: boolean;
    kind?: "course" | "review";
    nodeStatus?: "todo" | "current" | "ready" | "done";
    nextTitle?: string;
    why?: string;
    inPathThread?: boolean;
  } | null;
  materials: ChatMaterialContext[];
  figures?: ChatFigureContext[];
  knowledgeItems: ChatKnowledgeContext[];
  memories?: ChatMemoryContext[];
  personalization?: string;
  /** Hidden hint on the current exam — never reveal the answer. */
  hintAsk?: boolean;
  /** Hidden Continue after a path bite — ask the check, do not advance. */
  examAsk?: boolean;
  /** Current user / hidden tutor prompt — used to pick 0–2 native block cards. */
  prompt?: string;
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};
