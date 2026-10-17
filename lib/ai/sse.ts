import type { ChatToolCall } from "@/lib/ai/tools";
import { isChatToolName, parseToolCall } from "@/lib/ai/tools";
import type { ToolStatusUpdate } from "@/lib/ai/tool-execution";
import type { ChatImageHit, ChatSourceRef } from "@/types/chat";
import { parseSearchHits } from "@/lib/images/hits";
import { GUEST_CAP_CODE, GuestCapError } from "@/lib/guest";

export async function readSseStream(
  response: Response,
  onDelta: (delta: string) => void,
): Promise<string> {
  const result = await readChatSse(response, { onDelta });
  return result.text;
}

export async function readChatSse(
  response: Response,
  handlers?: {
    onDelta?: (delta: string) => void;
    onTool?: (tool: ChatToolCall) => void;
    onSources?: (sources: ChatSourceRef[]) => void;
    onImages?: (images: ChatImageHit[]) => void;
    onStatus?: (status: string, type?: "thinking" | "tool_status") => void;
    onToolStatus?: (update: ToolStatusUpdate) => void;
  },
): Promise<{ text: string; tool: ChatToolCall | null }> {
  if (!response.body) {
    throw new Error("No response stream.");
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
    if (data?.code === GUEST_CAP_CODE) throw new GuestCapError();
    throw new Error(data?.error ?? "Request failed.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let tool: ChatToolCall | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const line = event.split("\n").find((entry) => entry.startsWith("data: "));
      if (!line) continue;

      const payload = JSON.parse(line.slice(6)) as {
        delta?: string;
        tool?: { name?: unknown; args?: unknown };
        sources?: ChatSourceRef[];
        images?: unknown;
        status?: unknown;
        type?: unknown;
        text?: unknown;
        id?: unknown;
        toolName?: unknown;
        phase?: unknown;
        detail?: unknown;
        error?: string;
        done?: boolean;
      };

      if (payload.error) {
        throw new Error(payload.error);
      }

      if (Array.isArray(payload.sources)) handlers?.onSources?.(payload.sources);
      const statusType = payload.type === "thinking" || payload.type === "tool_status" ? payload.type : undefined;
      const status = payload.status ?? (statusType ? payload.text : undefined);
      if (typeof status === "string" && status.trim()) handlers?.onStatus?.(status.trim(), statusType);
      if (statusType === "tool_status" && typeof payload.id === "string" && isChatToolName(payload.toolName)
        && (payload.phase === "start" || payload.phase === "complete" || payload.phase === "error") && typeof status === "string") {
        handlers?.onToolStatus?.({
          id: payload.id,
          toolName: payload.toolName,
          phase: payload.phase,
          status: status.trim(),
          detail: typeof payload.detail === "string" ? payload.detail : undefined,
        });
      }

      if (payload.tool && !tool) {
        tool = parseToolCall(payload.tool.name, payload.tool.args);
        if (tool) handlers?.onTool?.(tool);
      }
      if (Array.isArray(payload.images)) handlers?.onImages?.(parseSearchHits(payload.images));
      if (payload.delta) {
        text += payload.delta;
        handlers?.onDelta?.(payload.delta);
      }
    }
  }

  return { text, tool };
}
