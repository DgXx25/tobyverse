import { generateTextStream, generateToolStream, getAIProvider, resolveAIRequest } from "@/lib/ai/gemini";
import { eligibleChatToolNames, isInternalTool, toolStreamsText, type ChatToolCall } from "@/lib/ai/tools";
import { toolStatusText, withToolTimeout, type ToolExecutionStatus } from "@/lib/ai/tool-execution";
import { DEFAULT_AI_PROVIDER, DEFAULT_MODEL_SELECTION, isAiEffort, isAllowedAiModel, isKnownModelSelection, isEnabledProvider } from "@/lib/ai/catalog";
import { selectModel } from "@/lib/ai/model-routing";
import { assertSignedInRequest, authErrorResponse } from "@/lib/api/assert";
import { GUEST_ASSISTANT_CAP, GUEST_CAP_CODE, GUEST_CAP_LINE, gateGuestChatTool } from "@/lib/guest";
import { buildChatSystemPrompt } from "@/lib/chat/context";
import { after } from "next/server";
import { openConversation } from "@/lib/chat/conversation-store";
import { CONVERSATION_SUMMARY_INSTRUCTION, recentConversation, prepareRecentConversation } from "@/lib/chat/conversation-context";
import { DEFAULT_CLAUDE_MODEL } from "@/lib/ai/catalog";
import { createSkillLoader } from "@/lib/skills/server";
import { parseChatArtifact } from "@/lib/artifacts/active";
import { fallbackToolAfterProvider, forcedToolForRequest } from "@/lib/chat/tool-routing";
import { CHAT_EXCERPT_CHARS, CHAT_IMAGE_LIMIT, CHAT_MATERIAL_LIMIT } from "@/lib/materials/limits";
import { asMemoryFacts, sanitizePersonalization } from "@/lib/memory/normalize";
import { asChatMode, chatModeSendsToolDeclarations, chatModeTools } from "@/lib/core/chat-modes";
import { retrieveChunks } from "@/lib/rag/server";
import { numberSources, retrievalQuery, sourceRef } from "@/lib/rag/sources";
import { papersInTurns } from "@/lib/blocks/paper-thread";
import {
  compactWeatherReply,
  ensureCitedWeatherCard,
  isPlainWeatherQuestion,
  WEATHER_CARD_REPAIR_INSTRUCTION,
} from "@/lib/blocks/kinds/weather-response";
import { startAiUsageSession, aiUsageErrorResponse } from "@/lib/billing/server";
import { readAccountAccess } from "@/lib/billing/account-server";
import { waitForChatStep } from "@/lib/ai/chat-deadline";
import { readChatLinkedPages } from "@/lib/chat/linked-pages";
import { allowImageSearch, clampImageCount, searchWebImages } from "@/lib/images/search";
import { toChatImageHit } from "@/lib/images/hits";
import { adminErrorResponse, assertAdminRequest } from "@/lib/admin/assert";
import { CHAT_MODES, type ChatArtifact, type ChatImageHit, type ChatSource, type ChatFigureContext, type ChatGenerationContext, type ChatMode, type ChatTurn } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ChatRequestBody = {
  prompt?: unknown;
  mode?: unknown;
  provider?: unknown;
  model?: unknown;
  effort?: unknown;
  history?: unknown;
  context?: unknown;
  threadId?: unknown;
  historyBeforeId?: unknown;
  historyThroughId?: unknown;
  continuation?: unknown;
};

function asMode(value: unknown): ChatMode {
  return asChatMode(value);
}

function asHistory(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const row = item as { role?: unknown; content?: unknown };
    if ((row.role === "user" || row.role === "assistant") && typeof row.content === "string") {
      return [{ role: row.role, content: row.content }];
    }

    return [];
  });
}

function asAcceptedTool(value: unknown): ChatGenerationContext["acceptedTool"] {
  return value === "create_practice" ||
    value === "create_note" ||
    value === "create_sheet" ||
    value === "create_path" ||
    value === "start_path" ||
    value === "search_images"
    ? value
    : undefined;
}

