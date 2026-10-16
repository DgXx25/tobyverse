import { generateTextStream, generateToolStream, getAIProvider } from "@/lib/ai/gemini";
import { eligibleChatToolNames, toolStreamsText, type ChatToolCall } from "@/lib/ai/tools";
import { DEFAULT_AI_PROVIDER, DEFAULT_GEMINI_MODEL, isAdminOnlyAiModel, isKnownAiModel, isEnabledProvider } from "@/lib/ai/catalog";
import { FREE_CAPS } from "@/lib/account/plan";
import { assertSignedInRequest, authErrorResponse } from "@/lib/api/assert";
import { GUEST_ASSISTANT_CAP, GUEST_CAP_CODE, GUEST_CAP_LINE, gateGuestChatTool } from "@/lib/guest";
import { buildChatSystemPrompt } from "@/lib/chat/context";
import { parseChatArtifact } from "@/lib/artifacts/active";
import { fallbackToolAfterProvider, forcedToolForRequest } from "@/lib/chat/tool-routing";
import { CHAT_EXCERPT_CHARS, CHAT_IMAGE_LIMIT, CHAT_MATERIAL_LIMIT } from "@/lib/materials/limits";
import { asMemoryFacts, sanitizePersonalization } from "@/lib/memory/normalize";
import { asChatMode, chatModeSendsToolDeclarations, chatModeTools } from "@/lib/core/chat-modes";
import { retrieveChunks } from "@/lib/rag/server";
import { numberSources, retrievalQuery, sourceRef } from "@/lib/rag/sources";
import { papersInTurns } from "@/lib/blocks/paper-thread";
import { startAiUsageSession, aiUsageErrorResponse } from "@/lib/billing/server";
import { allowImageSearch, clampImageCount, searchWebImages } from "@/lib/images/search";
import { toChatImageHit } from "@/lib/images/hits";
import { adminErrorResponse, assertAdminRequest } from "@/lib/admin/assert";
import { CHAT_MODES, type ChatArtifact, type ChatImageHit, type ChatSource, type ChatFigureContext, type ChatGenerationContext, type ChatMode, type ChatTurn } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequestBody = {
  prompt?: unknown;
  mode?: unknown;
  provider?: unknown;
  model?: unknown;
  history?: unknown;
  context?: unknown;
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
    memories: asMemoryFacts(row.memories, FREE_CAPS.memories),
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

  const requestedModel = typeof body.model === "string" ? body.model : DEFAULT_GEMINI_MODEL;
  if (!isKnownAiModel(requestedModel)) {
    return Response.json({ error: "That model is not available." }, { status: 400 });
  }
  if (isAdminOnlyAiModel(requestedModel)) {
    try {
      await assertAdminRequest(request);
    } catch (error) {
      return adminErrorResponse(error);
    }
  }
  const modelId = requestedModel;

  let usage: Awaited<ReturnType<typeof startAiUsageSession>> | null = null;
  if (!session.anonymous) {
    try {
      usage = await startAiUsageSession(session.uid, { models: [modelId] });
    } catch (error) {
      return aiUsageErrorResponse(error);
    }
  }
  const usageReporter = usage ? usage.report : undefined;

  const history = asHistory(body.history).slice(-20);
  if (session.anonymous) {
    const assistantTurns = history.filter((item) => item.role === "assistant").length;
    if (assistantTurns >= GUEST_ASSISTANT_CAP) {
      return Response.json({ error: GUEST_CAP_LINE, code: GUEST_CAP_CODE }, { status: 403 });
    }
  }
  const context = asContext(body.context, mode);
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
        await retrieveChunks({
          uid: session.uid,
          projectId: context.projectId,
          query: retrievalQuery(prompt, history),
          materialIds,
          limit: mode === "fast" ? 5 : 8,
        }),
      );
    } catch (error) {
      console.warn("[rag] retrieval failed, answering without sources", error instanceof Error ? error.message : error);
    }
  }

  const withPrompt = { ...context, prompt, threadPaper, sources };
  const guestContext = session.anonymous
    ? { ...withPrompt, materials: [], figures: [], hasMaterials: false, acceptedTool: undefined, memories: [], personalization: undefined }
    : withPrompt;
  const systemInstruction = buildChatSystemPrompt(guestContext);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (sources.length > 0) controller.enqueue(encodeSse({ sources: sources.map(sourceRef) }));
        let raw: ChatToolCall | null = null;
        let streamed = false;
        const supportsTools =
          Boolean(getAIProvider().generateToolStream) &&
          chatModeSendsToolDeclarations(mode);
        let toolSent = false;
        let imageResults: ChatImageHit[] | undefined;
        const executeTool = async (call: ChatToolCall): Promise<unknown> => {
          if (call.name !== "search_images") return { ok: true, tool: call.name };
          if (guestContext.hintAsk || guestContext.examAsk) return { images: [], error: "This turn is a chat exercise or hint, not an image request." };
          imageResults ??= [];
          if (!allowImageSearch(session.uid)) return { images: [], error: "Image search rate limit reached. Answer using the available context." };
          try {
            const query = call.args.query?.trim() || prompt;
            const statusQuery = query.slice(0, 72);
            const searching = /[\u10A0-\u10FF]/.test(prompt)
              ? `ვეძებ ფოტოებს „${statusQuery}“…`
              : `Searching photos for “${statusQuery}”…`;
            controller.enqueue(encodeSse({ status: searching }));
            const hits = await searchWebImages(query, clampImageCount(call.args.count), { usage: usageReporter });
            const found = hits.map(toChatImageHit);
            const seen = new Set(imageResults.map((hit) => hit.url));
            for (const hit of found) {
              if (!seen.has(hit.url)) imageResults.push(hit);
              seen.add(hit.url);
            }
            return { images: found.map(({ title, source }) => ({ title, source })) };
          } catch (error) {
            console.warn("[chat-images] search failed", error instanceof Error ? error.message : error);
            return { images: [], error: "Image search unavailable. Answer using the available context." };
          }
        };
        const sendImageTool = async (tool: ChatToolCall) => {
          if (imageResults === undefined) await executeTool(tool);
          controller.enqueue(encodeSse({ tool, images: imageResults ?? [] }));
          toolSent = true;
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
          const question = explicit.args.question?.trim();
          if (question) controller.enqueue(encodeSse({ delta: question }));
          controller.enqueue(encodeSse({ tool: explicit }));
          controller.enqueue(encodeSse({ done: true }));
          controller.close();
          return;
        }

        if (supportsTools) {
          for await (const part of generateToolStream(prompt, {
            model: modelId,
            mode,
            history,
            systemInstruction,
            tools: chatModeTools(mode),
            toolChoice:
              explicit && eligibleChatToolNames(mode).includes(explicit.name)
                ? explicit.name
                : undefined,
            images: guestContext.figures?.map((item) => ({ mimeType: item.mime, data: item.data })),
            usage: usageReporter,
            executeTool,
          })) {
            if (part.tool && !raw) {
              raw = part.tool;
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
            const preview = raw;
            const waitForTool = Boolean(guestContext.priorClarify && guestContext.pendingKind);
            if (part.text && (!waitForTool || preview) && (!preview || toolStreamsText(preview.name))) {
              if (preview) {
                streamed = true;
                controller.enqueue(encodeSse({ delta: part.text }));
              } else {
                pendingProviderText += part.text;
              }
            }
          }
        }

        if (!raw) {
          raw = explicit ?? fallbackToolAfterProvider({
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
          else if (toolStreamsText(preview.name) && pendingProviderText.trim()) {
            streamed = true;
            controller.enqueue(encodeSse({ delta: pendingProviderText }));
          } else if (!supportsTools && toolStreamsText(preview.name)) {
            for await (const delta of generateTextStream(prompt, {
              model: modelId,
              mode,
              history,
              systemInstruction,
              images: guestContext.figures?.map((item) => ({ mimeType: item.mime, data: item.data })),
              usage: usageReporter,
            })) {
              streamed = true;
              controller.enqueue(encodeSse({ delta }));
            }
          }
        }

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
            const captionSystem =
              tool.name === "search_images"
                ? `${systemInstruction}\n\nThis turn already called search_images. Write only one short line in the user's language introducing the photos. Nothing else. No URLs. No lists.`
                : systemInstruction;
            for await (const delta of generateTextStream(prompt, {
              model: modelId,
              mode,
              history,
              systemInstruction: captionSystem,
              images: guestContext.figures?.map((item) => ({ mimeType: item.mime, data: item.data })),
              usage: usageReporter,
            })) {
              streamed = true;
              controller.enqueue(encodeSse({ delta }));
            }
          }
        }
        if (!toolSent) controller.enqueue(encodeSse({ tool }));
        controller.enqueue(encodeSse({ done: true }));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Generation failed.";
        controller.enqueue(encodeSse({ error: message }));
        controller.close();
      } finally {
        if (usage) await usage.commit().catch((error) => console.error("[ai-usage] commit failed", error));
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
