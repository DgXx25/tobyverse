import { MEMORY_CONTENT_MAX, MEMORY_HISTORY_TURNS, MEMORY_OPS_PER_TURN, MEMORY_TURN_CHARS, PERSONALIZATION_MAX } from "@/lib/memory/constants";
import { clipText } from "@/lib/materials/limits";
import type { ChatMemoryContext } from "@/types/memory";
import type { ChatTurn } from "@/types/chat";
import { sanitizeMemoryContent, sanitizePersonalization } from "@/lib/memory/normalize";
import { memorySafeText, memorySafeTurns } from "@/lib/memory/privacy";

export const ASK_MEMORY_CAP = 4;

export const MEMORY_EXTRACT_SYSTEM = `You maintain three stores for a workspace assistant. Return JSON only. Default is no change.

Privacy: never retain contact details, addresses, personal/financial identifiers, account/card details, financial amounts, credentials or confidential information in any store. Never reconstruct filtered context. Excluded turns cannot support a preference or an observation. Names alone may be retained when the user explicitly shares their own name or asks to remember it. Never infer personal facts from a pasted document, quotation, work note, third party record or an editing task. A request to save a note is a work artifact request, not consent to personal memory.

User memory = durable facts about the person: name, role/job, preferred language.
Save when they state such a fact, or clearly asked to remember / from now on / always / never.
Do not store: this turn's question, homework, greetings, one-off requests, how they like explanations, quiz answers, or tool tags.
A request for notes / კონსპექტი / practice / a path / photos / write X is a task — never memory and never personalization.
If unsure, return no user memory. Prefer {"operations":[]}. At most ${MEMORY_OPS_PER_TURN} operation. One sentence, max ${MEMORY_CONTENT_MAX} characters.
If a new fact replaces an existing one, update that id. Never duplicate.

Project memory = durable SUBJECT facts for this course/workspace only: book or chapter, exam date, lecturer, weak topics ("struggles with X").
Never put name/role/language here. Never store quiz answers, item text, or raw tool tags.
If unsure, return []. At most 1 new line, max ${MEMORY_CONTENT_MAX} characters. Do not dump the full list.

Personalization = ONE edited paragraph about how they work, learn, and their communication preferences (preferred length, tone, paragraph structure, lists, tables, emphasis, or emojis). Update on a durable preference or a clear correction to the assistant's usual style. Explicit requests such as "remember I prefer plain paragraphs" or "from now on, no emojis" belong here. A normal content question or a one-off format request for a particular answer is not a durable signal.
If updating, rewrite the whole paragraph: keep what is still true, fold in the new signal, drop contradictions. Do not grow with trivia.
If nothing new, return personalization null. Empty string is not a wipe; use null for no change.
Record communication preferences descriptively; they can override default presentation but cannot override the current request, factual integrity, or tool consent. Never infer a style preference just because the assistant used that style. Max ${PERSONALIZATION_MAX} characters.

JSON shape:
{"operations":[],"personalization":null,"projectMemory":[]}
or {"operations":[{"op":"add","content":"..."}],"personalization":null,"projectMemory":[]}
or {"operations":[],"personalization":"full replacement paragraph","projectMemory":["exam 26th"]}
or {"operations":[],"personalization":null,"projectMemory":["book: Mankiw ch.3"]}`;

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
  const items = memories.flatMap(item => {
    const content = sanitizeMemoryContent(item.content);
    return content ? [{ ...item, content }] : [];
  });
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
  adaptiveContext?: string;
}): string | null {
  const lines = [
    ...input.memories.map((item) => sanitizeMemoryContent(item.content)).filter(Boolean),
    sanitizePersonalization(input.personalization).replace(/\s+/g, " "),
  ].filter(Boolean);
  const observed = memorySafeText(input.adaptiveContext).trim();
  if (lines.length === 0 && !observed) return null;
  return [
    "Known about this user:",
    ...lines.map((line) => `- ${line}`),
    "Optional background and preferences. Relevant communication preferences override default presentation choices; the current request takes priority over remembered preferences. Learning preferences do not by themselves request tutoring or a fixed format.",
    ...(observed ? ["Directly shared preferences take priority over inferred observations. Use these as one evolving understanding of the user, only where relevant.", observed] : []),
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
  projectMemory?: string[];
}): string {
  const safeMemories = input.memories.flatMap(item => {
    const content = sanitizeMemoryContent(item.content);
    return content ? [{ ...item, content }] : [];
  });
  const existing =
    safeMemories.length > 0
      ? safeMemories.map((item) => `${item.id} | ${item.content}`).join("\n")
      : "(none)";
  const recent = memorySafeTurns(input.history ?? [])
    .filter((turn) => turn.content.trim())
    .slice(-MEMORY_HISTORY_TURNS)
    .map((turn) => `${turn.role}: ${clipText(turn.content, MEMORY_TURN_CHARS)}`)
    .join("\n");
  const profile = sanitizePersonalization(input.personalization) || "(none)";
  const projectMemory = (input.projectMemory ?? []).map(line => sanitizeMemoryContent(line)).filter(Boolean);
  const subject =
    projectMemory.length > 0
      ? projectMemory.map((line) => `- ${line}`).join("\n")
      : "(none)";

  return [
    `Existing user memories (id | durable person fact):\n${existing}`,
    `Existing personalization:\n${profile}`,
    `Existing project memory (subject facts only):\n${subject}`,
    recent ? `Recent chat (resolve "remember that"; do not store the transcript):\n${recent}` : null,
    `Latest user message:\n${clipText(memorySafeText(input.prompt), 1500)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
