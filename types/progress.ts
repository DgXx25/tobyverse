import type { EntityId, IsoDateString } from "@/types/common";

export type ProgressStatus = "not_started" | "in_progress" | "completed";

export type ExerciseAttempt = {
  id: EntityId;
  userId: EntityId;
  projectId: EntityId;
  lessonId: EntityId | null;
  exerciseId: EntityId;
  answer: unknown;
  isCorrect: boolean | null;
  score: number | null;
  createdAt: IsoDateString | null;
};

export type LessonProgress = {
  id: EntityId;
  userId: EntityId;
  projectId: EntityId;
  lessonId: EntityId;
  completedExerciseIds: EntityId[];
  score: number | null;
  status: ProgressStatus;
  updatedAt: IsoDateString | null;
};
