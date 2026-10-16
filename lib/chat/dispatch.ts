import { chatToolDefinition, isArtifactTool, type ChatToolCall, type ChatToolName } from "@/lib/ai/tools";
import {
  extractAppendCount,
  intentFromTool,
  isMutationIntent,
  practiceModeOf,
  wantsPractice,
  wantsSheet,
  wantsImages,
  wantsPath,
  pathKindOf,
  promptIsKa,
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
import { stripArtifactMarkup } from "@/lib/composer/memory";
import { stripTrailingCheck, splitTeachingExam, requestedChatExercise } from "@/lib/chat/prompt-ask";
import { generatePathFromPrompt } from "@/lib/paths/generate-client";
import {
  bindPracticeSet,
  bindSheet,
  findNode,
  markNodeDone,
  nodeTeach,
  pathArtifactCount,
  pathIsStarted,
  progressCounts,
  restartPath,
} from "@/lib/paths/model";
import { getLatestPath, patchStudyPath } from "@/lib/paths/store";
import { pathThreadId, pathThreadTitle, ensureChatThread } from "@/lib/chats";
import type { ChatArtifact, ChatArtifactKind, ChatAttachment, ChatImageHit, ChatMessage, PendingKind } from "@/types/chat";
import type { ActiveArtifact, Project } from "@/types/project";
import type { Material } from "@/types/material";
import type { PathCourse, StudyPath } from "@/types/path";
import type { VisualBlock } from "@/types/visual";

export type ChatDispatchContext = {
  tool: ChatToolCall;
  text: string;
  prompt: string;
  project: Project;
  userId: string;
  materials: Material[];
  active: ActiveArtifact | null;
  path?: StudyPath | null;
  threadId?: string;
  messages?: Pick<ChatMessage, "artifact">[];
  count?: number;
  pendingKind?: PendingKind | null;
  attachments?: ChatAttachment[];
  /** Completed server image search, including an empty result; undefined uses the legacy client fallback. */
  imageSearchResults?: ChatImageHit[];
  onStatus?: (status: string) => void;
  onNotesEvent?: (event: { status?: string | null; title?: string; block?: VisualBlock; blocks?: VisualBlock[]; sheetId?: string }) => void;
  onPathEvent?: (event: { status?: string | null; title?: string; courses?: PathCourse[]; pathId?: string }) => void;
  signal?: AbortSignal;
  hintAsk?: boolean;
  examAsk?: boolean;
};

export type ChatDispatchResult = {
  intent: ComposerIntent;
  content: string;
  artifact?: ChatArtifact | null;
  options?: string[];
  pendingKind?: PendingKind;
  images?: ChatImageHit[];
  suggest?: "practice" | "exam" | "sheet" | "path";
  leadTopic?: string;
  leadTeach?: string;
  promptAsk?: { question: string; options?: string[] };
  openThreadId?: string;
  blocks?: VisualBlock[];
};

export type ChatToolHandler = {
  run: (ctx: ChatDispatchContext) => Promise<ChatDispatchResult>;
  artifactKind?: ChatArtifactKind;
};

function generatePrompt(ctx: ChatDispatchContext): string {
  const explicit = ctx.tool.args.topic?.trim();
  if (explicit) return explicit;
  const current = ctx.path ? findNode(ctx.path, ctx.path.currentNodeId)?.node.title.trim() : "";
  return current || ctx.tool.args.instruction || ctx.prompt;
}

function oneChatLine(text: string, fallback: string): string {
  const cleaned = stripArtifactMarkup(text);
  const line = cleaned.split(/\n+/).find((item) => item.trim())?.trim() ?? "";
  return line && line.length <= 80 ? line : fallback;
}

function pendingKindForClarify(ctx: ChatDispatchContext): PendingKind | undefined {
  if (
    ctx.pendingKind === "sheet" ||
    ctx.pendingKind === "practice" ||
    ctx.pendingKind === "images" ||
    ctx.pendingKind === "path"
  ) {
    return ctx.pendingKind;
  }
  if (wantsSheet(ctx.prompt)) return "sheet";
  if (wantsPractice(ctx.prompt)) return "practice";
  if (wantsPath(ctx.prompt)) return "path";
  if (wantsImages(ctx.prompt)) return "images";
  return undefined;
}

export const CREATING_NOTES_STATUS = "Creating notes…";
export const ANALYSING_MATERIAL_STATUS = "Analysing material…";

export function analysingStatus(items: Array<{ type?: string }> | undefined): string {
  const list = items ?? [];
  if (list.length === 0) return ANALYSING_MATERIAL_STATUS;
  let urls = 0;
  let files = 0;
  for (const item of list) {
    if ((item.type || "").toLowerCase() === "url") urls += 1;
    else files += 1;
  }
  const parts: string[] = [];
  if (files) parts.push(files === 1 ? "1 file" : `${files} files`);
  if (urls) parts.push(urls === 1 ? "1 link" : `${urls} links`);
  return `Reading ${parts.join(", ")}…`;
}

function imageFailLine(_prompt: string): string {
  return "Couldn't find an image.";
}

function imageFoundLine(_prompt: string): string {
  return "Here are some photos.";
}

function photoCaption(text: string, fallback: string): string {
  const clean = stripArtifactMarkup(text).trim();
  return clean || fallback;
}

export { imageFailLine, imageFoundLine };

function textResult(ctx: ChatDispatchContext, extra?: Partial<ChatDispatchResult>): ChatDispatchResult {
  return {
    intent: intentFromTool(ctx.tool.name),
    content: stripArtifactMarkup(ctx.text),
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

function promptAskFromTool(ctx: ChatDispatchContext): ChatDispatchResult["promptAsk"] {
  if (ctx.hintAsk || !requestedChatExercise(ctx.prompt, ctx.examAsk)) return undefined;
  const question = ctx.tool.args.question?.trim();
  if (!question) return undefined;
  return { question, options: ctx.tool.args.options };
}

async function runAnswer(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  if (ctx.hintAsk) return textResult(ctx);
  const raw = stripArtifactMarkup(ctx.text);
  if (!requestedChatExercise(ctx.prompt, ctx.examAsk)) return textResult(ctx, { content: raw });
  const { taught, exam } = splitTeachingExam(raw, ctx.tool.args.question);
  const fromTool = promptAskFromTool(ctx);
  const blank = ctx.examAsk && !exam && !fromTool && looksLikeBlank(raw) ? raw.trim() : undefined;
  const promptAsk = exam
    ? { question: exam, options: ctx.tool.args.options }
    : fromTool ?? (blank ? { question: blank, options: ctx.tool.args.options } : undefined);
  if (ctx.examAsk) {
    if (!promptAsk) return textResult(ctx, { content: taught || raw });
    return textResult(ctx, { content: "", promptAsk });
  }
  if (!promptAsk) return textResult(ctx, { content: taught || raw });
  return textResult(ctx, {
    content: taught,
    promptAsk,
  });
}

async function runIllustrate(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  return textResult(ctx, { blocks: ctx.tool.args.blocks ?? [] });
}

function looksLikeBlank(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 280) return false;
  return /_{2,}|……|\(\s*[a-z]+(?:\/[a-z]+)?\s*\)/i.test(t);
}

async function runClarify(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  return textResult(ctx, {
    content: stripArtifactMarkup(ctx.text.trim() || ctx.tool.args.question || ""),
    options: ctx.tool.args.options ?? [],
    pendingKind: pendingKindForClarify(ctx),
  });
}

async function runSuggestPractice(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  return textResult(ctx, { suggest: practiceModeOf(ctx.prompt, ctx.tool.args.mode), pendingKind: "practice" });
}

async function runSuggestSheet(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  const promptAsk = promptAskFromTool(ctx);
  if (!promptAsk) return textResult(ctx, { suggest: "sheet", pendingKind: "sheet" });
  return textResult(ctx, {
    content: stripTrailingCheck(stripArtifactMarkup(ctx.text), promptAsk.question),
    suggest: "sheet",
    pendingKind: "sheet",
    promptAsk,
  });
}

async function runSuggestPath(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  return textResult(ctx, { suggest: "path", pendingKind: "path" });
}

async function runCreatePractice(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  const mode = practiceModeOf(ctx.prompt, ctx.tool.args.mode);
  const ka = promptIsKa(ctx.prompt);
  ctx.onStatus?.(mode === "exam" ? "Generating exam" : "Generating quiz");
  const set = await generatePracticeSet({
    project: ctx.project,
    userId: ctx.userId,
    materials: ctx.materials,
    prompt: generatePrompt(ctx),
    count: ctx.count,
    onStatus: ctx.onStatus,
  });
  const path = ctx.path ?? (await getLatestPath(ctx.project.id).catch(() => null));
  ctx.onStatus?.("Done");
  if (path?.currentNodeId) {
    const next = bindPracticeSet(path, path.currentNodeId, set.ids[0]);
    await patchStudyPath(ctx.project.id, path.id, { courses: next.courses }).catch(() => undefined);
  }
  return {
    intent: "practice",
    content:
      mode === "exam"
        ? ka
          ? "გამოცდა მზადაა."
          : "Exam is ready."
        : ka
          ? "ვარჯიში მზადაა."
          : "Quiz is ready.",
    artifact: {
      kind: "practice",
      id: set.ids[0],
      title: mode === "exam" ? (ka ? "გამოცდა" : "Exam") : ka ? "ქვიზი" : "Quiz",
      count: set.count,
      ids: set.ids,
      mode,
    },
  };
}

async function runCreateSheet(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  ctx.onStatus?.(CREATING_NOTES_STATUS);
  ctx.onNotesEvent?.({ status: CREATING_NOTES_STATUS });
  const sheet = await generateStudySheetFromPrompt({
    projectId: ctx.project.id,
    userId: ctx.userId,
    projectTitle: ctx.project.title,
    materials: ctx.materials,
    prompt: generatePrompt(ctx),
    signal: ctx.signal,
    onEvent: ctx.onNotesEvent,
  });
  if (!sheet.id) throw new Error("Could not save notes.");
  const path = ctx.path ?? (await getLatestPath(ctx.project.id).catch(() => null));
  if (path && pathIsStarted(path) && path.currentNodeId) {
    const next = bindSheet(path, path.currentNodeId, sheet.id);
    await patchStudyPath(ctx.project.id, path.id, { courses: next.courses }).catch(() => undefined);
  }
  ctx.onNotesEvent?.({ title: sheet.title, blocks: sheet.blocks, sheetId: sheet.id, status: null });
  return {
    intent: "study",
    content: "",
    artifact: { kind: "sheet", id: sheet.id, title: sheet.title, count: sheet.blocks.length },
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
      ...activeToChatArtifact(active),
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
  ctx.onStatus?.("Generating quiz");
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
      ...activeToChatArtifact(active),
      count: nextIds.length,
      ids: nextIds,
    },
  };
}

async function runSearchImages(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  const query = ctx.tool.args.query?.trim() || ctx.prompt.trim();
  const count = ctx.tool.args.count ?? IMAGE_SEARCH_DEFAULT;
  ctx.onStatus?.("Searching photos…");
  const local = localImageHits({
    query,
    materials: ctx.materials,
    attachments: ctx.attachments,
    limit: count,
  });
  const seen = new Set(local.map((hit) => hit.thumb || hit.url).filter(Boolean));
  const imageAttaches = ctx.imageSearchResults ?? await searchImagesClient(query, count);
  const web = imageAttaches.flatMap((hit) => {
    const key = hit.thumb || hit.url;
    if (!key || seen.has(key) || !toImageAttach(hit)) return [];
    seen.add(key);
    return [hit];
  });
  const images = [...local, ...web];
  if (images.length === 0) {
    return { intent: "ask", content: photoCaption(ctx.text, imageFailLine(ctx.prompt)), images: [] };
  }
  return {
    intent: "ask",
    content: photoCaption(ctx.text, imageFoundLine(ctx.prompt)),
    images,
  };
}

async function runCreatePath(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  ctx.onStatus?.("Mapping the path…");
  ctx.onPathEvent?.({ status: "Mapping the path…" });
  const kind = pathKindOf(ctx.prompt);
  const generated = await generatePathFromPrompt({
    projectId: ctx.project.id,
    userId: ctx.userId,
    projectTitle: ctx.project.title,
    materials: ctx.materials,
    prompt: generatePrompt(ctx),
    kind,
    signal: ctx.signal,
    onEvent: ctx.onPathEvent,
  });
  const count = pathArtifactCount({ courses: generated.courses });
  ctx.onPathEvent?.({
    title: generated.title,
    courses: generated.courses,
    pathId: generated.id,
    status: null,
  });
  const ready = promptIsKa(ctx.prompt)
    ? "გზა მზადაა. შეგიძლია შეცვალო, ან Continue-ით დავიწყოთ."
    : "Path is ready. Change it if you want, or Continue when you're ready to start.";
  return {
    intent: "plan",
    content: oneChatLine(ctx.text, ready),
    artifact: { kind: "path", id: generated.id, title: generated.title, count },
  };
}

async function runAdvancePath(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  const path = ctx.path ?? (await getLatestPath(ctx.project.id));
  if (!path) throw new Error("Open a path first.");
  if (!pathIsStarted(path)) throw new Error("Start the path first.");
  const currentId = path.currentNodeId;
  const fromTitle = findNode(path, currentId)?.node.title;
  const next = markNodeDone(path, currentId);
  await patchStudyPath(ctx.project.id, path.id, {
    courses: next.courses,
    currentCourseId: next.currentCourseId,
    currentNodeId: next.currentNodeId,
  });
  const loc = findNode(next, next.currentNodeId);
  const finished = next.currentNodeId === currentId && findNode(next, currentId)?.node.status === "done";
  const { done, total } = progressCounts(next.courses);
  return {
    intent: "plan",
    content: finished ? (promptIsKa(ctx.prompt) ? "გზა დასრულდა." : "Path complete.") : "",
    artifact: {
      kind: "path",
      id: next.id,
      title: next.title,
      count: total,
      step: {
        from: fromTitle,
        to: finished ? undefined : loc?.node.title,
        done,
        total,
      },
    },
    leadTopic: finished ? undefined : loc?.node.title,
    leadTeach: finished ? undefined : loc ? nodeTeach(loc.node) : undefined,
  };
}

async function runRestartPath(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  const path = ctx.path ?? (await getLatestPath(ctx.project.id));
  if (!path) throw new Error("Open a path first.");
  if (pathIsStarted(path)) {
    return {
      intent: "ask",
      content: promptIsKa(ctx.prompt)
        ? "ეს გზა უკვე დაიწყო. სხვა კურსისთვის ახალი ჩატი გახსენი."
        : "This path already started. Open a new chat to map a different course.",
    };
  }
  const next = restartPath(path);
  await patchStudyPath(ctx.project.id, path.id, {
    courses: next.courses,
    currentCourseId: next.currentCourseId,
    currentNodeId: next.currentNodeId,
  });
  const loc = findNode(next, next.currentNodeId);
  const line = loc ? `Back at the start: ${loc.node.title}.` : "Path reset to the beginning.";
  return {
    intent: "plan",
    content: oneChatLine(ctx.text, line),
    artifact: {
      kind: "path",
      id: next.id,
      title: next.title,
      count: pathArtifactCount(next),
    },
  };
}

async function runStartPath(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  const path = ctx.path ?? (await getLatestPath(ctx.project.id));
  if (!path) throw new Error("Open a path first.");
  const threadId = path.threadId || pathThreadId(path.id);
  const title = pathThreadTitle(path);
  await ensureChatThread({
    projectId: ctx.project.id,
    userId: ctx.userId,
    mode: ctx.project.preferredChatMode,
    threadId,
    kind: "path",
    title,
    pathId: path.id,
  });
  if (!pathIsStarted(path) || path.threadId !== threadId) {
    await patchStudyPath(ctx.project.id, path.id, { started: true, threadId });
  }
  const loc = findNode(path, path.currentNodeId);
  const { done, total } = progressCounts(path.courses);
  const sameThread = ctx.threadId === threadId;
  const line = promptIsKa(ctx.prompt)
    ? "გეგმა გაიხსნა. მთავარ ჩატში კვლავ შეგიძლია იკითხო."
    : "Plan is open. This chat stays free.";
  return {
    intent: "plan",
    content: sameThread ? "" : oneChatLine(ctx.text, line),
    artifact: {
      kind: "path",
      id: path.id,
      title: path.title,
      count: total,
      step: {
        to: loc?.node.title,
        done,
        total,
      },
    },
    openThreadId: threadId,
    leadTopic: sameThread ? loc?.node.title : undefined,
    leadTeach: sameThread && loc ? nodeTeach(loc.node) : undefined,
  };
}
async function runEditSheet(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  const active = ctx.active;
  if (!active) throw new Error("Open a set or sheet first.");
  const sheet = await getStudySheet(ctx.project.id, active.id);
  if (!sheet) throw new Error("Those notes are gone.");
  ctx.onStatus?.("Updating notes…");
  ctx.onNotesEvent?.({ status: "Updating notes…", title: sheet.title });
  const next = await rewriteStudySheetFromPrompt({
    projectId: ctx.project.id,
    sheetId: sheet.id,
    projectTitle: ctx.project.title,
    materials: ctx.materials,
    prompt: ctx.tool.args.instruction || ctx.prompt,
    currentBlocks: sheet.blocks,
    currentTitle: sheet.title,
    currentContent: sheet.prose || sheet.content,
    signal: ctx.signal,
    onEvent: ctx.onNotesEvent,
  });
  ctx.onNotesEvent?.({ title: next.title, blocks: next.blocks, sheetId: sheet.id, status: null });
  return {
    intent: "rewrite_sheet",
    content: promptIsKa(ctx.prompt) ? "განვაახლე კონსპექტი." : "Updated notes.",
    artifact: activeToChatArtifact({ ...active, title: next.title, status: "ready" }),
  };
}

export const CHAT_TOOL_HANDLERS: Record<ChatToolName, ChatToolHandler> = {
  answer: { run: runAnswer },
  clarify: { run: runClarify },
  illustrate: { run: runIllustrate },
  suggest_practice: { run: runSuggestPractice },
  suggest_sheet: { run: runSuggestSheet },
  suggest_path: { run: runSuggestPath },
  create_practice: { run: runCreatePractice, artifactKind: "practice" },
  edit_practice: { run: runEditPractice, artifactKind: "practice" },
  append_practice: { run: runAppendPractice, artifactKind: "practice" },
  create_sheet: { run: runCreateSheet, artifactKind: "sheet" },
  edit_sheet: { run: runEditSheet, artifactKind: "sheet" },
  create_path: { run: runCreatePath, artifactKind: "path" },
  advance_path: { run: runAdvancePath, artifactKind: "path" },
  restart_path: { run: runRestartPath, artifactKind: "path" },
  start_path: { run: runStartPath, artifactKind: "path" },
  search_images: { run: runSearchImages },
};

export function getChatToolHandler(name: ChatToolName): ChatToolHandler | undefined {
  return CHAT_TOOL_HANDLERS[name];
}

export function toolProducesArtifact(name: ChatToolName): boolean {
  return Boolean(CHAT_TOOL_HANDLERS[name]?.artifactKind) || isArtifactTool(name);
}

export function thinkingStatus(_ka = false): string {
  return "Thinking";
}

export function dispatchStatus(intent: ComposerIntent, toolName?: ChatToolName, _ka = false): string {
  if (toolName === "search_images") return "Searching photos…";
  if (toolName === "clarify") return "Planning…";
  if (intent === "study") return CREATING_NOTES_STATUS;
  if (intent === "rewrite_sheet") return "Updating notes…";
  if (intent === "practice") return "Generating quiz";
  if (toolName === "advance_path") return "Moving on…";
  if (toolName === "restart_path") return "Starting at the beginning…";
  if (toolName === "start_path") return "Starting…";
  if (toolName === "create_path" || intent === "plan") return "Mapping the path…";
  if (isMutationIntent(intent)) return "Updating…";
  return thinkingStatus();
}

/** Run the registered handler. Unknown names stay text — never practice. */
export async function dispatchChatTool(ctx: ChatDispatchContext): Promise<ChatDispatchResult> {
  const handler = CHAT_TOOL_HANDLERS[ctx.tool.name];
  if (!handler) {
    return { intent: "ask", content: ctx.text };
  }
  return chatToolDefinition(ctx.tool.name).execute({
    call: ctx.tool,
    invoke: async () => handler.run(ctx),
  }) as Promise<ChatDispatchResult>;
}
