import { formulaIsProse, isLatexSource, unwrapLatex } from "@/lib/visuals/math";
import { parseVisualBlock } from "@/lib/visuals/validate";
import { EMBED_KINDS, type EmbedKind, type FromToEmbed, type FromToEmbedVisual, type FromToSide, type TermCardFields, type VisualBlock } from "@/types/visual";

const MAX_TITLE = 80;
const MAX_TERM = 360;
const MAX_SIDE = 220;
const MAX_SECTION = 720;
const MAX_STEP = 160;
const MAX_FORMULA = 800;
const MAX_DIAGRAM = 400;
const MAX_BLOCKS = 12;

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
  ["პროკარიოტ", "ევკარიოტ"],
  ["ევკარიოტ", "პროკარიოტ"],
  ["prokaryot", "eukaryot"],
  ["eukaryot", "prokaryot"],
  ["left", "right"],
  ["pros", "cons"],
  ["before", "after"],
];

function clip(value: string, max: number): string {
  const text = value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "").trim() || text.slice(0, max);
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function isParagraph(value: string): boolean {
  const text = value.replace(/\s+/g, " ").trim();
  return wordCount(text) > 28 || text.length > 180;
}

function hay(value: string): string {
  return value.toLowerCase();
}

function looksLikePair(left: string, right: string): boolean {
  const a = hay(left);
  const b = hay(right);
  return PAIR_HINTS.some(([x, y]) => a.includes(x) && b.includes(y));
}

function looksLikeFormula(value: string): boolean {
  return isLatexSource(value);
}

function isHeadingOnly(title: string, text: string): boolean {
  const heading = title.replace(/\s+/g, " ").trim().toLowerCase();
  const body = text.replace(/\s+/g, " ").trim().toLowerCase();
  return !body || body === heading;
}

function pickCopy(value: unknown): { title: string; text: string; icon?: string; emoji?: string } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const title = [row.title, row.heading, row.name, row.label].find(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  const text = [row.text, row.body, row.content, row.detail, row.markdown, row.prose].find(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  if (!title && !text) return null;
  const iconRaw = [row.icon, row.iconName].find(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  const icon = iconRaw?.trim();
  const emojiRaw = typeof row.emoji === "string" ? row.emoji.trim() : "";
  return { title: (title || "").trim(), text: (text || title || "").trim(), icon, emoji: emojiRaw || undefined };
}

function asTerm(value: unknown): TermCardFields | null {
  const copy = pickCopy(value);
  if (!copy) return null;
  return { title: copy.title || "Note", text: copy.text, icon: copy.icon, emoji: copy.emoji };
}

function asEmbedKind(value: unknown): EmbedKind | null {
  return typeof value === "string" && EMBED_KINDS.includes(value as EmbedKind) ? (value as EmbedKind) : null;
}

function asFromToVisual(value: unknown): FromToEmbedVisual | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const kind = asEmbedKind(row.kind);
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!kind || !id) return undefined;
  const label = typeof row.label === "string" ? clip(row.label, MAX_TITLE) : undefined;
  return { kind, id: clip(id, 40), label: label || undefined };
}

function asFromToSide(value: unknown): FromToSide | null {
  if (typeof value === "string" && value.trim()) {
    const text = value.trim();
    if (looksLikeFormula(text) && !formulaIsProse(text)) {
      return { formula: clip(unwrapLatex(text), MAX_FORMULA) };
    }
    return { text: clip(text, MAX_SIDE) };
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const formula = typeof row.formula === "string" ? clip(unwrapLatex(row.formula), MAX_FORMULA) : "";
  const text = typeof row.text === "string" ? clip(row.text, MAX_SIDE) : "";
  const embed =
    asFromToVisual(row.embed) ||
    asFromToVisual(row) ||
    (typeof row.emoji === "string" && row.emoji.trim()
      ? { kind: "emoji" as const, id: clip(row.emoji, 8) }
      : undefined) ||
    (typeof row.icon === "string" && row.icon.trim()
      ? { kind: "icon" as const, id: clip(row.icon, 24) }
      : undefined);
  if (!formula && !text && !embed) return null;
  return {
    formula: formula || undefined,
    text: text || undefined,
    embed,
  };
}

function asFromToEmbed(value: unknown): FromToEmbed | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const left = asFromToSide(row.left ?? row.from);
  const right = asFromToSide(row.right ?? row.to);
  if (!left || !right) return undefined;
  const viaRaw = [row.via, row.label, row.arrow].find(
    (entry): entry is string => typeof entry === "string" && Boolean(entry.trim()),
  );
  return {
    left,
    right,
    via: viaRaw ? clip(viaRaw, MAX_TITLE) : undefined,
  };
}