function asContext(value: unknown, mode: ChatMode): ChatGenerationContext {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    projectId: typeof row.projectId === "string" ? row.projectId : "",
    projectTitle: typeof row.projectTitle === "string" ? row.projectTitle : "Untitled",
    projectDescription: typeof row.projectDescription === "string" ? row.projectDescription : "",
    goal: typeof row.goal === "string" ? row.goal : "understand_topic",
    mode,
    materials: Array.isArray(row.materials)
      ? row.materials
          .flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const material = item as { id?: unknown; name?: unknown; excerpt?: unknown };
            if (typeof material.id !== "string" || typeof material.name !== "string") return [];
            const excerpt = typeof material.excerpt === "string" ? material.excerpt.slice(0, CHAT_EXCERPT_CHARS).trim() : "";
            if (!excerpt) return [];
            return [
              {
                id: material.id,
                name: material.name,
                excerpt,
              },
            ];
          })
          .slice(0, CHAT_MATERIAL_LIMIT)
      : [],
    knowledgeItems: Array.isArray(row.knowledgeItems)
      ? row.knowledgeItems.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const fact = item as { id?: unknown; prompt?: unknown; answer?: unknown };
          if (typeof fact.id !== "string" || typeof fact.prompt !== "string") return [];
          return [
            {
              id: fact.id,
              prompt: fact.prompt,
              answer: typeof fact.answer === "string" ? fact.answer : undefined,
            },
          ];
        })
      : [],
    figures: asFigures(row.figures),
    artifacts: asArtifacts(row.artifacts),
    latestArtifact: asArtifacts(row.latestArtifact ? [row.latestArtifact] : [])[0] ?? null,
    activeArtifact: asActive(row.activeArtifact),
    hasMaterials: row.hasMaterials === true || (Array.isArray(row.materials) && row.materials.length > 0),
    confirmed: row.confirmed === true,
    acceptedTool: asAcceptedTool(row.acceptedTool),
    priorClarify: row.priorClarify === true,
    pendingTopic: typeof row.pendingTopic === "string" ? row.pendingTopic.trim() || undefined : undefined,
    pendingKind:
      row.pendingKind === "sheet"
        ? "sheet"
        : row.pendingKind === "practice"
          ? "practice"
          : row.pendingKind === "images"
            ? "images"
            : row.pendingKind === "path"
              ? "path"
              : undefined,
    pathTopic: typeof row.pathTopic === "string" ? row.pathTopic.trim() || undefined : undefined,
    hasPath: row.hasPath === true,
    inPathThread: row.inPathThread === true,
    path: asPathBriefing(row.path),
    memories: asMemoryFacts(row.memories, 320),
    personalization: sanitizePersonalization(row.personalization) || undefined,
    hintAsk: row.hintAsk === true,
    examAsk: row.examAsk === true,
    replyTo: typeof row.replyTo === "string" ? row.replyTo.trim() || undefined : undefined,
    threadPaper: row.threadPaper === true,
  };
}

function asPathBriefing(value: unknown): ChatGenerationContext["path"] {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.title !== "string" || typeof row.nodeTitle !== "string") return null;
  const done = typeof row.done === "number" ? row.done : 0;
  const total = typeof row.total === "number" ? row.total : 0;
  return {
    title: row.title.slice(0, 80),
    courseTitle: typeof row.courseTitle === "string" ? row.courseTitle.slice(0, 80) : "",
    nodeTitle: row.nodeTitle.slice(0, 80),
    teach: typeof row.teach === "string" ? row.teach.slice(0, 420) : typeof row.outcome === "string" ? row.outcome.slice(0, 420) : "",
    outcome: typeof row.outcome === "string" ? row.outcome.slice(0, 160) : "",
    done,
    total,
    courseCount: typeof row.courseCount === "number" ? row.courseCount : 1,
    started: row.started !== false,
    kind: row.kind === "review" ? "review" : row.kind === "course" ? "course" : undefined,
    nodeStatus:
      row.nodeStatus === "todo" ||
      row.nodeStatus === "current" ||
      row.nodeStatus === "ready" ||
      row.nodeStatus === "done"
        ? row.nodeStatus
        : undefined,
    nextTitle: typeof row.nextTitle === "string" ? row.nextTitle.slice(0, 80) : undefined,
    why: typeof row.why === "string" ? row.why.slice(0, 80) : undefined,
    inPathThread: row.inPathThread === true,
  };
}

