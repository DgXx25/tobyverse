import type { VisualBlock } from "@/types/visual";
import { visualBlockSchema } from "@/lib/visuals/schemas";

function coerceLegacy(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const row = value as { type?: unknown; items?: unknown; formula?: unknown; title?: unknown };
  if (row.type === "steps" && Array.isArray(row.items) && row.items.some((item) => item && typeof item === "object")) {
    const items = row.items
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const cell = item as { title?: unknown; detail?: unknown; text?: unknown };
          return [cell.title, cell.detail, cell.text].find((entry) => typeof entry === "string");
        }
        return null;
      })
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return { type: "steps", items };
  }
  if (row.type === "formula_card" && typeof row.formula === "string") {
    return { type: "formula_card", title: typeof row.title === "string" ? row.title : undefined, formula: row.formula };
  }
  return value;
}

export function parseVisualBlock(value: unknown): VisualBlock | null {
  const result = visualBlockSchema.safeParse(coerceLegacy(value));
  return result.success ? result.data : null;
}

export function parseNoteBlocks(value: unknown): VisualBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: VisualBlock[] = [];
  for (const item of value.slice(0, 24)) {
    const parsed = parseVisualBlock(item);
    if (parsed) blocks.push(parsed);
  }
  return blocks;
}

export function parseNoteBlock(value: unknown): VisualBlock | null {
  return parseVisualBlock(value);
}

export function validNoteBlocks(blocks: VisualBlock[]): VisualBlock[] {
  return blocks;
}

export function blockPreviewText(blocks: VisualBlock[]): string {
  for (const block of blocks) {
    if (block.type === "term_card" || block.type === "example" || block.type === "pitfall") return block.text;
    if (block.type === "steps") return block.items[0] ?? "";
    if (block.type === "compare_vs") return `${block.left.title} vs ${block.right.title}`;
    if (block.type === "formula_card") return block.formula;
    if (block.type === "table") return block.headers.join(" · ");
    if (block.type === "concept_row") return block.items.map((item) => item.title).join(" · ");
    if (block.type === "sparkline") return block.caption || block.title || "";
    if (block.type === "source_image") return block.caption || `Slide ${block.slide ?? ""}`.trim();
  }
  return "";
}
