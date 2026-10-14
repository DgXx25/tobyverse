import { l2normalize } from "@/lib/rag/rank";

export const EMBED_MODEL = "gemini-embedding-001";
/** Matryoshka-truncated. 768 keeps nearly all retrieval quality at a quarter of the 3072 storage. */
export const EMBED_DIMS = 768;
const BATCH = 100;
const MAX_CHARS = 7_000;

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

type BatchResponse = { embeddings?: { values?: number[] }[]; error?: { message?: string } };

function apiKey(): string {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set.");
  return key;
}

async function embedBatch(texts: string[], task: EmbedTask, attempt = 0): Promise<number[][]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text: text.slice(0, MAX_CHARS) }] },
          taskType: task,
          outputDimensionality: EMBED_DIMS,
        })),
      }),
    });
  } catch (error) {
    if (attempt < 3) {
      await sleep(400 * 2 ** attempt);
      return embedBatch(texts, task, attempt + 1);
    }
    throw error instanceof Error ? error : new Error("Embedding request failed.");
  }

  if (response.status === 429 || response.status >= 500) {
    if (attempt < 4) {
      await sleep(600 * 2 ** attempt);
      return embedBatch(texts, task, attempt + 1);
    }
  }
  const body = (await response.json().catch(() => ({}))) as BatchResponse;
  if (!response.ok) throw new Error(body.error?.message || `Embedding failed (${response.status}).`);
  const vectors = (body.embeddings ?? []).map((item) => item.values ?? []);
  if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== EMBED_DIMS)) {
    throw new Error("Embedding service returned an unexpected shape.");
  }
  // Truncated Matryoshka vectors are not unit length; normalize so cosine and dot agree.
  return vectors.map(l2normalize);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Embeds any number of texts, in order, in batches of 100. */
export async function embedTexts(texts: string[], task: EmbedTask): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    out.push(...(await embedBatch(texts.slice(i, i + BATCH), task)));
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text], "RETRIEVAL_QUERY");
  return vector;
}
