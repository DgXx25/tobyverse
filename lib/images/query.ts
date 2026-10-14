import { generateText } from "@/lib/ai/gemini";
import type { AiUsageReporter } from "@/types/billing";

const FIGURE_NOISE = /^(diagram|illustration|schematic|photo|image|picture|chart|graph|plot|structure|model)$/i;

const GLOSSARY: [RegExp, string][] = [
  [/მოტოკროს(?:ი)?/giu, "motocross"],
  [/მოტოცროს(?:ი)?/giu, "motocross"],
  [/მოტოციკლ(?:ი)?/giu, "motorcycle"],
  [/წყ(?:ალ|ლის)/giu, "water"],
  [/მოლეკულ(?:ა|ის|ები)?/giu, "molecule"],
  [/ატომ(?:ი|ის|ები)?/giu, "atom"],
  [/სტრუქტურ(?:ა|ის)?/giu, "structure"],
  [/გრაფიკ(?:ები|ი)?/giu, "chart graph"],
  [/დიაგრამ(?:ა)?/giu, "diagram"],
  [/სქემ(?:ა|ები)?/giu, "diagram"],
  [/ილუსტრაცი(?:ა|ები)?/giu, "illustration"],
  [/ფოტო(?:ები)?/giu, ""],
  [/სურათ(?:ები|ი)?/giu, ""],
  [/მომიძებნ[ეა]?/giu, ""],
  [/მინიჭებ(?:ა|აზე)?/giu, ""],
  [/\bphotos?\b/gi, ""],
  [/\bimages?\b/gi, ""],
  [/\bpictures?\b/gi, ""],
  [/\bpics?\b/gi, ""],
  [/\bfind me\b/gi, ""],
  [/\blook up\b/gi, ""],
  [/\bshow me\b/gi, ""],
  [/\bcharts?\b/gi, "chart"],
  [/\bgraphs?\b/gi, "graph"],
  [/\bdiagrams?\b/gi, "diagram"],
];

const FILLER = /^(a|an|the|of|and|for|good|some|kargi|კარგი)$/i;

function tidyKeywords(value: string): string {
  const words = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !FILLER.test(word));
  const unique: string[] = [];
  for (const word of words) {
    if (!unique.includes(word)) unique.push(word);
    if (unique.length >= 8) break;
  }
  return unique.join(" ").trim();
}

function glossaryPass(query: string): string {
  let text = query;
  for (const [pattern, english] of GLOSSARY) {
    text = text.replace(pattern, english ? ` ${english} ` : " ");
  }
  return tidyKeywords(text);
}

function isMostlyLatin(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return true;
  const latin = letters.filter((ch) => /\p{Script=Latin}/u.test(ch)).length;
  return latin / letters.length >= 0.85;
}

export type ImageSearchPlan = {
  query: string;
  must: string[];
  avoid: string[];
};

const planMemory = new Map<string, ImageSearchPlan>();

function asWordList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique: string[] = [];
  for (const item of value) {
    const words = typeof item === "string" ? tidyKeywords(item).split(/\s+/) : [];
    for (const word of words) {
      if (!word || unique.includes(word)) continue;
      unique.push(word);
      if (unique.length >= 8) return unique;
    }
  }
  return unique;
}

function seedPlan(raw: string): ImageSearchPlan {
  const query = glossaryPass(raw) || tidyKeywords(raw);
  return { query, must: imageTopicTokens(query), avoid: [] };
}

function parsePlan(text: string, seed: ImageSearchPlan): ImageSearchPlan {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return seed;
  try {
    const row = JSON.parse(match[0]) as Record<string, unknown>;
    const query = typeof row.query === "string" ? tidyKeywords(row.query).split(/\s+/).slice(0, 4).join(" ") : "";
    const must = asWordList(row.must);
    const avoid = asWordList(row.avoid).filter((word) => !FIGURE_NOISE.test(word));
    return {
      query: query && isMostlyLatin(query) ? query : seed.query,
      must: [...new Set([...seed.must, ...must])].filter((word) => !FIGURE_NOISE.test(word)).slice(0, 8),
      avoid,
    };
  } catch {
    return seed;
  }
}

