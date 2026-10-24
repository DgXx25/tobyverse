import type { AcceptedChatTool } from "@/types/chat";
import type { UiIconName } from "@/components/workspace/ui-icon";
import type { ChatArtifact } from "@/types/chat";

export type StudioTool = "practice" | "quiz" | "flashcards" | "table" | "notes" | "path";

export type StudioRequest = {
  /** Changes on every click so the same tile can be used twice in a row. */
  id: number;
  type: StudioTool;
  label: string;
  prompt: string;
  /** Pins the Studio action to its matching tool instead of relying on model routing. */
  tool?: AcceptedChatTool;
  sourceIds: string[];
  /** Retry saving an already generated result without charging for generation again. */
  retryArtifact?: ChatArtifact;
};

export type StudioResult = { artifact: ChatArtifact; error?: never } | { artifact?: ChatArtifact; error: string };
export type StudioJob = {
  request: StudioRequest;
  phase: "pending" | "complete" | "failed";
  status?: string;
  artifact?: ChatArtifact;
  error?: string;
};

export type StudioSavedArtifact = {
  type: StudioTool;
  artifact: ChatArtifact;
  createdAt: string;
  prompt?: string;
  sourceMaterialIds?: string[];
  removed?: boolean;
};

/** Hidden instruction for a Studio click. The chat thread does not show it. */
export const STUDIO_ASK: Record<StudioTool, string> = {
  practice: "Generate a practice set",
  quiz: "Generate a set of exercises",
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

const STUDIO_META =
  /^(?:Length|Difficulty|Language): .+\.$|^Use my selected sources \(\d+\)\.$|^Use the sources as the topic\.$|^Topic: /;

/** The parameter block Studio used to post as the user's own message. */
export function isStudioConfigPrompt(content: string): boolean {
  const lines = content.replace(/\r\n/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  const asks = new Set(Object.values(STUDIO_ASK));
  if (lines.length === 1) return asks.has(lines[0]);
  if (!asks.has(lines[0])) return false;
  return lines.slice(1).every((line) => STUDIO_META.test(line));
}

const LANGUAGE = "Write in the language of my sources.";

/**
 * What each Studio tile asks the model for. The request stays off the chat thread;
 * the result still lands in Studio.
 */
export const STUDIO_TILES: StudioTile[] = [
  {
    id: "quiz",
    label: "Quiz",
    hint: "Exercises with feedback",
    icon: "check",
    tool: "create_practice",
    prompt: `Make a practice set from my selected sources. ${LANGUAGE}`,
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
