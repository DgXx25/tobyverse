import type { EntityId, IsoDateString } from "@/types/common";
import type { ExerciseType } from "@/types/exercise";

export const CHAT_MODES = ["normal", "socratic"] as const;

export type ChatMode = (typeof CHAT_MODES)[number];

export type ChatRole = "user" | "assistant" | "system";

export const CHAT_ARTIFACT_KINDS = ["plan", "sheet", "practice"] as const;

export type ChatArtifactKind = (typeof CHAT_ARTIFACT_KINDS)[number];

export type ChatArtifact = {
  kind: ChatArtifactKind;
  id: string;
  title: string;
  count?: number;
  ids?: string[];
};

export type ChatThread = {
  id: EntityId;
  projectId: EntityId;
  userId: EntityId;
  lessonId: EntityId | null;
  exerciseId: EntityId | null;
  mode: ChatMode;
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
  createdAt: IsoDateString | null;
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
    kind: "practice_set" | "study_sheet";
    id: string;
    title: string;
    count?: number;
    status?: string;
    progress?: string;
  } | null;
  hasMaterials?: boolean;
  confirmed?: boolean;
  acceptedTool?: "create_practice" | "create_sheet";
  materials: ChatMaterialContext[];
  figures?: ChatFigureContext[];
  knowledgeItems: ChatKnowledgeContext[];
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};
