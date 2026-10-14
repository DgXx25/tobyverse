/**
 * Language-light tokenizing shared by the index (chunk `terms`) and the query side.
 * Index and query MUST go through the same `stem`, or keyword matches silently miss.
 */

const GEORGIAN = /[\u10A0-\u10FF]/;

const STOP = new Set([
  // English
  "the", "and", "for", "are", "was", "were", "with", "that", "this", "from", "have", "has", "had", "not",
  "but", "what", "when", "where", "which", "who", "whom", "how", "why", "can", "could", "should", "would",
  "about", "into", "than", "then", "there", "their", "them", "they", "you", "your", "its", "also", "does",
  "did", "will", "shall", "may", "might", "been", "being", "any", "all", "some", "more", "most", "such",
  // Georgian
  "და", "რომ", "არის", "ეს", "ის", "თუ", "ან", "რა", "როგორ", "რატომ", "სად", "როდის", "რომელი", "რომელიც",
  "იყო", "იქნება", "ეგ", "მე", "შენ", "ჩვენ", "თქვენ", "ისინი", "ასევე", "მაგრამ", "თუმცა", "ამ", "იმ",
  "არ", "კი", "კიდევ", "უნდა", "შეიძლება", "აქვს", "აქვთ", "ყველა", "რაც", "როცა", "მისი", "მათი",
]);

export function isGeorgian(word: string): boolean {
  return GEORGIAN.test(word);
}

/** Crude suffix trimming. Georgian is agglutinative, so keep a stable prefix instead. */
export function stem(raw: string): string {
  const word = raw.toLocaleLowerCase();
  if (isGeorgian(word)) {
    if (word.length <= 4) return word;
    // Case endings and plurals sit at the tail; a short fixed prefix survives them.
    return word.slice(0, word.length >= 8 ? 5 : 4);
  }
  if (word.length <= 4 || /^\d+$/.test(word)) return word;
  const trimmed = word.replace(/(ations|ation|ments|ment|ings|ing|edly|ed|ies|es|ly|s)$/u, "");
  return trimmed.length >= 4 ? trimmed : word;
}

/** Lowercased word-ish tokens, stopwords and 1-char tokens removed, NOT stemmed. */
export function words(text: string): string[] {
  const found = text.toLocaleLowerCase().match(/[\p{L}\p{M}][\p{L}\p{M}\p{N}'’-]*|\d+(?:[.,]\d+)*/gu) ?? [];
  return found.filter((word) => word.length > 1 && !STOP.has(word));
}

/** Stemmed tokens including repeats (for term-frequency math). */
export function stems(text: string): string[] {
  return words(text).map((word) => stem(word.replace(/['’-]+$/u, "")));
}

/** Distinct stems ranked by frequency then length. Stored on each chunk for keyword candidates. */
export function chunkTerms(text: string, max = 40): string[] {
  const counts = new Map<string, number>();
  for (const term of stems(text)) {
    if (term.length < 3 && !/^\d+$/.test(term)) continue;
    counts.set(term.slice(0, 32), (counts.get(term.slice(0, 32)) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([term]) => term);
}

/** Query terms used for `array-contains-any` (Firestore allows 30). Longer terms are rarer, so they go first. */
export function queryTerms(query: string, max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of stems(query)) {
    const key = term.slice(0, 32);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out.sort((a, b) => b.length - a.length).slice(0, max);
}

/**
 * Rough token estimate. Georgian and CJK cost far more tokens per character than Latin,
 * so a flat chars/4 would under-count and blow past embedding limits.
 */
export function estimateTokens(text: string): number {
  let georgian = 0;
  for (const char of text) {
    if (/[\u10A0-\u10FF\u3040-\u30ff\u4e00-\u9fff]/.test(char)) georgian += 1;
  }
  const other = text.length - georgian;
  return Math.ceil(georgian / 1.6 + other / 4);
}
