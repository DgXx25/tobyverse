"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createChunkBuffer } from "@/lib/ai/chunk-stream";
import { readChatSse } from "@/lib/ai/sse";
import { toolStreamsText, type ChatToolCall } from "@/lib/ai/tools";
import { dispatchChatTool, dispatchStatus } from "@/lib/chat/dispatch";
import { trackEvent } from "@/lib/analytics/track";
import { addChatMessage, ensureChatThread, subscribeChatMessages } from "@/lib/chats";
import { incrementUsage } from "@/lib/account/store";
import { excerptsForChat } from "@/lib/materials/chat-context";
import { pickChatFigures } from "@/lib/materials/figures";
import { listMaterials, removeMaterial } from "@/lib/materials";
import { ingestMaterialFile, ingestMaterialPaste, ingestMaterialUrl } from "@/lib/materials/ingest-client";
import { newChipId, attachmentsFromMaterials, snapshotChatAttachments } from "@/lib/composer/attach";
import {
  takePendingStart,
  type PendingStart,
} from "@/lib/workspace/pending-start";
import { authHeaders } from "@/lib/api/client";
import {
  intentFromTool,
  pendingCreateFromMessages,
  resolvePendingKind,
  type ComposerIntent,
} from "@/lib/composer/intent";
import { inferProjectGoal } from "@/lib/composer/goal";
import { artifactFacts, historyTurnsFromMessages, latestArtifact } from "@/lib/composer/memory";
import { chatArtifactToActive } from "@/lib/artifacts/active";
import { autoNameProject } from "@/lib/workspace/auto-title";
import { isRealUserPrompt, needsAutoTitle } from "@/lib/workspace/title";
import { loadPracticeProgress } from "@/lib/workspace/practice-progress";
import { recipeForGoal } from "@/lib/core/recipes";
import { updateProjectActiveArtifact, updateProjectGoal } from "@/lib/projects";
import { RichContent } from "@/components/rich-content";
import { ChatComposer, type ChatComposerHandle, type ComposerChip } from "@/components/workspace/chat-composer";
import { ClarifyChips } from "@/components/workspace/clarify-chips";
import { MessageAttachments } from "@/components/workspace/message-attachments";
import { ArtifactCard } from "@/components/workspace/artifact-card";
import { ImageGallery } from "@/components/workspace/image-gallery";
import { getStudySheet } from "@/lib/study-sheets/store";
import type { AiProviderId } from "@/lib/ai/catalog";
import type { ActiveArtifact, ActiveArtifactStatus, ChatArtifact, ChatAttachment, ChatMessage, ChatTurn, Project } from "@/types";
import type { Material } from "@/types/material";
import type { ProjectGoal } from "@/types/goals";
import type { LessonRecipe } from "@/types/lesson";

type StreamState = {
  content: string;
  intent: ComposerIntent;
  status?: string;
};

