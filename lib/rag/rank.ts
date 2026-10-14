import { stems } from "@/lib/rag/tokens";

export type Scored<T> = { item: T; score: number };

/**
 * BM25 over a small candidate set. IDF is local to the candidates, which is the right
 * granularity when candidates were already narrowed by vector and keyword search.
 */
export function bm25<T>(query: string, docs: { id: string; text: string; item: T }[], k1 = 1.2, b = 0.75): Scored<T>[] {
  const queryStems = [...new Set(stems(query))];
  if (queryStems.length === 0 || docs.length === 0) return docs.map((doc) => ({ item: doc.item, score: 0 }));

  const tokenized = docs.map((doc) => {
    const tokens = stems(doc.text);
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    return { counts, length: tokens.length || 1 };
  });
  const averageLength = tokenized.reduce((sum, doc) => sum + doc.length, 0) / tokenized.length;
  const df = new Map<string, number>();
  for (const term of queryStems) {
    let hits = 0;
    for (const doc of tokenized) if (doc.counts.has(term)) hits += 1;
    df.set(term, hits);
  }

  return docs.map((doc, index) => {
    const { counts, length } = tokenized[index];
    let score = 0;
    for (const term of queryStems) {
      const tf = counts.get(term) ?? 0;
      if (!tf) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * length) / averageLength)));
    }
    return { item: doc.item, score };
  });
}

/** Reciprocal rank fusion. Each list is best-first ids; returns ids best-first with fused scores. */
export function reciprocalRankFusion(lists: string[][], weights: number[] = [], k = 60): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  lists.forEach((list, listIndex) => {
    const weight = weights[listIndex] ?? 1;
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + weight / (k + rank + 1));
    });
  });
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function shingles(text: string): Set<string> {
  const tokens = stems(text);
  const out = new Set<string>();
  for (let i = 0; i + 2 < tokens.length; i += 1) out.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Greedy pick by score, skipping near-duplicates (overlapping chunks, repeated headers).
 * `cap` bounds how many chunks one document can contribute so a single huge book
 * cannot crowd out every other source.
 */
export function pickDiverse<T extends { id: string; text: string; materialId: string }>(
  ranked: T[],
  limit: number,
  options: { duplicateThreshold?: number; perMaterialCap?: number } = {},
): T[] {
  const threshold = options.duplicateThreshold ?? 0.6;
  const cap = options.perMaterialCap ?? Number.POSITIVE_INFINITY;
  const picked: { item: T; grams: Set<string> }[] = [];
  const perMaterial = new Map<string, number>();
  for (const item of ranked) {
    if (picked.length >= limit) break;
    if ((perMaterial.get(item.materialId) ?? 0) >= cap) continue;
    const grams = shingles(item.text);
    if (picked.some((other) => jaccard(grams, other.grams) >= threshold)) continue;
    picked.push({ item, grams });
    perMaterial.set(item.materialId, (perMaterial.get(item.materialId) ?? 0) + 1);
  }
  return picked.map((entry) => entry.item);
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denominator = Math.sqrt(na) * Math.sqrt(nb);
  return denominator === 0 ? 0 : dot / denominator;
}

export function l2normalize(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum) || 1;
  return vector.map((value) => value / norm);
}

/** Explicit locator questions: "page 83", "slide 12", "მე-12 გვერდზე", "chapter 5". */
export type Locator = { page?: number; chapter?: number };

export function parseLocator(query: string): Locator {
  const locator: Locator = {};
  const page =
    query.match(/\b(?:page|slide|p\.)\s*#?\s*(\d{1,5})\b/i) ??
    query.match(/(\d{1,5})\s*(?:-?(?:ე|ა|ლ))?\s*(?:გვერდ|სლაიდ)/iu) ??
    query.match(/(?:გვერდ|სლაიდ)\p{L}*\s*#?\s*(\d{1,5})/iu);
  if (page) locator.page = Number(page[1]);
  const chapter = query.match(/\bchapter\s*(\d{1,3})\b/i) ?? query.match(/თავი\s*#?\s*(\d{1,3})/iu);
  if (chapter) locator.chapter = Number(chapter[1]);
  return locator;
}
