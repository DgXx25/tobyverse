import { weatherBlock } from "@/lib/blocks/kinds/weather";
import { parseTobyFence } from "@/lib/blocks/registry";

export const WEATHER_CARD_REPAIR_INSTRUCTION = `Convert the supplied, citation-backed current weather answer into TobyVerse's native weather card. The answer and its citations are in the user message. Use only facts explicitly present there; never search, infer, average, or invent values. If it says current conditions could not be verified, output exactly NO_CARD. Otherwise output exactly one valid fence, including the verified location and condition; temperature, time and forecast fields are optional and must be omitted unless explicitly supported:
\`\`\`toby weather
{"locale":"ka-GE","location":"Tbilisi, Georgia","current":{"tempRangeC":[12,14],"condition":{"text":"ღრუბლიანი"}}}
\`\`\`
Use tempC for a verified exact value or tempRangeC for a source-given range; never invent a midpoint. Preserve the user's language for the location and condition. No prose or source list.`;

const EXPANDED_WEATHER_INTENT = /\b(?:compare|analysis|analy[sz]e|explain|historical|climate|hourly|weekly|week|details|detailed|statistics)\b|შეადარე|შედარება|გაანალიზე|ანალიზი|ამიხსენი|დეტალურად|საათობრივად|კვირის პროგნოზ|ისტორიული ამინდი|კლიმატი/iu;

/** Keep a plain, short weather lookup from turning into a source-by-source report. */
export function isPlainWeatherQuestion(prompt: string): boolean {
  const text = prompt.trim();
  if (!text || text.length > 180 || EXPANDED_WEATHER_INTENT.test(text)) return false;
  const normalized = text.toLocaleLowerCase();
  return weatherBlock.keys.some((key) => normalized.includes(key.toLocaleLowerCase()));
}

export function extractWeatherFence(text: string): string {
  return text.match(/```toby[- ]weather\s*[\s\S]*?```/i)?.[0] ?? "";
}

/** A card may be repaired only when the answer is backed by a search citation. */
export function hasCitedWeatherResult(text: string): boolean {
  if (/(?:can't|cannot|couldn't|unable to|not able to)\s+(?:reliably\s+)?(?:verify|confirm|determine|find)|ვერ\s*(?:დავადგენ|დავადგინე|დადასტურებ|დავადასტურე|მოვძებნე|ვიპოვე)|დამოწმებულად\s+ვერ/iu.test(text)) return false;
  const sourceAt = text.search(/\n\s*Sources:\s*/i);
  return sourceAt >= 0 && /\[[^\]]+\]\(https?:\/\//i.test(text.slice(sourceAt));
}

export function isValidWeatherFence(fence: string): boolean {
  const body = fence.match(/^```toby[- ]weather\s*([\s\S]*?)```$/i)?.[1];
  return Boolean(body && parseTobyFence("toby weather", body)?.type === "weather");
}

/** Insert a repaired native card before the citations that support it. */
export function appendWeatherFence(text: string, fence: string): string {
  const withoutOldFence = text.replace(/```toby[- ]weather\s*[\s\S]*?```/i, "").trim();
  const sourceAt = withoutOldFence.search(/\n\s*Sources:\s*/i);
  if (sourceAt < 0) return `${withoutOldFence}\n\n${fence.trim()}`;
  const answer = withoutOldFence.slice(0, sourceAt).trim();
  const sources = withoutOldFence.slice(sourceAt).trim();
  return `${answer}\n\n${fence.trim()}\n\n${sources}`;
}

