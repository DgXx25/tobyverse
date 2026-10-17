import { isInternalTool, parseToolCall, type ChatToolCall } from "@/lib/ai/tools";
import { withToolTimeout, type ToolExecutionStatus } from "@/lib/ai/tool-execution";

export type ToolLoopPart = {
  text?: string;
  functionCall?: { name: string; args?: unknown };
};

export type ToolLoopTurn = { parts?: ToolLoopPart[] } | null | undefined;

export type ToolLoopResult = {
  text: string;
  tool: ChatToolCall | null;
  rounds: number;
  functionResponses: Array<{ name: string; response: unknown }>;
  failed?: boolean;
};

export async function runToolLoop(input: {
  callModel: (input: {
    round: number;
    functionResponses: Array<{ name: string; response: unknown }>;
  }) => Promise<ToolLoopTurn>;
  execute: (call: ChatToolCall, options: { signal: AbortSignal }) => Promise<unknown>;
  onToolStatus?: (event: ToolExecutionStatus) => void;
  signal?: AbortSignal;
  /** Hand a completed tool back to the provider for a streamed text-only continuation. */
  stopAfterTool?: (call: ChatToolCall) => boolean;
  maxRounds?: number;
}): Promise<ToolLoopResult> {
  const maxRounds = Math.max(1, Math.min(4, input.maxRounds ?? 4));
  let functionResponses: Array<{ name: string; response: unknown }> = [];
  let selected: ChatToolCall | null = null;
  let rounds = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    rounds = round;
    const turn = await input.callModel({ round, functionResponses });
    const parts = turn?.parts ?? [];
    const text = parts.map((part) => part.text ?? "").join("");
    const calls = parts.flatMap((part) => {
      const call = part.functionCall
        ? parseToolCall(part.functionCall.name, part.functionCall.args)
        : null;
      return call ? [call] : [];
    });

    functionResponses = [];
    let failed = false;
    for (const call of calls) {
      if (!isInternalTool(call.name) && (!selected || (selected.name === "answer" && call.name !== "answer"))) selected = call;
      input.onToolStatus?.({ call, phase: "start" });
      let response: unknown;
      try {
        response = await withToolTimeout((signal) => input.execute(call, { signal }), input.signal);
      } catch (error) {
        input.signal?.throwIfAborted();
        response = { ok: false, error: error instanceof Error && error.name === "ToolTimeoutError"
          ? error.message
          : "Tool failed. Continue with a text answer using the available context; do not retry the tool." };
      }
      functionResponses.push({ name: call.name, response });
      const outcome = response as { ok?: boolean; error?: unknown } | null;
      const callFailed = outcome?.ok === false || Boolean(outcome?.error);
      failed ||= callFailed;
      input.onToolStatus?.({ call, phase: callFailed ? "error" : "complete", response });
    }
    if (failed) return { text: "", tool: null, rounds, functionResponses, failed: true };

    const handoff = calls.find((call) => input.stopAfterTool?.(call));
    if (handoff) {
      return { text: "", tool: handoff, rounds, functionResponses };
    }
    if (calls.length === 0 && text.trim()) return { text, tool: selected, rounds, functionResponses };
    if (calls.length === 0) break;
  }

  return { text: "", tool: selected, rounds, functionResponses };
}
