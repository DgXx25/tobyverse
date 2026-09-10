import { MEMORY_CONTENT_MAX, MEMORY_OPS_PER_TURN } from "@/lib/memory/constants";
import type { ChatMemoryContext, MemoryOp } from "@/types/memory";

export function sanitizeMemoryContent(value: unknown): string {
  if (typeof value !== "string") return "";
  const line = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  if (!line) return "";
  return line.length <= MEMORY_CONTENT_MAX ? line : `${line.slice(0, MEMORY_CONTENT_MAX - 1).trim()}…`;
}

export function memoryKey(content: string): string {
  return sanitizeMemoryContent(content).toLowerCase();
}

export function asMemoryFacts(value: unknown, cap: number): ChatMemoryContext[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const facts: ChatMemoryContext[] = [];
  for (const item of value) {
    if (facts.length >= cap) break;
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; content?: unknown };
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const content = sanitizeMemoryContent(row.content);
    if (!id || !content) continue;
    const key = memoryKey(content);
    if (seen.has(key) || seen.has(id)) continue;
    seen.add(key);
    seen.add(id);
    facts.push({ id, content });
  }
  return facts;
}

export function parseMemoryOps(value: unknown, knownIds: Set<string>): MemoryOp[] {
  if (!value || typeof value !== "object") return [];
  const row = value as { operations?: unknown };
  if (!Array.isArray(row.operations)) return [];

  const ops: MemoryOp[] = [];
  const seen = new Set<string>();

  for (const item of row.operations) {
    if (ops.length >= MEMORY_OPS_PER_TURN) break;
    if (!item || typeof item !== "object") continue;
    const next = item as { op?: unknown; id?: unknown; content?: unknown };
    if (next.op === "add") {
      const content = sanitizeMemoryContent(next.content);
      if (!content) continue;
      const key = `add:${memoryKey(content)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ops.push({ op: "add", content });
      continue;
    }
    if (next.op === "update") {
      const id = typeof next.id === "string" ? next.id.trim() : "";
      const content = sanitizeMemoryContent(next.content);
      if (!id || !knownIds.has(id) || !content) continue;
      const key = `id:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ops.push({ op: "update", id, content });
      continue;
    }
    if (next.op === "delete") {
      const id = typeof next.id === "string" ? next.id.trim() : "";
      if (!id || !knownIds.has(id)) continue;
      const key = `id:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ops.push({ op: "delete", id });
    }
  }

  return ops;
}
