import type { LessonRecipe } from "@/types/lesson";
import type { ExerciseCategory, ExerciseType, ProblemExerciseType, TheoryExerciseType } from "@/types/exercise";
import type { ProjectGoal } from "@/types/goals";

export const PRACTICE_SET_SIZES = [10, 20, 30] as const;
export const FREE_PRACTICE_SET_CAP = 20;
export const EXERCISE_SET_CAP = FREE_PRACTICE_SET_CAP;

export function choosePracticeSetSize(input: { goal?: ProjectGoal | string; isPaid?: boolean } = {}): number {
  const cap = input.isPaid ? 30 : FREE_PRACTICE_SET_CAP;
  let pick = 20;
  if (input.goal === "review") pick = 10;
  if (input.goal === "exam_prep" || input.goal === "practice" || input.goal === "deep_understanding") pick = 30;
  return Math.min(pick, cap);
}

export type PlannedExercise = {
  type: ExerciseType;
  category: ExerciseCategory;
};

export function planExerciseSet(recipe: LessonRecipe, cap = EXERCISE_SET_CAP): PlannedExercise[] {
  const theoryTypes = recipe.theoryTypes.length > 0 ? recipe.theoryTypes : (["mcq"] as TheoryExerciseType[]);
  const problemTypes =
    recipe.problemTypes.length > 0 ? recipe.problemTypes : (["problem_steps"] as Exclude<ProblemExerciseType, "essay">[]);

  const total = Math.max(1, recipe.theoryCount + recipe.problemCount + recipe.essayCount);
  const target = Math.max(1, cap);
  const scale = target / total;

  let theoryN = recipe.theoryCount > 0 ? Math.max(0, Math.round(recipe.theoryCount * scale)) : 0;
  let problemN = recipe.problemCount > 0 ? Math.max(0, Math.round(recipe.problemCount * scale)) : 0;
  let essayN = recipe.essayCount > 0 ? Math.max(0, Math.round(recipe.essayCount * scale)) : 0;

  while (theoryN + problemN + essayN > target) {
    if (theoryN >= problemN && theoryN > (recipe.theoryCount > 0 ? 1 : 0)) theoryN -= 1;
    else if (problemN > (recipe.problemCount > 0 ? 1 : 0)) problemN -= 1;
    else if (essayN > 0) essayN -= 1;
    else break;
  }

  while (theoryN + problemN + essayN < target) {
    if (recipe.problemCount > 0 && problemN <= theoryN) problemN += 1;
    else if (recipe.theoryCount > 0) theoryN += 1;
    else if (recipe.problemCount > 0) problemN += 1;
    else if (recipe.essayCount > 0) essayN += 1;
    else theoryN += 1;
  }

  const plan: PlannedExercise[] = [];
  for (let i = 0; i < theoryN; i += 1) {
    plan.push({ type: theoryTypes[i % theoryTypes.length], category: "theory" });
  }
  for (let i = 0; i < problemN; i += 1) {
    plan.push({ type: problemTypes[i % problemTypes.length], category: "problems" });
  }
  for (let i = 0; i < essayN; i += 1) {
    plan.push({ type: "essay", category: "problems" });
  }
  return plan.slice(0, target);
}
