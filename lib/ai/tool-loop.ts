import { parseToolCall, type ChatToolCall } from "@/lib/ai/tools";

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
};

export async function runToolLoop(input: {
  callModel: (input: {
    round: number;
    functionResponses: Array<{ name: string; response: unknown }>;
  }) => Promise<ToolLoopTurn>;
  execute: (call: ChatToolCall) => Promise<unknown>;
  /** Hand a completed tool back to the provider for a streamed text-only continuation. */
  stopAfterTool?: (call: ChatToolCall) => boolean;
  maxRounds?: number;
}): Promise<ToolLoopResult> {
  const maxRounds = Math.max(1, Math.min(3, input.maxRounds ?? 3));
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
    for (const call of calls) {
      if (!selected || (selected.name === "answer" && call.name !== "answer")) selected = call;
      const response = await input.execute(call);
      functionResponses.push({ name: call.name, response });
    }

    if (selected && input.stopAfterTool?.(selected)) {
      return { text: "", tool: selected, rounds, functionResponses };
    }
    if (text.trim()) return { text, tool: selected, rounds, functionResponses };
    if (calls.length === 0) break;
  }

  return { text: "", tool: selected, rounds, functionResponses };
}
