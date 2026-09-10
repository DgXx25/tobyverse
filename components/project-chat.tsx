"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { usePreferredModel } from "@/components/account/use-preferred-model";
import { GuestGoogleCta } from "@/components/guest-google-cta";
import { createChunkBuffer } from "@/lib/ai/chunk-stream";
import { readChatSse } from "@/lib/ai/sse";
import { toolStreamsText, type ChatToolCall } from "@/lib/ai/tools";
import { dispatchChatTool, dispatchStatus, imageFailLine, imageFoundLine } from "@/lib/chat/dispatch";
import { trackEvent } from "@/lib/analytics/track";
import { addChatMessage, allocateChatMessageId, ensureChatThread, patchChatMessage, subscribeChatMessages } from "@/lib/chats";
import { incrementUsage } from "@/lib/account/store";
import { excerptsForChat } from "@/lib/materials/chat-context";
import { pickChatFigures, shouldAttachChatFigures } from "@/lib/materials/figures";
import { listMaterials, removeMaterial, waitForMaterialPreviews } from "@/lib/materials";
import { ingestMaterialFile, ingestMaterialPaste, ingestMaterialUrl } from "@/lib/materials/ingest-client";
import { newChipId, attachmentsFromMaterials, snapshotChatAttachments } from "@/lib/composer/attach";
import {
  takePendingStart,
  type PendingStart,
} from "@/lib/workspace/pending-start";
import { authHeaders } from "@/lib/api/client";
import { searchImagesClient, toImageAttach } from "@/lib/images/client";
import {
  intentFromTool,
  pendingCreateFromMessages,
  promptIsKa,
  resolvePendingKind,
  type ComposerIntent,
} from "@/lib/composer/intent";
import { inferProjectGoal } from "@/lib/composer/goal";
import { artifactFacts, historyTurnsFromMessages, latestArtifact } from "@/lib/composer/memory";
import { listMemories } from "@/lib/memory/store";
import { syncUserMemories } from "@/lib/memory/client";
import { chatArtifactToActive } from "@/lib/artifacts/active";
import { autoNameProject } from "@/lib/workspace/auto-title";
import { isRealUserPrompt, needsAutoTitle } from "@/lib/workspace/title";
import { loadPracticeProgress } from "@/lib/workspace/practice-progress";
import { gateGuestChatTool, guestCapReached, GuestCapError, isGuestUser, recordGuestAssistantTurn, syncGuestAssistantCount } from "@/lib/guest";
import { recipeForGoal } from "@/lib/core/recipes";
import { updateProjectActiveArtifact, updateProjectGoal } from "@/lib/projects";
import { RichContent } from "@/components/rich-content";
import { ChatComposer, type ChatComposerHandle, type ComposerChip } from "@/components/workspace/chat-composer";
import { ClarifyChips } from "@/components/workspace/clarify-chips";
import { MessageAttachments } from "@/components/workspace/message-attachments";
import { ArtifactCard } from "@/components/workspace/artifact-card";
import { ImageGallery } from "@/components/workspace/image-gallery";
import { SourcesChip, sourcesForTurn, turnLocale } from "@/components/workspace/sources-chip";
import { getStudySheet } from "@/lib/study-sheets/store";
import type { ActiveArtifact, ActiveArtifactStatus, ChatArtifact, ChatAttachment, ChatImageHit, ChatMessage, ChatTurn, PendingKind, Project } from "@/types";
import type { Material } from "@/types/material";
import type { ProjectGoal } from "@/types/goals";
import type { LessonRecipe } from "@/types/lesson";

type StreamState = {
  id: string;
  content: string;
  intent: ComposerIntent;
  status?: string;
  artifact?: ChatArtifact | null;
  images?: ChatImageHit[];
  options?: string[];
};

