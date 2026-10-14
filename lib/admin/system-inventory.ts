import { CHAT_TOOLS, INTERCEPT_ONLY_CHAT_TOOLS } from "@/lib/ai/tools";
import { COMPOSER_INTENTS } from "@/lib/composer/intent";
import { CHAT_MODE_INSTRUCTIONS, CHAT_MODE_TOOLS } from "@/lib/core/chat-modes";
import { PROJECT_GOALS } from "@/types/goals";
import { PROJECT_GOAL_LABELS } from "@/lib/core/constants";
import { recipeForGoal } from "@/lib/core/recipes";
import { CHAT_BLOCK_KINDS } from "@/lib/blocks/kinds";
import { listExerciseTemplates } from "@/lib/exercises/templates";
import { COLLECTIONS } from "@/lib/firestore";

export const SYSTEM_INVENTORY = {
  tools: [...CHAT_TOOLS],
  modes: Object.entries(CHAT_MODE_TOOLS).map(([name, tools]) => ({
    name,
    instructions: CHAT_MODE_INSTRUCTIONS[name as keyof typeof CHAT_MODE_INSTRUCTIONS],
    tools: [...tools],
  })),
  intercepts: [...INTERCEPT_ONLY_CHAT_TOOLS],
  intents: [...COMPOSER_INTENTS],
  goals: PROJECT_GOALS.map((goal) => ({ goal, label: PROJECT_GOAL_LABELS[goal], recipe: recipeForGoal(goal) })),
  blocks: CHAT_BLOCK_KINDS.map(({ id, keys, when }) => ({ id, keys, when })),
  exerciseTypes: listExerciseTemplates().map(({ type, category, label }) => ({ type, category, label })),
  collections: Object.entries(COLLECTIONS).map(([key, name]) => ({ key, name })),
} as const;
