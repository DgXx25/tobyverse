import type { ExerciseCategory, ExerciseType } from "@/types/exercise";
import type { LessonRecipe } from "@/types/lesson";
import type { ProjectGoal } from "@/types/goals";

export const PRACTICE_SET_MIN = 8;
export const PRACTICE_SET_CAP = 10;
export const PRACTICE_SET_SIZES = [10] as const;
export const FREE_PRACTICE_SET_CAP = PRACTICE_SET_CAP;
export const EXERCISE_SET_CAP = PRACTICE_SET_CAP;

export type PracticeFamily = "recall" | "procedure" | "writing";

export const GENERABLE_EXERCISE_TYPES = ["mcq", "connect", "problem_steps", "open_short", "analysis", "essay"] as const;
export type GenerableExerciseType = (typeof GENERABLE_EXERCISE_TYPES)[number];

export function isGenerableExerciseType(type: string): type is GenerableExerciseType {
  return (GENERABLE_EXERCISE_TYPES as readonly string[]).includes(type);
}

/** Click-first types for recall / one-word facts (capitals, terms). Never true_false or open_short. */
export const CLICK_FIRST_TYPES: ExerciseType[] = ["mcq", "connect"];

export function choosePracticeSetSize(_input: { goal?: ProjectGoal | string } = {}): number {
  return PRACTICE_SET_CAP;
}

export function practiceSetBounds(count: number): { requested: number; minAccept: number } {
  const requested = Math.min(PRACTICE_SET_CAP, Math.max(1, Math.floor(count)));
  const minAccept = requested >= PRACTICE_SET_MIN ? PRACTICE_SET_MIN : requested;
  return { requested, minAccept };
}

export type PlannedExercise = {
  type: ExerciseType;
  category: ExerciseCategory;
};

const WRITING_HINT =
  /essay|ესე|analysis|ანალიზ|case study|შემთხვევ|discuss|განიხილ|write about|დაწერ|compare and contrast|argument|რუბრიკ/i;
const PROCEDURE_HINT =
  /algebra|ალგებრ|math|მათემატიკ|equation|განტოლებ|solve|ამოხსნ|calculus|წარმოებულ|physics|ფიზიკ|step by step|ნაბიჯ|problem set|ამოცან/i;
const RECALL_HINT =
  /capital|დედაქალაქ|country|ქვეყან|geography|გეოგრაფ|flag|დროშ|term|ტერმინ|definition|განმარტ/i;

export function practiceFamilyForTopic(topic: string): PracticeFamily {
  const text = topic.trim();
  if (!text) return "recall";
  if (WRITING_HINT.test(text)) return "writing";
  if (PROCEDURE_HINT.test(text)) return "procedure";
  if (RECALL_HINT.test(text)) return "recall";
  return "recall";
}

export function practiceFamilyFromTypes(types: Array<ExerciseType | "unsupported">): PracticeFamily {
  const usable = types.filter((type): type is ExerciseType => type !== "unsupported");
  const writing = usable.filter((type) => type === "essay" || type === "analysis" || type === "open_short" || type === "case_tree").length;
  const procedure = usable.filter((type) => type === "problem_steps").length;
  const recall = usable.filter((type) => type === "mcq" || type === "connect").length;
  if (procedure > 0 && procedure >= writing && procedure >= recall) return "procedure";
  if (writing > recall) return "writing";
  return "recall";
}

function planFromParts(
  parts: { type: ExerciseType; category: ExerciseCategory; weight: number }[],
  cap: number,
): PlannedExercise[] {
  const target = Math.max(1, cap);
  const weightSum = parts.reduce((sum, part) => sum + part.weight, 0) || 1;
  const counts: number[] = parts.map((part) => Math.max(0, Math.round((part.weight / weightSum) * target)));
  let total = counts.reduce((sum, n) => sum + n, 0);
  while (total < target) {
    counts[0] += 1;
    total += 1;
  }
  while (total > target) {
    const idx = counts.reduce((best, n, i) => (n >= counts[best] ? i : best), 0);
    if (counts[idx] <= 0) break;
    counts[idx] -= 1;
    total -= 1;
  }
  if (total <= 0) counts[0] = target;

  const remaining = [...counts];
  const plan: PlannedExercise[] = [];
  while (plan.length < target) {
    let added = false;
    for (let i = 0; i < parts.length; i += 1) {
      const burst = i === 0 ? 2 : 1;
      for (let n = 0; n < burst && remaining[i] > 0 && plan.length < target; n += 1) {
        plan.push({ type: parts[i].type, category: parts[i].category });
        remaining[i] -= 1;
        added = true;
      }
    }
    if (!added) break;
  }
  return plan;
}

export function planPracticeSet(family: PracticeFamily, cap = EXERCISE_SET_CAP): PlannedExercise[] {
  if (family === "procedure") {
    return planFromParts(
      [
        { type: "mcq", category: "theory", weight: 7 },
        { type: "problem_steps", category: "problems", weight: 3 },
      ],
      cap,
    );
  }
  if (family === "writing") {
    return planFromParts(
      [
        { type: "open_short", category: "theory", weight: 4 },
        { type: "analysis", category: "problems", weight: 3 },
        { type: "essay", category: "problems", weight: 3 },
      ],
      cap,
    );
  }
  return planFromParts(
    [
      { type: CLICK_FIRST_TYPES[0], category: "theory", weight: 7 },
      { type: CLICK_FIRST_TYPES[1], category: "theory", weight: 3 },
    ],
    cap,
  );
}

/** Topic-driven click-first mix. Never true_false. Recall facts never open_short. */
export function planExerciseSet(topic: string, cap = EXERCISE_SET_CAP): PlannedExercise[] {
  return planPracticeSet(practiceFamilyForTopic(topic), cap);
}

/** Kept for goal recipes that still exist on the project. Not used for new sets. */
export function planExerciseSetFromRecipe(recipe: LessonRecipe, cap = EXERCISE_SET_CAP): PlannedExercise[] {
  return planPracticeSet(practiceFamilyForTopic(recipe.goal), cap);
}