function asActive(value: unknown): ChatGenerationContext["activeArtifact"] {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.kind !== "string" || !row.kind.trim()) return null;
  if (typeof row.id !== "string" || typeof row.title !== "string") return null;
  return {
    kind: row.kind.trim(),
    id: row.id,
    title: row.title,
    count: typeof row.count === "number" ? row.count : undefined,
    status: typeof row.status === "string" ? row.status : undefined,
    progress: typeof row.progress === "string" ? row.progress : undefined,
    noteKind: row.noteKind === "note" ? "note" : row.noteKind === "study" ? "study" : undefined,
  };
}

function asFigures(value: unknown): ChatFigureContext[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (typeof row.name !== "string" || typeof row.mime !== "string" || typeof row.data !== "string") return [];
      if (!row.mime.startsWith("image/") || !row.data) return [];
      return [
        {
          name: row.name.slice(0, 120),
          page: typeof row.page === "number" ? row.page : 1,
          path: typeof row.path === "string" ? row.path : "",
          mime: row.mime,
          data: row.data,
        },
      ];
    })
    .slice(0, CHAT_IMAGE_LIMIT);
}

function asArtifacts(value: unknown): ChatArtifact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = parseChatArtifact(item);
    return parsed ? [parsed] : [];
  });
}

function encodeSse(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(request: Request) {
  let session;
  try {
    session = await assertSignedInRequest(request);
  } catch (error) {
    return authErrorResponse(error);
  }

  let body: ChatRequestBody;

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return new Response(JSON.stringify({ error: "prompt is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const mode = asMode(body.mode);
  if (body.mode !== undefined && !(CHAT_MODES as readonly string[]).includes(mode)) {
    return new Response(JSON.stringify({ error: "Invalid chat mode." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const provider =
    typeof body.provider === "string" && body.provider.trim()
      ? body.provider.trim()
      : DEFAULT_AI_PROVIDER;
  if (!isEnabledProvider(provider)) {
    return new Response(JSON.stringify({ error: "That provider is not configured yet." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const requestedSelection = typeof body.model === "string" ? body.model : DEFAULT_MODEL_SELECTION;
  if (!isKnownModelSelection(requestedSelection)) {
    return Response.json({ error: "That model is not available." }, { status: 400 });
  }
  // Resolve account access before model selection so disallowed manual choices cannot reach a provider.
  let access = null;
  if (!session.anonymous) {
    try { access = await readAccountAccess(session.uid); }
    catch (error) { return aiUsageErrorResponse(error); }
  }
  const plan = session.anonymous ? "free_beta" : access!.plan;
  if (requestedSelection !== "auto" && !isAllowedAiModel(requestedSelection, plan)) {
    return Response.json({ error: "This model is available on Premium plans.", code: "premium_model_required" }, { status: 403 });
  }
  if (plan === "admin") {
    try { await assertAdminRequest(request); }
    catch (error) { return adminErrorResponse(error); }
  }
  const routing = selectModel(prompt, requestedSelection, plan);
  const modelId = routing.model;
  const effort = isAiEffort(body.effort) ? body.effort : undefined;
  if (!isAllowedAiModel(modelId, plan)) {
    return Response.json({ error: "This model is not included in your plan.", code: "premium_model_required" }, { status: 403 });
  }
  console.info("[model-routing]", JSON.stringify({ model: modelId, tier: routing.tier, score: routing.score, method: routing.method, signals: routing.signals }));

  let usage: Awaited<ReturnType<typeof startAiUsageSession>> | null = null;
  if (!session.anonymous) {
    try {
      usage = await startAiUsageSession(session.uid, { models: [modelId] });
    } catch (error) {
      return aiUsageErrorResponse(error);
    }
  }
  const usageReporter = usage ? usage.report : undefined;

  let history = prepareRecentConversation(asHistory(body.history), prompt);
  if (session.anonymous) {
    const assistantTurns = history.filter((item) => item.role === "assistant").length;
    if (assistantTurns >= GUEST_ASSISTANT_CAP) {
      return Response.json({ error: GUEST_CAP_LINE, code: GUEST_CAP_CODE }, { status: 403 });
    }
  }
  const context = asContext(body.context, mode);
  const generation = new AbortController();
  const signal = AbortSignal.any([request.signal, generation.signal, AbortSignal.timeout(240_000)]);
  let maintainHistory: (() => Promise<void>) | undefined;
  let answerCompleted = false;
  after(async () => {
    try { if (answerCompleted) await maintainHistory?.(); }
    catch (error) { console.warn("[chat-context] summary maintenance skipped", error instanceof Error ? error.name : "Error"); }
  });
  const stream = new ReadableStream({
    async start(controller) {
      // Establish the response before retrieval or the model's thinking phase.
      // SSE comments keep an active connection alive without inventing progress.
      const heartbeat = () => { if (!signal.aborted) controller.enqueue(new TextEncoder().encode(": keep-alive\n\n")); };
      heartbeat();
      const heartbeatTimer = setInterval(heartbeat, 10_000);
      try {
        const conversation = !session.anonymous && body.threadId && process.env.CHAT_CONTEXT_COMPACTION !== "0"
          ? await waitForChatStep("Loading conversation context", () => openConversation({
              uid: session.uid, projectId: context.projectId,
              threadId: typeof body.threadId === "string" ? body.threadId : "",
              beforeId: typeof body.historyBeforeId === "string" ? body.historyBeforeId : undefined,
              throughId: typeof body.historyThroughId === "string" ? body.historyThroughId : undefined,
              signal,
            }), { signal, timeoutMs: 2_500 }).catch(() => null)
          : null;
        if (conversation) {
          const continuation = body.continuation === true && history.at(-1)?.role === "assistant" ? [history.at(-1)!] : [];
          history = recentConversation([...conversation.recent, ...continuation]).map(({ role, content }) => ({ role, content }));
          maintainHistory = () => conversation.refresh(async (summaryPrompt) => {
            // Meter the occasional background call separately; never delay the reply.
            const summaryUsage = await startAiUsageSession(session.uid, { models: [DEFAULT_CLAUDE_MODEL] });
            try {
              return await getAIProvider(DEFAULT_CLAUDE_MODEL).generateText(summaryPrompt, {
                model: DEFAULT_CLAUDE_MODEL, systemInstruction: CONVERSATION_SUMMARY_INSTRUCTION,
                maxOutputTokens: 1400, cache: false, usage: summaryUsage.report,
                signal: AbortSignal.timeout(30_000),
              });
            } finally { await summaryUsage.commit(); }
          });
        }
        console.info("[chat-context]", JSON.stringify({ recentMessages: history.length,
          historyChars: history.reduce((sum, row) => sum + row.content.length, 0),
          summaryChars: conversation?.summary.length ?? 0, historySearch: conversation?.hasOlder ?? false }));
        const linkedPages = session.anonymous ? Promise.resolve([]) : readChatLinkedPages(prompt,
          body.context && typeof body.context === "object" ? (body.context as Record<string, unknown>).linkUrls : [], signal).catch(() => []);
        const threadPaper = context.threadPaper || papersInTurns(history).length > 0;

  // The answer is grounded in the user's own materials: retrieve server-side from the vector index.
  let sources: ChatSource[] = [];
  if (!session.anonymous && context.projectId && prompt.length >= 3) {
    try {
      const rawContext = body.context && typeof body.context === "object" ? (body.context as Record<string, unknown>) : {};
      const materialIds = Array.isArray(rawContext.materialIds)
        ? rawContext.materialIds.filter((id): id is string => typeof id === "string").slice(0, 200)
        : [];
      sources = numberSources(
        await waitForChatStep("Retrieving sources", () => retrieveChunks({
          uid: session.uid,
          projectId: context.projectId,
          query: retrievalQuery(prompt, history),
          materialIds,
          limit: mode === "fast" ? 5 : 8,
        }), { signal, timeoutMs: 30_000 }),
      );
    } catch (error) {
      console.warn("[rag] retrieval failed, answering without sources", error instanceof Error ? error.message : error);
    }
  }

  const withPrompt = { ...context, prompt, threadPaper, sources, linkedPages: await linkedPages,
    conversationSummary: conversation?.summary, historySearchAvailable: conversation?.hasOlder };
  const guestContext = session.anonymous
    ? { ...withPrompt, materials: [], figures: [], hasMaterials: false, acceptedTool: undefined, memories: [], personalization: undefined }
    : withPrompt;
  const requestImages = guestContext.figures?.map((item) => ({ mimeType: item.mime, data: item.data }));
  const resolvedRequest = resolveAIRequest(modelId, requestImages);
  const compactWeatherAnswer = resolvedRequest.provider.id === "anthropic" &&
    isPlainWeatherQuestion(prompt) &&
    Boolean(resolvedRequest.provider.generateToolStream) &&
    chatModeSendsToolDeclarations(mode);
  console.info("[provider-routing]", JSON.stringify({
    provider: resolvedRequest.provider.id,
    model: resolvedRequest.model ?? modelId,
    selection: modelId,
  }));
  const systemInstruction = buildChatSystemPrompt(guestContext);

        signal.throwIfAborted();
        if (sources.length > 0) controller.enqueue(encodeSse({ sources: sources.map(sourceRef) }));
        let raw: ChatToolCall | null = null;
        let streamed = false;
        const supportsTools =
          Boolean(getAIProvider(modelId).generateToolStream) &&
          chatModeSendsToolDeclarations(mode);
        let toolSent = false;
        let imagesSent = false;
        let imagesSentCount = 0;
        let imageResults: ChatImageHit[] | undefined;
        const loadSkill = createSkillLoader();
        let usedContextTool = false;
        let toolSequence = 0;
        const reportToolStatus = (event: ToolExecutionStatus, id: string) => {
          controller.enqueue(encodeSse({
            type: "tool_status",
            id,
            status: toolStatusText(event, /[\u10A0-\u10FF]/.test(prompt)),
            toolName: event.call.name,
            phase: event.phase,
            detail: (event.call.args.query || event.call.args.topic || (event.call.name === "load_skill" ? event.call.args.id : "") || "").trim().slice(0, 160) || undefined,
          }));
        };
        const executeTool = async (call: ChatToolCall, options?: { signal: AbortSignal }): Promise<unknown> => {
          const id = `tool-${++toolSequence}`;
          if (isInternalTool(call.name)) usedContextTool = true;
          reportToolStatus({ call, phase: "start" }, id);
          if (call.name === "search_images") imageResults ??= [];
          try {
            const response = await withToolTimeout(async (signal) => {
              if (call.name === "load_skill") return loadSkill(call.args.id);
              if (call.name === "search_chat_history") return conversation?.search(call.args.query ?? "", call.args.id) ?? { messages: [] };
              // Artifact creation stays in the existing client dispatcher.
              if (call.name !== "search_images") return { ok: true, tool: call.name, deferred: !toolStreamsText(call.name) };
              if (guestContext.hintAsk || guestContext.examAsk) throw new Error("This turn is a chat exercise or hint.");
              if (!allowImageSearch(session.uid)) throw new Error("Image search rate limit reached.");
              const query = call.args.query?.trim() || prompt;
              const hits = await searchWebImages(query, clampImageCount(call.args.count), { usage: usageReporter, signal });
              signal.throwIfAborted();
              const galleryId = `gallery-${crypto.randomUUID()}`;
              const found = hits.map((hit) => ({ ...toChatImageHit(hit), galleryId }));
              const seen = new Set<string>();
              const unique = found.filter((hit) => {
                if (seen.has(hit.url)) return false;
                seen.add(hit.url);
                return true;
              });
              imageResults!.push(...unique);
              return { galleryId, images: unique.map(({ title, source }, imageIndex) => ({ title, source, imageIndex })) };
            }, options?.signal ?? signal, call.name === "search_images" ? 25_000 : undefined);
            const failed = response && typeof response === "object" && "ok" in response && response.ok === false;
            reportToolStatus({ call, phase: failed ? "error" : "complete", response }, id);
            return response;
          } catch (error) {
            signal.throwIfAborted();
            reportToolStatus({ call, phase: "error" }, id);
            console.warn("[chat-tool] execution failed", call.name, error instanceof Error ? error.message : error);
            const detail = error instanceof Error ? error.message : "The requested tool is unavailable.";
            return { ok: false, images: [], error: detail };
          }
        };
        const sendImageTool = async (tool: ChatToolCall) => {
          if (imageResults === undefined) await executeTool(tool);
          controller.enqueue(encodeSse({ tool, ...(!imagesSent || imagesSentCount !== imageResults?.length ? { images: imageResults ?? [] } : {}) }));
          imagesSent = true;
          imagesSentCount = imageResults?.length ?? 0;
          toolSent = true;
        };
        const sendCompletedImages = () => {
          if (imageResults === undefined || (imagesSent && imagesSentCount === imageResults.length)) return;
          controller.enqueue(encodeSse({ images: imageResults }));
          imagesSent = true;
          imagesSentCount = imageResults.length;
        };
        let pendingProviderText = "";
        const explicit = guestContext.hintAsk || guestContext.examAsk
          ? null
          : forcedToolForRequest({
              prompt,
              mode,
              accepted: guestContext.acceptedTool,
              hasMaterials: Boolean(guestContext.hasMaterials || guestContext.materials.length > 0),
              priorClarify: guestContext.priorClarify,
              pendingTopic: guestContext.pendingTopic,
              pendingKind: guestContext.pendingKind,
              active: guestContext.activeArtifact,
              pathTopic: guestContext.pathTopic,
              projectTitle: guestContext.projectTitle,
              hasPath: guestContext.hasPath,
              pathStarted: Boolean(guestContext.hasPath && guestContext.path && guestContext.path.started !== false),
            });
        if (explicit?.name === "clarify") {
          const id = `tool-${++toolSequence}`;
          reportToolStatus({ call: explicit, phase: "start" }, id);
          const question = explicit.args.question?.trim();
          reportToolStatus({ call: explicit, phase: "complete" }, id);
          if (question) controller.enqueue(encodeSse({ delta: question }));
          controller.enqueue(encodeSse({ tool: explicit }));
          controller.enqueue(encodeSse({ done: true }));
          controller.close();
          return;
        }

        if (supportsTools) {
          for await (const part of generateToolStream(prompt, {
            model: modelId,
            effort,
            mode,
            history,
            systemInstruction,
            tools: chatModeTools(mode).filter(name => name !== "search_chat_history" || conversation?.hasOlder),
            // Image search uses the photo catalog tool; Anthropic web search
            // returns text sources rather than thumbnails and would double-search.
            webSearch: explicit?.name !== "search_images",
            webSearchRequired: compactWeatherAnswer && explicit?.name !== "search_images",
            toolChoice:
              explicit && eligibleChatToolNames(mode).includes(explicit.name)
                ? explicit.name
                : undefined,
            images: guestContext.figures?.map((item) => ({ mimeType: item.mime, data: item.data })),
            usage: usageReporter,
            executeTool,
            signal,
          })) {
            if (part.tool && !raw) {
              raw = explicit && (explicit.name === "create_note" || explicit.name === "edit_note" || explicit.name === "edit_sheet") && part.tool.name !== explicit.name ? explicit : part.tool;
              const preview = raw;
              if (preview.name === "search_images" && !guestContext.examAsk && !guestContext.hintAsk) {
                await sendImageTool(preview);
              } else if (
                preview &&
                !guestContext.examAsk &&
                !toolStreamsText(preview.name) &&
                preview.name !== "suggest_practice" &&
                preview.name !== "suggest_sheet" &&
                preview.name !== "suggest_path"
              ) {
                toolSent = true;
                controller.enqueue(encodeSse({ tool: preview }));
              }
            }
            sendCompletedImages();
            const preview = raw;
            const waitForTool = Boolean(guestContext.priorClarify && guestContext.pendingKind && !usedContextTool);
            if (part.text && (!waitForTool || preview) && (!preview || toolStreamsText(preview.name))) {
              if (!compactWeatherAnswer && (preview || !explicit)) {
                streamed = true;
                controller.enqueue(encodeSse({ delta: part.text }));
              }
              pendingProviderText += part.text;
            }
          }
        }

        if (compactWeatherAnswer) {
          try {
            pendingProviderText = await ensureCitedWeatherCard(pendingProviderText, (answer) =>
              resolvedRequest.provider.generateText(answer, {
                model: resolvedRequest.model,
                mode,
                systemInstruction: WEATHER_CARD_REPAIR_INSTRUCTION,
                cache: false,
                maxOutputTokens: 1000,
                signal,
                usage: usageReporter,
              }),
              prompt,
            );
          } catch (error) {
            signal.throwIfAborted();
            console.warn("[weather-card] formatting failed", error instanceof Error ? error.message : "unknown error");
          }
          // A simple weather lookup should surface only one concise sentence
          // plus a validated card and its citations, even if Claude over-explains.
          pendingProviderText = compactWeatherReply(pendingProviderText);
        }

        if (!raw) {
          // A context tool followed by final text is an answer, not a zero-tool routing miss.
          const guidedAnswer: ChatToolCall | null = usedContextTool && pendingProviderText.trim()
            ? { name: "answer", args: {} }
            : null;
          raw = explicit && isInternalTool(explicit.name)
            ? guidedAnswer ?? { name: "answer", args: {} }
            : explicit ?? guidedAnswer ?? fallbackToolAfterProvider({
            prompt,
            mode,
            active: guestContext.activeArtifact,
            accepted: guestContext.acceptedTool,
            hasMaterials: Boolean(guestContext.hasMaterials || guestContext.materials.length > 0),
            priorClarify: guestContext.priorClarify,
            pendingTopic: guestContext.pendingTopic,
            pendingKind: guestContext.pendingKind,
            pathTopic: guestContext.pathTopic,
            projectTitle: guestContext.projectTitle,
            hasPath: guestContext.hasPath,
            pathStarted: Boolean(guestContext.hasPath && guestContext.path && guestContext.path.started !== false),
          });
          const preview = raw;
          if (preview.name === "search_images") await sendImageTool(preview);
          else if (!streamed && toolStreamsText(preview.name) && pendingProviderText.trim()) {
            streamed = true;
            controller.enqueue(encodeSse({ delta: pendingProviderText }));
          } else if (!supportsTools && toolStreamsText(preview.name)) {
            for await (const delta of generateTextStream(prompt, {
              model: modelId,
              effort,
              mode,
              history,
              systemInstruction,
              images: guestContext.figures?.map((item) => ({ mimeType: item.mime, data: item.data })),
              usage: usageReporter,
              signal,
            })) {
              streamed = true;
              controller.enqueue(encodeSse({ delta }));
            }
          }
        }

        sendCompletedImages();
        let tool = raw ?? { name: "answer" as const, args: {} };
        if (session.anonymous) tool = gateGuestChatTool(tool);
        if (guestContext.hintAsk) {
          tool = { name: "answer", args: {} };
        }
        if (guestContext.examAsk) {
          tool = { name: "answer", args: { question: tool.args.question, options: tool.args.options } };
        }
        if (toolStreamsText(tool.name) && !streamed) {
          if (tool.name === "clarify" && tool.args.question) {
            streamed = true;
            controller.enqueue(encodeSse({ delta: tool.args.question }));
          } else {
            const answerSystem =
              tool.name === "search_images"
                ? imageResults?.length
                  ? `${systemInstruction}\n\nCompleted image search results (reference data): ${JSON.stringify(imageResults.map(({ galleryId, title, source }, index) => ({ galleryId, title, source, imageIndex: imageResults!.slice(0, index).filter((image) => image.galleryId === galleryId).length })))}\nAnswer the user's request using these completed results. You may place a gallery anywhere among prose and available native or visual blocks with an image-gallery code fence containing {"galleryId":"the returned ID"}. When the user asks for several distinct entries with a short explanation for each, prefer a toby image-list fence so each image appears beside its own title and explanation: {"items":[{"title":"Heading","text":"Explanation","galleryId":"the returned ID","imageIndex":0}]}. Use a plain gallery when they mainly want to browse. These can be interleaved with prose and other blocks. Use only returned gallery IDs and zero-based image indexes, and keep image URLs out of the answer. Unplaced results appear after the answer.`
                  : `${systemInstruction}\n\nImage search returned no images. Answer in text using the available context and briefly mention that images are unavailable.`
                : systemInstruction;
            for await (const delta of generateTextStream(prompt, {
              model: modelId,
              effort,
              mode,
              history,
              systemInstruction: answerSystem,
              images: guestContext.figures?.map((item) => ({ mimeType: item.mime, data: item.data })),
              usage: usageReporter,
              signal,
            })) {
              streamed = true;
              controller.enqueue(encodeSse({ delta }));
            }
          }
        }
        if (!toolSent) controller.enqueue(encodeSse({ tool }));
        answerCompleted = true;
        controller.enqueue(encodeSse({ done: true }));
        controller.close();
      } catch (error) {
        if (generation.signal.aborted || request.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Generation failed.";
        controller.enqueue(encodeSse({ error: message }));
        controller.close();
      } finally {
        clearInterval(heartbeatTimer);
        if (usage) await usage.commit().catch((error) => console.error("[ai-usage] commit failed", error));
      }
    },
    cancel() { generation.abort(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
