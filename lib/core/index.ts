export {
  DEFAULT_PROJECT_GOAL,
  PROJECT_GOAL_LABELS,
  CHAT_MODE_LABELS,
  DEFAULT_CHAT_THREAD_ID,
  PROJECT_TABS,
} from "@/lib/core/constants";
export { recipeForGoal, recipeTotals } from "@/lib/core/recipes";
export {
  preferredChatModeForGoal,
  CHAT_MODE_INSTRUCTIONS,
  CHAT_MODE_TOOLS,
  chatModeTools,
  chatModeSendsToolDeclarations,
  chatSystemInstruction,
  asChatMode,
  isChatMode,
} from "@/lib/core/chat-modes";
export {
  userProgressDocId,
  isEligibleForNewExercise,
  selectEligibleKnowledgeItems,
} from "@/lib/knowledge";
