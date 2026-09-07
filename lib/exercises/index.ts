export {
  getExerciseTemplate,
  listExerciseTemplates,
  templatesByCategory,
  isTheoryType,
  isProblemType,
  isSupportedExerciseType,
  exerciseTypeLabel,
  emptyPayload,
  registerExerciseTemplate,
} from "@/lib/exercises/templates";
export {
  planExerciseSet,
  planPracticeSet,
  planExerciseSetFromRecipe,
  practiceFamilyForTopic,
  practiceFamilyFromTypes,
  choosePracticeSetSize,
  EXERCISE_SET_CAP,
  FREE_PRACTICE_SET_CAP,
  PRACTICE_SET_SIZES,
  GENERABLE_EXERCISE_TYPES,
  CLICK_FIRST_TYPES,
  type PracticeFamily,
} from "@/lib/exercises/plan";
export { gradeObjective, isObjectiveType, isProblemTypeForHints } from "@/lib/exercises/grade";
export {
  createExercise,
  getExercise,
  updateExercise,
  subscribeExercises,
  listExercises,
  deleteExercise,
  exerciseStem,
  type ProjectExercise,
} from "@/lib/exercises/store";
