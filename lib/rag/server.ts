import { FieldValue, type DocumentData, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/server/firestore-admin";
import { embedQuery, embedTexts } from "@/lib/rag/embed";
import type { RagChunk } from "@/lib/rag/chunk";
import { bm25, cosine, parseLocator, pickDiverse, reciprocalRankFusion } from "@/lib/rag/rank";
import { queryTerms } from "@/lib/rag/tokens";

/**
 * Server-only index. A chunk is a doc at projects/{p}/materials/{m}/chunks/{c} with the text,
 * stemmed `terms` for keyword candidates, and a 768-d `embedding` for vector candidates.
 *
 * Required Firestore indexes live in firestore.indexes.json. If the vector index is not
 * deployed yet, retrieval degrades to an in-memory scan instead of failing the chat.
 */

export const INDEX_VERSION = 1;
const WRITE_BATCH = 200;
const VECTOR_CANDIDATES = 60;
const KEYWORD_CANDIDATES = 60;
const SCAN_LIMIT = 6_000;

export type RetrievedChunk = {
  id: string;
  materialId: string;
  title: string;
  page: number;
  pageEnd: number;
  section: string;
  text: string;
  score: number;
};

function chunksCollection(db: Firestore, projectId: string, materialId: string) {
  return db.collection("projects").doc(projectId).collection("materials").doc(materialId).collection("chunks");
}

export async function writeChunks(input: {
  uid: string;
  projectId: string;
  materialId: string;
  chunks: RagChunk[];
  vectors: number[][];
}): Promise<void> {
  if (input.chunks.length !== input.vectors.length) throw new Error("Chunk and vector counts differ.");
  const db = getAdminFirestore();
  const collection = chunksCollection(db, input.projectId, input.materialId);
  for (let start = 0; start < input.chunks.length; start += WRITE_BATCH) {
    const batch = db.batch();
    input.chunks.slice(start, start + WRITE_BATCH).forEach((chunk, offset) => {
      batch.set(collection.doc(chunk.id), {
        userId: input.uid,
        projectId: input.projectId,
        materialId: input.materialId,
        page: chunk.page,
        pageEnd: chunk.pageEnd,
        section: chunk.section,
        text: chunk.text,
        terms: chunk.terms,
        tokens: chunk.tokens,
        embedding: FieldValue.vector(input.vectors[start + offset]),
        v: INDEX_VERSION,
      });
    });
    await batch.commit();
  }
}

/** Embeds and stores. The caller decides batching/time budget. */
export async function indexChunks(input: { uid: string; projectId: string; materialId: string; chunks: RagChunk[] }): Promise<number> {
  if (input.chunks.length === 0) return 0;
  const vectors = await embedTexts(
    input.chunks.map((chunk) => (chunk.section ? `${chunk.section}\n${chunk.text}` : chunk.text)),
    "RETRIEVAL_DOCUMENT",
  );
  await writeChunks({ ...input, vectors });
  return input.chunks.length;
}

export async function deleteMaterialIndex(projectId: string, materialId: string): Promise<void> {
  const db = getAdminFirestore();
  await db.recursiveDelete(chunksCollection(db, projectId, materialId));
}

type Candidate = {
  id: string;
  materialId: string;
  page: number;
  pageEnd: number;
  section: string;
  text: string;
  vector: number[] | null;
};

function toCandidate(doc: QueryDocumentSnapshot<DocumentData>): Candidate | null {
  const data = doc.data();
  if (typeof data.text !== "string" || typeof data.materialId !== "string") return null;
  const embedding = data.embedding as { toArray?: () => number[] } | undefined;
  return {
    id: `${data.materialId}/${doc.id}`,
    materialId: data.materialId,
    page: typeof data.page === "number" ? data.page : 0,
    pageEnd: typeof data.pageEnd === "number" ? data.pageEnd : 0,
    section: typeof data.section === "string" ? data.section : "",
    text: data.text,
    vector: typeof embedding?.toArray === "function" ? embedding.toArray() : null,
  };
}

let warnedVectorIndex = false;

async function vectorCandidates(db: Firestore, projectId: string, materialIds: string[], vector: number[]): Promise<Candidate[]> {
  try {
    const single = materialIds.length === 1;
    const base = db.collectionGroup("chunks");
    const scoped = single ? base.where("materialId", "==", materialIds[0]) : base.where("projectId", "==", projectId);
    const snapshot = await scoped
      .findNearest({
        vectorField: "embedding",
        queryVector: vector,
        // Over-fetch when several materials are selected: the filter below happens after the search.
        limit: single ? VECTOR_CANDIDATES : VECTOR_CANDIDATES * 3,
        distanceMeasure: "COSINE",
      })
      .get();
    return snapshot.docs.flatMap((doc) => {
      const candidate = toCandidate(doc);
      return candidate ? [candidate] : [];
    });
  } catch (error) {
    if (!warnedVectorIndex) {
      warnedVectorIndex = true;
      console.warn("[rag] vector index unavailable, scanning in memory. Deploy firestore.indexes.json.", error instanceof Error ? error.message : error);
    }
    return scanCandidates(db, projectId, materialIds, vector);
  }
}

/** Brute force fallback: bounded, per-material, cosine in process. */
async function scanCandidates(db: Firestore, projectId: string, materialIds: string[], vector: number[]): Promise<Candidate[]> {
  const perMaterial = Math.max(200, Math.floor(SCAN_LIMIT / Math.max(1, materialIds.length)));
  const lists = await Promise.all(
    materialIds.map(async (materialId) => {
      const snapshot = await chunksCollection(db, projectId, materialId).limit(perMaterial).get();
      return snapshot.docs.flatMap((doc) => {
        const candidate = toCandidate(doc);
        return candidate ? [candidate] : [];
      });
    }),
  );
  return lists
    .flat()
    .map((candidate) => ({ candidate, score: candidate.vector ? cosine(candidate.vector, vector) : -1 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, VECTOR_CANDIDATES)
    .map((entry) => entry.candidate);
}

async function keywordCandidates(db: Firestore, projectId: string, terms: string[]): Promise<Candidate[]> {
  if (terms.length === 0) return [];
  try {
    const snapshot = await db
      .collectionGroup("chunks")
      .where("projectId", "==", projectId)
      .where("terms", "array-contains-any", terms.slice(0, 10))
      .limit(KEYWORD_CANDIDATES)
      .get();
    return snapshot.docs.flatMap((doc) => {
      const candidate = toCandidate(doc);
      return candidate ? [candidate] : [];
    });
  } catch {
    return [];
  }
}

async function locatorCandidates(db: Firestore, materialIds: string[], page: number): Promise<Candidate[]> {
  if (materialIds.length === 0 || materialIds.length > 8) return [];
  const lists = await Promise.all(
    materialIds.map(async (materialId) => {
      try {
        const snapshot = await db
          .collectionGroup("chunks")
          .where("materialId", "==", materialId)
          .where("page", "<=", page)
          .orderBy("page", "desc")
          .limit(3)
          .get();
        return snapshot.docs.flatMap((doc) => {
          const candidate = toCandidate(doc);
          return candidate && candidate.pageEnd >= page ? [candidate] : [];
        });
      } catch {
        return [];
      }
    }),
  );
  return lists.flat();
}

export type IndexedMaterial = { id: string; title: string; chunks: number; status: string };

/** Materials of this project that have at least some indexed chunks. */
export async function indexedMaterials(projectId: string, uid: string): Promise<IndexedMaterial[]> {
  const db = getAdminFirestore();
  const snapshot = await db.collection("projects").doc(projectId).collection("materials").get();
  return snapshot.docs.flatMap((doc) => {
    const data = doc.data();
    if (data.userId !== uid) return [];
    const index = (data.index ?? {}) as { status?: string; chunks?: number };
    const chunks = typeof index.chunks === "number" ? index.chunks : 0;
    if (chunks <= 0) return [];
    return [{ id: doc.id, title: typeof data.title === "string" ? data.title : "Untitled", chunks, status: index.status ?? "ready" }];
  });
}

/**
 * Hybrid retrieval: vector candidates + keyword candidates (+ explicit page hits), fused with
 * reciprocal rank fusion, de-duplicated, with a per-source cap so one huge book cannot drown the rest.
 */
export async function retrieveChunks(input: {
  uid: string;
  projectId: string;
  query: string;
  /** Restrict to these sources. Omit or pass [] for the whole project. */
  materialIds?: string[];
  limit?: number;
  materials?: IndexedMaterial[];
}): Promise<RetrievedChunk[]> {
  const limit = Math.max(1, Math.min(16, input.limit ?? 8));
  const db = getAdminFirestore();
  const available = input.materials ?? (await indexedMaterials(input.projectId, input.uid));
  const allowed = new Set(input.materialIds?.length ? input.materialIds : available.map((item) => item.id));
  const usable = available.filter((item) => allowed.has(item.id));
  if (usable.length === 0 || !input.query.trim()) return [];
  const usableIds = usable.map((item) => item.id);
  const titles = new Map(usable.map((item) => [item.id, item.title]));

  const locator = parseLocator(input.query);
  const vector = await embedQuery(input.query);
  const [vectorHits, keywordHits, locatorHits] = await Promise.all([
    vectorCandidates(db, input.projectId, usableIds, vector),
    keywordCandidates(db, input.projectId, queryTerms(input.query, 10)),
    locator.page ? locatorCandidates(db, usableIds, locator.page) : Promise.resolve([] as Candidate[]),
  ]);

  const byId = new Map<string, Candidate>();
  for (const candidate of [...locatorHits, ...vectorHits, ...keywordHits]) {
    if (!usableIds.includes(candidate.materialId)) continue;
    if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);
  }
  const candidates = [...byId.values()];
  if (candidates.length === 0) return [];

  const vectorRank = candidates
    .filter((candidate) => candidate.vector)
    .map((candidate) => ({ id: candidate.id, score: cosine(candidate.vector as number[], vector) }))
    .sort((a, b) => b.score - a.score);
  const keywordRank = bm25(
    input.query,
    candidates.map((candidate) => ({ id: candidate.id, text: `${candidate.section}\n${candidate.text}`, item: candidate.id })),
  )
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const lists: string[][] = [vectorRank.map((entry) => entry.id), keywordRank.map((entry) => entry.item)];
  const weights = [1, 0.8];
  if (locatorHits.length) {
    lists.push(locatorHits.map((candidate) => candidate.id));
    weights.push(1.6);
  }
  const fused = reciprocalRankFusion(lists, weights);
  const simById = new Map(vectorRank.map((entry) => [entry.id, entry.score]));
  const ordered = fused.flatMap((entry) => {
    const candidate = byId.get(entry.id);
    return candidate
      ? [{ ...candidate, title: titles.get(candidate.materialId) ?? "Source", score: simById.get(entry.id) ?? entry.score }]
      : [];
  });

  const picked = pickDiverse(ordered, limit, {
    perMaterialCap: usable.length > 1 ? Math.max(3, Math.ceil(limit * 0.6)) : limit,
  });
  return picked.map((item) => ({
    id: item.id,
    materialId: item.materialId,
    title: item.title,
    page: item.page,
    pageEnd: item.pageEnd,
    section: item.section,
    text: item.text,
    score: item.score,
  }));
}