export function ProjectChat({
  project,
  userId,
  materials,
  selectedIds,
  onOpenArtifact,
  onOpenMaterial,
  onProjectPatch,
}: {
  project: Project;
  userId: string;
  materials: Material[];
  selectedIds: string[];
  onOpenArtifact: (artifact: ChatArtifact) => void;
  onOpenMaterial?: (id: string) => void;
  onProjectPatch?: (patch: {
    title?: string;
    goal?: ProjectGoal;
    recipe?: LessonRecipe;
    activeArtifact?: ActiveArtifact | null;
  }) => void;
}) {
  const { user } = useAuth();
  const { model } = usePreferredModel();
  const guest = isGuestUser(user);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [stoppable, setStoppable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamState | null>(null);
  const [chips, setChips] = useState<ComposerChip[]>([]);
  const [suggest, setSuggest] = useState<{ messageId: string; kind: "practice" | "sheet" } | null>(null);
  const [needGoogle, setNeedGoogle] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const composerBoxRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ChatComposerHandle>(null);
  const pinRef = useRef(true);
  const sendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef<StreamState | null>(null);
  streamRef.current = stream;
  const bootstrapped = useRef(false);
  const namedRef = useRef(false);
  const [composerH, setComposerH] = useState(128);

  useEffect(() => {
    let cancelled = false;
    ensureChatThread({
      projectId: project.id,
      userId,
      mode: project.preferredChatMode,
    }).catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not open chat.");
    });

    const unsubscribe = subscribeChatMessages(
      project.id,
      (items) => {
        if (cancelled) return;
        const next = items.filter((item) => item.role !== "system");
        setMessages(next);
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
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [project.id, project.preferredChatMode, userId]);

  useEffect(() => {
    namedRef.current = false;
  }, [project.id]);

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

  function stickToBottom() {
    const node = scrollerRef.current;
    if (!node || !pinRef.current) return;
    node.scrollTop = node.scrollHeight;
  }

  useLayoutEffect(() => {
    stickToBottom();
  }, [messages, stream, composerH]);

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
    if (loading || bootstrapped.current) return;
    const pending = takePendingStart(project.id);
    bootstrapped.current = true;
    if (!pending) return;
    void bootstrap(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, project.id]);

  function onScroll() {
    const node = scrollerRef.current;
    if (!node) return;
    pinRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
  }

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

  async function bootstrap(pending: PendingStart) {
    const latest = await listMaterials(project.id);
    const pool = latest.length > 0 ? latest : materials;
    const attachments = attachmentsFromMaterials(pending.materialIds, pool);
    if (pending.prompt.trim()) {
      const pendingKind =
        pending.intent === "practice" ? "practice" : pending.intent === "study" ? "sheet" : undefined;
      await sendPrompt(pending.prompt, {
        materials: pool,
        attachments,
        pendingKind,
        waitForPreview: pending.materialIds,
      });
      return;
    }
    if (attachments.length === 0) return;
    await addChatMessage({
      projectId: project.id,
      userId,
      role: "user",
      mode: "normal",
      intent: "ask",
      content: "",
      attachments,
    });
  }

  async function streamChat(input: {
    prompt: string;
    history: ChatTurn[];
    materialExcerpts: { id: string; name: string; excerpt: string }[];
    figures?: { name: string; page: number; path: string; mime: string; data: string }[];
    confirmed?: boolean;
    acceptedTool?: "create_practice" | "create_sheet";
    pendingKind?: PendingKind;
    onFirstToken?: () => void;
    signal?: AbortSignal;
  }): Promise<{ text: string; tool: ChatToolCall }> {
    const facts = artifactFacts(messages);
    const latest = latestArtifact(messages);
    const active = resolveActive();
    const pending = pendingCreateFromMessages(messages);
    const pendingKind = input.pendingKind ?? resolvePendingKind(input.prompt, pending);
    const memories = guest
      ? []
      : await listMemories(userId).catch(() => []);
    if (!guest) {
      syncUserMemories({
        userId,
        prompt: input.prompt,
        memories,
        history: input.history,
      });
    }
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: await authHeaders(),
      signal: input.signal,
      body: JSON.stringify({
        prompt: input.prompt,
        mode: "normal",
        provider: model,
        history: input.history,
        context: {
          projectId: project.id,
          projectTitle: project.title,
          projectDescription: project.description,
          goal: project.goal,
          materials: input.materialExcerpts,
          figures: input.figures,
          knowledgeItems: [],
          memories,
          artifacts: facts,
          latestArtifact: latest,
          activeArtifact: activeContext(active),
          hasMaterials: poolFrom().length > 0 || input.materialExcerpts.length > 0,
          confirmed: input.confirmed,
          acceptedTool: input.acceptedTool,
          priorClarify: pending.priorClarify,
          pendingTopic: pending.pendingTopic ?? undefined,
          pendingKind: pendingKind ?? undefined,
        },
      }),
    });

    let tool: ChatToolCall = { name: "answer", args: {} };
    const chunks = createChunkBuffer((text) => {
      if (!toolStreamsText(tool.name)) return;
      setStream((current) =>
        current
          ? { ...current, content: text, intent: intentFromTool(tool.name), status: undefined }
          : current,
      );
    });
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
              ? { ...current, content: "", intent, status: dispatchStatus(intent, next.name) }
              : current,
          );
        }
      },
    });
    const full = chunks.finish();
    tool = result.tool ?? tool;
    const text = full.trim() || tool.args.question || "";
    if (toolStreamsText(tool.name) && !text) {
      throw new Error("The model returned an empty reply.");
    }
    return { text, tool };
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
    if (!inferred || inferred === project.goal) return;
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

  async function sendPrompt(
    prompt: string,
    options?: {
      materials?: Material[];
      skipUser?: boolean;
      openWhenReady?: boolean;
      confirmed?: boolean;
      acceptedTool?: "create_practice" | "create_sheet";
      attachments?: ChatAttachment[];
      pendingKind?: PendingKind;
      waitForPreview?: string[];
    },
  ) {
    let attachments = guest ? [] : (options?.attachments ?? []);
    const modelPrompt =
      prompt.trim() ||
      (attachments.length ? `Help me learn from ${attachments.map((item) => item.title).join(", ")}.` : "");
    if (!modelPrompt || sendingRef.current) return;
    if (guest && guestCapReached(messages.filter((item) => item.role === "assistant").length)) {
      setNeedGoogle(true);
      return;
    }

    let pool = await materialsForTurn(attachments, options?.materials);
    const previewIds = guest ? [] : (options?.waitForPreview ?? []).filter(Boolean);
    const previewMissing = previewIds.some((id) => !pool.find((item) => item.id === id)?.extractedTextPreview.trim());
    const firstFileTurn = previewIds.length > 0;
    const assistantId = allocateChatMessageId(project.id);

    sendingRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setSending(true);
    setStoppable(true);
    setError(null);
    setSuggest(null);
    setStream({
      id: assistantId,
      content: "",
      intent: "ask",
      status: firstFileTurn ? "მასალის გააზრება…" : "Thinking",
    });
    pinRef.current = true;

    const history = historyTurnsFromMessages(messages);

    try {
      if (!options?.skipUser) {
        await addChatMessage({
          projectId: project.id,
          userId,
          role: "user",
          mode: "normal",
          intent: "ask",
          content: prompt,
          attachments,
        });
        trackEvent({ userId, projectId: project.id, type: "chat_message_sent" });
        setChips((current) => {
          for (const chip of current) {
            if (chip.previewUrl) URL.revokeObjectURL(chip.previewUrl);
          }
          return [];
        });
      }

      if (previewMissing) {
        pool = await waitForMaterialPreviews(project.id, previewIds);
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        attachments = attachmentsFromMaterials(previewIds, pool);
        pool = await materialsForTurn(attachments, pool);
      }

      setStream((current) =>
        current
          ? {
              ...current,
              status: firstFileTurn ? "მასალის გააზრება…" : "Thinking",
            }
          : current,
      );
      applyInferredGoal(modelPrompt);

      const startedAt = performance.now();
      const materialExcerpts = pool.length > 0 ? excerptsForChat(modelPrompt, pool) : [];
      const excerptChars = materialExcerpts.reduce((sum, item) => sum + item.excerpt.length, 0);
      const attachFigures = shouldAttachChatFigures(modelPrompt, pool, attachments);
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
        onFirstToken: markFirstToken,
        signal: controller.signal,
      });
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      markFirstToken();
      const text = streamed.text;
      const tool = guest ? gateGuestChatTool(streamed.tool) : streamed.tool;
      const intent = intentFromTool(tool.name);
      applyInferredGoal(tool.args.topic || tool.args.instruction || modelPrompt);

      if (!toolStreamsText(tool.name)) {
        setStream((current) =>
          current ? { ...current, content: "", intent, status: dispatchStatus(intent, tool.name) } : current,
        );
      }

      const dispatched = await dispatchChatTool({
        tool,
        text,
        prompt: modelPrompt,
        project,
        userId,
        materials: pool,
        active: resolveActive(),
        messages,
        pendingKind,
        attachments,
        onStatus: (status) =>
          setStream((current) =>
            current
              ? { ...current, content: toolStreamsText(tool.name) ? text : "", intent, status }
              : current,
          ),
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

      const content = dispatched.content;
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
              status: undefined,
            }
          : current,
      );

      const id = await addChatMessage({
        id: assistantId,
        projectId: project.id,
        role: "assistant",
        mode: "normal",
        intent: dispatched.intent,
        content,
        artifact,
        options: dispatched.options,
        pendingKind: dispatched.pendingKind,
        images: dispatched.images,
      });
      void incrementUsage(userId, "chatTurns");
      if (guest) {
        recordGuestAssistantTurn();
        if (guestCapReached()) setNeedGoogle(true);
      }
      if (artifact) {
        if (options?.openWhenReady && !guest) onOpenArtifact(artifact);
        await rememberActive(artifact, "ready");
      }
      if (dispatched.suggest && !guest) setSuggest({ messageId: id, kind: dispatched.suggest });
      setStream(null);
    } catch (err) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError") || (err instanceof Error && err.name === "AbortError")) {
        const partial = streamRef.current?.content?.trim() ?? "";
        if (partial) {
          await addChatMessage({
            id: assistantId,
            projectId: project.id,
            role: "assistant",
            mode: "normal",
            intent: streamRef.current?.intent ?? "ask",
            content: partial,
            artifact: streamRef.current?.artifact ?? undefined,
            options: streamRef.current?.options,
            images: streamRef.current?.images,
          }).catch(() => undefined);
        }
        setError(null);
      } else if (err instanceof GuestCapError) {
        setNeedGoogle(true);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Could not send message.");
      }
      setStream(null);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      sendingRef.current = false;
      setSending(false);
      setStoppable(false);
      keepComposerFocus();
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
      status: "Searching…",
    });
    keepComposerFocus();
    try {
      const images = await searchImagesClient(prompt);
      await patchChatMessage(project.id, messageId, {
        images,
        content: images.length > 0 ? imageFoundLine(prompt) : imageFailLine(prompt),
      });
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
    const prompt = draft.trim();
    if (chips.some((chip) => chip.status === "uploading")) return;
    const attachments = snapshotChatAttachments(chips, materials);
    if (!prompt && attachments.length === 0) return;
    setDraft("");
    keepComposerFocus();
    await sendPrompt(prompt, { attachments });
  }

  async function confirmSuggestion(kind: "practice" | "sheet") {
    if (guest) return;
    const lastUser = [...messages].reverse().find((item) => item.role === "user");
    const prompt = lastUser?.content ?? project.title;
    setSuggest(null);
    keepComposerFocus();
    await sendPrompt(prompt, {
      skipUser: true,
      openWhenReady: true,
      confirmed: true,
      acceptedTool: kind === "practice" ? "create_practice" : "create_sheet",
    });
  }

  function assistantInner(message: ChatMessage, prev: ChatMessage | undefined, index: number, live: StreamState | null) {
    const content = live ? live.content : message.content;
    const artifact = live?.artifact ?? message.artifact;
    const images = live?.images ?? message.images;
    const options = live?.options ?? message.options;
    const streaming = Boolean(live && !artifact && content && !messages.some((item) => item.id === live.id));
    const view: ChatMessage = { ...message, content, artifact, images, options };
    const sources = sourcesForTurn(view);

    return (
      <div className="flex w-full max-w-[min(100%,42rem)] flex-col gap-2">
        {live?.status ? <p className="status-shimmer text-sm">{live.status}</p> : null}
        {artifact ? (
          <>
            {content.trim() ? <p className="text-sm text-foreground">{content.trim()}</p> : null}
            <ArtifactCard artifact={artifact} onOpen={() => onOpenArtifact(artifact)} />
          </>
        ) : content ? (
          <RichContent text={content} streaming={streaming} />
        ) : null}
        {images?.length ? (
          <ImageGallery
            images={images}
            onOpenUpload={(image) => {
              if (image.materialId) onOpenMaterial?.(image.materialId);
            }}
          />
        ) : null}
        {sources.length ? <SourcesChip items={sources} locale={turnLocale(view, prev)} /> : null}
        {images && images.length === 0 && !sending && (
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
            {promptIsKa(content) || (prev && promptIsKa(prev.content)) ? "სცადე თავიდან" : "Retry"}
          </button>
        )}
        {options != null &&
          !sending &&
          !messages.slice(index + 1).some((item) => item.role === "user" || item.role === "assistant") && (
            <ClarifyChips
              options={options}
              onPick={(value) => {
                keepComposerFocus();
                void sendPrompt(value).finally(keepComposerFocus);
              }}
              onOther={keepComposerFocus}
            />
          )}
        {suggest?.messageId === message.id && !guest && !sending && (
          <div className="flex flex-wrap gap-2">
            {suggest.kind === "practice" ? (
              <button
                type="button"
                onClick={() => void confirmSuggestion("practice")}
                className="rounded-full border border-border px-3 py-1 text-[12px] text-muted hover:border-accent hover:text-foreground"
              >
                Practice this
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
        )}
      </div>
    );
  }

  const streamPending = stream && !messages.some((item) => item.id === stream.id);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
      >
        <div className="mx-auto grid min-h-full w-full max-w-3xl grid-rows-[minmax(0,1fr)_auto] px-6">
          <div aria-hidden className="min-h-0" />
          <div className="pt-4" style={{ paddingBottom: composerH }}>
            {loading && <p className="text-sm text-muted">Loading chat…</p>}
            {!loading && messages.length === 0 && !stream && !sending && (
              <p className="pb-2 text-center text-sm text-muted">
                {guest ? "Ask anything." : "Ask anything. Attach a file if you want."}
              </p>
            )}
            {messages.map((message, index) => {
              const prev = messages[index - 1];
              const live = stream && message.id === stream.id ? stream : null;
              return (
              <article key={message.id} className={`${index === 0 ? "" : "mt-4"} ${message.role === "user" ? "flex justify-end" : ""}`}>
                {message.role === "user" ? (
                  <div className="flex w-fit max-w-[min(100%,36rem)] flex-col items-end gap-2">
                    <MessageAttachments items={message.attachments} />
                    {message.content.trim() ? (
                      <div className="chat-body rounded-2xl bg-surface-2 px-4 py-3 text-foreground">
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  assistantInner(message, prev, index, live)
                )}
              </article>
              );
            })}
            {streamPending ? (
              <article
                key={stream.id}
                className={`max-w-[min(100%,42rem)] ${messages.length ? "mt-4" : ""}`}
              >
                {assistantInner(
                  {
                    id: stream.id,
                    projectId: project.id,
                    threadId: "",
                    lessonId: null,
                    exerciseId: null,
                    role: "assistant",
                    mode: "normal",
                    content: stream.content,
                    attachments: [],
                    relatedExerciseType: null,
                    intent: null,
                    artifact: stream.artifact ?? null,
                    options: stream.options,
                    images: stream.images,
                    createdAt: null,
                  },
                  messages[messages.length - 1],
                  messages.length,
                  stream,
                )}
              </article>
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
              error={needGoogle ? null : error}
              chips={guest ? [] : chips}
              allowAttach={!guest}
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
