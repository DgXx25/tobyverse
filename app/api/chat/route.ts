import { generateTextStream, generateToolStream, getAIProvider } from "@/lib/ai/gemini";
import { toolStreamsText, type ChatToolCall } from "@/lib/ai/tools";
import { DEFAULT_AI_PROVIDER, isEnabledProvider } from "@/lib/ai/catalog";
import { assertSignedInRequest, authErrorResponse } from "@/lib/api/assert";
import { buildChatSystemPrompt } from "@/lib/chat/context";
import { parseChatArtifact } from "@/lib/artifacts/active";
import { fallbackChatTool, gateChatTool } from "@/lib/composer/intent";
import { CHAT_EXCERPT_CHARS, CHAT_IMAGE_LIMIT, CHAT_MATERIAL_LIMIT } from "@/lib/materials/limits";
import { CHAT_MODES, type ChatArtifact, type ChatFigureContext, type ChatGenerationContext, type ChatMode, type ChatTurn } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequestBody = {
  prompt?: unknown;
  mode?: unknown;
  provider?: unknown;
  history?: unknown;
  context?: unknown;
};

function asMode(value: unknown): ChatMode {
  return value === "socratic" ? "socratic" : "normal";
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
  return value === "create_practice" || value === "create_sheet" ? value : undefined;
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
    pendingKind: row.pendingKind === "sheet" ? "sheet" : row.pendingKind === "practice" ? "practice" : undefined,
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

function gateFromContext(tool: ChatToolCall | null, prompt: string, context: ChatGenerationContext): ChatToolCall {
  return gateChatTool({
    tool,
    prompt,
    hasMaterials: Boolean(context.hasMaterials || context.materials.length > 0),
    confirmed: context.confirmed,
    priorClarify: context.priorClarify,
    pendingTopic: context.pendingTopic,
    pendingKind: context.pendingKind,
    active: context.activeArtifact,
  });
}

export async function POST(request: Request) {
  try {
    await assertSignedInRequest(request);
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

  const history = asHistory(body.history).slice(-20);
  const context = asContext(body.context, mode);
  const systemInstruction = buildChatSystemPrompt(context);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let raw: ChatToolCall | null = context.acceptedTool
          ? { name: context.acceptedTool, args: {} }
          : null;
        let streamed = false;
        let textChars = 0;
        const supportsTools = Boolean(getAIProvider().generateToolStream) && !context.acceptedTool;

        if (supportsTools) {
          for await (const part of generateToolStream(prompt, {
            mode,
            history,
            systemInstruction,
            tools: true,
            images: context.figures?.map((item) => ({ mimeType: item.mime, data: item.data })),
          })) {
            if (part.tool && !raw) raw = part.tool;
            const preview = raw ? gateFromContext(raw, prompt, context) : null;
            const waitForTool = Boolean(context.priorClarify && context.pendingKind);
            if (part.text && (!waitForTool || preview) && (!preview || toolStreamsText(preview.name))) {
              streamed = true;
              textChars += part.text.length;
              controller.enqueue(encodeSse({ delta: part.text }));
            }
          }
        } else if (!raw) {
          raw = fallbackChatTool({
            prompt,
            active: context.activeArtifact,
            accepted: context.acceptedTool,
            priorClarify: context.priorClarify,
            pendingTopic: context.pendingTopic,
            pendingKind: context.pendingKind,
          });
          const preview = gateFromContext(raw, prompt, context);
          if (toolStreamsText(preview.name)) {
            for await (const delta of generateTextStream(prompt, {
              mode,
              history,
              systemInstruction,
              images: context.figures?.map((item) => ({ mimeType: item.mime, data: item.data })),
            })) {
              streamed = true;
              textChars += delta.length;
              controller.enqueue(encodeSse({ delta }));
            }
          }
        }

        let tool = gateFromContext(raw, prompt, context);
        if ((tool.name === "suggest_practice" || tool.name === "suggest_sheet") && textChars < 280) {
          tool = { name: "answer", args: {} };
        }
        if (toolStreamsText(tool.name) && !streamed) {
          if (tool.name === "clarify" && tool.args.question) {
            streamed = true;
            controller.enqueue(encodeSse({ delta: tool.args.question }));
          } else {
            for await (const delta of generateTextStream(prompt, {
              mode,
              history,
              systemInstruction,
              images: context.figures?.map((item) => ({ mimeType: item.mime, data: item.data })),
            })) {
              streamed = true;
              textChars += delta.length;
              controller.enqueue(encodeSse({ delta }));
            }
          }
        }
        controller.enqueue(encodeSse({ tool }));
        controller.enqueue(encodeSse({ done: true }));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Generation failed.";
        controller.enqueue(encodeSse({ error: message }));
        controller.close();
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
