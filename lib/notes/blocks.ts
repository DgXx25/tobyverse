import { parseVisualBlock } from "@/lib/visuals/validate";
import type { TermCardFields, VisualBlock } from "@/types/visual";

const MAX_TITLE = 48;
const MAX_LINE = 72;
const MAX_WORDS = 12;
const MAX_BLOCKS = 8;
const MAX_STEP = 90;

const PAIR_HINTS: Array<[string, string]> = [
  ["as", "ad"],
  ["ad", "as"],
  ["(as)", "(ad)"],
  ["aggregate demand", "aggregate supply"],
  ["aggregate supply", "aggregate demand"],
  ["demand", "supply"],
  ["supply", "demand"],
  ["მოთხოვნა", "მიწოდება"],
  ["მიწოდება", "მოთხოვნა"],
  ["short run", "long run"],
  ["long run", "short run"],
  ["short-run", "long-run"],
  ["მოკლევადიან", "გრძელვადიან"],
  ["გრძელვადიან", "მოკლევადიან"],
  ["left", "right"],
  ["pros", "cons"],
  ["before", "after"],
];

function clip(value: string, max = MAX_LINE): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "").trim() || text.slice(0, max);
}

function clipLine(value: string): string {
  const words = clip(value, MAX_LINE).split(/\s+/).filter(Boolean);
  return words.slice(0, MAX_WORDS).join(" ");
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function isEssayText(value: string): boolean {
  const text = value.replace(/\s+/g, " ").trim();
  return wordCount(text) > MAX_WORDS || text.length > MAX_LINE;
}

function looksLikeFormula(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > 160) return false;
  return /[=≈≤≥]|\\frac|\\sum|\$\$|AD\s*=|AS\s*=|Y\s*=|P\s*=/.test(text);
}

function hay(value: string): string {
  return value.toLowerCase();
}

function looksLikePair(left: string, right: string): boolean {
  const a = hay(left);
  const b = hay(right);
  return PAIR_HINTS.some(([x, y]) => a.includes(x) && b.includes(y));
}

function blobLooksPaired(values: string[]): boolean {
  const blob = hay(values.join(" "));
  return PAIR_HINTS.some(([x, y]) => blob.includes(x) && blob.includes(y));
}

function splitBits(value: string): string[] {
  return value
    .split(/(?<=[.!?…;:])\s+|\n+|,\s+| — |\s+–\s+|\s+და\s+/u)
    .map((item) => clip(item.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, ""), MAX_STEP))
    .filter((item) => item.length > 1);
}

function forceSteps(texts: string[]): Extract<VisualBlock, { type: "steps" }> | null {
  const items: string[] = [];
  for (const text of texts) {
    for (const bit of splitBits(text)) {
      if (items.length >= 6) break;
      if (!items.includes(bit)) items.push(bit);
    }
  }
  if (items.length < 3) return null;
  return { type: "steps", items: items.slice(0, 6) };
}

function term(title: string, text: string, icon?: string): VisualBlock {
  return { type: "term_card", title: clip(title, MAX_TITLE) || "Note", text: clipLine(text), icon };
}

