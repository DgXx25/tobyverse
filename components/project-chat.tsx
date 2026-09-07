"use client";

import { useEffect, useRef, useState } from "react";
import { createChunkBuffer } from "@/lib/ai/chunk-stream";
import { readChatSse } from "@/lib/ai/sse";
import { isArtifactTool, toolStreamsText, type ChatToolCall } from "@/lib/ai/tools";
import { trackEvent } from "@/lib/analytics/track";
import { addChatMessage, ensureChatThread, subscribeChatMessages } from "@/lib/chats";
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
import { getStudySheet } from "@/lib/study-sheets/store";
import { generateStudySheetFromPrompt, rewriteStudySheetFromPrompt } from "@/lib/study-sheets/generate-client";
import { generatePracticeSet } from "@/lib/exercises/generate-set";
import { appendPracticeItems, regenerateOneItem, rewritePracticeItems } from "@/lib/exercises/mutate-client";
import {
  extractAppendCount,
  intentFromTool,
  isMutationIntent,
  type ComposerIntent,
} from "@/lib/composer/intent";
import { inferProjectGoal } from "@/lib/composer/goal";
import { artifactFacts, historyTurnsFromMessages, latestArtifact } from "@/lib/composer/memory";
import { activeToChatArtifact, chatArtifactToActive } from "@/lib/artifacts/active";
import { autoNameProject } from "@/lib/workspace/auto-title";
import { isRealUserPrompt, needsAutoTitle } from "@/lib/workspace/title";
import { loadPracticeProgress } from "@/lib/workspace/practice-progress";
import { recipeForGoal } from "@/lib/core/recipes";
import { updateProjectActiveArtifact, updateProjectGoal } from "@/lib/projects";
import { RichContent } from "@/components/rich-content";
import { ChatComposer, type ComposerChip } from "@/components/workspace/chat-composer";
import { MessageAttachments } from "@/components/workspace/message-attachments";
import { ArtifactCard } from "@/components/workspace/artifact-card";
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
  const endRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef(true);
  const sendingRef = useRef(false);
  const bootstrapped = useRef(false);
  const namedRef = useRef(false);

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
    if (!pinRef.current) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, stream]);

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
        },
      }),
    });

    setStream({ content: "", intent: "ask", status: "Thinking" });
    let tool: ChatToolCall = { name: "answer", args: {} };
    const chunks = createChunkBuffer((text) => {
      if (isArtifactTool(tool.name)) return;
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
        if (isArtifactTool(next.name)) {
          setStream({
            content: "",
            intent: intentFromTool(next.name),
            status: workingLabel(intentFromTool(next.name)),
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

  function practiceIds(active: ActiveArtifact): string[] {
    if (active.ids?.length) return active.ids;
    const match = [...messages]
      .reverse()
      .find((item) => item.artifact?.kind === "practice" && item.artifact.id === active.id);
    return match?.artifact?.ids?.length ? match.artifact.ids : [active.id];
  }

  async function rememberActive(artifact: ChatArtifact, status: ActiveArtifactStatus = "ready") {
    const active = chatArtifactToActive(artifact, status);
    onProjectPatch?.({ activeArtifact: active });
    await updateProjectActiveArtifact(project.id, userId, active).catch(() => undefined);
  }

  async function runArtifactMutation(input: {
    intent: ComposerIntent;
    prompt: string;
    pool: Material[];
    appendCount: number;
    onStatus: (status: string) => void;
  }): Promise<ChatArtifact> {
    const active = resolveActive();
    if (!active) throw new Error("Open a set or sheet first.");

    if (input.intent === "rewrite_sheet" || (input.intent === "edit" && active.kind === "study_sheet")) {
      const sheet = await getStudySheet(project.id, active.id);
      if (!sheet) throw new Error("Those notes are gone.");
      input.onStatus("Updating…");
      await rewriteStudySheetFromPrompt({
        projectId: project.id,
        sheetId: sheet.id,
        projectTitle: project.title,
        materials: input.pool,
        prompt: input.prompt,
        currentBlocks: sheet.blocks,
        currentTitle: sheet.title,
        currentContent: sheet.prose || sheet.content,
      });
      const artifact = activeToChatArtifact({ ...active, status: "ready" });
      await addChatMessage({
        projectId: project.id,
        role: "assistant",
        mode: "normal",
        intent: "rewrite_sheet",
        content: "Updated notes.",
        artifact,
      });
      return artifact;
    }

    const ids = practiceIds(active);
    let nextIds = ids;
    if (input.intent === "append") {
      input.onStatus(`Generating practice · ${input.appendCount} items`);
      const extra = await appendPracticeItems({
        project,
        userId,
        materials: input.pool,
        prompt: `Add ${input.appendCount} more items to the current practice set "${active.title}". Same topic. User request: ${input.prompt}`,
        count: input.appendCount,
        onStatus: input.onStatus,
      });
      nextIds = [...ids, ...extra];
    } else if (input.intent === "regenerate_one") {
      input.onStatus("Updating…");
      const progress = loadPracticeProgress(project.id)[active.id] ?? 0;
      const targetId = ids[Math.min(progress, ids.length - 1)] ?? ids[0];
      await regenerateOneItem({
        project,
        exerciseId: targetId,
        instruction: input.prompt,
        materials: input.pool,
      });
    } else {
      await rewritePracticeItems({
        project,
        userId,
        ids,
        instruction: input.prompt,
        materials: input.pool,
        onStatus: input.onStatus,
      });
    }

    const artifact: ChatArtifact = {
      kind: "practice",
      id: active.id,
      title: active.title || "Practice set",
      count: nextIds.length,
      ids: nextIds,
    };
    await addChatMessage({
      projectId: project.id,
      role: "assistant",
      mode: "normal",
      intent: input.intent,
      content: `Updated practice set · ${nextIds.length} items`,
      artifact,
    });
    return artifact;
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

    const pool = poolFrom(options?.materials);

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
      const { text, tool } = await streamChat({
        prompt: modelPrompt,
        history,
        materialExcerpts,
        figures,
        confirmed: options?.confirmed,
        acceptedTool: options?.acceptedTool,
      });
      const intent = intentFromTool(tool.name);
      const generatePrompt = tool.args.topic || tool.args.instruction || modelPrompt;

      applyInferredGoal(generatePrompt);

      if (tool.name === "create_practice") {
        setStream({ content: "", intent, status: workingLabel(intent) });
        const set = await generatePracticeSet({
          project,
          userId,
          materials: pool,
          prompt: generatePrompt,
          onStatus: (status) => setStream({ content: "", intent, status }),
        });
        const artifact: ChatArtifact = {
          kind: "practice",
          id: set.ids[0],
          title: "Practice set",
          count: set.count,
          ids: set.ids,
        };
        await addChatMessage({
          projectId: project.id,
          role: "assistant",
          mode: "normal",
          intent,
          content: "Practice set is ready.",
          artifact,
        });
        if (options?.openWhenReady) onOpenArtifact(artifact);
        await rememberActive(artifact, "ready");
      } else if (tool.name === "create_sheet") {
        setStream({ content: "", intent, status: "Writing" });
        const sheet = await generateStudySheetFromPrompt({
          projectId: project.id,
          userId,
          projectTitle: project.title,
          materials: pool,
          prompt: generatePrompt,
        });
        const artifact: ChatArtifact = { kind: "sheet", id: sheet.id, title: sheet.title };
        await addChatMessage({
          projectId: project.id,
          role: "assistant",
          mode: "normal",
          intent,
          content: "კონსპექტი",
          artifact,
        });
        if (options?.openWhenReady) onOpenArtifact(artifact);
        await rememberActive(artifact, "ready");
      } else if (tool.name === "edit_practice" || tool.name === "append_practice" || tool.name === "edit_sheet") {
        const artifact = await runArtifactMutation({
          intent: tool.name === "append_practice" ? "append" : tool.name === "edit_sheet" ? "rewrite_sheet" : "edit",
          prompt: tool.args.instruction || modelPrompt,
          pool,
          appendCount: tool.args.count ?? extractAppendCount(modelPrompt),
          onStatus: (status) => setStream({ content: "", intent, status }),
        });
        await rememberActive(artifact, "ready");
        if (options?.openWhenReady) onOpenArtifact(artifact);
      } else {
        const id = await addChatMessage({
          projectId: project.id,
          role: "assistant",
          mode: "normal",
          intent,
          content: text,
        });
        if (tool.name === "suggest_practice") setSuggest({ messageId: id, kind: "practice" });
        if (tool.name === "suggest_sheet") setSuggest({ messageId: id, kind: "sheet" });
      }
      setStream(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
      setStream(null);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function send() {
    const prompt = draft.trim();
    if (chips.some((chip) => chip.status === "uploading")) return;
    const attachments = snapshotChatAttachments(chips, materials);
    if (!prompt && attachments.length === 0) return;
    setDraft("");
    await sendPrompt(prompt, { attachments });
  }

  async function confirmSuggestion(kind: "practice" | "sheet") {
    const lastUser = [...messages].reverse().find((item) => item.role === "user");
    const prompt = lastUser?.content ?? project.title;
    setSuggest(null);
    await sendPrompt(prompt, {
      skipUser: true,
      openWhenReady: true,
      confirmed: true,
      acceptedTool: kind === "practice" ? "create_practice" : "create_sheet",
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollerRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-8">
          {loading && <p className="text-sm text-muted">Loading chat…</p>}
          {!loading && messages.length === 0 && !stream && !sending && (
            <p className="pt-24 text-center text-sm text-muted">Ask anything. Attach a file if you want.</p>
          )}
          <div className="space-y-6">
            {messages.map((message) => (
              <article key={message.id} className={message.role === "user" ? "flex justify-end" : ""}>
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
                  <div>
                    {message.artifact ? (
                      <ArtifactCard artifact={message.artifact} onOpen={() => onOpenArtifact(message.artifact!)} />
                    ) : (
                      <RichContent text={message.content} />
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
            ))}
            {stream && (
              <article>
                {stream.status ? <p className="status-shimmer mb-3 text-sm">{stream.status}</p> : null}
                {stream.content ? <RichContent text={stream.content} streaming /> : null}
              </article>
            )}
          </div>
          <div ref={endRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl">
        <ChatComposer
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
  );
}

function workingLabel(intent: ComposerIntent): string {
  if (intent === "study" || intent === "rewrite_sheet") return "Writing";
  if (intent === "practice") return "Generating a practice set…";
  if (intent === "plan") return "Writing";
  if (isMutationIntent(intent)) return "Updating…";
  return "Thinking";
}
