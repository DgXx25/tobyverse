import type { EntityId, IsoDateString } from "@/types/common";
import type { ChatMode } from "@/types/chat";
import type { ProjectGoal } from "@/types/goals";
import type { LessonRecipe } from "@/types/lesson";

export const ACTIVE_ARTIFACT_KINDS = ["practice_set", "study_sheet"] as const;
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
  userId: EntityId;
  goal: ProjectGoal;
  /** Frozen lesson composition for this project's goal. */
  recipe: LessonRecipe;
  preferredChatMode: ChatMode;
  activeArtifact: ActiveArtifact | null;
  createdAt: IsoDateString | null;
  updatedAt: IsoDateString | null;
};

export type CreateProjectInput = {
  id?: EntityId;
  title: string;
  description?: string;
  userId: EntityId;
  goal?: ProjectGoal;
};