function pickCopy(value: unknown): { title: string; text: string; icon?: string } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const title = [row.title, row.heading, row.name, row.label].find(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  const text = [row.text, row.body, row.content, row.detail, row.markdown, row.prose].find(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  if (!title && !text) return null;
  const icon = typeof row.icon === "string" ? row.icon : undefined;
  return { title: (title || "Note").trim(), text: (text || title || "Note").trim(), icon };
}

function asTerm(value: unknown): TermCardFields | null {
  const copy = pickCopy(value);
  if (!copy) return null;
  return { title: copy.title, text: copy.text, icon: copy.icon };
}

function flattenIncoming(raw: unknown): VisualBlock[] {
  const incoming = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: VisualBlock[] = [];

  for (const value of incoming) {
    if (typeof value === "string" && value.trim()) {
      out.push({ type: "term_card", title: "Note", text: value.trim() });
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const type = typeof row.type === "string" ? row.type : "";

    if (type === "compare_vs") {
      const left = asTerm(row.left);
      const right = asTerm(row.right);
      if (left && right) {
        out.push({
          type: "compare_vs",
          title: typeof row.title === "string" ? row.title : undefined,
          left,
          right,
        });
        continue;
      }
    }

    if (type === "concept_row" && Array.isArray(row.items)) {
      for (const item of row.items) {
        const next = asTerm(item);
        if (next) out.push({ type: "term_card", ...next });
      }
      continue;
    }

    if (type === "formula_card" && typeof row.formula === "string") {
      out.push({
        type: "formula_card",
        title: typeof row.title === "string" ? row.title : undefined,
        formula: row.formula,
      });
      continue;
    }

    if (type === "steps" && Array.isArray(row.items)) {
      const items = row.items.flatMap((item) => {
        if (typeof item === "string") return [item];
        const copy = pickCopy(item);
        return copy ? [`${copy.title}: ${copy.text}`] : [];
      });
      if (items.length) out.push({ type: "steps", items });
      continue;
    }

    if (type === "example" && typeof row.text === "string") {
      out.push({ type: "example", text: row.text });
      continue;
    }
    if (type === "pitfall" && typeof row.text === "string") {
      out.push({ type: "pitfall", text: row.text });
      continue;
    }

    if (type === "table" || type === "sparkline" || type === "source_image") {
      const parsed = parseVisualBlock(value);
      if (parsed) out.push(parsed);
      continue;
    }

    const copy = pickCopy(value);
    if (copy) out.push({ type: "term_card", ...copy });
  }

  return out;
}

function compactLayout(blocks: VisualBlock[]): VisualBlock[] {
  const formulas: Extract<VisualBlock, { type: "formula_card" }>[] = [];
  const pairs: Extract<VisualBlock, { type: "compare_vs" }>[] = [];
  const kept: VisualBlock[] = [];
  const shorts: TermCardFields[] = [];
  const essays: TermCardFields[] = [];
  const stepBits: string[] = [];

  for (const block of blocks) {
    if (block.type === "formula_card" || looksLikeFormula(block.type === "term_card" ? block.text : "")) {
      if (block.type === "formula_card") {
        formulas.push({ type: "formula_card", title: block.title ? clip(block.title, MAX_TITLE) : undefined, formula: clip(block.formula, 160) });
      } else if (block.type === "term_card") {
        formulas.push({ type: "formula_card", title: clip(block.title, MAX_TITLE), formula: clip(block.text, 160) });
      }
      continue;
    }
    if (block.type === "compare_vs") {
      pairs.push({
        type: "compare_vs",
        title: block.title ? clip(block.title, MAX_TITLE) : undefined,
        left: { ...block.left, title: clip(block.left.title, MAX_TITLE), text: clipLine(block.left.text) },
        right: { ...block.right, title: clip(block.right.title, MAX_TITLE), text: clipLine(block.right.text) },
      });
      continue;
    }
    if (block.type === "steps") {
      stepBits.push(...block.items);
      continue;
    }
    if (block.type === "term_card") {
      if (looksLikeFormula(block.title)) {
        formulas.push({ type: "formula_card", title: clip(block.title, MAX_TITLE), formula: clip(block.text || block.title, 160) });
        continue;
      }
      if (isEssayText(block.text)) essays.push(block);
      else shorts.push({ title: clip(block.title, MAX_TITLE), text: clipLine(block.text), icon: block.icon });
      continue;
    }
    if (block.type === "example" || block.type === "pitfall") {
      kept.push({ ...block, text: clip(block.text, 140) });
      continue;
    }
    kept.push(block);
  }

  function takePair(pool: TermCardFields[]): boolean {
    for (let i = 0; i < pool.length; i += 1) {
      for (let j = i + 1; j < pool.length; j += 1) {
        if (!looksLikePair(pool[i].title, pool[j].title) && !looksLikePair(pool[i].text, pool[j].text)) continue;
        const left = pool[i];
        const right = pool[j];
        pairs.push({
          type: "compare_vs",
          left: { title: clip(left.title, MAX_TITLE), text: clipLine(left.text), icon: left.icon },
          right: { title: clip(right.title, MAX_TITLE), text: clipLine(right.text), icon: right.icon },
        });
        pool.splice(j, 1);
        pool.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  while (takePair(essays) || takePair(shorts)) {
    // Pull opposing cards into compare_vs.
  }

  if (pairs.length === 0 && blobLooksPaired([...essays, ...shorts].map((item) => `${item.title} ${item.text}`))) {
    const pool = [...essays, ...shorts];
    if (pool.length >= 2) {
      pairs.push({
        type: "compare_vs",
        left: { title: clip(pool[0].title, MAX_TITLE), text: clipLine(pool[0].text), icon: pool[0].icon },
        right: { title: clip(pool[1].title, MAX_TITLE), text: clipLine(pool[1].text), icon: pool[1].icon },
      });
      essays.splice(0, essays.length, ...essays.filter((item) => item !== pool[0] && item !== pool[1]));
      shorts.splice(0, shorts.length, ...shorts.filter((item) => item !== pool[0] && item !== pool[1]));
    }
  }

  stepBits.push(...essays.map((item) => item.text));

  const steps = forceSteps(stepBits);

  const out: VisualBlock[] = [];
  out.push(...pairs);
  out.push(...formulas);
  if (shorts.length >= 2) out.push({ type: "concept_row", items: shorts.slice(0, 4).map((item) => ({ ...item, text: clipLine(item.text) })) });
  else if (shorts.length === 1) out.push(term(shorts[0].title, shorts[0].text, shorts[0].icon));
  if (steps) out.push(steps);
  out.push(...kept);

  const unique: VisualBlock[] = [];
  const seen = new Set<string>();
  for (const block of out) {
    const key = JSON.stringify(block);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(block);
  }

  return unique
    .filter((block) => {
      if (block.type === "steps") return block.items.length >= 3;
      if (block.type === "concept_row") return block.items.length >= 2;
      if (block.type === "term_card") return !isEssayText(block.text);
      return true;
    })
    .slice(0, MAX_BLOCKS);
}

export function proseToBlocks(prose: string): VisualBlock[] {
  const text = prose.replace(/\r/g, "").trim();
  if (!text) return [];

  const chunks = text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const heading = chunk.match(/^#{1,3}\s+(.+)\n?([\s\S]*)$/);
      if (heading) return { title: heading[1].trim(), body: heading[2].trim() };
      return { title: "", body: chunk };
    });

  const raw: VisualBlock[] = [];
  const leftover: string[] = [];

  for (const chunk of chunks) {
    const body = chunk.body || chunk.title;
    if (!body) continue;
    if (looksLikeFormula(body)) {
      raw.push({ type: "formula_card", title: chunk.title || undefined, formula: clip(body, 160) });
      continue;
    }
    const list = body.match(/(?:^|\n)\s*(?:\d+[.)]|[-*•])\s+/);
    if (list) {
      const items = body
        .split(/\n+/)
        .map((line) => clip(line.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, ""), MAX_STEP))
        .filter(Boolean);
      if (items.length >= 3) {
        raw.push({ type: "steps", items: items.slice(0, 6) });
        continue;
      }
    }
    if (chunk.title && !isEssayText(body)) {
      raw.push(term(chunk.title, body));
      continue;
    }
    leftover.push(body);
  }

  if (leftover.length >= 2 && looksLikePair(leftover[0].slice(0, 80), leftover[1].slice(0, 80))) {
    raw.push({
      type: "compare_vs",
      left: { title: clip(leftover[0], MAX_TITLE), text: clipLine(leftover[0]) },
      right: { title: clip(leftover[1], MAX_TITLE), text: clipLine(leftover[1]) },
    });
    const rest = leftover.slice(2);
    if (rest.length) raw.push({ type: "term_card", title: "Note", text: rest.join(" ") });
  } else if (leftover.length) {
    leftover.forEach((item, index) => {
      raw.push({ type: "term_card", title: leftover.length === 1 ? "Note" : `Point ${index + 1}`, text: item });
    });
  }

  return compactLayout(raw);
}

export function normalizeNoteBlocks(raw: unknown, fallbackProse = ""): VisualBlock[] {
  const collected = flattenIncoming(raw);
  const next = compactLayout(collected);
  if (next.length > 0) return next;
  const fromProse = proseToBlocks(fallbackProse);
  if (fromProse.length > 0) return fromProse;
  const first = collected.find((block) => block.type === "term_card");
  if (first?.type === "term_card") return [term(first.title, first.text, first.icon)];
  return [];
}
