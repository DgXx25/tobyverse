import { generateText } from "@/lib/ai/gemini";

const GLOSSARY: [RegExp, string][] = [
  [/მოტოკროს(?:ი)?/giu, "motocross"],
  [/მოტოცროს(?:ი)?/giu, "motocross"],
  [/მოტოციკლ(?:ი)?/giu, "motorcycle"],
  [/გრაფიკ(?:ები|ი)?/giu, "chart graph"],
  [/დიაგრამ(?:ა)?/giu, "diagram"],
  [/სქემ(?:ა|ები)?/giu, "diagram"],
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

const memory = new Map<string, string>();

export async function englishImageQuery(query: string): Promise<string> {
  const raw = query.trim();
  if (!raw) return "";
  const key = raw.toLowerCase();
  const cached = memory.get(key);
  if (cached) return cached;

  const fromGlossary = glossaryPass(raw);
  let english = fromGlossary;
  if (!isMostlyLatin(fromGlossary) || (!fromGlossary && !isMostlyLatin(raw))) {
    try {
      const text = await generateText(
        `Turn this image-search request into 2-8 English search keywords. Nouns and topic words only. Keep chart/graph/diagram if they asked for those. No quotes, no sentences.\n\n${raw}`,
        { systemInstruction: "Return only short English search keywords. No sentences." },
      );
      english = tidyKeywords(text) || fromGlossary;
    } catch {
      english = fromGlossary;
    }
  }

  if (!english || !isMostlyLatin(english)) {
    english = fromGlossary || tidyKeywords(raw) || "photo";
  }
  memory.set(key, english);
  return english;
}

export function expandEnglishImageQuery(english: string): string {
  const q = tidyKeywords(english);
  if (/\b(chart|graph|diagram|plot)\b/.test(q)) {
    const extra = ["chart", "graph", "diagram"].filter((word) => !q.includes(word));
    return tidyKeywords(`${q} ${extra.slice(0, 2).join(" ")}`);
  }
  return tidyKeywords(`${q} photo`);
}
