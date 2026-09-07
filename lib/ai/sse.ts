import type { ChatToolCall } from "@/lib/ai/tools";
import { parseToolCall } from "@/lib/ai/tools";

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
  },
): Promise<{ text: string; tool: ChatToolCall | null }> {
  if (!response.body) {
    throw new Error("No response stream.");
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
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
        error?: string;
        done?: boolean;
      };

      if (payload.error) {
        throw new Error(payload.error);
      }

      if (payload.delta) {
        text += payload.delta;
        handlers?.onDelta?.(payload.delta);
      }

      if (payload.tool && !tool) {
        tool = parseToolCall(payload.tool.name, payload.tool.args);
        if (tool) handlers?.onTool?.(tool);
      }
    }
  }

  return { text, tool };
}
