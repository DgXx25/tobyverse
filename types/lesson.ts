import type { EntityId, IsoDateString } from "@/types/common";
import type { ProblemExerciseType, TheoryExerciseType } from "@/types/exercise";
import type { ProjectGoal } from "@/types/goals";

export type LessonStatus = "draft" | "ready" | "in_progress" | "completed";

/**
 * How a lesson is composed. Counts are independent:
 * theory = category A, problems = step/case/analysis, essays counted separately.
 */
export type LessonRecipe = {
  id: string;
  goal: ProjectGoal;
  theoryCount: number;
  problemCount: number;
  essayCount: number;
  theoryTypes: TheoryExerciseType[];
  problemTypes: Exclude<ProblemExerciseType, "essay">[];
};

export type Lesson = {
  id: EntityId;
  projectId: EntityId;
  userId: EntityId;
  title: string;
  topic: string;
  status: LessonStatus;
  recipe: LessonRecipe;
  exerciseIds: EntityId[];
  createdAt: IsoDateString | null;
  updatedAt: IsoDateString | null;
};
