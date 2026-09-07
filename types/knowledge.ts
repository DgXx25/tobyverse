import type { EntityId, IsoDateString } from "@/types/common";

export const KNOWLEDGE_ITEM_TYPES = [
  "capital",
  "definition",
  "formula",
  "date",
  "vocab",
  "fact",
] as const;

export type KnownKnowledgeItemType = (typeof KNOWLEDGE_ITEM_TYPES)[number];

/** Open-ended so any subject can add its own type without a schema change. */
export type KnowledgeItemType = KnownKnowledgeItemType | (string & {});

export const KNOWLEDGE_CATEGORIES = [
  "geography_capitals",
  "biology_terms",
  "law_articles",
] as const;

export type KnownKnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];
export type KnowledgeCategory = KnownKnowledgeCategory | (string & {});

export const KNOWLEDGE_PROGRESS_STATUSES = [
  "not_started",
  "learning",
  "learned",
  "mastered",
] as const;

export type KnowledgeProgressStatus = (typeof KNOWLEDGE_PROGRESS_STATUSES)[number];

export type KnowledgeItemMetadata = {
  tags?: string[];
  difficulty?: 1 | 2 | 3 | 4 | 5;
  language?: string;
  source?: string;
  aliases?: string[];
};

export type KnowledgeItem = {
  id: EntityId;
  /** `null` = global bank, shared across projects. */
  projectId: EntityId | null;
  category: KnowledgeCategory;
  type: KnowledgeItemType;
  prompt: string;
  answer: string;
  metadata: KnowledgeItemMetadata;
  createdAt: IsoDateString | null;
};

export type CreateKnowledgeItemInput = {
  projectId?: EntityId | null;
  category: KnowledgeCategory;
  type: KnowledgeItemType;
  prompt: string;
  answer: string;
  metadata?: KnowledgeItemMetadata;
};

export type UserProgress = {
  id: EntityId;
  userId: EntityId;
  knowledgeItemId: EntityId;
  /** Denormalized from the item, for project-scoped queries. */
  projectId: EntityId | null;
  status: KnowledgeProgressStatus;
  correctCount: number;
  incorrectCount: number;
  lastSeen: IsoDateString | null;
  nextReview: IsoDateString | null;
  easeFactor: number;
  updatedAt: IsoDateString | null;
};
