import { isArtifactTool, type ChatToolCall, type ChatToolName } from "@/lib/ai/tools";
import {
  extractAppendCount,
  intentFromTool,
  isMutationIntent,
  promptIsKa,
  wantsPractice,
  wantsSheet,
  wantsImages,
  type ComposerIntent,
} from "@/lib/composer/intent";
import { searchImagesClient, toImageAttach } from "@/lib/images/client";
import { IMAGE_SEARCH_DEFAULT } from "@/lib/images/types";
import { generatePracticeSet } from "@/lib/exercises/generate-set";
import { appendPracticeItems, rewritePracticeItems } from "@/lib/exercises/mutate-client";
import { generateStudySheetFromPrompt, rewriteStudySheetFromPrompt } from "@/lib/study-sheets/generate-client";
import { getStudySheet } from "@/lib/study-sheets/store";
import { activeToChatArtifact } from "@/lib/artifacts/active";
import { localImageHits } from "@/lib/images/local";
import type { ChatArtifact, ChatArtifactKind, ChatAttachment, ChatImageHit, ChatMessage, PendingKind } from "@/types/chat";
import type { ActiveArtifact, Project } from "@/types/project";
import type { Material } from "@/types/material";

export type ChatDispatchContext = {
  tool: ChatToolCall;
  text: string;
  prompt: string;
  project: Project;
  userId: string;
  materials: Material[];
  active: ActiveArtifact | null;
  messages?: Pick<ChatMessage, "artifact">[];
  count?: number;
  pendingKind?: PendingKind | null;
  attachments?: ChatAttachment[];
  onStatus?: (status: string) => void;
};

export type ChatDispatchResult = {
  intent: ComposerIntent;
  content: string;
  artifact?: ChatArtifact | null;
  options?: string[];
  pendingKind?: PendingKind;
  images?: ChatImageHit[];
  suggest?: "practice" | "sheet";
};

export type ChatToolHandler = {
  run: (ctx: ChatDispatchContext) => Promise<ChatDispatchResult>;
  artifactKind?: ChatArtifactKind;
};

function generatePrompt(ctx: ChatDispatchContext): string {
  return ctx.tool.args.topic || ctx.tool.args.instruction || ctx.prompt;
}

function oneChatLine(text: string, fallback: string): string {
  const line = text.trim().split(/\n+/).find((item) => item.trim())?.trim() ?? "";
  return line && line.length <= 80 ? line : fallback;
}

function pendingKindForClarify(ctx: ChatDispatchContext): PendingKind | undefined {
  if (ctx.pendingKind === "sheet" || ctx.pendingKind === "practice" || ctx.pendingKind === "images") {
    return ctx.pendingKind;
  }
  if (wantsSheet(ctx.prompt)) return "sheet";
  if (wantsPractice(ctx.prompt)) return "practice";
  if (wantsImages(ctx.prompt)) return "images";
  return undefined;
}

function imageFailLine(prompt: string): string {
  return promptIsKa(prompt) ? "სურათი ვერ მოიძებნა" : "Couldn't find an image.";
}

function imageFoundLine(prompt: string): string {
  return promptIsKa(prompt) ? "აქ არის სურათები." : "Here are some photos.";
}

export { imageFailLine, imageFoundLine };

function textResult(ctx: ChatDispatchContext, extra?: Partial<ChatDispatchResult>): ChatDispatchResult {
  return {
    intent: intentFromTool(ctx.tool.name),
    content: ctx.text,
    ...extra,
  };
}

function practiceIds(ctx: ChatDispatchContext): string[] {
  const active = ctx.active;
  if (!active) return [];
  if (active.ids?.length) return active.ids;
  const match = [...(ctx.messages ?? [])]
    .reverse()
    .find((item) => item.artifact?.kind === "practice" && item.artifact.id === active.id);
  return match?.artifact?.ids?.length ? match.artifact.ids : [active.id];
}

async function runAnswer(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  return textResult(ctx);
}

async function runClarify(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  return textResult(ctx, {
    content: ctx.text.trim() || ctx.tool.args.question || "",
    options: ctx.tool.args.options ?? [],
    pendingKind: pendingKindForClarify(ctx),
  });
}

async function runSuggestPractice(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  return textResult(ctx, { suggest: "practice" });
}

async function runSuggestSheet(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  return textResult(ctx, { suggest: "sheet" });
}

async function runCreatePractice(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  ctx.onStatus?.("Generating a practice set…");
  const set = await generatePracticeSet({
    project: ctx.project,
    userId: ctx.userId,
    materials: ctx.materials,
    prompt: generatePrompt(ctx),
    count: ctx.count,
    onStatus: ctx.onStatus,
  });
  return {
    intent: "practice",
    content: "Practice set is ready.",
    artifact: {
      kind: "practice",
      id: set.ids[0],
      title: "Practice set",
      count: set.count,
      ids: set.ids,
    },
  };
}

async function runCreateSheet(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  ctx.onStatus?.("Writing");
  const sheet = await generateStudySheetFromPrompt({
    projectId: ctx.project.id,
    userId: ctx.userId,
    projectTitle: ctx.project.title,
    materials: ctx.materials,
    prompt: generatePrompt(ctx),
  });
  if (!sheet.id) throw new Error("Could not save notes.");
  return {
    intent: "study",
    content: oneChatLine(ctx.text, "კონსპექტი"),
    artifact: { kind: "sheet", id: sheet.id, title: sheet.title },
  };
}

