"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, startTransition, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { usePreferredModel } from "@/components/account/use-preferred-model";
import { GuestGoogleCta } from "@/components/guest-google-cta";
import { createChunkBuffer } from "@/lib/ai/chunk-stream";
import { readChatSse } from "@/lib/ai/sse";
import { toolStreamsText, type ChatToolCall } from "@/lib/ai/tools";
import { dispatchChatTool, dispatchStatus, imageFailLine, imageFoundLine, analysingStatus, thinkingStatus } from "@/lib/chat/dispatch";
import { latestOpenAsk, splitTeachingExam } from "@/lib/chat/prompt-ask";
import { trackEvent } from "@/lib/analytics/track";
import { addChatMessage, allocateChatMessageId, ensureChatThread, patchChatMessage, subscribeChatMessages } from "@/lib/chats";
import { DEFAULT_CHAT_THREAD_ID, DEFAULT_PROJECT_GOAL } from "@/lib/core/constants";
import { incrementUsage } from "@/lib/account/store";
import { excerptsForChat } from "@/lib/materials/chat-context";
import { pickChatFigures, shouldAttachChatFigures } from "@/lib/materials/figures";
import { listMaterials, removeMaterial, waitForMaterialPreviews } from "@/lib/materials";
import { ingestMaterialFile, ingestMaterialPaste, ingestMaterialUrl, urlsInText } from "@/lib/materials/ingest-client";
import { newChipId, attachmentsFromMaterials, snapshotChatAttachments } from "@/lib/composer/attach";
import {
  peekPendingStart,
  takePendingStart,
  type PendingStart,
} from "@/lib/workspace/pending-start";
import { peekOpeningPending, takeProjectStartIngest, waitForOpeningProject } from "@/lib/workspace/start-project";
import { authHeaders } from "@/lib/api/client";
import { searchImagesClient, toImageAttach } from "@/lib/images/client";
import {
  acceptedToolFromIntent,
  intentFromTool,
  pendingCreateFromMessages,
  promptIsKa,
  resolvePendingKind,
  wantsPath,
  type ComposerIntent,
  DEFAULT_COMPOSER_INTENT,
} from "@/lib/composer/intent";
import {
  acceptedToolFromSkill,
  consumeSlashCommand,
  type ComposerSkill,
} from "@/lib/composer/slash";
import { inferProjectGoal } from "@/lib/composer/goal";
import { isSimpleChatTask } from "@/lib/blocks/match";
import { artifactFacts, historyTurnsFromMessages, historyWithoutCurrentPrompt, latestArtifact } from "@/lib/composer/memory";
import { listMemories } from "@/lib/memory/store";
import { getLearningProfile } from "@/lib/memory/profile";
import { syncUserMemories } from "@/lib/memory/client";
import { chatArtifactToActive } from "@/lib/artifacts/active";
import { autoNameProject } from "@/lib/workspace/auto-title";
import { isRealUserPrompt, needsAutoTitle, DEFAULT_FIRST_PROMPT } from "@/lib/workspace/title";
import { loadPracticeProgress } from "@/lib/workspace/practice-progress";
import { workFinishedPrompt, type SetResult } from "@/lib/exercises/session";
import { gateGuestChatTool, guestCapReached, GuestCapError, isGuestUser, recordGuestAssistantTurn, syncGuestAssistantCount } from "@/lib/guest";
import { recipeForGoal } from "@/lib/core/recipes";
import { updateProjectActiveArtifact, updateProjectGoal } from "@/lib/projects";
import { RichContent } from "@/components/rich-content";
import { MixedText } from "@/components/visuals/mixed-text";
import { ChatComposer, type ChatComposerHandle, type ComposerChip } from "@/components/workspace/chat-composer";
import { ClarifyChips } from "@/components/workspace/clarify-chips";
import { MessageAttachments } from "@/components/workspace/message-attachments";
import { ArtifactCard } from "@/components/workspace/artifact-card";
import { ChatSetCard } from "@/components/exercises/chat-set";
import { ImageGallery } from "@/components/workspace/image-gallery";
import { LinkifiedText } from "@/components/workspace/linkified-text";
import { StatusWait, formatWorked } from "@/components/workspace/status-wait";
import { SourcesChip, sourcesForTurn } from "@/components/workspace/sources-chip";
import { useShell } from "@/components/workspace/shell-context";
import { UiIcon } from "@/components/workspace/ui-icon";
import { getStudySheet } from "@/lib/study-sheets/store";
import { findNode, findNodeByPracticeSet, flattenNodes, hintAskPrompt, leadPathPrompt, markNodeDone, markNodeReady, moveOnPrompt, nodeTeach, pathBriefing, pathIsStarted, resumeAfterWorkPrompt, subscribeStudyPaths } from "@/lib/paths";
import { patchStudyPath } from "@/lib/paths/store";
import { stripArtifactMarkup } from "@/lib/composer/memory";
import type { NotesGenerateEvent } from "@/lib/study-sheets/generate-client";
import type { PathGenerateEvent } from "@/lib/paths/generate-client";
import type { AcceptedChatTool, ActiveArtifact, ActiveArtifactStatus, ChatArtifact, ChatAttachment, ChatImageHit, ChatMessage, ChatMode, ChatTurn, PendingKind, Project } from "@/types";
import type { Material } from "@/types/material";
import type { StudyPath } from "@/types/path";
import type { ProjectGoal } from "@/types/goals";
import type { LessonRecipe } from "@/types/lesson";

type StreamState = {
  id: string;
  content: string;
  intent: ComposerIntent;
  status?: string;
  startedAt?: number;
  artifact?: ChatArtifact | null;
  images?: ChatImageHit[];
  options?: string[];
  promptAsk?: ChatMessage["promptAsk"];
  memorized?: boolean;
};

function ExamCard({ question, ka }: { question: string; ka: boolean }) {
  return (
    <blockquote className="note-highlight my-3 px-3.5 py-2.5">
      <p className="mb-1.5 text-[12px] font-medium text-muted">
        {ka ? "სცადე — შეავსე, როგორც მაგალითში" : "Try this — same move as the example"}
      </p>
      <MixedText text={question} />
    </blockquote>
  );
}

function FollowChips({
  ka,
  followup,
  pathStart,
  teaching,
  hintLabel,
  askQuestion,
  options,
  onAction,
}: {
  ka: boolean;
  followup: boolean;
  pathStart: boolean;
  teaching: boolean;
  hintLabel: string;
  askQuestion: boolean;
  options: string[];
  onAction: (id: string) => void;
}) {
  const actions: { id: string; label: string; primary?: boolean }[] = [];
  if (followup) {
    actions.push({ id: "continue", label: ka ? "გაგრძელება" : "Continue", primary: true });
  } else if (pathStart) {
    actions.push({ id: "new-chat", label: ka ? "ახალი ჩატი" : "New chat" });
    actions.push({ id: "continue", label: ka ? "გაგრძელება" : "Continue", primary: true });
  } else if (teaching) {
    if (askQuestion) actions.push({ id: "hint", label: hintLabel });
    for (const option of options) actions.push({ id: option, label: option });
    actions.push({ id: "continue", label: ka ? "გაგრძელება" : "Continue", primary: true });
  } else if (askQuestion) {
    actions.push({ id: "hint", label: hintLabel });
    for (const option of options) actions.push({ id: option, label: option });
  }
  if (actions.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => onAction(action.id)}
          className={
            action.primary
              ? "rounded-full bg-foreground px-3 py-1 text-[12px] font-medium text-background"
              : "rounded-full border border-border px-3 py-1 text-[12px] text-muted hover:border-accent hover:text-foreground"
          }
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function hasPathTeach(
  message: Pick<ChatMessage, "content" | "promptAsk" | "artifact">,
  live?: Pick<StreamState, "content" | "promptAsk" | "artifact"> | null,
) {
  if (live?.artifact ?? message.artifact) return false;
  const raw = stripArtifactMarkup(live?.content ?? message.content);
  const ask = (live?.promptAsk ?? message.promptAsk)?.question;
  return Boolean(splitTeachingExam(raw, ask).taught.trim());
}

function latestPathTeachId(messages: ChatMessage[], live: StreamState | null): string | null {
  if (live && hasPathTeach({ content: live.content, promptAsk: live.promptAsk, artifact: live.artifact ?? null }, live)) {
    return live.id;
  }
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i];
    if (item.role !== "assistant") continue;
    const overlay = live && live.id === item.id ? live : null;
    if (hasPathTeach(item, overlay)) return item.id;
  }
  return null;
}