export async function planImageSearch(query: string, options: { usage?: AiUsageReporter } = {}): Promise<ImageSearchPlan> {
  const raw = query.trim();
  if (!raw) return { query: "", must: [], avoid: [] };
  const key = `plan6:${raw.toLowerCase()}`;
  const cached = planMemory.get(key);
  if (cached) return cached;

  const seed = seedPlan(raw);
  let plan = seed;
  try {
    const text = await generateText(
      `Plan an image search for a study app. Match the WHOLE topic, not a nearby object.
"water molecule" is the molecule (H2O), not a water drop, beach, or fountain.
"atom structure" is the atom, not a random chart.
Return JSON only: {"query":"2-6 English keywords","must":["terms the filename/title should contain"],"avoid":["nearby objects to reject"]}
Keep chart/graph/map/flag in query only if they asked.

${raw}`,
      {
        json: true,
        systemInstruction: "JSON only. No markdown.",
        usage: options.usage,
      },
    );
    plan = parsePlan(text, seed);
  } catch {
    plan = seed;
  }

  if (!plan.query) plan = seed;
  planMemory.set(key, plan);
  return plan;
}

export async function englishImageQuery(query: string, options: { usage?: AiUsageReporter } = {}): Promise<string> {
  return (await planImageSearch(query, options)).query;
}

export function expandEnglishImageQuery(english: string): string {
  const q = tidyKeywords(english);
  if (/\b(chart|graph|diagram|plot)\b/.test(q)) {
    const extra = ["chart", "graph", "diagram"].filter((word) => !q.includes(word));
    return tidyKeywords(`${q} ${extra.slice(0, 2).join(" ")}`);
  }
  return q;
}

function hayWords(haystack: string): string[] {
  return haystack.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function containsTerm(haystack: string, word: string): boolean {
  const term = word.toLowerCase().trim();
  if (!term) return false;
  const hay = haystack.toLowerCase();
  if (term.length <= 3) return hayWords(hay).includes(term);
  return hay.includes(term);
}

export function imageTopicTokens(query: string): string[] {
  return tidyKeywords(query)
    .split(/\s+/)
    .filter((word) => word.length > 2 && !FIGURE_NOISE.test(word));
}

export function imageHitRelevant(haystack: string, query: string): boolean {
  const tokens = imageTopicTokens(query);
  if (tokens.length === 0) return true;
  const distinctive = [...tokens].sort((a, b) => b.length - a.length)[0];
  if (distinctive && containsTerm(haystack, distinctive)) return true;
  if (tokens.length === 1) return containsTerm(haystack, tokens[0]);
  return tokens.filter((token) => containsTerm(haystack, token)).length >= 2;
}

export function scoreImageHit(haystack: string, plan: ImageSearchPlan): number {
  if (plan.query && !imageHitRelevant(haystack, plan.query)) return -1;
  const must = plan.must.map((word) => word.toLowerCase()).filter((word) => word.length > 1 && !FIGURE_NOISE.test(word));
  const avoid = plan.avoid.map((word) => word.toLowerCase()).filter((word) => word.length > 2);
  let score = 0;
  let mustHits = 0;
  for (const word of must) {
    if (containsTerm(haystack, word)) {
      mustHits += 1;
      score += 4 + Math.min(word.length, 8);
    }
  }
  for (const word of imageTopicTokens(plan.query)) {
    if (containsTerm(haystack, word)) score += 1;
  }
  for (const word of avoid) {
    if (containsTerm(haystack, word)) score -= 6;
  }
  const strong = must.filter((word) => word.length >= 6);
  if (strong.length > 0 && !strong.some((word) => containsTerm(haystack, word))) return -1;
  if (must.length && mustHits === 0) return -1;
  return score;
}

function fileNameFromUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
  } catch {
    return "";
  }
}

export function imageHitText(hit: { alt?: string; url: string; thumbnail?: string }): string {
  return `${hit.alt ?? ""} ${fileNameFromUrl(hit.url)} ${fileNameFromUrl(hit.thumbnail ?? "")}`;
}

export function pickImageHits<T extends { alt?: string; url: string; thumbnail?: string }>(
  hits: T[],
  plan: ImageSearchPlan,
  max = 8,
): T[] {
  const ranked = hits
    .map((hit) => ({
      hit,
      score: scoreImageHit(imageHitText(hit), plan),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return [];
  return ranked.slice(0, max).map((row) => row.hit);
}
