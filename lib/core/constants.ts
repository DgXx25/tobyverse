import type { ChatMode } from "@/types/chat";
import type { ProjectGoal } from "@/types/goals";
import {
  PROBLEM_EXERCISE_TYPES,
  THEORY_EXERCISE_TYPES,
} from "@/types/exercise";

export const DEFAULT_PROJECT_GOAL: ProjectGoal = "understand_topic";

export const PROJECT_GOAL_LABELS: Record<ProjectGoal, string> = {
  exam_prep: "Exam preparation with problems",
  understand_topic: "Understand the topic",
  deep_understanding: "Deep understanding",
  practice: "Practice problems",
  review: "Quick review",
};

export const CHAT_MODE_LABELS: Record<ChatMode, string> = {
  normal: "Normal",
  socratic: "Socratic (hints only)",
};

export const DEFAULT_CHAT_THREAD_ID = "main";

export const PROJECT_TABS = [
  { id: "chat", label: "Chat", enabled: true },
  { id: "materials", label: "Materials", enabled: true },
  { id: "sheets", label: "Notes", enabled: true },
  { id: "exercises", label: "Exercises", enabled: true },
  { id: "settings", label: "Settings", enabled: true },
] as const;

export type ProjectTabId = (typeof PROJECT_TABS)[number]["id"];

export const THEORY_TYPES = THEORY_EXERCISE_TYPES;
export const PROBLEM_TYPES = PROBLEM_EXERCISE_TYPES;