async function runEditPractice(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  const active = ctx.active;
  if (!active || active.kind !== "practice_set") throw new Error("Open a set first.");
  const ids = practiceIds(ctx);
  ctx.onStatus?.("Updating…");
  await rewritePracticeItems({
    project: ctx.project,
    userId: ctx.userId,
    ids,
    instruction: ctx.tool.args.instruction || ctx.prompt,
    materials: ctx.materials,
    onStatus: ctx.onStatus,
  });
  return {
    intent: "edit",
    content: `Updated practice set · ${ids.length} items`,
    artifact: {
      kind: "practice",
      id: active.id,
      title: active.title || "Practice set",
      count: ids.length,
      ids,
    },
  };
}

async function runAppendPractice(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  const active = ctx.active;
  if (!active || active.kind !== "practice_set") throw new Error("Open a set first.");
  const ids = practiceIds(ctx);
  const count = ctx.tool.args.count ?? extractAppendCount(ctx.prompt);
  ctx.onStatus?.(`Generating practice · ${count} items`);
  const extra = await appendPracticeItems({
    project: ctx.project,
    userId: ctx.userId,
    materials: ctx.materials,
    prompt: `Add ${count} more items to the current practice set "${active.title}". Same topic. User request: ${ctx.tool.args.instruction || ctx.prompt}`,
    count,
    setIds: ids,
    onStatus: ctx.onStatus,
  });
  const nextIds = [...ids, ...extra];
  return {
    intent: "append",
    content: `Updated practice set · ${nextIds.length} items`,
    artifact: {
      kind: "practice",
      id: active.id,
      title: active.title || "Practice set",
      count: nextIds.length,
      ids: nextIds,
    },
  };
}

async function runSearchImages(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  const query = ctx.tool.args.query?.trim() || ctx.prompt.trim();
  const count = ctx.tool.args.count ?? IMAGE_SEARCH_DEFAULT;
  ctx.onStatus?.("Searching…");
  const local = localImageHits({
    query,
    materials: ctx.materials,
    attachments: ctx.attachments,
    limit: count,
  });
  const seen = new Set(local.map((hit) => hit.thumb || hit.url).filter(Boolean));
  const imageAttaches = await searchImagesClient(query, count);
  const web = imageAttaches.flatMap((hit) => {
    const key = hit.thumb || hit.url;
    if (!key || seen.has(key) || !toImageAttach(hit)) return [];
    seen.add(key);
    return [hit];
  });
  const images = [...local, ...web];
  if (images.length === 0) {
    return { intent: "ask", content: imageFailLine(ctx.prompt), images: [] };
  }
  return {
    intent: "ask",
    content: imageFoundLine(ctx.prompt),
    images,
  };
}

async function runEditSheet(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  const active = ctx.active;
  if (!active) throw new Error("Open a set or sheet first.");
  const sheet = await getStudySheet(ctx.project.id, active.id);
  if (!sheet) throw new Error("Those notes are gone.");
  ctx.onStatus?.("Updating…");
  await rewriteStudySheetFromPrompt({
    projectId: ctx.project.id,
    sheetId: sheet.id,
    projectTitle: ctx.project.title,
    materials: ctx.materials,
    prompt: ctx.tool.args.instruction || ctx.prompt,
    currentBlocks: sheet.blocks,
    currentTitle: sheet.title,
    currentContent: sheet.prose || sheet.content,
  });
  return {
    intent: "rewrite_sheet",
    content: "Updated notes.",
    artifact: activeToChatArtifact({ ...active, status: "ready" }),
  };
}

export const CHAT_TOOL_HANDLERS: Record<ChatToolName, ChatToolHandler> = {
  answer: { run: runAnswer },
  clarify: { run: runClarify },
  suggest_practice: { run: runSuggestPractice },
  suggest_sheet: { run: runSuggestSheet },
  create_practice: { run: runCreatePractice, artifactKind: "practice" },
  edit_practice: { run: runEditPractice, artifactKind: "practice" },
  append_practice: { run: runAppendPractice, artifactKind: "practice" },
  create_sheet: { run: runCreateSheet, artifactKind: "sheet" },
  edit_sheet: { run: runEditSheet, artifactKind: "sheet" },
  search_images: { run: runSearchImages },
};

export function getChatToolHandler(name: ChatToolName): ChatToolHandler | undefined {
  return CHAT_TOOL_HANDLERS[name];
}

export function toolProducesArtifact(name: ChatToolName): boolean {
  return Boolean(CHAT_TOOL_HANDLERS[name]?.artifactKind) || isArtifactTool(name);
}

export function dispatchStatus(intent: ComposerIntent, toolName?: ChatToolName): string {
  if (toolName === "search_images") return "Searching…";
  if (intent === "study" || intent === "rewrite_sheet") return "Writing";
  if (intent === "practice") return "Generating a practice set…";
  if (intent === "plan") return "Writing";
  if (isMutationIntent(intent)) return "Updating…";
  return "Thinking";
}

/** Run the registered handler. Unknown names stay text — never practice. */
export async function dispatchChatTool(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  const handler = CHAT_TOOL_HANDLERS[ctx.tool.name];
  if (!handler) {
    return { intent: "ask", content: ctx.text };
  }
  return handler.run(ctx);
}