export function ProjectChat({
  project,
  userId,
  model,
  materials,
  selectedIds,
  onOpenArtifact,
  onProjectPatch,
}: {
  project: Project;
  userId: string;
  model: AiProviderId;
  materials: Material[];
  selectedIds: string[];
  onOpenArtifact: (artifact: ChatArtifact) => void;
  onProjectPatch?: (patch: {
    title?: string;
    goal?: ProjectGoal;
    recipe?: LessonRecipe;
    activeArtifact?: ActiveArtifact | null;
  }) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamState | null>(null);
  const [chips, setChips] = useState<ComposerChip[]>([]);
  const [suggest, setSuggest] = useState<{ messageId: string; kind: "practice" | "sheet" } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const composerBoxRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ChatComposerHandle>(null);
  const pinRef = useRef(true);
  const sendingRef = useRef(false);
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
        setMessages(items.filter((item) => item.role !== "system"));
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
    const id = newChipId();
    void addChip(
      { id, title: "Pasted notes", type: "txt", size: text.length, status: "uploading" },
      () => ingestMaterialPaste({ projectId: project.id, userId, text }),
    );
  }

  function onUrl(url: string) {
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
      await sendPrompt(pending.prompt, { materials: pool, attachments });
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
  }): Promise<{ text: string; tool: ChatToolCall }> {
    const facts = artifactFacts(messages);
    const latest = latestArtifact(messages);
    const active = resolveActive();
    const pending = pendingCreateFromMessages(messages);
    const pendingKind = resolvePendingKind(input.prompt, pending);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: await authHeaders(),
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

    setStream({ content: "", intent: "ask", status: "Thinking" });
    let tool: ChatToolCall = { name: "answer", args: {} };
    const chunks = createChunkBuffer((text) => {
      if (!toolStreamsText(tool.name)) return;
      setStream({
        content: text,
        intent: intentFromTool(tool.name),
        status: "Writing",
      });
    });
    const result = await readChatSse(response, {
      onDelta: (delta) => chunks.push(delta),
      onTool: (next) => {
        tool = next;
        if (!toolStreamsText(next.name)) {
          const intent = intentFromTool(next.name);
          setStream({
            content: "",
            intent,
            status: dispatchStatus(intent),
          });
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
    },
  ) {
    const attachments = options?.attachments ?? [];
    const modelPrompt =
      prompt.trim() ||
      (attachments.length ? `Help me learn from ${attachments.map((item) => item.title).join(", ")}.` : "");
    if (!modelPrompt || sendingRef.current) return;

    const pool = await materialsForTurn(attachments, options?.materials);

    sendingRef.current = true;
    setSending(true);
    setError(null);
    setSuggest(null);
    setStream({ content: "", intent: "ask", status: "Thinking" });
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

      applyInferredGoal(modelPrompt);

      const materialExcerpts = pool.length > 0 ? await excerptsForChat(modelPrompt, pool) : [];
      const figures = pool.length > 0 ? await pickChatFigures(modelPrompt, pool) : [];
      const pendingKind = resolvePendingKind(modelPrompt, pendingCreateFromMessages(messages));
      const { text, tool } = await streamChat({
        prompt: modelPrompt,
        history,
        materialExcerpts,
        figures,
        confirmed: options?.confirmed,
        acceptedTool: options?.acceptedTool,
      });
      const intent = intentFromTool(tool.name);
      applyInferredGoal(tool.args.topic || tool.args.instruction || modelPrompt);

      if (!toolStreamsText(tool.name)) {
        setStream({ content: "", intent, status: dispatchStatus(intent) });
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
        onStatus: (status) => setStream({ content: toolStreamsText(tool.name) ? text : "", intent, status }),
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

      const id = await addChatMessage({
        projectId: project.id,
        role: "assistant",
        mode: "normal",
        intent: dispatched.intent,
        content: dispatched.content,
        artifact,
        options: dispatched.options,
        pendingKind: dispatched.pendingKind,
        images: dispatched.images,
      });
      void incrementUsage(userId, "chatTurns");
      if (artifact) {
        if (options?.openWhenReady) onOpenArtifact(artifact);
        await rememberActive(artifact, "ready");
      }
      if (dispatched.suggest)       setSuggest({ messageId: id, kind: dispatched.suggest });
      setStream(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
      setStream(null);
    } finally {
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

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
      >
        <div className="mx-auto grid min-h-full w-full max-w-3xl grid-rows-[minmax(0,1fr)_auto] px-6">
          <div aria-hidden className="min-h-0" />
          <div className="pt-8" style={{ paddingBottom: composerH }}>
            {loading && <p className="text-sm text-muted">Loading chat…</p>}
            {!loading && messages.length === 0 && !stream && !sending && (
              <p className="pb-2 text-center text-sm text-muted">Ask anything. Attach a file if you want.</p>
            )}
            {messages.map((message, index) => {
              const prev = messages[index - 1];
              const gap =
                index === 0
                  ? ""
                  : message.role === "assistant" && prev?.role === "user"
                    ? "mt-10"
                    : "mt-5";
              return (
              <article key={message.id} className={`${gap} ${message.role === "user" ? "flex justify-end" : ""}`}>
                {message.role === "user" ? (
                  <div className="flex max-w-[80%] flex-col items-end gap-1.5">
                    <MessageAttachments items={message.attachments} />
                    {message.content.trim() ? (
                      <div className="chat-body rounded-2xl bg-surface-2 px-4 py-2.5 text-foreground">
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="w-full">
                    {message.artifact ? (
                      <ArtifactCard artifact={message.artifact} onOpen={() => onOpenArtifact(message.artifact!)} />
                    ) : (
                      <RichContent text={message.content} />
                    )}
                    {message.images?.length ? <ImageGallery images={message.images} /> : null}
                    {message.options != null &&
                      !sending &&
                      !messages.slice(index + 1).some((item) => item.role === "user" || item.role === "assistant") && (
                        <ClarifyChips
                          options={message.options}
                          onPick={(value) => {
                            keepComposerFocus();
                            void sendPrompt(value).finally(keepComposerFocus);
                          }}
                          onOther={keepComposerFocus}
                        />
                      )}
                    {suggest?.messageId === message.id && !sending && (
                      <div className="mt-3 flex flex-wrap gap-2">
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
                )}
              </article>
              );
            })}
            {stream && (
              <article className={!messages.length || messages[messages.length - 1]?.role === "user" ? "mt-10" : "mt-5"}>
                {stream.status ? <p className="status-shimmer mb-3 text-sm">{stream.status}</p> : null}
                {stream.content ? <RichContent text={stream.content} streaming /> : null}
              </article>
            )}
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
              error={error}
              chips={chips}
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
              onFile={onFile}
              onPasteText={onPasteText}
              onUrl={onUrl}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
