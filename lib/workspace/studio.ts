import type { AcceptedChatTool } from "@/types/chat";
import type { UiIconName } from "@/components/workspace/ui-icon";

export type StudioTool = "practice" | "quiz" | "flashcards" | "table" | "notes" | "path";

export type StudioRequest = {
  /** Changes on every click so the same tile can be used twice in a row. */
  id: number;
  label: string;
  prompt: string;
  /** Omitted when the notebook has no sources, so the reply stays a normal answer. */
  tool?: AcceptedChatTool;
};

/** What the user sees in chat, the same shape NotebookLM uses. */
export const STUDIO_ASK: Record<StudioTool, string> = {
  practice: "Generate a practice set",
  quiz: "Generate a quiz",
  flashcards: "Generate flashcards",
  table: "Generate a data table",
  notes: "Generate a report",
  path: "Generate a course path",
};

export type StudioTile = {
  id: StudioTool;
  label: string;
  hint: string;
  icon: UiIconName;
  tool: AcceptedChatTool;
  prompt: string;
};

const LANGUAGE = "Write in the language of my sources.";

/**
 * What each Studio tile asks for. They are ordinary requests, sent as the user's own turn,
 * so the answer keeps the usual voice and the result lands in Studio like any other output.
 */
export const STUDIO_TILES: StudioTile[] = [
  {
    id: "practice",
    label: "Practice",
    hint: "Exercises with feedback",
    icon: "practice",
    tool: "create_practice",
    prompt: `Make a practice set from my selected sources. ${LANGUAGE}`,
  },
  {
    id: "quiz",
    label: "Quiz",
    hint: "One check per question",
    icon: "check",
    tool: "create_practice",
    prompt: `Make a short exam-style quiz from my selected sources, one check per question. ${LANGUAGE}`,
  },
  {
    id: "flashcards",
    label: "Flashcards",
    hint: "Terms and meanings",
    icon: "deck",
    tool: "create_sheet",
    prompt: `Make flashcards from my selected sources: a term on one side and its meaning on the other, as clear term cards. ${LANGUAGE}`,
  },
  {
    id: "table",
    label: "Data table",
    hint: "Key facts in a grid",
    icon: "spreadsheet",
    tool: "create_sheet",
    prompt: `Pull the key facts from my selected sources into a clear table. ${LANGUAGE}`,
  },
  {
    id: "notes",
    label: "Study notes",
    hint: "A tidy summary",
    icon: "notes",
    tool: "create_sheet",
    prompt: `Write study notes from my selected sources. ${LANGUAGE}`,
  },
  {
    id: "path",
    label: "Course path",
    hint: "A route through it",
    icon: "plan",
    tool: "create_path",
    prompt: `Map a course path from my selected sources. ${LANGUAGE}`,
  },
];
