import type { KnowledgeItem, KnowledgeProgressStatus, UserProgress } from "@/types/knowledge";
import {
  ACQUIRED_KNOWLEDGE_STATUSES,
  DEFAULT_EASE_FACTOR,
  NEW_KNOWLEDGE_STATUSES,
} from "@/lib/knowledge/constants";

export function userProgressDocId(userId: string, knowledgeItemId: string): string {
  return `${userId}_${knowledgeItemId}`;
}

export function isAcquiredStatus(status: KnowledgeProgressStatus): boolean {
  return ACQUIRED_KNOWLEDGE_STATUSES.includes(status);
}

export function isNewStatus(status: KnowledgeProgressStatus): boolean {
  return NEW_KNOWLEDGE_STATUSES.includes(status);
}

export function initialUserProgress(input: {
  userId: string;
  knowledgeItemId: string;
  projectId?: string | null;
}): UserProgress {
  return {
    id: userProgressDocId(input.userId, input.knowledgeItemId),
    userId: input.userId,
    knowledgeItemId: input.knowledgeItemId,
    projectId: input.projectId ?? null,
    status: "not_started",
    correctCount: 0,
    incorrectCount: 0,
    lastSeen: null,
    nextReview: null,
    easeFactor: DEFAULT_EASE_FACTOR,
    updatedAt: null,
  };
}

export type KnowledgeSelectionFilter = {
  userId: string;
  projectId?: string | null;
  category?: string;
  type?: string;
  /** Skip facts the user already learned or mastered. */
  excludeAcquired?: boolean;
  /** Keep learned items whose nextReview is due. */
  includeDueReviews?: boolean;
  now?: Date;
};

export function isDueForReview(progress: UserProgress, now = new Date()): boolean {
  if (!progress.nextReview) {
    return false;
  }

  return new Date(progress.nextReview).getTime() <= now.getTime();
}

/**
 * Whether this fact should be picked for a new exercise.
 * Later generation should call this instead of inventing the same prompt again.
 */
export function isEligibleForNewExercise(
  progress: UserProgress | null,
  options: Pick<KnowledgeSelectionFilter, "excludeAcquired" | "includeDueReviews" | "now"> = {},
): boolean {
  const excludeAcquired = options.excludeAcquired ?? true;
  const includeDueReviews = options.includeDueReviews ?? true;
  const now = options.now ?? new Date();

  if (!progress || isNewStatus(progress.status)) {
    return true;
  }

  if (excludeAcquired && isAcquiredStatus(progress.status)) {
    return includeDueReviews && isDueForReview(progress, now);
  }

  return true;
}

export function matchesKnowledgeFilter(
  item: KnowledgeItem,
  filter: Pick<KnowledgeSelectionFilter, "projectId" | "category" | "type">,
): boolean {
  if (filter.projectId !== undefined) {
    const scoped = item.projectId === filter.projectId || item.projectId === null;
    if (!scoped) {
      return false;
    }
  }

  if (filter.category && item.category !== filter.category) {
    return false;
  }

  if (filter.type && item.type !== filter.type) {
    return false;
  }

  return true;
}

export function selectEligibleKnowledgeItems(
  items: KnowledgeItem[],
  progressByItemId: ReadonlyMap<string, UserProgress>,
  filter: KnowledgeSelectionFilter,
): KnowledgeItem[] {
  return items.filter((item) => {
    if (!matchesKnowledgeFilter(item, filter)) {
      return false;
    }

    return isEligibleForNewExercise(progressByItemId.get(item.id) ?? null, filter);
  });
}
