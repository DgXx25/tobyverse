import { z } from "zod";
import { SECTION_SYMBOL_GUIDE, SECTION_SYMBOL_IDS } from "@/lib/blocks/section-symbols";
import { ACCENT_OPTIONS } from "@/lib/workspace/theme";
import type { ChatBlockDef } from "@/lib/blocks/types";

export const sectionItemSchema = z.object({
  symbol: z.enum(SECTION_SYMBOL_IDS),
  title: z.string().trim().min(1).max(160),
  text: z.string().trim().min(1).max(6000),
  accent: z.enum(ACCENT_OPTIONS.map(({ id }) => id)).optional(),
});

export const sectionsSchema = z.object({
  type: z.literal("sections").optional(),
  title: z.string().trim().min(1).max(160).optional(),
  items: z.array(sectionItemSchema).min(1).max(8),
});

export type SectionsBlock = z.infer<typeof sectionsSchema>;

export const sectionsBlock: ChatBlockDef<SectionsBlock> = {
  id: "sections",
  keys: ["how", "why", "explain", "steps", "stage", "stages", "solution", "solve", "approach", "method", "procedure", "strategy", "compare", "comparison", "analysis", "როგორ", "რატომ", "ეტაპ", "ნაბიჯ", "ამოხს", "ახსნ", "შედარ", "მეთოდ", "მიდგომ", "პროცედურ", "სტრატეგ", "ანალიზ"],
  when: "An optional group of titled explanations, steps, criteria or observations benefits from symbols and clear separation.",
  schema: sectionsSchema,
  card: () => `Optional sections: one quiet shared frame with symbol, heading and rich text per row. Use for steps, reasoning, criteria, explanations or observations when grouping helps; not limited to solutions. Choose freely; do not turn every response into steps or repeat the same text outside the block. No forced numbering or fixed number of rows.
Fence: \`\`\`toby sections
JSON: {"items":[{"symbol":"idea","title":"...","text":"..."},{"symbol":"check","title":"...","text":"..."}]}
1–8 rows; optional group title. Choose a symbol from each row's actual title and content, not at random; use a specific matching symbol when available and a general one only when the subject is unclear. Avoid repeating the same symbol unless the rows share that meaning. Symbols and their meanings: ${SECTION_SYMBOL_GUIDE}. Row text supports paragraphs, Markdown, lists, code and math; JSON strings use \\n for newlines. No nested native blocks. Optional row accent: ${ACCENT_OPTIONS.map(({ id }) => id).join(", ")}; omit for neutral symbols. Number headings only for an actual sequence.`,
};