function asSection(title: string | undefined, text: string, fromTo?: FromToEmbed): Extract<VisualBlock, { type: "section" }> | null {
  const body = clip(text, MAX_SECTION);
  if (!body) return null;
  const heading = title ? clip(title, MAX_TITLE) : undefined;
  if (heading && isHeadingOnly(heading, body)) return null;
  return { type: "section", title: heading || undefined, text: body, from_to: fromTo };
}

function flattenIncoming(raw: unknown): VisualBlock[] {
  const incoming = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: VisualBlock[] = [];

  for (const value of incoming) {
    if (typeof value === "string" && value.trim()) {
      const section = asSection(undefined, value);
      if (section) out.push(section);
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const type = typeof row.type === "string" ? row.type : "";

    if (type === "section" && typeof row.text === "string") {
      const parsed = parseVisualBlock(value);
      if (parsed?.type === "section") {
        out.push(parsed);
        continue;
      }
      const section = asSection(typeof row.title === "string" ? row.title : undefined, row.text, asFromToEmbed(row.from_to));
      if (section) out.push(section);
      continue;
    }

    if (type === "diagram" && typeof row.text === "string") {
      const kept = row.text.replace(/\n{3,}/g, "\n\n").trim();
      const text = kept.length <= MAX_DIAGRAM ? kept : kept.slice(0, MAX_DIAGRAM);
      if (text) {
        out.push({
          type: "diagram",
          title: typeof row.title === "string" ? clip(row.title, MAX_TITLE) : undefined,
          text,
        });
      }
      continue;
    }

    if (type === "highlight" && typeof row.text === "string") {
      const parsed = parseVisualBlock(value);
      if (parsed?.type === "highlight") {
        out.push(parsed);
        continue;
      }
      const text = clip(row.text, MAX_SIDE);
      if (text) out.push({ type: "highlight", text, from_to: asFromToEmbed(row.from_to) });
      continue;
    }

    if (type === "graph") {
      const slope = typeof row.slope === "number" && Number.isFinite(row.slope) ? row.slope : undefined;
      const intercept = typeof row.intercept === "number" && Number.isFinite(row.intercept) ? row.intercept : undefined;
      const points = Array.isArray(row.points)
        ? row.points.filter((item): item is number => typeof item === "number" && Number.isFinite(item)).slice(0, 24)
        : undefined;
      if (slope != null || (points && points.length >= 2)) {
        out.push({
          type: "graph",
          title: typeof row.title === "string" ? clip(row.title, MAX_TITLE) : undefined,
          slope,
          intercept,
          points: points && points.length >= 2 ? points : undefined,
          caption: typeof row.caption === "string" ? clip(row.caption, 120) : undefined,
        });
      }
      continue;
    }

    if (type === "compare_vs") {
      const left = asTerm(row.left);
      const right = asTerm(row.right);
      if (left && right && !isHeadingOnly(left.title, left.text) && !isHeadingOnly(right.title, right.text)) {
        out.push({
          type: "compare_vs",
          title: typeof row.title === "string" ? clip(row.title, MAX_TITLE) : undefined,
          left: { ...left, title: clip(left.title, MAX_TITLE), text: clip(left.text, MAX_SIDE) },
          right: { ...right, title: clip(right.title, MAX_TITLE), text: clip(right.text, MAX_SIDE) },
        });
        continue;
      }
    }

    if (type === "concept_row" && Array.isArray(row.items)) {
      const items = row.items.flatMap((item) => {
        const next = asTerm(item);
        if (!next || isHeadingOnly(next.title, next.text)) return [];
        return [{ ...next, title: clip(next.title, MAX_TITLE), text: clip(next.text, MAX_SIDE) }];
      });
      if (items.length >= 2) out.push({ type: "concept_row", items: items.slice(0, 4) });
      continue;
    }

    if (type === "formula_card" && typeof row.formula === "string") {
      const formula = unwrapLatex(row.formula);
      if (formulaIsProse(formula)) {
        const section = asSection(typeof row.title === "string" ? row.title : undefined, formula);
        if (section) out.push(section);
        continue;
      }
      const text = typeof row.text === "string" ? clip(row.text, MAX_TERM) : undefined;
      out.push({
        type: "formula_card",
        title: typeof row.title === "string" ? clip(row.title, MAX_TITLE) : undefined,
        text: text || undefined,
        formula: clip(formula, MAX_FORMULA),
      });
      continue;
    }

    if (type === "steps" && Array.isArray(row.items)) {
      const items = row.items.flatMap((item) => {
        if (typeof item === "string") return [clip(item, MAX_STEP)];
        const copy = pickCopy(item);
        return copy ? [clip(`${copy.title}: ${copy.text}`.replace(/^:\s*/, ""), MAX_STEP)] : [];
      }).filter(Boolean);
      if (items.length) out.push({ type: "steps", items: items.slice(0, 6) });
      continue;
    }

    if (type === "example") {
      const parsed = parseVisualBlock(value);
      if (parsed?.type === "example") {
        out.push(parsed);
        continue;
      }
      if (typeof row.text === "string") {
        const text = clip(row.text, MAX_SECTION);
        const steps = Array.isArray(row.steps)
          ? row.steps
              .flatMap((item) => (typeof item === "string" ? [clip(item, 700)] : []))
              .filter(Boolean)
              .slice(0, 8)
          : [];
        if (text) out.push({ type: "example", text, steps: steps.length >= 2 ? steps : undefined, from_to: asFromToEmbed(row.from_to) });
      }
      continue;
    }
    if (type === "pitfall" && typeof row.text === "string") {
      const parsed = parseVisualBlock(value);
      if (parsed?.type === "pitfall") {
        out.push(parsed);
        continue;
      }
      const text = clip(row.text, MAX_SECTION);
      if (text) out.push({ type: "pitfall", text, from_to: asFromToEmbed(row.from_to) });
      continue;
    }

    if (type === "table" || type === "sparkline" || type === "source_image" || type === "embed" || type === "cluster" || type === "flow") {
      const parsed = parseVisualBlock(value);
      if (parsed) out.push(parsed);
      continue;
    }

    if (type === "walk") {
      const parsed = parseVisualBlock(value);
      if (parsed?.type === "walk") {
        out.push(parsed);
        continue;
      }
      const rawSlides = Array.isArray(row.slides) ? row.slides : Array.isArray(row.items) ? row.items : [];
      const slides = rawSlides.flatMap((item) => {
        if (typeof item === "string" && item.trim()) return [{ text: clip(item, MAX_SIDE) }];
        if (!item || typeof item !== "object") return [];
        const cell = item as Record<string, unknown>;
        const fromTo = asFromToEmbed(cell.from_to) ?? asFromToEmbed(cell);
        const text = typeof cell.text === "string" ? clip(cell.text, MAX_SIDE) : "";
        const formula = typeof cell.formula === "string" ? clip(unwrapLatex(cell.formula), MAX_FORMULA) : undefined;
        const heading = typeof cell.title === "string" ? clip(cell.title, MAX_TITLE) : undefined;
        if (!text && !formula && !fromTo) return [];
        return [{ text: text || heading || "", formula, title: heading, from_to: fromTo }];
      });
      if (slides.length >= 2) {
        out.push({
          type: "walk",
          title: typeof row.title === "string" ? clip(row.title, MAX_TITLE) : undefined,
          slides,
        });
      }
      continue;
    }

    if (type === "from_to" || type === "transform" || type === "becomes") {
      const parsed = parseVisualBlock({ ...row, type: "from_to" });
      if (parsed?.type === "from_to") {
        out.push(parsed);
        continue;
      }
      const left = asFromToSide(row.left ?? row.from);
      const right = asFromToSide(row.right ?? row.to);
      if (left && right) {
        const viaRaw = [row.via, row.label, row.arrow].find(
          (entry): entry is string => typeof entry === "string" && Boolean(entry.trim()),
        );
        out.push({
          type: "from_to",
          title: typeof row.title === "string" ? clip(row.title, MAX_TITLE) : undefined,
          via: viaRaw ? clip(viaRaw, MAX_TITLE) : undefined,
          left,
          right,
        });
      }
      continue;
    }

    if (type === "term_card") {
      const parsed = parseVisualBlock(value);
      if (parsed?.type === "term_card") {
        out.push(parsed);
        continue;
      }
    }

    const copy = pickCopy(value);
    if (!copy) continue;
    if (looksLikeFormula(copy.text) && !formulaIsProse(copy.text)) {
      out.push({
        type: "formula_card",
        title: copy.title ? clip(copy.title, MAX_TITLE) : undefined,
        formula: clip(unwrapLatex(copy.text), MAX_FORMULA),
      });
      continue;
    }
    if (!copy.title || isParagraph(copy.text)) {
      const section = asSection(copy.title, copy.text, asFromToEmbed(row.from_to));
      if (section) out.push(section);
      continue;
    }
    if (isHeadingOnly(copy.title, copy.text)) continue;
    out.push({
      type: "term_card",
      title: clip(copy.title, MAX_TITLE),
      text: clip(copy.text, MAX_TERM),
      icon: copy.icon,
      emoji: copy.emoji,
      from_to: asFromToEmbed(row.from_to),
    });
  }

  return out;
}

function compactLayout(blocks: VisualBlock[]): VisualBlock[] {
  const merged: VisualBlock[] = [];

  for (let i = 0; i < blocks.length; i += 1) {
    const current = blocks[i];
    const next = blocks[i + 1];
    if (
      current.type === "term_card" &&
      next?.type === "term_card" &&
      (looksLikePair(current.title, next.title) || looksLikePair(current.text, next.text))
    ) {
      merged.push({
        type: "compare_vs",
        left: { ...current, title: clip(current.title, MAX_TITLE), text: clip(current.text, MAX_SIDE) },
        right: { ...next, title: clip(next.title, MAX_TITLE), text: clip(next.text, MAX_SIDE) },
      });
      i += 1;
      continue;
    }
    merged.push(current);
  }

  const unique: VisualBlock[] = [];
  const seen = new Set<string>();
  for (const block of merged) {
    if (block.type === "steps" && block.items.length < 3) continue;
    if (block.type === "walk" && block.slides.length < 2) continue;
    if (
      block.type === "from_to" &&
      (!(block.left.formula || block.left.text) || !(block.right.formula || block.right.text))
    ) {
      continue;
    }
    if (block.type === "concept_row" && block.items.length < 2) continue;
    if (block.type === "term_card" && isHeadingOnly(block.title, block.text)) continue;
    if (block.type === "section" && !block.text.trim()) continue;
    const key = JSON.stringify(block);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(block);
  }

  return unique.slice(0, MAX_BLOCKS);
}

export function readNoteBlocks(raw: unknown): VisualBlock[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return flattenIncoming(raw);
}

export function splitNotePayload(raw: unknown, fallbackProse = ""): { blocks: VisualBlock[]; content: string } {
  const collected = flattenIncoming(raw);
  let blocks = compactLayout(collected);
  const fallback = fallbackProse.trim();
  if (blocks.length === 0 && fallback) {
    blocks = proseToBlocks(fallback);
  }
  if (blocks.length > 0) return { blocks, content: "" };
  return { blocks: [], content: fallback };
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

  for (const chunk of chunks) {
    const body = chunk.body || chunk.title;
    if (!body) continue;
    if (looksLikeFormula(body) && !formulaIsProse(body)) {
      raw.push({ type: "formula_card", title: chunk.title || undefined, formula: clip(unwrapLatex(body), MAX_FORMULA) });
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
    const section = asSection(chunk.title, body);
    if (section) raw.push(isParagraph(body) || !chunk.title ? section : { type: "term_card", title: clip(chunk.title, MAX_TITLE) || "Note", text: clip(body, MAX_TERM) });
  }

  return compactLayout(raw);
}

export function normalizeNoteBlocks(raw: unknown): VisualBlock[] {
  return compactLayout(flattenIncoming(raw));
}

export function parseRawNoteBlock(value: unknown): VisualBlock | null {
  return flattenIncoming(value)[0] ?? null;
}
