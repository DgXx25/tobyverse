import { CHAT_BLOCK_KINDS } from "@/lib/blocks/kinds";
import type { ChatBlockDef } from "@/lib/blocks/types";
import type { ChatGenerationContext } from "@/types/chat";
import { formatTobyBlockCards } from "@/lib/blocks/registry";
import { isActivePathThread } from "@/lib/chat/path-context";

const MAX_CARDS = 2;

/** Write / translate / rewrite / calculate / code — not a lesson turn. */
export function isSimpleChatTask(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  if (/(?:ინგლისურად|ქართულად|ფრანგულად|გერმანულად|ესპანურად)\s+როგორ\s+(?:ვთქვა|ითქმის|იწერება)/u.test(text)) return true;
  if (/^how\s+(?:do|can|would)\s+(?:i|you)\s+say\b.+\bin\s+\p{L}+/iu.test(text)) return true;
  if (/^(?:თარგმნ\p{L}*|გადათარგმნ\p{L}*|დათვალ\p{L}*)(?:\s|:|$)/u.test(text)) return true;
  if (/^\s*(translate|rewrite|calculate|თარგმნ|გადათარგმნ|დათვალ|დათვალე)\b/i.test(text)) return true;
  if (/\bwrite (me |this |an? |the |a )/i.test(text)) return true;
  if (/(დამიწერე|დაწერე)\s+(მეილ|იმეილ|წერილ|email)/i.test(text)) return true;
  if (/\b(write|fix|refactor)\s+(a |the |this )?(function|class|script|component|code|bug)\b/i.test(text)) return true;
  if (/^(დაწერე|დამიწერე)\s+(კოდ|ფუნქცი)/i.test(text)) return true;
  return false;
}

const WORD = /[\p{L}\p{N}]+/gu;

type PhraseHit = { phrase: string; id: string };

const byId = new Map(CHAT_BLOCK_KINDS.map((item) => [item.id, item]));
const unigrams = new Map<string, string[]>();
const phrases = new Map<string, PhraseHit[]>();

for (const def of CHAT_BLOCK_KINDS) {
  for (const raw of def.keys) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    if (key.includes(" ")) {
      const first = key.split(/\s+/)[0];
      const list = phrases.get(first) ?? [];
      list.push({ phrase: key, id: def.id });
      phrases.set(first, list);
      continue;
    }
    const list = unigrams.get(key) ?? [];
    list.push(def.id);
    unigrams.set(key, list);
  }
}

function haystack(context: ChatGenerationContext): string {
  const path = isActivePathThread(context) ? context.path : null;
  return [
    context.prompt,
    path ? context.pathTopic : null,
    context.pendingTopic,
    context.projectTitle,
    context.goal,
    path?.title,
    path?.courseTitle,
    path?.nodeTitle,
    path?.teach,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function wordsIn(text: string): string[] {
  return text.match(WORD) ?? [];
}

/** O(words in the turn). Catalog size does not change prompt cost. */
export function matchChatBlocks(context: ChatGenerationContext): ChatBlockDef[] {
  if (context.hintAsk || context.examAsk) return [];
  const prompt = context.prompt?.trim() ?? "";
  if (prompt && isSimpleChatTask(prompt)) return [];
  const text = haystack(context);
  if (!text.trim()) return [];

  const hits: ChatBlockDef[] = [];
  let allowScene = true;

  function scan(source: string) {
    const relevance = new Map<string, number>();
    for (const word of wordsIn(source)) {
      for (const id of unigrams.get(word) ?? []) {
        relevance.set(id, Math.max(relevance.get(id) ?? 0, word.length));
      }
      for (let n = word.length - 1; n >= 4; n -= 1) {
        for (const id of unigrams.get(word.slice(0, n)) ?? []) {
          relevance.set(id, Math.max(relevance.get(id) ?? 0, n));
        }
      }
      for (const hit of phrases.get(word) ?? []) {
        if (!source.includes(hit.phrase)) continue;
        relevance.set(hit.id, Math.max(relevance.get(hit.id) ?? 0, 100 + hit.phrase.length));
      }
    }
    // Specific topic words (e.g. “dialogue”) outrank broad format words (e.g. “explain”).
    // Longer phrases such as “why does” outrank their component unigrams.
    return [...relevance.entries()]
      .filter(([id]) => id !== "scene" || allowScene)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => byId.get(id))
      .filter((def): def is ChatBlockDef => Boolean(def))
      .slice(0, MAX_CARDS);
  }
  // Current, specific requests outrank a notebook's older topic.
  hits.push(...scan(prompt.toLowerCase()));
  if (hits.length) return hits;
  allowScene = !prompt || /^(?:continue|go on|explain (?:it|this|that)|show (?:it|this|that)|what about (?:it|this|that)|შემდეგ|გააგრძელე|ეს |ამის |იგივე|ამიხსენი ეს|მაჩვენე)/i.test(prompt);
  hits.push(...scan(text));
  return hits;
}

export function tobyCardsForTurn(context: ChatGenerationContext): string {
  const defs = matchChatBlocks(context);
  const cards = formatTobyBlockCards(defs);
  if (!cards || !context.threadPaper || !defs.some((item) => item.id === "paper")) return cards;
  return [
    cards,
    "",
    "A paper sheet is already in this thread. If they want to fill or try it now, do not rewrite the JSON. Emit only:",
    "```toby paper",
    "{\"reuse\":true}",
    "```",
    "The UI places that sheet at the bottom. Older sheets stay skipped — no Check.",
  ].join("\n");
}