/** Last-resort formatter: preserves the searched answer verbatim when a model formatter fails. */
export function weatherFenceFromCitedAnswer(text: string, prompt: string): string {
  if (!hasCitedWeatherResult(text)) return "";
  const sourceAt = text.search(/\n\s*Sources:\s*/i);
  const answer = (sourceAt >= 0 ? text.slice(0, sourceAt) : text).trim();
  const sources = sourceAt >= 0 ? text.slice(sourceAt) : "";
  const sourceTitles = [...sources.matchAll(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g)].map((match) => match[1]).join(" ");
  const location = extractWeatherLocation(prompt) || extractWeatherLocation(sourceTitles);
  if (!location) return "";

  const firstParagraph = answer.split(/\n\s*\n/)[0]?.replace(/\*\*/g, "").trim() ?? "";
  const sentence = firstParagraph.match(/^.*?[.!?](?=\s|$)|^.+$/u)?.[0]?.trim() ?? "";
  if (!sentence) return "";
  const conditionText = sentence.length <= 100 ? sentence : `${sentence.slice(0, 97).trimEnd()}…`;
  const block: Record<string, unknown> = {
    locale: /[\u10A0-\u10FF]/u.test(`${prompt} ${sentence}`) ? "ka-GE" : "en",
    location,
    current: { condition: { text: conditionText } },
  };
  const range = sentence.match(/(-?\d+(?:[.,]\d+)?)\s*(?:–|—|\bto\b|-)\s*(-?\d+(?:[.,]\d+)?)\s*°?\s*°?\s*C\b/i);
  const exact = range ? null : sentence.match(/(-?\d+(?:[.,]\d+)?)\s*°\s*C\b/i);
  const current = block.current as Record<string, unknown>;
  if (range) {
    current.tempRangeC = [Number(range[1].replace(",", ".")), Number(range[2].replace(",", "."))];
  } else if (exact) {
    current.tempC = Number(exact[1].replace(",", "."));
  }
  const fence = `\`\`\`toby weather\n${JSON.stringify(block)}\n\`\`\``;
  return isValidWeatherFence(fence) ? fence : "";
}

function extractWeatherLocation(text: string): string {
  const georgian = text.match(/([\p{L}]{3,}ში)(?=\s|[?.!,]|$)/iu)?.[1];
  if (georgian) return georgian;
  const english = text.match(/\b(?:in|at|for|near)\s+([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*)?)(?=\s+(?:today|tomorrow|tonight|now)\b|[?.!,]|$)/iu)?.[1];
  if (english) return english.trim();
  return "";
}

/** Repair a missing or malformed card from citation-backed answer text, without searching again. */
export async function ensureCitedWeatherCard(
  text: string,
  format: (answer: string) => Promise<string>,
  prompt = "",
): Promise<string> {
  const existing = extractWeatherFence(text);
  if (isValidWeatherFence(existing) || !hasCitedWeatherResult(text)) return text;
  let formatted = "";
  try { formatted = await format(text); } catch { /* Fall back to exact cited prose without changing its facts. */ }
  const repaired = extractWeatherFence(formatted);
  if (isValidWeatherFence(repaired)) return appendWeatherFence(text, repaired);
  const fallback = weatherFenceFromCitedAnswer(text, prompt);
  return fallback ? appendWeatherFence(text, fallback) : text;
}

/** Keep the first useful sentence, optional native card, and provider citations. */
export function compactWeatherReply(text: string): string {
  const sourceAt = text.search(/\n\s*Sources:\s*/i);
  const sources = sourceAt >= 0 ? text.slice(sourceAt).trim() : "";
  let body = sourceAt >= 0 ? text.slice(0, sourceAt).trim() : text.trim();
  const card = body.match(/```toby weather\s*[\s\S]*?```/i)?.[0] ?? "";
  if (card) body = body.replace(card, "").trim();

  // The card already presents structured detail; a one-sentence lead is enough.
  const paragraph = body.split(/\n\s*\n/)[0]?.trim() ?? "";
  const sentenceMatch = paragraph.match(/^.*?[.!?](?=\s|$)|^.+$/u);
  let sentence = sentenceMatch?.[0]?.trim() ?? "";
  if (card) {
    const body = card.match(/^```toby weather\s*([\s\S]*?)```$/i)?.[1];
    try {
      const parsed = body ? JSON.parse(body) as { current?: { condition?: { text?: unknown } } } : null;
      if (typeof parsed?.current?.condition?.text === "string" && parsed.current.condition.text.trim() === sentence) sentence = "";
    } catch { /* A malformed card is excluded by validation before this point. */ }
  }
  return [sentence, card, sources].filter(Boolean).join("\n\n");
}
