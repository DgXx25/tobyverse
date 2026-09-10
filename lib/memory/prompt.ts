import { MEMORY_CONTENT_MAX, MEMORY_HISTORY_TURNS, MEMORY_OPS_PER_TURN, MEMORY_TURN_CHARS } from "@/lib/memory/constants";
import { clipText } from "@/lib/materials/limits";
import type { ChatMemoryContext } from "@/types/memory";
import type { ChatTurn } from "@/types/chat";

export const MEMORY_EXTRACT_SYSTEM = `You curate long-term memory for a study tutor. Return JSON only.

Store only short atomic facts about the student: preferences, speaking style, identity, recurring instructions, stable study constraints.
Do not store chat transcripts, summaries, homework from this turn, greetings, or one-off topics.
Do not invent facts. Only what the user clearly stated or strongly implied.
If they asked to remember something, or said from now on / always / never do X, store that immediately as one atomic fact.
If a new fact replaces an existing one, update that id. Never duplicate.
Prefer zero operations. At most ${MEMORY_OPS_PER_TURN}. Each fact is one sentence, max ${MEMORY_CONTENT_MAX} characters.

JSON shape:
{"operations":[{"op":"add","content":"..."}]|[{"op":"update","id":"...","content":"..."}]|[{"op":"delete","id":"..."}]}`;

export function formatMemoryBlock(memories: ChatMemoryContext[]): string | null {
  const lines = memories.map((item) => item.content.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return [
    "Memory",
    "Durable facts about this student. Follow them automatically when relevant. Do not mention this list unless asked. Do not invent extra memories.",
    ...lines.map((line) => `- ${line}`),
  ].join("\n");
}

export function memoryExtractPrompt(input: {
  prompt: string;
  memories: ChatMemoryContext[];
  history?: ChatTurn[];
}): string {
  const existing =
    input.memories.length > 0
      ? input.memories.map((item) => `${item.id} | ${item.content}`).join("\n")
      : "(none)";
  const recent = (input.history ?? [])
    .filter((turn) => turn.content.trim())
    .slice(-MEMORY_HISTORY_TURNS)
    .map((turn) => `${turn.role}: ${clipText(turn.content, MEMORY_TURN_CHARS)}`)
    .join("\n");

  return [
    `Existing memories (id | fact):\n${existing}`,
    recent ? `Recent chat (resolve references such as "remember that"; do not store the transcript):\n${recent}` : null,
    `Latest user message:\n${clipText(input.prompt, 1500)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