function mergeArtifactSteps(
  prev: ChatMessage[],
  next: ChatMessage[],
  extras?: Map<string, NonNullable<ChatArtifact["step"]>>,
): ChatMessage[] {
  if (prev.length === 0 && !extras?.size) return next;
  const byId = new Map(prev.map((item) => [item.id, item]));
  return next.map((item) => {
    const old = byId.get(item.id);
    const step = item.artifact?.step ?? old?.artifact?.step ?? (item.artifact ? extras?.get(item.id) : undefined);
    if (!step || !item.artifact || item.artifact.step) return item;
    return { ...item, artifact: { ...item.artifact, step } };
  });
}

function mergeOpeningMessages(
  prev: ChatMessage[],
  next: ChatMessage[],
  extras?: Map<string, NonNullable<ChatArtifact["step"]>>,
): ChatMessage[] {
  const merged = mergeArtifactSteps(prev, next, extras);
  if (merged.length === 0 && prev.length > 0) return prev;
  const extrasLocal = prev.filter((item) => {
    if (merged.some((message) => message.id === item.id)) return false;
    if (item.role !== "user") return false;
    return !merged.some((message) => message.role === "user" && message.content === item.content);
  });
  return extrasLocal.length ? [...extrasLocal, ...merged] : merged;
}

function pendingUserMessage(projectId: string, threadId: string, pending: PendingStart): ChatMessage {
  return {
    id: pending.userMessageId || `opening-user-${projectId}`,
    projectId,
    threadId,
    lessonId: null,
    exerciseId: null,
    role: "user",
    mode: pending.mode ?? "auto",
    content: pending.prompt,
    attachments: [],
    relatedExerciseType: null,
    intent: pending.intent ?? DEFAULT_COMPOSER_INTENT,
    artifact: null,
    createdAt: null,
  };
}

function openingChatState(
  projectId: string,
  threadId: string,
  isMainThread: boolean,
): {
  messages: ChatMessage[];
  sending: boolean;
  stream: StreamState | null;
  loading: boolean;
} {
  if (!isMainThread || typeof window === "undefined") {
    return { messages: [], sending: false, stream: null, loading: true };
  }
  const pending = peekOpeningPending(projectId) ?? peekPendingStart(projectId);
  if (!pending) {
    return { messages: [], sending: false, stream: null, loading: true };
  }
  const messages = pending.prompt.trim() ? [pendingUserMessage(projectId, threadId, pending)] : [];
  return {
    messages,
    sending: true,
    stream: {
      id: `opening-stream-${projectId}`,
      content: "",
      intent: pending.intent ?? DEFAULT_COMPOSER_INTENT,
      status: pending.awaitingIngest ? analysingStatus(undefined) : thinkingStatus(promptIsKa(pending.prompt)),
      startedAt: Date.now(),
    },
    loading: false,
  };
}

const bootstrappedStarts = new Set<string>();

function isLatestPathCard(
  messageId: string,
  messages: ChatMessage[],
  live: StreamState | null,
  kind?: string,
): boolean {
  if (kind !== "path") return false;
  if (live?.artifact?.kind === "path") return live.id === messageId;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].artifact?.kind === "path") return messages[i].id === messageId;
  }
  return false;
}

