"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, startTransition, type Dispatch, type SetStateAction } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { usePreferredModel } from "@/components/account/use-preferred-model";
import { useUserProfile } from "@/components/account/use-user-profile";
import { HeadlineVerb } from "@/components/workspace/headline-verb";
import { GuestGoogleCta } from "@/components/guest-google-cta";
import { createChunkBuffer } from "@/lib/ai/chunk-stream";
import { readChatSse } from "@/lib/ai/sse";
import { waitForChatStep } from "@/lib/ai/chat-deadline";
import { upsertToolStatus, type ToolStatusUpdate } from "@/lib/ai/tool-execution";
import { toolStreamsText, type ChatToolCall } from "@/lib/ai/tools";
import { dispatchChatTool, dispatchStatus, analysingStatus, thinkingStatus } from "@/lib/chat/dispatch";
import { latestOpenAsk, splitTeachingExam } from "@/lib/chat/prompt-ask";
import { addChatMessage, allocateChatMessageId, ensureChatThread, patchChatMessage, subscribeChatMessages } from "@/lib/chats";
import { DEFAULT_CHAT_THREAD_ID, DEFAULT_PROJECT_GOAL } from "@/lib/core/constants";
import { figureAttachmentsForTurn, pickChatFigures, shouldAttachChatFigures } from "@/lib/materials/figures";
import { listMaterials, removeMaterial, waitForMaterialPreviews } from "@/lib/materials";
import { ingestMaterialPaste } from "@/lib/materials/ingest-client";
import { discardChatImage, ingestComposerFile } from "@/lib/composer/attach-client";
import { newChipId, attachmentsFromMaterials, snapshotChatAttachments } from "@/lib/composer/attach";
import { patchComposerChip } from "@/lib/composer/chips";
import {
  peekPendingStart,
  takePendingStart,
  type PendingStart,
  type StartIngestResult,
} from "@/lib/workspace/pending-start";
import { peekOpeningPending, takeProjectStartIngest, waitForOpeningProject } from "@/lib/workspace/start-project";
import { authHeaders } from "@/lib/api/client";
import { toImageAttach } from "@/lib/images/client";
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
import { indexChatHistory, mergeChatMessages } from "@/lib/workspace/chat-history";
import { papersInTurns } from "@/lib/blocks/paper-thread";
import { artifactFacts, historyTurnsFromMessages, historyWithoutCurrentPrompt, latestArtifact } from "@/lib/composer/memory";
import { listMemories } from "@/lib/memory/store";
import { cachedLearningProfile, getLearningProfile } from "@/lib/memory/profile";
import { createMemorySession } from "@/lib/memory/session";
import { isExplicitMemoryRequest } from "@/lib/memory/normalize";
import { chatArtifactToActive } from "@/lib/artifacts/active";
import { autoNameChat } from "@/lib/workspace/auto-title";
import { isStudioConfigPrompt, type StudioRequest, type StudioResult } from "@/lib/workspace/studio";
import { executeStudioGeneration } from "@/lib/workspace/studio-generation";
import { saveStudioArtifact } from "@/lib/workspace/studio-store";
import { isRealUserPrompt, needsAutoTitle, DEFAULT_FIRST_PROMPT, PLACEHOLDER_CHAT_TITLE } from "@/lib/workspace/title";
import { loadPracticeProgress } from "@/lib/workspace/practice-progress";
import { workFinishedPrompt, type SetResult } from "@/lib/exercises/session";
import { gateGuestChatTool, guestCapReached, GuestCapError, isGuestUser, recordGuestAssistantTurn, syncGuestAssistantCount } from "@/lib/guest";
import { recipeForGoal } from "@/lib/core/recipes";
import { updateProjectActiveArtifact, updateProjectGoal } from "@/lib/projects";
import { clearUntouchedNotebook } from "@/lib/workspace/draft-notebook";
import { markProjectActivityComplete } from "@/lib/workspace/project-activity";
import {
  MAX_ACTIVE_NAVIGATION_GENERATIONS,
  abortLiveGeneration,
  beginLiveGeneration,
  finishLiveGeneration,
  getActiveGenerationCount,
  getLiveGeneration,
  makeLiveGenerationKey,
  subscribeLiveGeneration,
  updateLiveGeneration,
} from "@/lib/workspace/live-generations";
import { RichContent } from "@/components/rich-content";
import { ChatExerciseProvider } from "@/components/workspace/chat-exercise-context";
import { ChatComposer, type ChatComposerHandle, type ComposerChip } from "@/components/workspace/chat-composer";
import { VirtualChatThread, type VirtualChatThreadHandle } from "@/components/workspace/virtual-chat-thread";
import { LinkifiedText } from "@/components/workspace/linkified-text";
import { StatusWait, formatWorked } from "@/components/workspace/status-wait";
import { ToolActivity } from "@/components/workspace/tool-activity";
import { CitationProvider } from "@/components/workspace/citations";
import { usedSources } from "@/lib/rag/sources";
import { useShell } from "@/components/workspace/shell-context";
import { UiIcon } from "@/components/workspace/ui-icon";
import { getStudySheet } from "@/lib/study-sheets/store";
import { findNode, findNodeByPracticeSet, flattenNodes, hintAskPrompt, leadPathPrompt, markNodeDone, markNodeReady, moveOnPrompt, nodeTeach, pathBriefing, pathIsStarted, resumeAfterWorkPrompt, subscribeStudyPaths } from "@/lib/paths";
import { patchStudyPath } from "@/lib/paths/store";
import { submitAssistantDislike } from "@/lib/feedback/store";
import { stripArtifactMarkup } from "@/lib/composer/memory";
import { chatPath, publicChatId } from "@/lib/workspace/routes";
import type { NotesGenerateEvent } from "@/lib/study-sheets/generate-client";
import type { PathGenerateEvent } from "@/lib/paths/generate-client";
import type { AcceptedChatTool, ActiveArtifact, ActiveArtifactStatus, ChatArtifact, ChatAttachment, ChatImageHit, ChatMessage, ChatMode, ChatTurn, PendingKind, Project } from "@/types";
import type { Material } from "@/types/material";
import type { StudyPath } from "@/types/path";
import type { ProjectGoal } from "@/types/goals";
import type { LessonRecipe } from "@/types/lesson";

const IllustrationBlocks = dynamic(() => import("@/components/workspace/illustration-blocks").then((module) => module.IllustrationBlocks), { ssr: false });
const ClarifyChips = dynamic(() => import("@/components/workspace/clarify-chips").then((module) => module.ClarifyChips), { ssr: false });
const MessageAttachments = dynamic(() => import("@/components/workspace/message-attachments").then((module) => module.MessageAttachments), { ssr: false });
const ArtifactCard = dynamic(() => import("@/components/workspace/artifact-card").then((module) => module.ArtifactCard), { ssr: false });
const ChatSetCard = dynamic(() => import("@/components/exercises/chat-set").then((module) => module.ChatSetCard), { ssr: false });
const ImageGallery = dynamic(() => import("@/components/workspace/image-gallery").then((module) => module.ImageGallery), { ssr: false });
const ReportContentModal = dynamic(() => import("@/components/workspace/report-content-modal").then((module) => module.ReportContentModal), { ssr: false });

type StreamState = {
  id: string;
  content: string;
  intent: ComposerIntent;
  status?: string;
  toolActivity?: ToolStatusUpdate[];
  startedAt?: number;
  artifact?: ChatArtifact | null;
  images?: ChatImageHit[];
  options?: string[];
  promptAsk?: ChatMessage["promptAsk"];
  blocks?: ChatMessage["blocks"];
  sources?: ChatMessage["sources"];
  activity?: string[];
  memorized?: boolean;
  quiet?: boolean;
};

function processForTool(tool: ChatToolCall, ka: boolean): { activity: string; status?: string } | null {
  const detail = (tool.args.topic || tool.args.query || tool.args.instruction || "").replace(/\s+/g, " ").trim().slice(0, 64);
  const suffix = detail ? ` “${detail}”` : "";
  switch (tool.name) {
    case "search_images":
      return { activity: ka ? `ფოტოები მოვძებნე${detail ? `: „${detail}“` : ""}` : `Searched photos${detail ? ` for “${detail}”` : ""}` };
    case "create_sheet":
    case "create_note":
      return { activity: ka ? `ნოუთს ვქმნი${suffix}` : `Creating note${suffix}` };
    case "edit_sheet":
    case "edit_note":
      return { activity: ka ? `ნოუთს ვაახლებ${suffix}` : `Updating note${suffix}` };
    case "create_practice":
      return { activity: ka ? `სავარჯიშოს ვქმნი${suffix}` : `Creating practice${suffix}` };
    case "create_path":
      return { activity: ka ? `სასწავლო გზას ვგეგმავ${suffix}` : `Planning a learning path${suffix}` };
    case "illustrate":
      return { activity: ka ? `ილუსტრაციას ვამზადებ${suffix}` : `Creating an illustration${suffix}` };
    default:
      return null;
  }
}

