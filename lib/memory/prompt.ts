import { MEMORY_CONTENT_MAX, MEMORY_HISTORY_TURNS, MEMORY_OPS_PER_TURN, MEMORY_TURN_CHARS, PERSONALIZATION_MAX } from "@/lib/memory/constants";
import { clipText } from "@/lib/materials/limits";
import type { ChatMemoryContext } from "@/types/memory";
import type { ChatTurn } from "@/types/chat";

export const MEMORY_EXTRACT_SYSTEM = `You maintain two stores for a study tutor. Return JSON only. Default is no change.

Memory = standing instructions for how Toby should respond later. Not a biography. Not how they learn.
Save memory ONLY when they clearly want this as the default on future turns:
- they asked to remember / never forget / from now on / always / never do X, or
- they stated a lasting preference for Toby's behavior: "I prefer you…", "I'd rather you…", "I like when you…", "please take this into account", "maybe keep this in mind" when it is about how Toby should act going forward.
Do not store: this turn's topic, homework, greetings, identity trivia, one-off "it would be nice if this answer…", or how they study.
If unsure, return no memory. Prefer {"operations":[]}. At most ${MEMORY_OPS_PER_TURN} operation. One sentence, max ${MEMORY_CONTENT_MAX} characters.
If a new instruction replaces an existing one, update that id. Never duplicate.

Personalization = ONE edited paragraph about how THIS student learns (what helps them understand, why they ask questions, how they like to study).
Update only when this turn reveals a durable learning signal — not from a normal homework question.
If updating, rewrite the whole existing paragraph: keep what is still true, fold in the new signal, drop what they contradicted. Do not grow with trivia. Do not append a new bullet.
If nothing new about learning, return personalization null. Empty string is not a wipe; use null for no change.
Never put standing response instructions in personalization. Max ${PERSONALIZATION_MAX} characters.

JSON shape:
{"operations":[],"personalization":null}
or {"operations":[{"op":"add","content":"..."}],"personalization":null}
or {"operations":[],"personalization":"full replacement paragraph"}`;

export function formatMemoryBlock(memories: ChatMemoryContext[]): string | null {
  const lines = memories.map((item) => item.content.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return [
    "Memory",
    "Standing instructions for how you respond. Follow when relevant. Not a biography and not a learning-style profile. Do not mention this list unless asked. Do not invent extra memories.",
    ...lines.map((line) => `- ${line}`),
  ].join("\n");
}

export function formatPersonalizationBlock(text: string): string | null {
  const body = text.trim();
  if (!body) return null;
  return [
    "Learning profile",
    "How this student tends to learn. Adapt teaching to it. Do not mention this block. Do not treat it as standing tool/response instructions.",
    body,
  ].join("\n");
}

export function memoryExtractPrompt(input: {
  prompt: string;
  memories: ChatMemoryContext[];
  personalization?: string;
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
  const profile = input.personalization?.trim() || "(none)";

  return [
    `Existing memories (id | standing instruction):\n${existing}`,
    `Existing learning profile:\n${profile}`,
    recent ? `Recent chat (resolve "remember that"; do not store the transcript):\n${recent}` : null,
    `Latest user message:\n${clipText(input.prompt, 1500)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
