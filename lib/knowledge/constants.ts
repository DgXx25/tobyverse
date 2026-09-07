import type { ExerciseType } from "@/types/exercise";
import type { KnowledgeItemType, KnowledgeProgressStatus } from "@/types/knowledge";

export const DEFAULT_EASE_FACTOR = 2.5;
export const MIN_EASE_FACTOR = 1.3;

/** Statuses that still need new exposure (not yet known). */
export const NEW_KNOWLEDGE_STATUSES: KnowledgeProgressStatus[] = [
  "not_started",
  "learning",
];

/** Statuses that should not be reused as fresh facts. */
export const ACQUIRED_KNOWLEDGE_STATUSES: KnowledgeProgressStatus[] = [
  "learned",
  "mastered",
];

export const KNOWLEDGE_PROGRESS_STATUS_LABELS: Record<KnowledgeProgressStatus, string> = {
  not_started: "Not started",
  learning: "Learning",
  learned: "Learned",
  mastered: "Mastered",
};

export const KNOWLEDGE_TYPE_LABELS: Record<string, string> = {
  capital: "Capital",
  definition: "Definition",
  formula: "Formula",
  date: "Date",
  vocab: "Vocabulary",
  fact: "Fact",
};

/** Suggested exercise shapes later, per knowledge type. Not used for generation yet. */
export const KNOWLEDGE_TYPE_EXERCISE_HINTS: Record<string, ExerciseType[]> = {
  capital: ["mcq", "fill_blank", "true_false"],
  definition: ["open_short", "mcq", "connect"],
  formula: ["fill_blank", "problem_steps", "mcq"],
  date: ["mcq", "fill_blank", "true_false"],
  vocab: ["mcq", "connect", "fill_blank", "open_short"],
  fact: ["mcq", "true_false", "open_short"],
};

export function exerciseHintsForKnowledgeType(type: KnowledgeItemType): ExerciseType[] {
  return KNOWLEDGE_TYPE_EXERCISE_HINTS[type] ?? ["mcq", "open_short"];
}
