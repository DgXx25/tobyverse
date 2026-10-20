import type { EntityId, IsoDateString } from "@/types/common";
import type { ChatMode } from "@/types/chat";
import type { ProjectGoal } from "@/types/goals";
import type { LessonRecipe } from "@/types/lesson";

export const ACTIVE_ARTIFACT_KINDS = ["practice_set", "study_sheet", "study_path"] as const;
export type KnownActiveArtifactKind = (typeof ACTIVE_ARTIFACT_KINDS)[number];
/** Known kinds plus a generic { kind, id, title } for future tools. */
export type ActiveArtifactKind = KnownActiveArtifactKind | (string & {});
export type ActiveArtifactStatus = "ready" | "open" | "in_progress";

export type ActiveArtifact = {
  kind: ActiveArtifactKind;
  id: string;
  status: ActiveArtifactStatus;
  title: string;
  count?: number;
  ids?: string[];
};

export type Project = {
  id: EntityId;
  title: string;
  description: string;
  /** A user rename always takes precedence over generated titles. */
  manualTitle?: boolean;
  userId: EntityId;
  goal: ProjectGoal;
  /** Frozen lesson composition for this project's goal. */
  recipe: LessonRecipe;
  preferredChatMode: ChatMode;
  activeArtifact: ActiveArtifact | null;
  /** Durable subject facts (book, weak topics, exam date). Not user personalization. */
  projectMemory: string[];
  /** Legacy flag from the chat-list era. Every project is a notebook now. */
  listed?: boolean;
  /** Symbol shown on the notebook card and in the top bar. */
  icon?: string;
  /** Accent hex for that symbol. */
  iconColor?: string;
  /** Optional group, e.g. "Study". Notebooks without one show under All. */
  folder?: string;
  hidden?: boolean;
  createdAt: IsoDateString | null;
  updatedAt: IsoDateString | null;
};

export type CreateProjectInput = {
  id?: EntityId;
  title: string;
  description?: string;
  userId: EntityId;
  goal?: ProjectGoal;
  preferredChatMode?: ChatMode;
  listed?: boolean;
  icon?: string;
  folder?: string;
  /** Default true. Listed project homes start empty until "New chat". */
  createThread?: boolean;
};
