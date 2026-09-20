import { MEMORY_CONTENT_MAX, MEMORY_HISTORY_TURNS, MEMORY_OPS_PER_TURN, MEMORY_TURN_CHARS, PERSONALIZATION_MAX } from "@/lib/memory/constants";
import { clipText } from "@/lib/materials/limits";
import type { ChatMemoryContext } from "@/types/memory";
import type { ChatTurn } from "@/types/chat";

export const ASK_MEMORY_CAP = 4;

export const MEMORY_EXTRACT_SYSTEM = `You maintain two stores for a workspace assistant. Return JSON only. Default is no change.

Memory = durable facts about the user that should change later answers: name, role/job, exam or course (including a date), level, preferred language, work context.
Save memory when they state such a fact, or clearly asked to remember / from now on / always / never.
Do not store: this turn's question, homework, greetings, one-off requests, or how they like explanations.
A request for notes / კონსპექტი / practice / a path / photos / write X is a task — never memory and never personalization.
If unsure, return no memory. Prefer {"operations":[]}. At most ${MEMORY_OPS_PER_TURN} operation. One sentence, max ${MEMORY_CONTENT_MAX} characters.
If a new fact replaces an existing one, update that id. Never duplicate.

Personalization = ONE edited paragraph about how they work or learn (what clicks, what loses them, preferred length). Update only on a durable signal (confused, too long, wants examples, job context). A normal content question is not a signal.
If updating, rewrite the whole paragraph: keep what is still true, fold in the new signal, drop contradictions. Do not grow with trivia.
If nothing new, return personalization null. Empty string is not a wipe; use null for no change.
Never put standing response instructions in personalization. Max ${PERSONALIZATION_MAX} characters.

JSON shape:
{"operations":[],"personalization":null}
or {"operations":[{"op":"add","content":"..."}],"personalization":null}
or {"operations":[],"personalization":"full replacement paragraph"}`;

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 2);
}

/** Prefer memories that overlap this prompt; fill remaining slots from recency (newest first). */
export function pickMemoriesForAsk(
  memories: ChatMemoryContext[],
  prompt: string,
  cap = ASK_MEMORY_CAP,
): ChatMemoryContext[] {
  const items = memories.filter((item) => item.content.trim());
  if (items.length === 0 || cap <= 0) return [];
  const words = new Set(tokens(prompt));
  const scored = items.map((item, index) => {
    const hay = item.content.toLowerCase();
    let hits = 0;
    for (const word of words) {
      if (hay.includes(word)) hits += 1;
    }
    return { item, score: words.size === 0 ? 0 : hits / words.size, index };
  });
  const overlapping = scored
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const rest = scored.filter((row) => row.score === 0).sort((a, b) => a.index - b.index);
  const picked: ChatMemoryContext[] = [];
  const seen = new Set<string>();
  for (const row of [...overlapping, ...rest]) {
    if (picked.length >= cap) break;
    if (seen.has(row.item.id)) continue;
    seen.add(row.item.id);
    picked.push(row.item);
  }
  return picked;
}

export function formatKnownUserBlock(input: {
  memories: ChatMemoryContext[];
  personalization?: string;
}): string | null {
  const lines = [
    ...input.memories.map((item) => item.content.trim()).filter(Boolean),
    input.personalization?.replace(/\s+/g, " ").trim() || "",
  ].filter(Boolean);
  if (lines.length === 0) return null;
  return [
    "Known about this user:",
    ...lines.map((line) => `- ${line}`),
    "Use only when it changes the answer (name, level, exam date, preferred language, job). Never recite the list.",
  ].join("\n");
}

export function formatMemoryBlock(memories: ChatMemoryContext[]): string | null {
  return formatKnownUserBlock({ memories });
}

export function formatPersonalizationBlock(text: string): string | null {
  return formatKnownUserBlock({ memories: [], personalization: text });
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
    `Existing memories (id | durable fact):\n${existing}`,
    `Existing personalization:\n${profile}`,
    recent ? `Recent chat (resolve "remember that"; do not store the transcript):\n${recent}` : null,
    `Latest user message:\n${clipText(input.prompt, 1500)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