function processForSource(title: string, ka: boolean): { activity: string; status: string } {
  const source = title.replace(/\s+/g, " ").trim().slice(0, 64) || (ka ? "მასალა" : "source");
  return {
    activity: ka ? `წყარო მოვიძიე: „${source}“` : `Searched source “${source}”`,
    status: ka ? `წყარო: „${source}“` : `Using source “${source}”`,
  };
}

function FollowChips({
  ka: _ka,
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
    actions.push({ id: "continue", label: "Continue", primary: true });
  } else if (pathStart) {
    actions.push({ id: "continue", label: "Continue", primary: true });
  } else if (teaching) {
    if (askQuestion) actions.push({ id: "hint", label: hintLabel });
    for (const option of options) actions.push({ id: option, label: option });
    actions.push({ id: "continue", label: "Continue", primary: true });
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

function SuggestedFollowups({ prompts, onPick }: { prompts: string[]; onPick: (prompt: string) => void }) {
  return (
    <div className="mt-1 flex flex-col gap-1">
      {prompts.slice(0, 2).map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onPick(prompt)}
          className="flex w-fit max-w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[13px] text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <UiIcon name="forward" size={14} />
          <span className="truncate">{prompt}</span>
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
  return mergeChatMessages(prev, merged);
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
): {
  messages: ChatMessage[];
  sending: boolean;
  stream: StreamState | null;
  loading: boolean;
} {
  if (typeof window === "undefined") {
    return { messages: [], sending: false, stream: null, loading: true };
  }
  const startKey = publicChatId(projectId, threadId);
  const pending =
    (threadId === DEFAULT_CHAT_THREAD_ID ? peekOpeningPending(projectId) : null) ??
    peekPendingStart(startKey) ??
    (threadId === DEFAULT_CHAT_THREAD_ID ? peekPendingStart(projectId) : null);
  if (!pending) {
    return { messages: [], sending: false, stream: null, loading: true };
  }
  const messages = pending.prompt.trim() ? [pendingUserMessage(projectId, threadId, pending)] : [];
  return {
    messages,
    sending: true,
    stream: {
      id: `opening-stream-${startKey}`,
      content: "",
      intent: pending.intent ?? DEFAULT_COMPOSER_INTENT,
      status: pending.awaitingIngest ? analysingStatus(undefined) : thinkingStatus(promptIsKa(pending.prompt)),
      startedAt: Date.now(),
    },
    loading: false,
  };
}

const bootstrappedStarts = new Set<string>();

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
  isActive = true,
  threadId = DEFAULT_CHAT_THREAD_ID,
  threadTitle,
  chatMode = "auto",
  onChatMode,
  onComposerHeightChange,
  initialMessages = [],
  onLoadOlder,
  studioRequest = null,
  onStudioRequestHandled,
  onStudioProgress,
  onBusyChange,
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
  isActive?: boolean;
  threadId?: string;
  threadTitle?: string;
  chatMode?: ChatMode;
  onChatMode?: (mode: ChatMode) => void;
  onComposerHeightChange?: (height: number) => void;
  chatLayoutWidth?: number;
  initialMessages?: ChatMessage[];
  onLoadOlder?: (beforeId: string) => Promise<ChatMessage[]>;
  /** Studio runs its selected generator directly once the chat is idle. */
  studioRequest?: StudioRequest | null;
  onStudioRequestHandled?: (id: number, result: StudioResult) => void;
  onStudioProgress?: (id: number, status: string) => void;
  onBusyChange?: (busy: boolean) => void;
  onProjectPatch?: (patch: {
    title?: string;
    goal?: ProjectGoal;
    recipe?: LessonRecipe;
    activeArtifact?: ActiveArtifact | null;
    projectMemory?: string[];
  }) => void;
}) {
  const { user } = useAuth();
  const { profile: userProfile } = useUserProfile();
  const router = useRouter();
  const { model } = usePreferredModel();
  const { openSettings } = useShell();
  const guest = isGuestUser(user);
  const chatThreadId = threadId || DEFAULT_CHAT_THREAD_ID;
  const liveGenerationKey = makeLiveGenerationKey(project.id, chatThreadId);
  const isMainThread = chatThreadId === DEFAULT_CHAT_THREAD_ID;
  const [openingUi] = useState(() => openingChatState(project.id, chatThreadId));
  const subscribeToGeneration = useCallback(
    (listener: () => void) => subscribeLiveGeneration(liveGenerationKey, listener),
    [liveGenerationKey],
  );
  const getGenerationSnapshot = useCallback(
    () => getLiveGeneration<StreamState>(liveGenerationKey),
    [liveGenerationKey],
  );
  const liveGeneration = useSyncExternalStore(subscribeToGeneration, getGenerationSnapshot, () => null);
  const [messages, setMessages] = useState<ChatMessage[]>(openingUi.messages);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  const olderExhaustedRef = useRef(false);
  const olderCursorRef = useRef<string | null>(null);
  const [memorizedIds, setMemorizedIds] = useState<Set<string>>(() => new Set());
  const memorizedRef = useRef<Set<string>>(new Set());
  const [skill, setSkill] = useState<ComposerSkill | null>(null);
  const [loading, setLoading] = useState(openingUi.loading);
  const [sending, setSending] = useState(openingUi.sending || Boolean(liveGeneration));
  const [stoppable, setStoppable] = useState(Boolean(liveGeneration));
  const [error, setError] = useState<string | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [localStream, setLocalStream] = useState<StreamState | null>(() =>
    getLiveGeneration<StreamState>(liveGenerationKey) ? null : openingUi.stream,
  );
  const stream = liveGeneration ? liveGeneration.stream : localStream;
  const setStream: Dispatch<SetStateAction<StreamState | null>> = useCallback((update) => {
    const current = getLiveGeneration<StreamState>(liveGenerationKey);
    if (current) {
      updateLiveGeneration(liveGenerationKey, current.controller, update);
      return;
    }
    setLocalStream(update);
  }, [liveGenerationKey]);
  const [chips, setChips] = useState<ComposerChip[]>([]);
  const removedChipIds = useRef(new Set<string>());
  const unsentChatImages = useRef(new Map<string, ChatAttachment>());
  const uploadEpoch = useRef(0);
  useEffect(() => {
    const owned = unsentChatImages.current;
    uploadEpoch.current += 1;
    return () => {
      uploadEpoch.current += 1;
      for (const image of owned.values()) void discardChatImage(image).catch(() => undefined);
      owned.clear();
    };
  }, [project.id, chatThreadId]);
  const [suggest, setSuggest] = useState<{ messageId: string; kind: "practice" | "exam" | "sheet" | "path" } | null>(null);
  const [suggestedFollowups, setSuggestedFollowups] = useState<{ messageId: string; prompts: string[] } | null>(null);
  const [followup, setFollowup] = useState<{ kind: "sheet" | "practice"; ka: boolean; since: number } | null>(null);
  const [stoppedIds, setStoppedIds] = useState<Set<string>>(() => new Set());
  const [needGoogle, setNeedGoogle] = useState(false);
  const [path, setPath] = useState<StudyPath | null>(null);
  const [workedMs, setWorkedMs] = useState<Record<string, number>>({});
  const [turnReaction, setTurnReaction] = useState<Record<string, "like" | "dislike">>({});
  const [completedSets, setCompletedSets] = useState<Record<string, SetResult>>({});
  const [dislikeOpen, setDislikeOpen] = useState<string | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [expandedUserMessages, setExpandedUserMessages] = useState<Record<string, boolean>>({});
  const pendingPromptScrollRef = useRef<string | null>(openingUi.messages.find((message) => message.role === "user")?.id ?? null);
  const enteringPromptsRef = useRef(new Set(openingUi.messages.filter((message) => message.role === "user").map((message) => message.id)));
  const [historyReady, setHistoryReady] = useState(false);
  const onHistoryReady = useCallback(() => setHistoryReady(true), []);
  const pathRef = useRef<StudyPath | null>(null);
  const artifactStepsRef = useRef<Map<string, NonNullable<ChatArtifact["step"]>>>(new Map());
  const scrollerRef = useRef<HTMLDivElement>(null);
  const historyViewRef = useRef<VirtualChatThreadHandle>(null);
  const composerBoxRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ChatComposerHandle>(null);
  const initialScrollRef = useRef(false);
  const sendingRef = useRef(Boolean(liveGeneration));
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef<StreamState | null>(null);
  const finishedKeyRef = useRef<string | null>(null);
  const previousLiveGenerationRef = useRef(liveGeneration);
  streamRef.current = stream;

  useEffect(() => {
    if (liveGeneration) {
      sendingRef.current = true;
      setSending(true);
      setStoppable(true);
    } else if (previousLiveGenerationRef.current) {
      sendingRef.current = false;
      setSending(false);
      setStoppable(false);
    }
    previousLiveGenerationRef.current = liveGeneration;
  }, [liveGeneration]);

  useEffect(() => {
    if (!initialMessages.length) return;
    setMessages((current) => mergeOpeningMessages(current, initialMessages, artifactStepsRef.current));
    setLoading(false);
  }, [initialMessages]);
  const chatModeRef = useRef(chatMode);
  chatModeRef.current = chatMode;
  const sessionGoalRef = useRef<ProjectGoal | null>(null);
  const bootstrapped = useRef(false);
  const ledPathRef = useRef(false);
  const namedRef = useRef(false);
  const [composerH, setComposerH] = useState(128);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    const keepOpening = Boolean(
      peekPendingStart(publicChatId(project.id, chatThreadId)) ??
        (isMainThread ? peekOpeningPending(project.id) ?? peekPendingStart(project.id) : null),
    );
    if (!keepOpening) {
      olderExhaustedRef.current = false;
      olderCursorRef.current = null;
      initialScrollRef.current = false;
      setLoading(!initialMessages.length);
      setMessages(initialMessages);
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
        mode: chatModeRef.current,
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
          setError(/insufficient permissions/i.test(err.message) ? "Could not open chat." : err.message);
          setLoading(false);
        }
      },
      chatThreadId,
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [project.id, userId, guest, chatThreadId, isMainThread, isActive]);

  useEffect(() => {
    if (!isActive) return;
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
  }, [project.id, guest, isActive]);

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
    memorizedRef.current = new Set();
    setMemorizedIds(new Set());
  }, [project.id, chatThreadId]);

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
    const sync = () => {
      const height = node.offsetHeight;
      if (!height) return;
      setComposerH(height);
      onComposerHeightChange?.(height);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [onComposerHeightChange]);

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
    if (!node || !node.clientHeight) return;
    lockPageScroll();
    historyViewRef.current?.scrollToEnd();
  }, [lockPageScroll]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onScroll = () => {
      if (!scroller.clientHeight) return;
      if (scroller.scrollTop < 160 && initialScrollRef.current && onLoadOlder && !loadingOlderRef.current && !olderExhaustedRef.current && messages[0]?.id) {
        loadingOlderRef.current = true;
        setLoadingOlder(true);
        void onLoadOlder(olderCursorRef.current ?? messages[0].id).then((older) => {
          if (older.length < 40) olderExhaustedRef.current = true;
          if (!older.length) return;
          olderCursorRef.current = older[0].id;
          setMessages((current) => mergeOpeningMessages(current, [...older.filter((message) => message.role !== "system"), ...current], artifactStepsRef.current));
        }).catch(() => setError("Could not load older messages. Scroll up to try again.")).finally(() => {
          loadingOlderRef.current = false;
          setLoadingOlder(false);
        });
      }
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [onLoadOlder, messages]);

  useLayoutEffect(() => {
    if (loading || !historyReady) return;
    if (!initialScrollRef.current && messages.length > 0 && !sending && !stream) {
      initialScrollRef.current = true;
      stickToBottom();
      return;
    }
    const promptId = pendingPromptScrollRef.current;
    if (promptId && messages.some((message) => message.id === promptId)) {
      pendingPromptScrollRef.current = null;
      historyViewRef.current?.scrollToMessage(promptId);
    }
  }, [loading, historyReady, messages, stream, sending, stickToBottom]);

  useEffect(() => {
    if (loading || namedRef.current) return;
    const listed = project.listed === true;
    const namesProject = isMainThread && !listed;
    const currentTitle = namesProject ? project.title : (threadTitle || PLACEHOLDER_CHAT_TITLE);
    if ((namesProject && project.manualTitle) || !needsAutoTitle(currentTitle)) {
      namedRef.current = true;
      return;
    }
    const firstUser = messages.find((item) => item.role === "user" && isRealUserPrompt(item.content));
    if (!firstUser) return;
    namedRef.current = true;
    void autoNameChat({
      projectId: project.id,
      threadId: chatThreadId,
      userId,
      prompt: firstUser.content,
      currentTitle,
      listedProject: listed,
    })
      .then((title) => {
        if (title && namesProject) onProjectPatch?.({ title });
      })
      .catch(() => {
        namedRef.current = false;
      });
  }, [loading, messages, project.id, project.title, project.manualTitle, project.listed, userId, onProjectPatch, chatThreadId, threadTitle, isMainThread]);

  useEffect(() => {
    const startKey = publicChatId(project.id, chatThreadId);
    const key = `${project.id}:${chatThreadId}`;
    if (bootstrappedStarts.has(key) || bootstrapped.current) return;
    const pending =
      (isMainThread ? peekOpeningPending(project.id) : null) ??
      peekPendingStart(startKey) ??
      (isMainThread ? peekPendingStart(project.id) : null);
    const ingest = takeProjectStartIngest(startKey) ?? (isMainThread ? takeProjectStartIngest(project.id) : null);
    if (!pending && !ingest) return;
    bootstrapped.current = true;
    bootstrappedStarts.add(key);
    if (pending) {
      takePendingStart(startKey);
      if (isMainThread) takePendingStart(project.id);
    }
    const runStart = async () => {
      setError(null);
      setCanRetry(false);
      try {
        await waitForChatStep("Opening notebook", () => waitForOpeningProject(project.id));
        await bootstrap(pending ?? { prompt: "", materialIds: [], awaitingIngest: true }, ingest);
      } catch (err: unknown) {
        setError(err instanceof Error && err.message.trim() ? err.message : "Could not start.");
        setSending(false);
        setStream(null);
        sendingRef.current = false;
        setCanRetry(true);
      }
    };
    retryRef.current = () => { void runStart(); };
    void runStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, isMainThread, chatThreadId]);

  async function addChip(start: ComposerChip, work: () => Promise<string | ChatAttachment>) {
    const epoch = uploadEpoch.current;
    removedChipIds.current.delete(start.id);
    setChips((current) =>
      current.some((chip) => chip.id === start.id)
        ? patchComposerChip(current, start.id, { ...start, status: "uploading", error: undefined })
        : [...current, start],
    );
    setError(null);
    retryRef.current = () => {
      void addChip(start, work);
    };
    setCanRetry(true);
    try {
      const result = await work();
      const materialId = typeof result === "string" ? result : result.materialId;
      if (typeof result !== "string" && (removedChipIds.current.delete(start.id) || epoch !== uploadEpoch.current)) {
        await discardChatImage(result);
        return;
      }
      if (typeof result !== "string") unsentChatImages.current.set(start.id, result);
      const latest = materialId ? await listMaterials(project.id) : [];
      const match = latest.find((item) => item.id === materialId);
      setChips((current) =>
        current.map((chip) =>
          chip.id === start.id
            ? {
                ...chip, status: "ready", materialId,
                storagePath: typeof result === "string" ? match?.storagePath : result.storagePath,
                ...(typeof result !== "string" ? { type: result.type, size: result.sizeBytes } : {}),
              }
            : chip,
        ),
      );
      retryRef.current = null;
      setCanRetry(false);
    } catch (err) {
      const message = err instanceof Error && err.message.trim() ? err.message : "Upload failed.";
      setChips((current) => patchComposerChip(current, start.id, { status: "error", error: message }));
    } finally {
      setChips((current) => current.some((chip) => chip.id === start.id && chip.status === "uploading")
        ? patchComposerChip(current, start.id, { status: "error", error: "Upload failed." })
        : current);
      markProjectActivityComplete(project.id);
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
      () => ingestComposerFile({ projectId: project.id, userId, file }),
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
      () => Promise.resolve({ title: url, type: "url" }),
    );
  }

  async function bootstrap(pending: PendingStart, ingest?: Promise<StartIngestResult> | null) {
    const latest = pending.materialIds.length
      ? await waitForChatStep("Loading sources", () => listMaterials(project.id))
      : materials;
    const pool = latest.length > 0 ? latest : materials;
    const attachments = [...attachmentsFromMaterials(pending.materialIds, pool), ...(pending.attachments ?? [])];
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
    await waitForChatStep("Saving attachments", () => addChatMessage({
      projectId: project.id,
      userId,
      role: "user",
      mode: chatModeRef.current,
      intent: "ask",
      content: "",
      attachments,
      threadId: chatThreadId,
    }));
  }

  async function streamChat(input: {
    prompt: string;
    history: ChatTurn[];
    appendPrefix?: string;
    materialIds: string[];
    linkUrls?: string[];
    figures?: { name: string; page: number; path: string; mime: string; data: string }[];
    confirmed?: boolean;
    acceptedTool?: AcceptedChatTool;
    pendingKind?: PendingKind;
    leadPath?: boolean;
    skipMemory?: boolean;
    hintAsk?: boolean;
    examAsk?: boolean;
    replyTo?: string;
    onFirstToken?: () => void;
    onActivity?: (activity: string, status?: string) => void;
    signal?: AbortSignal;
  }): Promise<{ text: string; tool: ChatToolCall; memory: Promise<boolean>; sources: NonNullable<ChatMessage["sources"]>; imageSearchResults?: ChatImageHit[]; aborted?: boolean }> {
    const facts = artifactFacts(messages);
    const latest = latestArtifact(messages);
    const active = resolveActive();
    const activeNote = !guest && active?.kind === "study_sheet"
      ? await waitForChatStep("Loading active note", () => getStudySheet(project.id, active.id), { signal: input.signal, timeoutMs: 2_000 }).catch(() => null)
      : null;
    const pending = pendingCreateFromMessages(messages);
    const pendingKind = input.pendingKind ?? resolvePendingKind(input.prompt, pending);
    const [memories, personalization] = guest
      ? [[], ""]
      : await Promise.all([
          waitForChatStep("Loading memory", () => listMemories(userId), { signal: input.signal, timeoutMs: 2_000 }).catch(async (error) => {
            input.signal?.throwIfAborted();
            console.warn("[chat-send] using cached memory", error.name);
            return waitForChatStep("Loading cached memory", () => listMemories(userId, true), { signal: input.signal, timeoutMs: 250 })
              .catch(() => { input.signal?.throwIfAborted(); return []; });
          }),
          waitForChatStep("Loading preferences", () => getLearningProfile(userId), { signal: input.signal, timeoutMs: 2_000 }).catch((error) => {
            input.signal?.throwIfAborted();
            console.warn("[chat-send] using cached preferences", error.name);
            return cachedLearningProfile(userId);
          }),
        ]);
    const turnId = streamRef.current?.id;
    const memorySession = createMemorySession({
      skip: guest || input.skipMemory,
      threadId: chatThreadId,
      userId,
      prompt: input.prompt,
      memories,
      personalization,
      history: input.history,
      projectId: project.id,
      projectMemory: project.projectMemory,
      onProjectMemory: (lines) => onProjectPatch?.({ projectMemory: lines }),
    });
    const memory = memorySession.updates;
    void memory.then((saved) => {
      if (!saved || !turnId || !isExplicitMemoryRequest(input.prompt)) return;
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
    const headers = await waitForChatStep("Verifying your session", () => authHeaders(), { signal: input.signal });
    const response = await waitForChatStep("Connecting to the response server", () => fetch("/api/chat", {
      method: "POST",
      headers,
      signal: input.signal,
      body: JSON.stringify({
        prompt: input.prompt,
        mode: chatModeRef.current,
        provider: "gemini",
        model,
        history: input.history,
        context: {
          projectId: project.id,
          projectTitle: project.title,
          projectDescription: project.description,
          projectMemory: project.projectMemory,
          goal: sessionGoalRef.current ?? DEFAULT_PROJECT_GOAL,
          materialIds: input.materialIds,
          linkUrls: input.linkUrls,
          materials: [],
          figures: input.figures,
          knowledgeItems: [],
          memories,
          personalization: personalization || undefined,
          artifacts: facts,
          latestArtifact: latest,
          activeArtifact: active ? { ...activeContext(active), ...(activeNote ? { noteKind: activeNote.kind ?? "study" } : {}) } : null,
          hasMaterials: poolFrom().length > 0,
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
          replyTo: input.replyTo,
          threadPaper: papersInTurns(messages).length > 0,
        },
      }),
    }), { signal: input.signal, timeoutMs: 45_000 });

    let tool: ChatToolCall = { name: "answer", args: {} };
    let sources: NonNullable<ChatMessage["sources"]> = [];
    let imageSearchResults: ChatImageHit[] | undefined;
    const chunks = createChunkBuffer((text) => {
      if (!toolStreamsText(tool.name)) return;
      startTransition(() => {
        setStream((current) =>
          current
            ? { ...current, content: `${input.appendPrefix ?? ""}${text}`, intent: intentFromTool(tool.name), ...(text.trim() ? { status: undefined, toolActivity: undefined } : {}) }
            : current,
        );
      });
    }, { deltaMode: "append" });
    try {
      const result = await readChatSse(response, {
        onDelta: (delta) => {
          input.onFirstToken?.();
          chunks.push(delta);
        },
        onSources: (list) => {
          sources = list;
          setStream((current) => (current ? { ...current, sources: list } : current));
          for (const source of list.slice(0, 3)) {
            const process = processForSource(source.title, promptIsKa(input.prompt));
            input.onActivity?.(process.activity, process.status);
          }
        },
        onStatus: (status) => input.onActivity?.("", status),
        onToolStatus: (update) => setStream((current) => current ? {
          ...current,
          toolActivity: upsertToolStatus(current.toolActivity ?? [], update),
        } : current),
        onImages: (list) => {
          imageSearchResults = list;
          setStream((current) => current ? { ...current, images: list } : current);
        },
        onTool: (next) => {
          input.onFirstToken?.();
          tool = next;
          const process = processForTool(next, promptIsKa(input.prompt));
          if (process) input.onActivity?.(process.activity, process.status);
          if (!toolStreamsText(next.name)) {
            const intent = intentFromTool(next.name);
            setStream((current) =>
              current
                ? { ...current, content: "", intent, status: dispatchStatus(intent, next.name, promptIsKa(input.prompt)) }
                : current,
            );
          }
        },
      }, { signal: input.signal });
      await chunks.drain();
      const full = chunks.finish();
      tool = result.tool ?? tool;
      const text = full.trim() || tool.args.question || "";
      if (toolStreamsText(tool.name) && !text && tool.name !== "search_images" && !chunks.raw.trim()) {
        throw new Error("The model returned an empty reply.");
      }
      if (turnId) memorySession.observe({ turnId, answer: text });
      return { text, tool, memory, sources, imageSearchResults };
    } catch (err) {
      const partial = chunks.finish();
      if (
        input.signal?.aborted ||
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        return { text: partial, tool, memory, sources, imageSearchResults, aborted: true };
      }
      throw err;
    }
  }

  function poolFrom(override?: Material[]) {
    return override ?? materials;
  }

  async function materialsForTurn(attachments: ChatAttachment[], override?: Material[]): Promise<Material[]> {
    const attachedIds = attachments.flatMap((item) => (item.materialId ? [item.materialId] : []));
    let source = override ?? materials;
    const missingAttached = attachedIds.some((id) => !source.some((item) => item.id === id));
    if (missingAttached) {
      source = await listMaterials(project.id);
    }
    return source;
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
      waitForIngest?: Promise<StartIngestResult>;
      leadPath?: boolean;
      hintAsk?: boolean;
      examAsk?: boolean;
      replyTo?: string;
      userMessageId?: string;
      studio?: boolean;
      resumeAssistantId?: string;
      resumePrefix?: string;
      resumeHistory?: ChatTurn[];
      onUserMessageSaved?: () => void;
    },
  ) {
    let attachments = guest ? [] : (options?.attachments ?? []);
    const ingest = guest ? undefined : options?.waitForIngest;
    let modelPrompt =
      prompt.trim() ||
      (attachments.length ? DEFAULT_FIRST_PROMPT : "");
    if ((!modelPrompt && !ingest) || sendingRef.current) return;
    if (getLiveGeneration<StreamState>(liveGenerationKey)) {
      setError("A response is already running for this conversation. Switch back to its project tab to follow it.");
      return;
    }
    if (getActiveGenerationCount() >= MAX_ACTIVE_NAVIGATION_GENERATIONS) {
      setError("Three project responses are already running. Wait for one to finish before starting another.");
      return;
    }
    if (guest && guestCapReached(messages.filter((item) => item.role === "assistant").length)) {
      setNeedGoogle(true);
      return;
    }

    clearUntouchedNotebook(project.id);

    // Sending owns its photo snapshot before any await; chip removal cannot delete it mid-send.
    const entryEpoch = uploadEpoch.current;
    const claimed = options?.skipUser ? [] : [...unsentChatImages.current].filter(([, image]) => attachments.some((item) => item.storagePath === image.storagePath));
    for (const [id] of claimed) unsentChatImages.current.delete(id);
    const restoreClaimed = () => {
      for (const [id, image] of claimed) {
        if (entryEpoch === uploadEpoch.current && !removedChipIds.current.has(id)) unsentChatImages.current.set(id, image);
        else void discardChatImage(image).catch(() => undefined);
      }
    };
    let pool: Material[];
    let previewIds = guest ? [] : (options?.waitForPreview ?? []).filter(Boolean);
    const analysing = Boolean(ingest) || previewIds.length > 0;
    const assistantId = options?.resumeAssistantId ?? allocateChatMessageId(project.id, chatThreadId);
    const activity: string[] = [];
    const recordActivity = (entry: string, status?: string) => {
      const clean = entry.replace(/\s+/g, " ").trim().slice(0, 100);
      if (clean && !activity.includes(clean) && activity.length < 5) activity.push(clean);
      setStream((current) => current?.id === assistantId
        ? { ...current, activity: [...activity], ...(status ? { status } : {}) }
        : current);
    };

    const controller = new AbortController();
    const initialStream: StreamState = {
      id: assistantId,
      content: options?.resumePrefix ?? "",
      intent: "ask",
      status: options?.leadPath
        ? "Teaching…"
        : options?.examAsk
          ? thinkingStatus(promptIsKa(modelPrompt))
          : options?.hintAsk
            ? "Hint…"
            : analysing
              ? analysingStatus(attachments)
              : thinkingStatus(promptIsKa(modelPrompt)),
      startedAt: Date.now(),
      quiet: Boolean(options?.studio),
    };
    if (!beginLiveGeneration({
      key: liveGenerationKey,
      projectId: project.id,
      threadId: chatThreadId,
      controller,
      stream: initialStream,
    })) {
      restoreClaimed();
      setError("Three project responses are already running. Wait for one to finish before starting another.");
      return;
    }
    streamRef.current = initialStream;
    sendingRef.current = true;
    const savedUserMessageId = options?.userMessageId ?? allocateChatMessageId(project.id, chatThreadId);
    if (!options?.skipUser && !options?.studio) {
      pendingPromptScrollRef.current = savedUserMessageId;
      enteringPromptsRef.current.add(savedUserMessageId);
    }
    abortRef.current = controller;
    setSending(true);
    setStoppable(true);
    setError(null);
    if (options?.resumeAssistantId) {
      setMessages((current) => current.map((item) => item.id === assistantId
        ? { ...item, responseStatus: undefined }
        : item));
      setStoppedIds((current) => {
        const next = new Set(current);
        next.delete(assistantId);
        return next;
      });
    }
    retryRef.current = () => {
      void sendPrompt(prompt, { ...options, userMessageId: savedUserMessageId });
    };
    setCanRetry(true);
    setSuggest(null);
    setSuggestedFollowups(null);
    setFollowup(null);
    setStream(initialStream);
    initialScrollRef.current = !options?.studio;

    const history = options?.resumeHistory ?? historyWithoutCurrentPrompt(historyTurnsFromMessages(messages), modelPrompt);
    let followTopic: string | undefined;
    let followTeach: string | undefined;
    const recordResponseStatus = async (
      responseStatus: NonNullable<ChatMessage["responseStatus"]>,
      content: string,
    ) => {
      const active = streamRef.current;
      const intent = active?.intent ?? "ask";
      const memorized = memorizedRef.current.has(assistantId) || undefined;
      const message: ChatMessage = {
        id: assistantId,
        projectId: project.id,
        threadId: chatThreadId,
        lessonId: null,
        exerciseId: null,
        role: "assistant",
        mode: chatModeRef.current,
        content,
        attachments: [],
        relatedExerciseType: null,
        intent,
        artifact: active?.artifact ?? null,
        activity: activity.length ? [...activity] : undefined,
        options: active?.options,
        images: active?.images,
        blocks: active?.blocks,
        sources: active?.sources,
        memorized,
        responseStatus,
        createdAt: null,
      };
      setMessages((current) => current.some((item) => item.id === assistantId)
        ? current.map((item) => item.id === assistantId ? { ...item, ...message } : item)
        : [...current, message]);
      await waitForChatStep("Saving response status", () => addChatMessage({
        id: assistantId,
        projectId: project.id,
        role: "assistant",
        mode: chatModeRef.current,
        intent,
        content,
        responseStatus,
        artifact: active?.artifact,
        activity,
        options: active?.options,
        images: active?.images,
        blocks: active?.blocks,
        sources: active?.sources,
        memorized,
        threadId: chatThreadId,
      }), { timeoutMs: 3_000 });
    };

    try {
      try {
        pool = await waitForChatStep("Loading sources", () => materialsForTurn(attachments, options?.materials), { signal: controller.signal });
        if (entryEpoch !== uploadEpoch.current) throw new DOMException("Aborted", "AbortError");
      } catch (error) {
        restoreClaimed();
        throw error;
      }
      let userMessageId: string | null = null;
      if (!options?.skipUser) {
        let userWriteStarted = false;
        try {
          setStream((current) => current ? { ...current, status: "Sending…" } : current);
          userMessageId = await waitForChatStep("Saving message", () => {
            userWriteStarted = true;
            const pending = addChatMessage({
            id: savedUserMessageId,
            projectId: project.id,
            userId,
            role: "user",
            mode: chatModeRef.current,
            intent: "ask",
            content: prompt,
            attachments,
            threadId: chatThreadId,
            });
            // A timed-out Firestore write may still commit after reconnecting.
            // Only a definitive rejection returns its images to unsent cleanup.
            void pending.catch(() => restoreClaimed());
            return pending;
          }, { signal: controller.signal });
          options?.onUserMessageSaved?.();
        } catch (error) {
          if (!userWriteStarted) restoreClaimed();
          throw error;
        }
        setChips((current) => {
          for (const chip of current) {
            if (chip.previewUrl) URL.revokeObjectURL(chip.previewUrl);
          }
          return [];
        });
      }

      if (ingest) {
        const ingestedResult = await waitForChatStep("Preparing attachments", () => ingest, { signal: controller.signal, timeoutMs: 120_000 });
        const ids = ingestedResult.materialIds;
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const latest = await waitForChatStep("Loading sources", () => listMaterials(project.id), { signal: controller.signal });
        const ingested = [...attachmentsFromMaterials(ids, latest), ...ingestedResult.attachments];
        pool = await waitForChatStep("Loading sources", () => materialsForTurn([...attachments, ...ingested], latest), { signal: controller.signal });
        previewIds = [...new Set([...previewIds, ...ids])];
        const visible = [
          ...attachments,
          ...ingested.filter((item) => item.type !== "url" || !prompt.includes(item.title)),
        ].filter((item, index, list) => list.findIndex((row) =>
          item.materialId ? row.materialId === item.materialId : item.storagePath ? row.storagePath === item.storagePath : row === item,
        ) === index);
        attachments = visible;
        if (userMessageId && visible.length > 0) {
          await waitForChatStep("Saving attachments", () => patchChatMessage(project.id, userMessageId!, { attachments: visible }, chatThreadId), { signal: controller.signal });
        }
      }

      modelPrompt =
        prompt.trim() ||
        (attachments.length ? DEFAULT_FIRST_PROMPT : "");
      if (!modelPrompt) throw new Error("Type a prompt or attach a source to start.");

      const previewMissing = previewIds.some((id) => !pool.find((item) => item.id === id)?.extractedTextPreview.trim());
      if (previewMissing) {
        pool = await waitForChatStep("Preparing source previews", () => waitForMaterialPreviews(project.id, previewIds), { signal: controller.signal, timeoutMs: 35_000 });
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        pool = await waitForChatStep("Loading sources", () => materialsForTurn([...attachments, ...attachmentsFromMaterials(previewIds, pool)], pool), { signal: controller.signal });
      }

      const ka = promptIsKa(modelPrompt);
      setStream((current) => (current
        ? { ...current, status: pool.length ? (ka ? "მასალებში ვეძებ…" : "Searching sources…") : thinkingStatus(ka) }
        : current));
      applyInferredGoal(modelPrompt);

      const startedAt = performance.now();
      const mappingPath = options?.acceptedTool === "create_path" || wantsPath(modelPrompt);
      // Passages come from the server-side index. Only the selection travels with the request.
      const attachedIds = attachments.flatMap((item) => (item.materialId ? [item.materialId] : []));
      const sourceIds = selectedIds.length > 0 ? [...new Set([...selectedIds, ...attachedIds])] : [];
      const visionAttachments = figureAttachmentsForTurn(modelPrompt, attachments, messages);
      const attachFigures = !mappingPath && shouldAttachChatFigures(modelPrompt, pool, visionAttachments);
      const picked = attachFigures
        ? await waitForChatStep("Loading attached images", () => pickChatFigures(modelPrompt, pool, visionAttachments), { signal: controller.signal, timeoutMs: 20_000 })
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
        appendPrefix: options?.resumePrefix,
        materialIds: sourceIds,
        linkUrls: attachments.filter((item) => item.type === "url").map((item) => item.title),
        figures,
        confirmed: options?.confirmed,
        acceptedTool: guest ? undefined : options?.acceptedTool,
        pendingKind: pendingKind ?? undefined,
        leadPath: options?.leadPath,
        skipMemory: options?.skipUser,
        hintAsk: options?.hintAsk,
        examAsk: options?.examAsk,
        replyTo: options?.replyTo,
        onFirstToken: markFirstToken,
        onActivity: recordActivity,
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
          current ? { ...current, content: options?.resumePrefix ?? "", intent, status: dispatchStatus(intent, tool.name, promptIsKa(modelPrompt)) } : current,
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
        imageSearchResults: streamed.imageSearchResults,
        signal: controller.signal,
        hintAsk: options?.hintAsk,
        examAsk: options?.examAsk,
        onStatus: (status) =>
          setStream((current) =>
            current
              ? { ...current, content: toolStreamsText(tool.name) ? text : "", intent, status }
              : current,
          ),
        onToolStatus: (update) => setStream((current) => current ? {
          ...current,
          toolActivity: upsertToolStatus(current.toolActivity ?? [], update),
        } : current),
        onNotesEvent: guest ? undefined : onNotesLive,
        onPathEvent: guest ? undefined : onPathLive,
      });

      let artifact = dispatched.artifact ?? null;
      if (artifact && (artifact.kind === "sheet" || artifact.kind === "plan")) {
        try {
          const sheet = await waitForChatStep("Loading note details", () => getStudySheet(project.id, artifact!.id), { signal: controller.signal, timeoutMs: 2_000 });
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
      const generatedContent = leadExam?.taught || dispatched.content;
      const content = options?.resumePrefix
        ? `${options.resumePrefix.trimEnd()}${generatedContent.trim() ? `\n\n${generatedContent.trimStart()}` : ""}`
        : generatedContent;
      const promptAsk =
        options?.leadPath && modelPrompt.startsWith("Tutor-lead (not a user request):")
          ? undefined
          : dispatched.promptAsk;
      const imageAttaches = (dispatched.images ?? []).flatMap((hit) => {
        const attach = toImageAttach(hit);
        return attach ? [attach] : [];
      });
      console.info("[chat-send]", {
        imageAttaches,
        fileGets,
        msUntilFirstToken,
      });
      setStream((current) =>
        current
          ? {
              ...current,
              content,
              toolActivity: undefined,
              intent: dispatched.intent,
              artifact: artifact,
              activity: activity.length ? [...activity] : undefined,
              images: dispatched.images,
              options: dispatched.options,
              promptAsk,
              blocks: dispatched.blocks,
              status: artifact
                ? "Done"
                : undefined,
            }
          : current,
      );

      if (artifact?.step) artifactStepsRef.current.set(assistantId, artifact.step);
      const id = options?.studio
        ? assistantId
        : await waitForChatStep("Saving response", () => addChatMessage({
        id: assistantId,
        projectId: project.id,
        role: "assistant",
        mode: chatModeRef.current,
        intent: dispatched.intent,
        content,
        artifact,
        activity,
        options: dispatched.options,
        pendingKind: dispatched.pendingKind,
        images: dispatched.images,
        promptAsk,
        blocks: dispatched.blocks,
        sources: toolStreamsText(tool.name) ? usedSources(content, streamed.sources) : undefined,
        memorized: memorizedRef.current.has(assistantId) || undefined,
        threadId: chatThreadId,
      }), { signal: controller.signal });
      if (!options?.studio) {
        void streamed.memory.then((saved) => {
          if (!saved) return;
          markMemorized(id);
          void patchChatMessage(project.id, id, { memorized: true }, chatThreadId).catch(() => undefined);
        });
        if (guest) {
          recordGuestAssistantTurn();
          if (guestCapReached()) setNeedGoogle(true);
        }
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
        await waitForChatStep("Updating notebook", () => rememberActive(artifact!, "ready"), { signal: controller.signal, timeoutMs: 2_000 })
          .catch(() => controller.signal.throwIfAborted());
      }
      if (!options?.studio && dispatched.suggest && !guest && chatModeRef.current !== "fast" && !isSimpleChatTask(modelPrompt)) {
        setSuggest({ messageId: id, kind: dispatched.suggest });
      }
      const responseFollowups =
        streamed.tool.name === "answer" &&
        !promptAsk &&
        !artifact &&
        !dispatched.suggest
          ? (streamed.tool.args.options ?? [])
              .map((item) => item.trim())
              .filter((item) => item.endsWith("?") && item.length <= 160)
              .slice(0, 3)
          : [];
      if (!options?.studio && responseFollowups.length > 0) {
        setSuggestedFollowups({ messageId: id, prompts: responseFollowups });
      }
      if (!options?.studio && !guest && dispatched.artifact?.kind === "sheet" && tool.name !== "create_note" && tool.name !== "edit_note") {
        setFollowup({ kind: "sheet", ka: promptIsKa(modelPrompt), since: Date.now() });
      }
      if (dispatched.openThreadId && pathRef.current) {
        const opened = { ...pathRef.current, started: true, threadId: dispatched.openThreadId };
        pathRef.current = opened;
        setPath(opened);
      }
      settleWorked(assistantId);
      setStream(null);
      retryRef.current = null;
      setCanRetry(false);
      if (dispatched.openThreadId && dispatched.openThreadId !== chatThreadId && isCurrentConversationRoute()) {
        router.push(chatPath(dispatched.openThreadId));
      } else if (dispatched.leadTopic && !options?.leadPath && !guest) {
        followTopic = dispatched.leadTopic;
        followTeach = dispatched.leadTeach;
      }
    } catch (err) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError") || (err instanceof Error && err.name === "AbortError")) {
        streamRef.current = getLiveGeneration<StreamState>(liveGenerationKey)?.stream ?? streamRef.current;
        const partial = stripArtifactMarkup(
          (err as { partial?: string }).partial ?? streamRef.current?.content ?? "",
        ).trim();
        if (!options?.studio) {
          await recordResponseStatus("stopped", partial).catch(() => undefined);
          setStoppedIds((current) => new Set(current).add(assistantId));
        }
        setSuggestedFollowups(null);
        setError(null);
        retryRef.current = null;
        setCanRetry(false);
        onNotesLive?.(null);
        onPathLive?.(null);
      } else if (err instanceof GuestCapError) {
        setNeedGoogle(true);
        setError(null);
        retryRef.current = null;
        setCanRetry(false);
      } else {
        setError(err instanceof Error ? err.message : "Could not send message.");
        if (!options?.studio) {
          const partial = stripArtifactMarkup(streamRef.current?.content ?? "").trim();
          await recordResponseStatus("failed", partial).catch(() => undefined);
        }
        onNotesLive?.(null);
        onPathLive?.(null);
      }
      settleWorked(assistantId);
      setStream(null);
    } finally {
      controller.abort();
      if (abortRef.current === controller) abortRef.current = null;
      sendingRef.current = false;
      setSending(false);
      setStoppable(false);
      finishLiveGeneration(liveGenerationKey, controller);
      keepComposerFocus();
      markProjectActivityComplete(project.id);
    }
    if (followTopic) {
      void sendPrompt(leadPathPrompt(followTopic, followTeach, pathRef.current?.kind), { skipUser: true, leadPath: true });
    }
  }

  async function sendFormReply(text: string) {
    keepComposerFocus();
    await new Promise<void>((resolve, reject) => {
      let saved = false;
      void sendPrompt(text, { onUserMessageSaved: () => { saved = true; resolve(); } })
        .then(() => { if (!saved) reject(new Error("Answers were not sent.")); }, reject);
    });
  }

  function isCurrentConversationRoute() {
    if (typeof window === "undefined") return false;
    const id = publicChatId(project.id, chatThreadId);
    return window.location.pathname === `/p/${id}` || window.location.pathname === chatPath(id);
  }

  async function send() {
    const raw = composerRef.current?.getDraft().trim() ?? "";
    if (chips.some((chip) => chip.status === "uploading")) return;
    const attachments = snapshotChatAttachments(chips, materials);
    const slash = consumeSlashCommand(raw);
    if (slash.mode) onChatMode?.(slash.mode);
    const nextSkill = slash.skill ?? skill;
    const prompt = slash.skill || slash.mode ? slash.prompt.trim() : raw;
    if (!prompt && attachments.length === 0) {
      if (slash.skill) setSkill(slash.skill);
      else if (slash.mode) composerRef.current?.setDraft("");
      return;
    }
    composerRef.current?.setDraft("");
    setSkill(null);
    keepComposerFocus();
    await sendPrompt(prompt || raw, {
      attachments,
      acceptedTool: guest ? undefined : acceptedToolFromSkill(nextSkill),
    });
  }

  function resumeStoppedResponse() {
    if (sendingRef.current) return;
    let assistantIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === "assistant") {
        assistantIndex = index;
        break;
      }
    }
    if (assistantIndex < 0) return;
    const stopped = messages[assistantIndex];
    const prefix = stripArtifactMarkup(stopped.content).trim();
    if (!(stopped.responseStatus === "stopped" || stoppedIds.has(stopped.id)) || stopped.artifact || !prefix) return;

    const history: ChatTurn[] = historyTurnsFromMessages(messages.slice(0, assistantIndex));
    history.push({ role: "assistant", content: prefix });
    void sendPrompt(
      "Continue your previous answer from where it stopped. Keep the saved text unchanged, do not repeat it, and finish the response naturally.",
      {
        skipUser: true,
        resumeAssistantId: stopped.id,
        resumePrefix: prefix,
        resumeHistory: history,
      },
    );
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

  const studioHandledRef = useRef<number | null>(null);
  useEffect(() => {
    if (!studioRequest || guest || sending || loading) return;
    if (studioHandledRef.current === studioRequest.id) return;
    studioHandledRef.current = studioRequest.id;
    const request = studioRequest;
    const controller = new AbortController();
    sendingRef.current = true;
    abortRef.current = controller;
    setSending(true);
    setStoppable(true);
    void executeStudioGeneration({
      request,
      signal: controller.signal,
      generate: async () => {
        const pool = materials.filter((item) => request.sourceIds.includes(item.id) && item.status === "ready");
        if (pool.length !== request.sourceIds.length) throw new Error("Some selected sources are not ready. Wait for them or choose another topic.");
        if (!request.tool) throw new Error("Choose a Studio generator first.");
        return dispatchChatTool({
          origin: "studio",
          tool: { name: request.tool, args: { instruction: request.prompt } },
          text: "",
          prompt: request.prompt,
          project,
          userId,
          materials: pool,
          active: null,
          signal: controller.signal,
          onStatus: (status) => onStudioProgress?.(request.id, status),
        });
      },
      save: (artifact) => waitForChatStep("Saving Studio output", () => saveStudioArtifact(project.id, request.type, artifact), { signal: controller.signal, timeoutMs: 15_000 }),
    }).then((result) => onStudioRequestHandled?.(request.id, result)).finally(() => {
      controller.abort();
      if (abortRef.current === controller) abortRef.current = null;
      sendingRef.current = false;
      setSending(false);
      setStoppable(false);
      markProjectActivityComplete(project.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioRequest, sending, loading]);

  useEffect(() => {
    onBusyChange?.(sending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sending]);

  useEffect(() => {
    if (!finishedSet) return;
    const key = `${finishedSet.setId}:${finishedSet.mode}:${finishedSet.correct}/${finishedSet.total}`;
    if (finishedKeyRef.current === key) return;
    finishedKeyRef.current = key;
    const result = finishedSet;
    setCompletedSets((current) => ({ ...current, [result.setId]: result }));
    onFinishedSetHandled?.();
    void reportSetFinished(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedSet]);

  const history = useMemo(() => indexChatHistory(messages), [messages]);
  const latestAsk = useMemo(() => latestOpenAsk(messages, stream ?? undefined), [messages, stream]);
  const teachId = useMemo(() => latestPathTeachId(messages, stream), [messages, stream]);
  const teachingHere = Boolean(
    path && pathIsStarted(path) && (!path.threadId || path.threadId === chatThreadId),
  );
  const nowTitle = teachingHere ? findNode(path!, path!.currentNodeId)?.node.title.trim() || "" : "";
  const threadKa = promptIsKa(
    messages[history.lastUserIndex]?.content ?? nowTitle,
  );
  const openImageUpload = useCallback((image: ChatImageHit) => {
    if (image.materialId) onOpenMaterial?.(image.materialId);
  }, [onOpenMaterial]);

  async function sendDislike(message: ChatMessage, reason: string, note: string) {
    if (feedbackBusy) return;
    setFeedbackBusy(true);
    try {
      await submitAssistantDislike({
        projectId: project.id,
        messageId: message.id,
        reason,
        note,
      });
      setTurnReaction((current) => ({ ...current, [message.id]: "dislike" }));
      setDislikeOpen(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send feedback.");
    } finally {
      setFeedbackBusy(false);
    }
  }

  function assistantInner(message: ChatMessage, prev: ChatMessage | undefined, index: number, live: StreamState | null) {
    const content = stripArtifactMarkup(live ? live.content : message.content);
    const artifact = live?.artifact ?? message.artifact;
    const images = live?.images ?? message.images;
    const options = live?.options ?? message.options;
    const promptAsk = live?.promptAsk ?? message.promptAsk;
    const blocks = live?.blocks ?? message.blocks;
    const turnSources = live?.sources ?? message.sources;
    const streaming = Boolean(live && !artifact && !history.byId.has(live.id));
    const exerciseOpen = history.lastUserIndex <= index && (!stream?.id || stream.id === message.id) && (!sending || stream?.id === message.id);
    const priorPapers = history.priorPapers.get(message.id) ?? history.papers;
    const split = splitTeachingExam(content, promptAsk?.question);
    const taught = split.taught;
    const showToolActivity = Boolean(live && !taught && (live.status || live.toolActivity?.length));
    const examText = split.exam;
    const visibleCopyText = [taught, examText, !taught && !examText ? promptAsk?.question : ""]
      .map((item) => item?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n");
    const ka = promptIsKa(prev?.role === "user" ? prev.content : "") || threadKa;
    const orientKa = ka || promptIsKa(taught);
    const showOrient = Boolean(nowTitle && taught && !artifact && message.id === teachId);
    const showClarify =
      options != null &&
      !promptAsk &&
      !sending &&
      history.lastConversationIndex <= index;
    const showSuggest =
      suggest?.messageId === message.id &&
      !guest &&
      !sending &&
      chatMode !== "fast";
    const memorized = Boolean(live?.memorized || message.memorized || memorizedIds.has(message.id))
      && isExplicitMemoryRequest(prev?.role === "user" ? prev.content : "");
    const likeActive = turnReaction[message.id] === "like";
    const dislikeActive = turnReaction[message.id] === "dislike";
    const dislikeHighlighted = dislikeActive || dislikeOpen === message.id;
    const responseStatus = message.responseStatus ?? (stoppedIds.has(message.id) ? "stopped" : undefined);
    const waiting =
      Boolean(followup) &&
      !sending &&
      !live &&
      history.lastAssistantId === message.id &&
      ((followup?.kind === "sheet" && artifact?.kind === "sheet") ||
        (followup?.kind === "practice" && artifact?.kind === "practice"));
    const waitLabel =
      followup?.kind === "practice"
        ? "Have a look…"
        : "Looking this over…";

    return (
      <ChatExerciseProvider priorPapers={priorPapers} interactive={exerciseOpen} images={images ?? []}
        onReply={!sending ? sendFormReply : undefined}>
      <div className="flex w-full flex-col">
        <div className="flex flex-col gap-4">
          {showToolActivity ? <ToolActivity rows={live?.toolActivity ?? []} status={live?.status} startedAt={live?.startedAt} /> : null}
          {memorized || (live?.status && !showToolActivity) || waiting || responseStatus || workedMs[message.id] != null ? (
            <div className="flex flex-col gap-2">
              {memorized ? <MemorizedMark onOpen={() => openSettings("memory")} /> : null}
              {live?.status && !showToolActivity ? (
                <StatusWait label={live.status} />
              ) : waiting ? (
                <StatusWait label={waitLabel} since={followup?.since} timer />
              ) : responseStatus ? (
                <StatusWait
                  label={responseStatus === "stopped"
                    ? (ka ? "პასუხი შეწყდა" : "Stopped responding")
                    : (ka ? "პასუხი ვერ დასრულდა" : "Response failed")}
                  settled
                />
              ) : workedMs[message.id] != null ? (
                <StatusWait
                  label={formatWorked(workedMs[message.id], ka)}
                  settled
                  savedActivity={message.activity}
                  savedStep={message.artifact?.step ?? artifactStepsRef.current.get(message.id)}
                />
              ) : null}
            </div>
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
                  result={finishedSet?.setId === artifact.id ? finishedSet : completedSets[artifact.id]}
                  onStart={() => (onStartPractice ?? onOpenArtifact)(artifact)}
                />
              ) : (
                <ArtifactCard
                  artifact={artifact}
                  path={path}
                  showAdvance={artifact.kind === "path" && (stream?.artifact?.kind === "path" ? stream.id : history.lastPathId) === message.id}
                  onOpen={() => onOpenArtifact(artifact)}
                />
              )}
            </>
          ) : taught || (images?.length && !live) ? (
            <div className="flex flex-col gap-2">
              {showOrient ? (
                <p className="text-[13px] text-muted">
                  Now looking at
                  {nowTitle ? ` · ${nowTitle}` : ""}
                </p>
              ) : null}
              <CitationProvider sources={turnSources} onOpen={onOpenMaterial}>
                <RichContent
                  text={taught}
                  streaming={streaming}
                  images={images}
                  ka={ka}
                  onOpenImageUpload={openImageUpload}
                />
              </CitationProvider>
              <IllustrationBlocks blocks={blocks} />
            </div>
          ) : null}
          {artifact && images?.length ? (
            <ImageGallery
              images={images}
              ka={ka}
              moreLabel="More"
              onOpenUpload={(image) => {
                if (image.materialId) onOpenMaterial?.(image.materialId);
              }}
            />
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
                  {suggest.kind === "exam" ? "Make an exam" : "Make a quiz"}
                </button>
              ) : suggest.kind === "path" ? (
                <button
                  type="button"
                  onClick={() => void confirmSuggestion("path")}
                  className="rounded-full border border-border px-3 py-1 text-[12px] text-muted hover:border-accent hover:text-foreground"
                >
                  Make a plan
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void confirmSuggestion("sheet")}
                  className="rounded-full border border-border px-3 py-1 text-[12px] text-muted hover:border-accent hover:text-foreground"
                >
                  Make notes
                </button>
              )}
            </div>
          ) : null}
          {!live && !sending && history.lastAssistantId === message.id && !guest ? (
            <FollowChips
              ka={ka}
              followup={Boolean(followup)}
              pathStart={Boolean(isMainThread && path && !pathIsStarted(path))}
              teaching={teachingHere}
              hintLabel="Hint"
              askQuestion={false}
              options={[]}
              onAction={(id) => {
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
          {!live && !sending && history.lastAssistantId === message.id && suggestedFollowups?.messageId === message.id ? (
            <SuggestedFollowups
              prompts={suggestedFollowups.prompts}
              onPick={(prompt) => {
                setSuggestedFollowups(null);
                keepComposerFocus();
                void sendPrompt(prompt).finally(keepComposerFocus);
              }}
            />
          ) : null}
          {!live ? (
            <div className="relative -mt-2 flex items-center gap-0.5">
              <button
                type="button"
                aria-label="Copy response"
                title="Copy"
                onClick={() => {
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(visibleCopyText);
                      setCopiedMessageId(message.id);
                      window.setTimeout(() => setCopiedMessageId((current) => current === message.id ? null : current), 1200);
                    } catch {
                      setError("Could not copy response.");
                    }
                  })();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <UiIcon name="copy" size={16} />
              </button>
              {copiedMessageId === message.id ? <span role="status" className="px-1 text-[12px] text-muted">Copied</span> : null}
              <button
                type="button"
                aria-label="Like"
                aria-pressed={turnReaction[message.id] === "like"}
                disabled={turnReaction[message.id] === "dislike"}
                onClick={() => {
                  setDislikeOpen(null);
                  setTurnReaction((current) => ({ ...current, [message.id]: "like" }));
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-2 hover:text-foreground disabled:cursor-default disabled:opacity-50 ${turnReaction[message.id] === "like" ? "text-foreground" : "text-muted"}`}
              >
                <span
                  aria-hidden="true"
                  className="h-4 w-4"
                  style={{
                    backgroundColor: likeActive ? "var(--accent)" : "var(--text-muted)",
                    mask: `url("${likeActive ? "/icons/like-filled.svg" : "/icons/like.svg"}") center / contain no-repeat`,
                    WebkitMask: `url("${likeActive ? "/icons/like-filled.svg" : "/icons/like.svg"}") center / contain no-repeat`,
                    opacity: likeActive ? 1 : 0.58,
                  }}
                />
              </button>
              <button
                type="button"
                aria-label="Dislike"
                aria-pressed={turnReaction[message.id] === "dislike"}
                onClick={() => {
                  setDislikeOpen((current) => current === message.id ? null : message.id);
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-2 hover:text-foreground ${turnReaction[message.id] === "dislike" ? "text-foreground" : "text-muted"}`}
              >
                <span
                  aria-hidden="true"
                  className="h-4 w-4"
                  style={{
                    backgroundColor: dislikeHighlighted ? "var(--accent)" : "var(--text-muted)",
                    mask: `url("${dislikeHighlighted ? "/icons/deslike-filled.svg" : "/icons/deslike.svg"}") center / contain no-repeat`,
                    WebkitMask: `url("${dislikeHighlighted ? "/icons/deslike-filled.svg" : "/icons/deslike.svg"}") center / contain no-repeat`,
                    opacity: dislikeHighlighted ? 1 : 0.58,
                  }}
                />
              </button>
              {dislikeOpen === message.id ? (
                <ReportContentModal
                  snippet={visibleCopyText}
                  busy={feedbackBusy}
                  onClose={() => setDislikeOpen(null)}
                  onSubmit={(reason, note) => sendDislike(message, reason, note)}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      </ChatExerciseProvider>
    );
  }

  const pendingStreamId = stream && !stream.quiet && !history.byId.has(stream.id) ? stream.id : null;
  const visibleMessages = useMemo(() => {
    const visible = messages.filter((message) => !isStudioConfigPrompt(message.content));
    if (!pendingStreamId) return visible;
    return [...visible, {
      id: pendingStreamId,
      projectId: project.id,
      threadId: chatThreadId,
      lessonId: null,
      exerciseId: null,
      role: "assistant" as const,
      mode: chatModeRef.current,
      content: "",
      attachments: [],
      relatedExerciseType: null,
      intent: null,
      artifact: null,
      createdAt: null,
    }];
  }, [messages, pendingStreamId, project.id, chatThreadId]);
  const emptyThread = !loading && messages.length === 0 && !stream && !sending;
  const latestAssistant = [...messages].reverse().find((item) => item.role === "assistant");
  const resumeAvailable = Boolean(
    !guest &&
    latestAssistant &&
    !latestAssistant.artifact &&
    (latestAssistant.responseStatus === "stopped" || stoppedIds.has(latestAssistant.id)) &&
    stripArtifactMarkup(latestAssistant.content).trim(),
  );

  function requestHint() {
    const ask = latestAsk?.question;
    if (!ask) return;
    void sendPrompt(hintAskPrompt(ask), { skipUser: true, hintAsk: true });
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollerRef}
        className="chat-thread-viewport min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none]"
        onWheel={() => { pendingPromptScrollRef.current = null; }}
        onTouchStart={() => { pendingPromptScrollRef.current = null; }}
        onPointerDown={() => { pendingPromptScrollRef.current = null; }}
        onKeyDown={() => { pendingPromptScrollRef.current = null; }}
      >
        <div className="mx-auto w-full max-w-3xl px-8 max-md:px-4">
            {loadingOlder ? <span role="status" className="pointer-events-none absolute top-2 z-10 rounded-full bg-background px-3 py-1 text-xs text-muted">Loading older messages…</span> : null}
            {loading && messages.length === 0 && !stream && !sending && (
              <p className="pt-8 text-sm text-muted">Loading chat…</p>
            )}
            <VirtualChatThread
              messages={visibleMessages}
              scrollRef={scrollerRef}
              handleRef={historyViewRef}
              onReady={onHistoryReady}
              bottomInset={composerH}
              active={isActive}
              renderMessage={(message) => {
              const index = history.indexById.get(message.id) ?? messages.length;
              const prev = messages[index - 1];
              const live = stream && message.id === stream.id ? stream : null;
              return (
              <article
                data-turn={message.id}
                className={`chat-msg ${message.role === "user" ? `chat-msg-user flex justify-end${enteringPromptsRef.current.has(message.id) ? " chat-prompt-enter" : ""}` : "chat-msg-assistant"}`}
                onAnimationEnd={() => { enteringPromptsRef.current.delete(message.id); }}
              >
                {message.role === "user" ? (
                  <div className="flex w-fit max-w-[min(100%,36rem)] flex-col items-end gap-2">
                    <MessageAttachments items={message.attachments} onOpenMaterial={onOpenMaterial} />
                    {message.content.trim() ? (
                      <div
                        role={message.content.length > 280 ? "button" : undefined}
                        tabIndex={message.content.length > 280 ? 0 : undefined}
                        aria-expanded={expandedUserMessages[message.id] === true}
                        onClick={(event) => {
                          if (message.content.length <= 280) return;
                          if (event.target instanceof Element && event.target.closest("a")) return;
                          if (window.getSelection()?.toString()) return;
                          setExpandedUserMessages((current) => ({ ...current, [message.id]: !current[message.id] }));
                        }}
                        onKeyDown={(event) => {
                          if (message.content.length <= 280 || (event.key !== "Enter" && event.key !== " ")) return;
                          event.preventDefault();
                          setExpandedUserMessages((current) => ({ ...current, [message.id]: !current[message.id] }));
                        }}
                        className={`prompt-bubble chat-body cursor-text select-text rounded-2xl bg-surface-2 px-4 py-2.5 text-left text-foreground ${
                          message.content.length > 280 && !expandedUserMessages[message.id] ? "chat-prompt-collapsed" : ""
                        }`}
                      >
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
              );
            }} />
        </div>
      </div>

      {emptyThread ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex items-center justify-center px-5"
          style={{ bottom: composerH }}
        >
          <h1 className="text-center text-[32px] font-medium leading-[1.2] tracking-tight text-foreground max-sm:text-[26px]">
            <span className="sr-only">What should we learn?</span>
            <span aria-hidden="true" className="whitespace-nowrap">
              What should we <HeadlineVerb />?
            </span>
          </h1>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background from-[28px] via-background/95 to-transparent">
        <div ref={composerBoxRef} className="pointer-events-auto mx-auto w-full max-w-[calc(48rem-2px)] px-8 pt-10 max-md:px-4">
          <div>
            <ChatComposer
              ref={composerRef}
              sending={sending}
              locked={composerLocked}
              error={needGoogle ? null : error}
              onRetry={
                canRetry
                  ? () => {
                      retryRef.current?.();
                    }
                  : undefined
              }
              chips={guest ? [] : chips}
              allowAttach={!guest}
              placeholder={undefined}
              pad={false}
              className="composer-pad"
              onRemoveChip={(id) => {
                const chip = chips.find((item) => item.id === id);
                removedChipIds.current.add(id);
                const unsentImage = unsentChatImages.current.get(id);
                unsentChatImages.current.delete(id);
                setChips((current) => current.filter((item) => item.id !== id));
                if (chip?.previewUrl) URL.revokeObjectURL(chip.previewUrl);
                if (chip?.materialId) {
                  const match = materials.find((item) => item.id === chip.materialId);
                  if (match) void removeMaterial(match);
                } else if (unsentImage) {
                  void discardChatImage(unsentImage).catch(() => undefined);
                }
              }}
              onSend={() => void send()}
              onStop={stoppable ? () => {
                if (!abortLiveGeneration(liveGenerationKey)) abortRef.current?.abort();
              } : undefined}
              onResume={resumeStoppedResponse}
              resumeAvailable={resumeAvailable}
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
