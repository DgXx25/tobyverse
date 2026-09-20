import type { EntityId, IsoDateString } from "@/types/common";

export const ANALYTICS_EVENT_TYPES = [
  "session_start",
  "project_created",
  "chat_message_sent",
  "hint_mode_used",
  "exercise_started",
  "exercise_completed",
  "exercise_correct",
  "exercise_incorrect",
  "study_sheet_opened",
  "material_uploaded",
  "study_sheet_generated",
  "path_generated",
  "returned_same_day",
  "returned_next_day",
  "time_spent_seconds",
  "dropped_off",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export const DROPOFF_VALUES = ["chat", "exercise", "project"] as const;
export type DropoffValue = (typeof DROPOFF_VALUES)[number];

/** Tiny analytics ping. Never store chat text or model output here. */
export type AnalyticsEvent = {
  id: EntityId;
  userId: EntityId;
  projectId: EntityId | null;
  type: AnalyticsEventType;
  value: number | string;
  createdAt: IsoDateString;
};

export type TrackAnalyticsInput = {
  userId: EntityId;
  projectId?: EntityId | null;
  type: AnalyticsEventType;
  value?: number | string;
};