export function ProjectChat({
  project,
  userId,
  materials,
  selectedIds,
  onOpenArtifact,
  onStartPractice,
  onOpenMaterial,
  onProjectPatch,
  onNotesLive,
  onPathLive,
  finishedSet,
  onFinishedSetHandled,
  composerLocked = false,
  threadId = DEFAULT_CHAT_THREAD_ID,
  chatMode = "auto",
  onChatMode,
}: {
  project: Project;
  userId: string;
  materials: Material[];
  selectedIds: string[];
  onOpenArtifact: (artifact: ChatArtifact) => void;
  onStartPractice?: (artifact: ChatArtifact) => void;
  onOpenMaterial?: (id: string) => void;
  onNotesLive?: (event: NotesGenerateEvent | "start" | null) => void;
  onPathLive?: (event: PathGenerateEvent | "start" | null) => void;
  finishedSet?: SetResult | null;
  onFinishedSetHandled?: () => void;
  composerLocked?: boolean;
  threadId?: string;
  chatMode?: ChatMode;
  onChatMode?: (mode: ChatMode) => void;
  onProjectPatch?: (patch: {
    title?: string;
    goal?: ProjectGoal;
    recipe?: LessonRecipe;
    activeArtifact?: ActiveArtifact | null;
  }) => void;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const { model } = usePreferredModel();
  const { openSettings } = useShell();
  const guest = isGuestUser(user);
  const chatThreadId = threadId || DEFAULT_CHAT_THREAD_ID;
  const isMainThread = chatThreadId === DEFAULT_CHAT_THREAD_ID;
  const [openingUi] = useState(() => openingChatState(project.id, chatThreadId, isMainThread));
  const [messages, setMessages] = useState<ChatMessage[]>(openingUi.messages);
  const [memorizedIds, setMemorizedIds] = useState<Set<string>>(() => new Set());
  const memorizedRef = useRef<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [skill, setSkill] = useState<ComposerSkill | null>(null);
  const [loading, setLoading] = useState(openingUi.loading);
  const [sending, setSending] = useState(openingUi.sending);
  const [stoppable, setStoppable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamState | null>(openingUi.stream);
  const [chips, setChips] = useState<ComposerChip[]>([]);
  const [suggest, setSuggest] = useState<{ messageId: string; kind: "practice" | "exam" | "sheet" | "path" } | null>(null);
  const [followup, setFollowup] = useState<{ kind: "sheet" | "practice"; ka: boolean; since: number } | null>(null);
  const [needGoogle, setNeedGoogle] = useState(false);
  const [path, setPath] = useState<StudyPath | null>(null);
  const [workedMs, setWorkedMs] = useState<Record<string, number>>({});
  const pinBottomRef = useRef(true);
  const pathRef = useRef<StudyPath | null>(null);
  const artifactStepsRef = useRef<Map<string, NonNullable<ChatArtifact["step"]>>>(new Map());
  const scrollerRef = useRef<HTMLDivElement>(null);
  const composerBoxRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ChatComposerHandle>(null);
  const initialScrollRef = useRef(false);
  const examStickRef = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef<StreamState | null>(null);
  const finishedKeyRef = useRef<string | null>(null);
  streamRef.current = stream;
  const chatModeRef = useRef(chatMode);
  chatModeRef.current = chatMode;
  const sessionGoalRef = useRef<ProjectGoal | null>(null);
  const bootstrapped = useRef(false);
  const ledPathRef = useRef(false);
  const namedRef = useRef(false);
  const [composerH, setComposerH] = useState(128);

  useEffect(() => {
    let cancelled = false;
    const keepOpening = isMainThread && Boolean(peekOpeningPending(project.id) ?? peekPendingStart(project.id));
    if (!keepOpening) {
      setLoading(true);
      setMessages([]);
    }
    void (async () => {
      try {
        await waitForOpeningProject(project.id);
      } catch {
        return;
      }
      if (cancelled) return;
      ensureChatThread({
        projectId: project.id,
        userId,
        mode: project.preferredChatMode,
        threadId: chatThreadId,
      }).catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not open chat.");
      });
    })();

    const unsubscribe = subscribeChatMessages(
      project.id,
      (items) => {
        if (cancelled) return;
        const next = items.filter((item) => item.role !== "system");
        setMessages((prev) => mergeOpeningMessages(prev, next, artifactStepsRef.current));
        if (guest) {
          const assistantTurns = next.filter((item) => item.role === "assistant").length;
          syncGuestAssistantCount(assistantTurns);
          if (guestCapReached(assistantTurns)) setNeedGoogle(true);
        }
        setLoading(false);
      },
      (err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      },
      chatThreadId,
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [project.id, project.preferredChatMode, userId, guest, chatThreadId, isMainThread]);

  useEffect(() => {
    if (guest) {
      setPath(null);
      return;
    }
    return subscribeStudyPaths(project.id, (items) => {
      const next = items[0] ?? null;
      const local = pathRef.current;
      if (local?.started && next && next.id === local.id && !next.started) {
        const locked = { ...next, started: true, threadId: local.threadId ?? next.threadId };
        pathRef.current = locked;
        setPath(locked);
        return;
      }
      setPath(next);
    });
  }, [project.id, guest]);

  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  useEffect(() => {
    ledPathRef.current = false;
  }, [chatThreadId]);

  useEffect(() => {
    if (loading || sending || guest || stream) return;
    if (isMainThread) return;
    if (messages.length > 0) return;
    const current = pathRef.current;
    if (!current || current.threadId !== chatThreadId || !pathIsStarted(current)) return;
    if (ledPathRef.current) return;
    ledPathRef.current = true;
    const loc = findNode(current, current.currentNodeId);
    if (loc) {
      void sendPrompt(leadPathPrompt(loc.node.title, nodeTeach(loc.node), current.kind), {
        skipUser: true,
        leadPath: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, sending, stream, messages.length, chatThreadId, path?.id, path?.threadId, path?.started, isMainThread]);

  useEffect(() => {
    namedRef.current = false;
    initialScrollRef.current = false;
    pinBottomRef.current = true;
    memorizedRef.current = new Set();
    setMemorizedIds(new Set());
  }, [project.id]);

  function markMemorized(id: string) {
    if (!id || memorizedRef.current.has(id)) return;
    memorizedRef.current.add(id);
    setMemorizedIds((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (!guest) setNeedGoogle(false);
  }, [guest]);

  useEffect(() => {
    const node = composerBoxRef.current;
    if (!node) return;
    const sync = () => setComposerH(node.offsetHeight);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function keepComposerFocus() {
    composerRef.current?.focus();
  }

  const lockPageScroll = useCallback(() => {
    const page = scrollerRef.current?.closest(".page-y-scroll");
    if (page instanceof HTMLElement) page.scrollTop = 0;
    window.scrollTo(0, 0);
  }, []);

  const stickToBottom = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    lockPageScroll();
    node.scrollTop = node.scrollHeight;
  }, [lockPageScroll]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onScroll = () => {
      pinBottomRef.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 72;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    if (loading) return;
    if (!initialScrollRef.current && messages.length > 0 && !sending && !stream) {
      initialScrollRef.current = true;
      pinBottomRef.current = true;
      stickToBottom();
      return;
    }
    if ((sending || stream) && pinBottomRef.current) stickToBottom();
  }, [loading, messages, stream, sending, composerH, stickToBottom]);

  useEffect(() => {
    if (loading || namedRef.current) return;
    if (!needsAutoTitle(project.title)) {
      namedRef.current = true;
      return;
    }
    const firstUser = messages.find((item) => item.role === "user" && isRealUserPrompt(item.content));
    if (!firstUser) return;
    namedRef.current = true;
    void autoNameProject({
      projectId: project.id,
      userId,
      prompt: firstUser.content,
      currentTitle: project.title,
    })
      .then((title) => {
        if (title) onProjectPatch?.({ title });
      })
      .catch(() => {
        namedRef.current = false;
      });
  }, [loading, messages, project.id, project.title, userId, onProjectPatch]);

  useEffect(() => {
    const key = `${project.id}:${chatThreadId}`;
    if (bootstrappedStarts.has(key) || bootstrapped.current) return;
    if (!isMainThread) return;
    const pending = peekOpeningPending(project.id) ?? takePendingStart(project.id);
    const ingest = takeProjectStartIngest(project.id);
    if (!pending && !ingest) return;
    bootstrapped.current = true;
    bootstrappedStarts.add(key);
    if (pending) takePendingStart(project.id);
    void (async () => {
      try {
        await waitForOpeningProject(project.id);
        await bootstrap(pending ?? { prompt: "", materialIds: [], awaitingIngest: true }, ingest);
      } catch (err: unknown) {
        setError(err instanceof Error && err.message.trim() ? err.message : "Could not start.");
        setSending(false);
        setStream(null);
        sendingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, isMainThread, chatThreadId]);

  async function addChip(start: ComposerChip, work: () => Promise<string>) {
    setChips((current) => [...current, start]);
    setError(null);
    try {
      const materialId = await work();
      const latest = await listMaterials(project.id);
      const match = latest.find((item) => item.id === materialId);
      setChips((current) =>
        current.map((chip) =>
          chip.id === start.id
            ? { ...chip, status: "ready", materialId, storagePath: match?.storagePath }
            : chip,
        ),
      );
    } catch (err) {
      const message = err instanceof Error && err.message.trim() ? err.message : "Upload failed.";
      setError(message);
      setChips((current) =>
        current.map((chip) => (chip.id === start.id ? { ...chip, status: "error" } : chip)),
      );
    }
  }

  function onFile(file: File) {
    if (guest) return;
    const id = newChipId();
    const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
    void addChip(
      {
        id,
        title: file.name,
        type: file.name.split(".").pop() || (file.type.startsWith("image/") ? "img" : "file"),
        size: file.size,
        status: "uploading",
        previewUrl,
      },
      () => ingestMaterialFile({ projectId: project.id, userId, file }),
    );
  }

  function onPasteText(text: string) {
    if (guest) return;
    const id = newChipId();
    void addChip(
      { id, title: "Pasted notes", type: "txt", size: text.length, status: "uploading" },
      () => ingestMaterialPaste({ projectId: project.id, userId, text }),
    );
  }

  function onUrl(url: string) {
    if (guest) return;
    const id = newChipId();
    void addChip(
      { id, title: url, type: "url", status: "uploading" },
      () => ingestMaterialUrl({ projectId: project.id, userId, url }),
    );
  }

  async function bootstrap(pending: PendingStart, ingest?: Promise<string[]> | null) {
    const latest = await listMaterials(project.id);
    const pool = latest.length > 0 ? latest : materials;
    const attachments = attachmentsFromMaterials(pending.materialIds, pool);
    if (pending.prompt.trim() || ingest) {
      await sendPrompt(pending.prompt.trim() || DEFAULT_FIRST_PROMPT, {
        materials: pool,
        attachments,
        waitForPreview: pending.materialIds,
        waitForIngest: ingest ?? undefined,
        userMessageId: pending.userMessageId,
        acceptedTool: guest
          ? undefined
          : acceptedToolFromSkill(pending.skill) ?? acceptedToolFromIntent(pending.intent),
      });
      return;
    }
    if (attachments.length === 0) return;
    await addChatMessage({
      projectId: project.id,
      userId,
      role: "user",
      mode: chatModeRef.current,
      intent: "ask",
      content: "",
      attachments,
      threadId: chatThreadId,
    });
  }

  async function streamChat(input: {
    prompt: string;
    history: ChatTurn[];
    materialExcerpts: { id: string; name: string; excerpt: string }[];
    figures?: { name: string; page: number; path: string; mime: string; data: string }[];
    confirmed?: boolean;
    acceptedTool?: AcceptedChatTool;
    pendingKind?: PendingKind;
    leadPath?: boolean;
    skipMemory?: boolean;
    hintAsk?: boolean;
    examAsk?: boolean;
    onFirstToken?: () => void;
    signal?: AbortSignal;
  }): Promise<{ text: string; tool: ChatToolCall; memory: Promise<boolean>; aborted?: boolean }> {
    const facts = artifactFacts(messages);
    const latest = latestArtifact(messages);
    const active = resolveActive();
    const pending = pendingCreateFromMessages(messages);
    const pendingKind = input.pendingKind ?? resolvePendingKind(input.prompt, pending);
    const [memories, personalization] = guest
      ? [[], ""]
      : await Promise.all([
          listMemories(userId).catch(() => []),
          getLearningProfile(userId).catch(() => ""),
        ]);
    const turnId = streamRef.current?.id;
    const memory = guest || input.skipMemory
      ? Promise.resolve(false)
      : syncUserMemories({
          userId,
          prompt: input.prompt,
          memories,
          personalization,
          history: input.history,
        });
    void memory.then((saved) => {
      if (!saved || !turnId) return;
      setStream((current) =>
        current?.id === turnId ? { ...current, memorized: true } : current,
      );
      markMemorized(turnId);
      void patchChatMessage(project.id, turnId, { memorized: true }, chatThreadId).catch(() => undefined);
    });
    const livePath = pathRef.current;
    const briefing = livePath ? pathBriefing(livePath) : null;
    const inPathThread = Boolean(livePath?.threadId && livePath.threadId === chatThreadId);
    const pathForModel = briefing
      ? { ...briefing, started: input.leadPath ? true : briefing.started, inPathThread }
      : briefing;
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: await authHeaders(),
      signal: input.signal,
      body: JSON.stringify({
        prompt: input.prompt,
        mode: chatModeRef.current,
        provider: model,
        history: input.history,
        context: {
          projectId: project.id,
          projectTitle: project.title,
          projectDescription: project.description,
          goal: sessionGoalRef.current ?? DEFAULT_PROJECT_GOAL,
          materials: input.materialExcerpts,
          figures: input.figures,
          knowledgeItems: [],
          memories,
          personalization: personalization || undefined,
          artifacts: facts,
          latestArtifact: latest,
          activeArtifact: activeContext(active),
          hasMaterials: poolFrom().length > 0 || input.materialExcerpts.length > 0,
          confirmed: input.confirmed,
          acceptedTool: input.acceptedTool,
          priorClarify: pending.priorClarify,
          pendingTopic: pending.pendingTopic ?? undefined,
          pendingKind: pendingKind ?? undefined,
          pathTopic: pathForModel?.nodeTitle,
          hasPath: Boolean(livePath),
          inPathThread,
          path: pathForModel,
          hintAsk: input.hintAsk,
          examAsk: input.examAsk,
        },
      }),
    });

    let tool: ChatToolCall = { name: "answer", args: {} };
    const chunks = createChunkBuffer((text) => {
      if (!toolStreamsText(tool.name)) return;
      startTransition(() => {
        setStream((current) =>
          current
            ? { ...current, content: text, intent: intentFromTool(tool.name), status: text.trim() ? undefined : current.status }
            : current,
        );
      });
    });
    try {
      const result = await readChatSse(response, {
        onDelta: (delta) => {
          input.onFirstToken?.();
          chunks.push(delta);
        },
        onTool: (next) => {
          input.onFirstToken?.();
          tool = next;
          if (!toolStreamsText(next.name)) {
            const intent = intentFromTool(next.name);
            setStream((current) =>
              current
                ? { ...current, content: "", intent, status: dispatchStatus(intent, next.name, promptIsKa(input.prompt)) }
                : current,
            );
          }
        },
      });
      const full = chunks.finish();
      tool = result.tool ?? tool;
      const text = full.trim() || tool.args.question || "";
      if (toolStreamsText(tool.name) && !text && tool.name !== "search_images" && !chunks.raw.trim()) {
        throw new Error("The model returned an empty reply.");
      }
      return { text, tool, memory };
    } catch (err) {
      const partial = chunks.finish();
      if (
        input.signal?.aborted ||
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        return { text: partial, tool, memory, aborted: true };
      }
      throw err;
    }
  }

  function poolFrom(override?: Material[]) {
    const source = override ?? materials;
    return selectedIds.length > 0 ? source.filter((item) => selectedIds.includes(item.id)) : source;
  }

  async function materialsForTurn(attachments: ChatAttachment[], override?: Material[]): Promise<Material[]> {
    const attachedIds = attachments.flatMap((item) => (item.materialId ? [item.materialId] : []));
    let source = override ?? materials;
    if (attachedIds.some((id) => !source.some((item) => item.id === id))) {
      source = await listMaterials(project.id);
    }
    if (selectedIds.length === 0) return source;
    return source.filter((item) => selectedIds.includes(item.id) || attachedIds.includes(item.id));
  }

  function applyInferredGoal(text: string) {
    const inferred = inferProjectGoal(text);
    if (!inferred) return;
    sessionGoalRef.current = inferred;
    if (inferred === project.goal) return;
    const recipe = recipeForGoal(inferred);
    onProjectPatch?.({ goal: inferred, recipe });
    void updateProjectGoal(project.id, userId, inferred).catch(() => {
      onProjectPatch?.({ goal: project.goal, recipe: project.recipe });
    });
  }

  function resolveActive(): ActiveArtifact | null {
    if (project.activeArtifact) return project.activeArtifact;
    const latest = latestArtifact(messages);
    return latest ? chatArtifactToActive(latest, "ready") : null;
  }

  function activeContext(active: ActiveArtifact | null) {
    if (!active) return null;
    const total = active.count ?? active.ids?.length;
    const index = active.kind === "practice_set" ? loadPracticeProgress(project.id)[active.id] : undefined;
    return {
      kind: active.kind,
      id: active.id,
      title: active.title,
      count: total,
      status: active.status,
      progress:
        active.kind === "practice_set" && total
          ? `${index != null ? index + 1 : 0}/${total}`
          : undefined,
    };
  }

  async function rememberActive(artifact: ChatArtifact, status: ActiveArtifactStatus = "ready") {
    const active = chatArtifactToActive(artifact, status);
    onProjectPatch?.({ activeArtifact: active });
    await updateProjectActiveArtifact(project.id, userId, active).catch(() => undefined);
  }

  function settleWorked(id: string, startedAt?: number) {
    const start = startedAt ?? streamRef.current?.startedAt;
    if (!id || !start) return;
    setWorkedMs((current) => (current[id] != null ? current : { ...current, [id]: Date.now() - start }));
  }

  async function sendPrompt(
    prompt: string,
    options?: {
      materials?: Material[];
      skipUser?: boolean;
      openWhenReady?: boolean;
      confirmed?: boolean;
      acceptedTool?: AcceptedChatTool;
      attachments?: ChatAttachment[];
      pendingKind?: PendingKind;
      waitForPreview?: string[];
      waitForIngest?: Promise<string[]>;
      leadPath?: boolean;
      hintAsk?: boolean;
      examAsk?: boolean;
      userMessageId?: string;
    },
  ) {
    let attachments = guest ? [] : (options?.attachments ?? []);
    const pendingIngest = guest ? undefined : options?.waitForIngest;
    const promptUrls = guest || pendingIngest ? [] : urlsInText(prompt);
    const urlIngest =
      promptUrls.length > 0
        ? Promise.all(promptUrls.map((url) => ingestMaterialUrl({ projectId: project.id, userId, url })))
        : undefined;
    const ingest = pendingIngest ?? urlIngest;
    let modelPrompt =
      prompt.trim() ||
      (attachments.length ? DEFAULT_FIRST_PROMPT : "");
    if ((!modelPrompt && !ingest) || sendingRef.current) return;
    if (guest && guestCapReached(messages.filter((item) => item.role === "assistant").length)) {
      setNeedGoogle(true);
      return;
    }

    let pool = await materialsForTurn(attachments, options?.materials);
    let previewIds = guest ? [] : (options?.waitForPreview ?? []).filter(Boolean);
    const analysing = Boolean(ingest) || previewIds.length > 0;
    const assistantId = allocateChatMessageId(project.id, chatThreadId);

    sendingRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setSending(true);
    setStoppable(true);
    setError(null);
    setSuggest(null);
    setFollowup(null);
    setStream({
      id: assistantId,
      content: "",
      intent: "ask",
      status: options?.leadPath
        ? promptIsKa(modelPrompt)
          ? "ვასწავლი…"
          : "Teaching…"
        : options?.examAsk
          ? thinkingStatus(promptIsKa(modelPrompt))
          : options?.hintAsk
            ? promptIsKa(modelPrompt)
              ? "მინიშნება…"
              : "Hint…"
            : analysing
              ? analysingStatus([
                  ...attachments,
                  ...urlsInText(prompt).map((url) => ({ title: url, type: "url" })),
                ])
              : thinkingStatus(promptIsKa(modelPrompt)),
      startedAt: Date.now(),
    });
    pinBottomRef.current = true;
    initialScrollRef.current = true;

    const history = historyWithoutCurrentPrompt(historyTurnsFromMessages(messages), modelPrompt);
    let followTopic: string | undefined;
    let followTeach: string | undefined;

    try {
      let userMessageId: string | null = null;
      if (!options?.skipUser) {
        userMessageId = await addChatMessage({
          id: options?.userMessageId,
          projectId: project.id,
          userId,
          role: "user",
          mode: chatModeRef.current,
          intent: "ask",
          content: prompt,
          attachments,
          threadId: chatThreadId,
        });
        trackEvent({ userId, projectId: project.id, type: "chat_message_sent" });
        setChips((current) => {
          for (const chip of current) {
            if (chip.previewUrl) URL.revokeObjectURL(chip.previewUrl);
          }
          return [];
        });
      }

      if (ingest) {
        const ids = await ingest;
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const latest = await listMaterials(project.id);
        const ingested = attachmentsFromMaterials(ids, latest);
        pool = await materialsForTurn([...attachments, ...ingested], latest);
        previewIds = [...new Set([...previewIds, ...ids])];
        const visible = [
          ...attachments,
          ...ingested.filter((item) => item.type !== "url" || !prompt.includes(item.title)),
        ].filter((item, index, list) => !item.materialId || list.findIndex((row) => row.materialId === item.materialId) === index);
        attachments = visible;
        if (userMessageId && visible.length > 0) {
          await patchChatMessage(project.id, userMessageId, { attachments: visible }, chatThreadId);
        }
      }

      modelPrompt =
        prompt.trim() ||
        (attachments.length ? DEFAULT_FIRST_PROMPT : "");
      if (!modelPrompt) throw new Error("Type a prompt or attach a source to start.");

      const previewMissing = previewIds.some((id) => !pool.find((item) => item.id === id)?.extractedTextPreview.trim());
      if (previewMissing) {
        pool = await waitForMaterialPreviews(project.id, previewIds);
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        pool = await materialsForTurn([...attachments, ...attachmentsFromMaterials(previewIds, pool)], pool);
      }

      setStream((current) => (current ? { ...current, status: thinkingStatus(promptIsKa(modelPrompt)) } : current));
      applyInferredGoal(modelPrompt);

      const startedAt = performance.now();
      const mappingPath = options?.acceptedTool === "create_path" || wantsPath(modelPrompt);
      const materialExcerpts = pool.length > 0 ? excerptsForChat(modelPrompt, pool) : [];
      const excerptChars = materialExcerpts.reduce((sum, item) => sum + item.excerpt.length, 0);
      const attachFigures = !mappingPath && shouldAttachChatFigures(modelPrompt, pool, attachments);
      const picked = attachFigures
        ? await pickChatFigures(modelPrompt, pool, attachments)
        : { figures: [], fileGets: 0 };
      const figures = picked.figures;
      const fileGets = picked.fileGets;
      let sendLogged = false;
      let msUntilFirstToken = 0;
      const markFirstToken = () => {
        if (sendLogged) return;
        sendLogged = true;
        msUntilFirstToken = Math.round(performance.now() - startedAt);
      };
      const pendingKind = options?.pendingKind ?? resolvePendingKind(modelPrompt, pendingCreateFromMessages(messages));
      const streamed = await streamChat({
        prompt: modelPrompt,
        history,
        materialExcerpts,
        figures,
        confirmed: options?.confirmed,
        acceptedTool: guest ? undefined : options?.acceptedTool,
        pendingKind: pendingKind ?? undefined,
        leadPath: options?.leadPath,
        skipMemory: options?.skipUser,
        hintAsk: options?.hintAsk,
        examAsk: options?.examAsk,
        onFirstToken: markFirstToken,
        signal: controller.signal,
      });
      if (streamed.aborted || controller.signal.aborted) {
        const err = new DOMException("Aborted", "AbortError") as DOMException & { partial?: string };
        err.partial = streamed.text;
        throw err;
      }
      markFirstToken();
      const text = streamed.text;
      const tool = guest ? gateGuestChatTool(streamed.tool) : streamed.tool;
      const intent = intentFromTool(tool.name);
      applyInferredGoal(tool.args.topic || tool.args.instruction || modelPrompt);

      if (!toolStreamsText(tool.name)) {
        setStream((current) =>
          current ? { ...current, content: "", intent, status: dispatchStatus(intent, tool.name, promptIsKa(modelPrompt)) } : current,
        );
      }

      if (!guest && (tool.name === "create_sheet" || tool.name === "edit_sheet")) {
        onNotesLive?.("start");
      }
      if (!guest && tool.name === "create_path") {
        onPathLive?.("start");
      }
      if (tool.name === "start_path" && pathRef.current) {
        const locked = { ...pathRef.current, started: true };
        pathRef.current = locked;
        setPath(locked);
      }

      const dispatched = await dispatchChatTool({
        tool,
        text,
        prompt: modelPrompt,
        project,
        userId,
        materials: pool,
        active: resolveActive(),
        path,
        threadId: chatThreadId,
        messages,
        pendingKind,
        attachments,
        signal: controller.signal,
        hintAsk: options?.hintAsk,
        examAsk: options?.examAsk,
        onStatus: (status) =>
          setStream((current) =>
            current
              ? { ...current, content: toolStreamsText(tool.name) ? text : "", intent, status }
              : current,
          ),
        onNotesEvent: guest ? undefined : onNotesLive,
        onPathEvent: guest ? undefined : onPathLive,
      });

      let artifact = dispatched.artifact ?? null;
      if (artifact && (artifact.kind === "sheet" || artifact.kind === "plan")) {
        try {
          const sheet = await getStudySheet(project.id, artifact.id);
          if (sheet) {
            artifact = {
              ...artifact,
              title: sheet.title || artifact.title,
              count: sheet.blocks.length || artifact.count,
            };
          }
        } catch {
          /* keep dispatched artifact */
        }
      }

      const leadExam =
        options?.leadPath && modelPrompt.startsWith("Tutor-lead (not a user request):")
          ? splitTeachingExam(dispatched.content, dispatched.promptAsk?.question)
          : null;
      const content = leadExam?.taught || dispatched.content;
      const promptAsk =
        options?.leadPath && modelPrompt.startsWith("Tutor-lead (not a user request):")
          ? undefined
          : dispatched.promptAsk;
      const imageAttaches = (dispatched.images ?? []).flatMap((hit) => {
        const attach = toImageAttach(hit);
        return attach ? [attach] : [];
      });
      console.info("[chat-send]", {
        excerptChars,
        imageAttaches,
        fileGets,
        msUntilFirstToken,
      });
      setStream((current) =>
        current
          ? {
              ...current,
              content,
              intent: dispatched.intent,
              artifact: artifact,
              images: dispatched.images,
              options: dispatched.options,
              promptAsk,
              status: artifact
                ? promptIsKa(modelPrompt)
                  ? "მზადაა"
                  : "Done"
                : undefined,
            }
          : current,
      );

      if (artifact?.step) artifactStepsRef.current.set(assistantId, artifact.step);
      const id = await addChatMessage({
        id: assistantId,
        projectId: project.id,
        role: "assistant",
        mode: chatModeRef.current,
        intent: dispatched.intent,
        content,
        artifact,
        options: dispatched.options,
        pendingKind: dispatched.pendingKind,
        images: dispatched.images,
        promptAsk,
        memorized: memorizedRef.current.has(assistantId) || undefined,
        threadId: chatThreadId,
      });
      void streamed.memory.then((saved) => {
        if (!saved) return;
        markMemorized(id);
        void patchChatMessage(project.id, id, { memorized: true }, chatThreadId).catch(() => undefined);
      });
      void incrementUsage(userId, "chatTurns");
      if (guest) {
        recordGuestAssistantTurn();
        if (guestCapReached()) setNeedGoogle(true);
      }
      if (artifact) {
        if (
          !guest &&
          (options?.openWhenReady ||
            artifact.kind === "sheet" ||
            artifact.kind === "plan" ||
            tool.name === "create_path")
        ) {
          onOpenArtifact(artifact);
        }
        await rememberActive(artifact, "ready");
      }
      if (dispatched.suggest && !guest && chatModeRef.current !== "fast" && !isSimpleChatTask(modelPrompt)) {
        setSuggest({ messageId: id, kind: dispatched.suggest });
      }
      if (!guest && dispatched.artifact?.kind === "sheet") {
        setFollowup({ kind: "sheet", ka: promptIsKa(modelPrompt), since: Date.now() });
      }
      if (dispatched.openThreadId && pathRef.current) {
        const opened = { ...pathRef.current, started: true, threadId: dispatched.openThreadId };
        pathRef.current = opened;
        setPath(opened);
      }
      settleWorked(assistantId);
      setStream(null);
      if (dispatched.openThreadId && dispatched.openThreadId !== chatThreadId) {
        router.push(`/project/${project.id}/${dispatched.openThreadId}`);
      } else if (dispatched.leadTopic && !options?.leadPath && !guest) {
        followTopic = dispatched.leadTopic;
        followTeach = dispatched.leadTeach;
      }
    } catch (err) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError") || (err instanceof Error && err.name === "AbortError")) {
        const partial = stripArtifactMarkup(
          (err as { partial?: string }).partial ?? streamRef.current?.content ?? "",
        ).trim();
        if (partial) {
          await addChatMessage({
            id: assistantId,
            projectId: project.id,
            role: "assistant",
            mode: chatModeRef.current,
            intent: streamRef.current?.intent ?? "ask",
            content: partial,
            artifact: streamRef.current?.artifact ?? undefined,
            options: streamRef.current?.options,
            images: streamRef.current?.images,
            memorized: memorizedRef.current.has(assistantId) || undefined,
            threadId: chatThreadId,
          }).catch(() => undefined);
        }
        setError(null);
        onNotesLive?.(null);
        onPathLive?.(null);
      } else if (err instanceof GuestCapError) {
        setNeedGoogle(true);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Could not send message.");
        onNotesLive?.(null);
        onPathLive?.(null);
      }
      settleWorked(assistantId);
      setStream(null);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      sendingRef.current = false;
      setSending(false);
      setStoppable(false);
      keepComposerFocus();
    }
    if (followTopic) {
      void sendPrompt(leadPathPrompt(followTopic, followTeach, pathRef.current?.kind), { skipUser: true, leadPath: true });
    }
  }

  async function retryImageSearch(messageId: string, userPrompt: string) {
    const prompt = userPrompt.trim();
    if (!prompt || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    setStream({
      id: messageId,
      content: "",
      intent: "ask",
      status: "Searching photos…",
      startedAt: Date.now(),
    });
    keepComposerFocus();
    try {
      const images = await searchImagesClient(prompt);
      const prior = messages.find((item) => item.id === messageId)?.content?.trim();
      await patchChatMessage(project.id, messageId, {
        images,
        content: images.length > 0 ? prior || imageFoundLine(prompt) : prior || imageFailLine(prompt),
      }, chatThreadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image search failed.");
    } finally {
      setStream(null);
      sendingRef.current = false;
      setSending(false);
      keepComposerFocus();
    }
  }

  async function send() {
    const raw = draft.trim();
    if (chips.some((chip) => chip.status === "uploading")) return;
    const attachments = snapshotChatAttachments(chips, materials);
    const slash = consumeSlashCommand(raw);
    if (slash.mode) onChatMode?.(slash.mode);
    const nextSkill = slash.skill ?? skill;
    const prompt = slash.skill || slash.mode ? slash.prompt.trim() : raw;
    if (!prompt && attachments.length === 0) {
      if (slash.skill) setSkill(slash.skill);
      else if (slash.mode) setDraft("");
      return;
    }
    setDraft("");
    setSkill(null);
    keepComposerFocus();
    await sendPrompt(prompt || raw, {
      attachments,
      acceptedTool: guest ? undefined : acceptedToolFromSkill(nextSkill),
    });
  }

  async function beginPath() {
    const current = pathRef.current;
    if (!current || pathIsStarted(current) || sendingRef.current) return;
    const ka = promptIsKa(messages.at(-1)?.content ?? project.title);
    void sendPrompt(ka ? "დავიწყოთ" : "let's start", { skipUser: true, acceptedTool: "start_path" });
  }

  async function continuePath() {
    const current = pathRef.current;
    if (!current || !pathIsStarted(current) || sendingRef.current) return;
    const ka = promptIsKa(messages.at(-1)?.content ?? project.title);
    const open = latestOpenAsk(messages, stream ?? undefined);
    const loc = findNode(current, current.currentNodeId);
    if (open?.question || loc?.node.status === "ready") {
      void sendPrompt(ka ? "შემდეგი თემა" : "next topic", { skipUser: true });
      return;
    }
    const nodes = flattenNodes(current.courses);
    const index = nodes.findIndex((item) => item.id === current.currentNodeId);
    const nextTitle = nodes.slice(index + 1).find((item) => item.status !== "done")?.title;
    const ready = markNodeReady(current, current.currentNodeId);
    pathRef.current = ready;
    setPath(ready);
    void patchStudyPath(project.id, ready.id, { courses: ready.courses }).catch(() => undefined);
    void sendPrompt(moveOnPrompt(nextTitle), { skipUser: true });
  }

  async function continueFollowup() {
    const kind = followup?.kind ?? "sheet";
    setFollowup(null);
    const current = pathRef.current;
    if (current && !pathIsStarted(current)) {
      await beginPath();
      return;
    }
    const loc = current ? findNode(current, current.currentNodeId) : null;
    void sendPrompt(
      resumeAfterWorkPrompt({
        kind,
        nodeTitle: loc?.node.title,
        teach: loc ? nodeTeach(loc.node) : undefined,
      }),
      { skipUser: true, leadPath: Boolean(current && pathIsStarted(current)) },
    );
  }

  async function confirmSuggestion(kind: "practice" | "exam" | "sheet" | "path") {
    if (guest) return;
    const lastUser = [...messages].reverse().find((item) => item.role === "user");
    const prompt = lastUser?.content ?? project.title;
    setSuggest(null);
    keepComposerFocus();
    await sendPrompt(prompt, {
      skipUser: true,
      openWhenReady: kind === "sheet",
      confirmed: true,
      acceptedTool: kind === "sheet" ? "create_sheet" : kind === "path" ? "create_path" : "create_practice",
    });
  }

  async function reportSetFinished(result: SetResult) {
    if (guest) return;
    const current = pathRef.current;
    if (result.mode === "exam" && result.passed && current) {
      const node = findNodeByPracticeSet(current, result.setId);
      if (node) {
        const next = markNodeDone(current, node.id);
        pathRef.current = next;
        setPath(next);
        await patchStudyPath(project.id, next.id, {
          courses: next.courses,
          currentCourseId: next.currentCourseId,
          currentNodeId: next.currentNodeId,
        }).catch(() => undefined);
      }
    }
    await sendPrompt(workFinishedPrompt(result), {
      skipUser: true,
      leadPath: Boolean(current && pathIsStarted(current) && (!current.threadId || current.threadId === chatThreadId)),
    });
  }

  useEffect(() => {
    if (!finishedSet) return;
    const key = `${finishedSet.setId}:${finishedSet.mode}:${finishedSet.correct}/${finishedSet.total}`;
    if (finishedKeyRef.current === key) return;
    finishedKeyRef.current = key;
    const result = finishedSet;
    onFinishedSetHandled?.();
    void reportSetFinished(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedSet]);

  const latestAsk = latestOpenAsk(messages, stream ?? undefined);
  const teachId = latestPathTeachId(messages, stream);
  const teachingHere = Boolean(
    path && pathIsStarted(path) && (!path.threadId || path.threadId === chatThreadId),
  );
  const nowTitle = teachingHere ? findNode(path!, path!.currentNodeId)?.node.title.trim() || "" : "";
  const threadKa = promptIsKa(
    [...messages].reverse().find((item) => item.role === "user")?.content ?? nowTitle,
  );

  useLayoutEffect(() => {
    if (loading || sending || stream) return;
    const examId = latestAsk?.messageId;
    if (!examId || examStickRef.current === examId) return;
    examStickRef.current = examId;
    stickToBottom();
  }, [loading, sending, stream, latestAsk?.messageId, stickToBottom]);

  function assistantInner(message: ChatMessage, prev: ChatMessage | undefined, index: number, live: StreamState | null) {
    const content = stripArtifactMarkup(live ? live.content : message.content);
    const artifact = live?.artifact ?? message.artifact;
    const images = live?.images ?? message.images;
    const options = live?.options ?? message.options;
    const promptAsk = live?.promptAsk ?? message.promptAsk;
    const streaming = Boolean(live && !artifact && content && !messages.some((item) => item.id === live.id));
    const split = splitTeachingExam(content, promptAsk?.question);
    const taught = split.taught;
    const examText = split.exam;
    const view: ChatMessage = { ...message, content: taught, artifact, images, options, promptAsk };
    const sources = sourcesForTurn(view);
    const ka = promptIsKa(prev?.role === "user" ? prev.content : "") || threadKa;
    const orientKa = ka || promptIsKa(taught);
    const showOrient = Boolean(nowTitle && taught && !artifact && message.id === teachId);

    const showRetry = Boolean(images && images.length === 0 && !sending);
    const showClarify =
      options != null &&
      !promptAsk &&
      !sending &&
      !messages.slice(index + 1).some((item) => item.role === "user" || item.role === "assistant");
    const showSuggest =
      suggest?.messageId === message.id &&
      !guest &&
      !sending &&
      chatMode !== "fast";
    const memorized = Boolean(live?.memorized || message.memorized || memorizedIds.has(message.id));
    const latestAssistant = [...messages].reverse().find((item) => item.role === "assistant");
    const waiting =
      Boolean(followup) &&
      !sending &&
      !live &&
      latestAssistant?.id === message.id &&
      ((followup?.kind === "sheet" && artifact?.kind === "sheet") ||
        (followup?.kind === "practice" && artifact?.kind === "practice"));
    const waitLabel =
      followup?.kind === "practice"
        ? followup.ka
          ? "გაიარე…"
          : "Have a look…"
        : followup?.ka
          ? "გადახედე…"
          : "Looking this over…";

    return (
      <div className="flex w-full flex-col">
        <div className="flex flex-col gap-2">
          {memorized ? <MemorizedMark onOpen={() => openSettings("memory")} /> : null}
          {live?.status ? (
            <StatusWait label={live.status} />
          ) : waiting ? (
            <StatusWait label={waitLabel} since={followup?.since} timer />
          ) : workedMs[message.id] != null ? (
            <StatusWait label={formatWorked(workedMs[message.id], ka)} settled />
          ) : null}
          {artifact ? (
            <>
              {!waiting && taught.trim() ? (
                <div className="chat-body text-foreground">
                  <p>{taught.trim()}</p>
                </div>
              ) : null}
              {artifact.kind === "practice" ? (
                <ChatSetCard
                  artifact={artifact}
                  projectId={project.id}
                  userId={userId}
                  ka={orientKa}
                  result={finishedSet?.setId === artifact.id ? finishedSet : undefined}
                  onStart={() => (onStartPractice ?? onOpenArtifact)(artifact)}
                />
              ) : (
                <ArtifactCard
                  artifact={artifact}
                  path={path}
                  showAdvance={isLatestPathCard(message.id, messages, live, artifact.kind)}
                  onOpen={() => onOpenArtifact(artifact)}
                />
              )}
            </>
          ) : taught ? (
            <>
              {showOrient ? (
                <p className="text-[13px] text-muted">
                  {orientKa ? "ახლა განვიხილავთ" : "Now looking at"}
                  {nowTitle ? ` · ${nowTitle}` : ""}
                </p>
              ) : null}
              <RichContent text={taught} streaming={streaming} />
            </>
          ) : null}
          {promptAsk?.question && !waiting && !taught ? (
            <ExamCard question={promptAsk.question} ka={orientKa} />
          ) : examText && !waiting && !taught ? (
            <ExamCard question={examText} ka={orientKa} />
          ) : null}
          {images?.length ? (
            <ImageGallery
              images={images}
              ka={ka}
              moreLabel={ka ? "მეტი" : "More"}
              onOpenUpload={(image) => {
                if (image.materialId) onOpenMaterial?.(image.materialId);
              }}
            />
          ) : null}
          {sources.length ? <SourcesChip items={sources} /> : null}
          {showRetry ? (
            <button
              type="button"
              onClick={() => {
                const promptText = prev?.role === "user" ? prev.content : "";
                if (!promptText) return;
                keepComposerFocus();
                void retryImageSearch(message.id, promptText).finally(keepComposerFocus);
              }}
              className="w-fit rounded-full border border-border px-3 py-1 text-[12px] text-muted hover:border-accent hover:text-foreground"
            >
              Retry
            </button>
          ) : null}
          {showClarify ? (
            <ClarifyChips
              options={options}
              onPick={(value) => {
                keepComposerFocus();
                void sendPrompt(value).finally(keepComposerFocus);
              }}
              onOther={keepComposerFocus}
            />
          ) : null}
          {showSuggest && suggest ? (
            <div className="flex flex-wrap gap-2">
              {suggest.kind === "practice" || suggest.kind === "exam" ? (
                <button
                  type="button"
                  onClick={() => void confirmSuggestion(suggest.kind === "exam" ? "exam" : "practice")}
                  className="rounded-full border border-border px-3 py-1 text-[12px] text-muted hover:border-accent hover:text-foreground"
                >
                  {suggest.kind === "exam"
                    ? ka
                      ? "გამოცდა"
                      : "Take exam"
                    : ka
                      ? "ვარჯიში"
                      : "Practice this"}
                </button>
              ) : suggest.kind === "path" ? (
                <button
                  type="button"
                  onClick={() => void confirmSuggestion("path")}
                  className="rounded-full border border-border px-3 py-1 text-[12px] text-muted hover:border-accent hover:text-foreground"
                >
                  {ka ? "გეგმა" : "Make a plan"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void confirmSuggestion("sheet")}
                  className="rounded-full border border-border px-3 py-1 text-[12px] text-muted hover:border-accent hover:text-foreground"
                >
                  {ka ? "კონსპექტი" : "Make notes"}
                </button>
              )}
            </div>
          ) : null}
          {!live && !sending && latestAssistant?.id === message.id && !guest ? (
            <FollowChips
              ka={ka}
              followup={Boolean(followup)}
              pathStart={Boolean(isMainThread && path && !pathIsStarted(path))}
              teaching={teachingHere}
              hintLabel={threadKa || promptIsKa(latestAsk?.question ?? "") ? "მინიშნება" : "Hint"}
              askQuestion={Boolean(latestAsk?.question)}
              options={latestAsk?.options ?? []}
              onAction={(id) => {
                if (id === "new-chat") {
                  router.push("/new");
                  return;
                }
                if (id === "continue") {
                  if (followup) {
                    void continueFollowup();
                    return;
                  }
                  if (path && !pathIsStarted(path)) {
                    void beginPath();
                    return;
                  }
                  void continuePath();
                  return;
                }
                if (id === "hint") {
                  requestHint();
                  return;
                }
                keepComposerFocus();
                void sendPrompt(id).finally(keepComposerFocus);
              }}
            />
          ) : null}
        </div>
        <div className="message-actions" />
      </div>
    );
  }

  const streamPending = stream && !messages.some((item) => item.id === stream.id);
  const emptyThread = !loading && messages.length === 0 && !stream && !sending;

  function examArticle(id: string, question: string) {
    return (
      <article
        key={`${id}-exam`}
        data-turn={`${id}-exam`}
        className="chat-msg chat-msg-assistant"
      >
        <ExamCard question={question} ka={threadKa} />
      </article>
    );
  }

  function examFor(
    message: Pick<ChatMessage, "id" | "role" | "content" | "promptAsk" | "artifact">,
    live: StreamState | null,
  ) {
    if (message.role !== "assistant") return null;
    const raw = stripArtifactMarkup(live ? live.content : message.content);
    const ask = (live?.promptAsk ?? message.promptAsk)?.question?.trim();
    const { taught, exam } = splitTeachingExam(raw, ask);
    if (!exam || !taught || message.artifact || live?.artifact) return null;
    return examArticle(message.id, exam);
  }

  function requestHint() {
    const ask = latestAsk?.question;
    if (!ask) return;
    void sendPrompt(hintAskPrompt(ask), { skipUser: true, hintAsk: true });
  }

  const pendingExam =
    streamPending && stream
      ? examFor(
          {
            id: stream.id,
            role: "assistant",
            content: stream.content,
            promptAsk: stream.promptAsk,
            artifact: stream.artifact ?? null,
          },
          stream,
        )
      : null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none]"
      >
        <div className="mx-auto w-full max-w-3xl px-6">
          <div className="chat-thread flex flex-col pt-3" style={{ paddingBottom: composerH }}>
            {loading && messages.length === 0 && !stream && !sending && (
              <p className="text-sm text-muted">Loading chat…</p>
            )}
            {emptyThread ? (
              <p className="pb-2 text-sm text-muted">
                {guest ? "Ask anything." : "Ask anything. Attach a file if you want."}
              </p>
            ) : null}
            {messages.map((message, index) => {
              const prev = messages[index - 1];
              const live = stream && message.id === stream.id ? stream : null;
              const exam = examFor(message, live);
              return (
              <Fragment key={message.id}>
              <article
                data-turn={message.id}
                className={`chat-msg ${message.role === "user" ? "chat-msg-user flex justify-end" : "chat-msg-assistant"}`}
              >
                {message.role === "user" ? (
                  <div className="flex w-fit max-w-[min(100%,36rem)] flex-col items-end gap-2">
                    <MessageAttachments items={message.attachments} />
                    {message.content.trim() ? (
                      <div className="chat-body rounded-2xl bg-surface-2 px-4 py-3 text-foreground">
                        <p className="whitespace-pre-wrap">
                          <LinkifiedText text={message.content} />
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  assistantInner(message, prev, index, live)
                )}
              </article>
              {exam}
              </Fragment>
              );
            })}
            {streamPending ? (
              <Fragment key={stream.id}>
              <article
                data-turn={stream.id}
                className="chat-msg chat-msg-assistant"
              >
                {assistantInner(
                  {
                    id: stream.id,
                    projectId: project.id,
                    threadId: chatThreadId,
                    lessonId: null,
                    exerciseId: null,
                    role: "assistant",
                    mode: chatModeRef.current,
                    content: stream.content,
                    attachments: [],
                    relatedExerciseType: null,
                    intent: null,
                    artifact: stream.artifact ?? null,
                    options: stream.options,
                    images: stream.images,
                    createdAt: null,
                    promptAsk: stream.promptAsk,
                  },
                  messages[messages.length - 1],
                  messages.length,
                  stream,
                )}
              </article>
              {pendingExam}
              </Fragment>
            ) : null}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl bg-gradient-to-t from-surface from-[28px] via-surface/95 to-transparent pt-8">
          <div ref={composerBoxRef}>
            <ChatComposer
              ref={composerRef}
              draft={draft}
              onDraft={setDraft}
              sending={sending}
              locked={composerLocked}
              error={needGoogle ? null : error}
              chips={guest ? [] : chips}
              allowAttach={!guest}
              placeholder={!sending && latestAsk?.question ? (threadKa || promptIsKa(latestAsk.question) ? "პასუხი" : "Your answer") : undefined}
              onRemoveChip={(id) => {
                const chip = chips.find((item) => item.id === id);
                setChips((current) => current.filter((item) => item.id !== id));
                if (chip?.previewUrl) URL.revokeObjectURL(chip.previewUrl);
                if (chip?.materialId) {
                  const match = materials.find((item) => item.id === chip.materialId);
                  if (match) void removeMaterial(match);
                }
              }}
              onSend={() => void send()}
              onStop={stoppable ? () => abortRef.current?.abort() : undefined}
              onFile={onFile}
              onPasteText={onPasteText}
              onUrl={onUrl}
              showParameters
              chatMode={chatMode}
              onChatMode={onChatMode}
              skill={guest ? null : skill}
              onSkill={guest ? undefined : setSkill}
              slashSkills={!guest}
            />
            {needGoogle ? (
              <div className="px-4 pb-3">
                <GuestGoogleCta />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MemorizedMark({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-fit items-center gap-1.5 text-[12px] text-muted hover:text-foreground"
    >
      <UiIcon name="brain" size={13} />
      Memorized
    </button>
  );
}
