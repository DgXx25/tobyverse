export {
  DEFAULT_EASE_FACTOR,
  MIN_EASE_FACTOR,
  NEW_KNOWLEDGE_STATUSES,
  ACQUIRED_KNOWLEDGE_STATUSES,
  KNOWLEDGE_PROGRESS_STATUS_LABELS,
  KNOWLEDGE_TYPE_LABELS,
  KNOWLEDGE_TYPE_EXERCISE_HINTS,
  exerciseHintsForKnowledgeType,
} from "@/lib/knowledge/constants";
export {
  userProgressDocId,
  isAcquiredStatus,
  isNewStatus,
  initialUserProgress,
  isDueForReview,
  isEligibleForNewExercise,
  matchesKnowledgeFilter,
  selectEligibleKnowledgeItems,
  type KnowledgeSelectionFilter,
} from "@/lib/knowledge/selection";
export { listKnowledgeForProject } from "@/lib/knowledge/store";
