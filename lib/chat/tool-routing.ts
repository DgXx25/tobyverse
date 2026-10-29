import type { ChatToolCall } from "@/lib/ai/tools";
import { isNoteEditRequest } from "@/lib/notes/plain";
import {
  extractTopic,
  fallbackChatTool,
  forcedCreateTool,
  gateChatTool,
  imageClarifyQuestion,
  pathClarifyQuestion,
  practiceClarifyQuestion,
  sheetClarifyQuestion,
  wantsImages,
  wantsPlainNote,
} from "@/lib/composer/intent";
import type { AcceptedChatTool, ChatMode, PendingKind } from "@/types/chat";

export type ToolRoutingInput = {
  prompt: string;
  mode: ChatMode;
  accepted?: AcceptedChatTool;
  hasMaterials?: boolean;
  priorClarify?: boolean;
  pendingTopic?: string | null;
  pendingKind?: PendingKind | null;
  active?: { kind: string; id: string; noteKind?: "note" | "study" } | null;
  pathTopic?: string;
  projectTitle?: string;
  hasPath?: boolean;
  pathStarted?: boolean;
};

/** Explicit actions pin the native tool so a save request cannot become a prose claim. */
export function forcedToolForRequest(input: ToolRoutingInput): ChatToolCall | null {
  const accepted = input.accepted;
  // Image requests are explicit tool intents. Pin the search before generation
  // so a model cannot answer from unrelated project context or apologize instead.
  if (!accepted && wantsImages(input.prompt)) {
    return { name: "search_images", args: { query: input.prompt.trim() } };
  }
  if (!accepted && wantsPlainNote(input.prompt)) {
    const editing = input.active?.kind === "study_sheet" && isNoteEditRequest(input.prompt);
    return { name: editing ? input.active?.noteKind === "note" ? "edit_note" : "edit_sheet" : "create_note", args: { instruction: input.prompt, ...(editing ? { id: input.active!.id } : {}) } };
  }
  if (!accepted) return null;
  if (accepted === "create_path" && input.mode !== "teacher") return null;
  if (accepted === "start_path" && input.mode !== "teacher") return null;

  const prompt = input.prompt.trim();
  if (accepted === "create_note") return prompt
    ? { name: "create_note", args: { instruction: prompt } }
    : { name: "clarify", args: { question: "What should I save in the note?" } };
  const topic = extractTopic(prompt) ?? input.pendingTopic ?? input.pathTopic ?? undefined;
  const hasSubject = Boolean(topic || input.hasMaterials);
  if (!hasSubject) {
    const question =
      accepted === "create_sheet"
        ? sheetClarifyQuestion(prompt)
        : accepted === "create_practice"
          ? practiceClarifyQuestion(prompt)
          : accepted === "create_path"
            ? pathClarifyQuestion(prompt)
            : imageClarifyQuestion(prompt);
    return { name: "clarify", args: { question } };
  }
  if (accepted === "start_path") return { name: "start_path", args: {} };
  if (accepted === "search_images") return { name: "search_images", args: { query: prompt || topic } };
  return { name: accepted, args: { topic } };
}

/** Keyword and active-artifact routing runs only after a provider returned zero tool calls. */
export function fallbackToolAfterProvider(input: ToolRoutingInput): ChatToolCall {
  const immediate = forcedCreateTool({
    prompt: input.prompt,
    hasMaterials: input.hasMaterials,
    priorClarify: input.priorClarify,
    pendingTopic: input.pendingTopic,
    pendingKind: input.pendingKind,
    accepted: input.accepted,
    pathTopic: input.pathTopic,
    projectTitle: input.projectTitle,
  });
  const raw = immediate ?? fallbackChatTool({
    prompt: input.prompt,
    active: input.active,
    accepted: input.accepted,
    priorClarify: input.priorClarify,
    pendingTopic: input.pendingTopic,
    pendingKind: input.pendingKind,
    pathTopic: input.pathTopic,
    projectTitle: input.projectTitle,
    hasPath: input.hasPath,
    pathStarted: input.pathStarted,
  });
  return gateChatTool({
    tool: raw,
    prompt: input.prompt,
    hasMaterials: input.hasMaterials,
    priorClarify: input.priorClarify,
    pendingTopic: input.pendingTopic,
    pendingKind: input.pendingKind,
    active: input.active,
    accepted: input.accepted,
    pathTopic: input.pathTopic,
    projectTitle: input.projectTitle,
    hasPath: input.hasPath,
    pathStarted: input.pathStarted,
    keywordFallback: true,
    mode: input.mode,
  });
}
