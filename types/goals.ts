export const PROJECT_GOALS = [
  "exam_prep",
  "understand_topic",
  "deep_understanding",
  "practice",
  "review",
] as const;

export type ProjectGoal = (typeof PROJECT_GOALS)[number];
