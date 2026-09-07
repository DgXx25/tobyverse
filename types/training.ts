import type { EntityId, IsoDateString } from "@/types/common";

export const TRAINING_CONTEXT_TYPES = ["chat", "exercise", "audit"] as const;
export type TrainingContextType = (typeof TRAINING_CONTEXT_TYPES)[number];

export const TRAINING_SIGNALS = ["good", "bad", "edited", "abandoned", "completed"] as const;
export type TrainingSignalKind = (typeof TRAINING_SIGNALS)[number];

/** Compact fine-tuning breadcrumb. No full prompts or completions. */
export type TrainingSignal = {
  id: EntityId;
  userId: EntityId;
  projectId: EntityId | null;
  contextType: TrainingContextType;
  signal: TrainingSignalKind;
  shortHash: string;
  itemId: EntityId | null;
  createdAt: IsoDateString;
};
