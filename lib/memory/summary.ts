import { MEMORY_CONTENT_MAX } from "@/lib/memory/constants";
import { memoryKey, sanitizeMemoryContent } from "@/lib/memory/normalize";
import { memorySafeText } from "@/lib/memory/privacy";
import type { MemoryOp, UserMemory } from "@/types/memory";

export const MEMORY_SUMMARY_MAX = 70_000;
export type SummaryEntry = { content: string; date: string | null };

/** Apply an intentional prompt edit without rewriting untouched facts or their dates. */
export function applyPersonalMemoryEdit(current: Array<SummaryEntry & { id: string }>, operations: MemoryOp[]): SummaryEntry[] {
  const entries = current.map(({ id, content, date }) => ({ id, content: sanitizeMemoryContent(content), date }));
  for (const operation of operations) {
    if (operation.op === "delete") {
      const index = entries.findIndex(entry => entry.id === operation.id);
      if (index >= 0) entries.splice(index, 1);
      continue;
    }
    const content = sanitizeMemoryContent(operation.content);
    if (!content) continue;
    if (operation.op === "update") {
      const entry = entries.find(item => item.id === operation.id);
      if (entry) { entry.content = content; entry.date = null; }
      continue;
    }
    if (entries.some(entry => memoryKey(entry.content) === memoryKey(content))) continue;
    entries.push({ id: `new-${entries.length}`, content, date: null });
  }
  const seen = new Set<string>();
  return entries.flatMap(({ content, date }) => {
    const key = memoryKey(content);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{ content, date }];
  });
}

/** A view of the saved facts, not a second model-generated biography. */
export function formatPersonalMemory(facts: UserMemory[], legacyPreferences = ""): string {
  const entries: SummaryEntry[] = facts.flatMap(fact => {
    const content = sanitizeMemoryContent(fact.content);
    return content ? [{ content, date: (fact.updatedAt || fact.createdAt)?.slice(0, 10) ?? null }] : [];
  });
  // Keep existing preference text reviewable when moving to one personal summary.
  const sentences = memorySafeText(legacyPreferences).match(/[^.!?\n]+[.!?]?/gu) ?? [];
  for (const sentence of sentences) {
    let remaining = sentence.trim();
    while (remaining) {
      const end = remaining.length > MEMORY_CONTENT_MAX ? remaining.lastIndexOf(" ", MEMORY_CONTENT_MAX) : remaining.length;
      const length = end > 0 ? end : MEMORY_CONTENT_MAX;
      entries.push({ content: remaining.slice(0, length).trim(), date: null });
      remaining = remaining.slice(length).trim();
    }
  }
  const seen = new Set<string>();
  return entries.filter(entry => {
    const key = memoryKey(entry.content);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  }).map(entry => `- ${entry.content}${entry.date ? ` [${entry.date}]` : ""}`).join("\n");
}

/** Validate the whole edit before saving; never silently clip or discard an edited fact. */
export function parsePersonalMemory(text: string): SummaryEntry[] {
  if (text.length > MEMORY_SUMMARY_MAX) throw new Error("Memory summary is too long.");
  const seen = new Set<string>();
  const entries: SummaryEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^#{1,6}\s/.test(line)) continue;
    const clean = line.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "");
    const match = clean.match(/\s*\[(\d{4}-\d{2}-\d{2})\]\s*$/);
    const content = (match ? clean.slice(0, match.index) : clean).trim();
    if (!content) continue;
    if (content.length > MEMORY_CONTENT_MAX) throw new Error(`Keep each memory at most ${MEMORY_CONTENT_MAX} characters. Split longer memories into separate lines.`);
    if (!memorySafeText(content)) throw new Error("Remove private information or credentials before saving memory.");
    const key = memoryKey(content);
    if (seen.has(key)) continue;
    seen.add(key);
    const date = match && !Number.isNaN(Date.parse(`${match[1]}T00:00:00Z`)) ? match[1] : null;
    entries.push({ content, date });
  }
  return entries;
}
