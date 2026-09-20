import { z } from "zod";
import type { ChatBlockDef } from "@/lib/blocks/types";

export const GRID_MARKS = ["f", "e", "d", "h", "s"] as const;
export type GridMark = (typeof GRID_MARKS)[number];

export type GridPiece = { kind: "group"; marks: GridMark[] } | { kind: "op"; op: string };

const MARK_SET = new Set<string>(GRID_MARKS);
const FILL_DOT = /[●•⬤◉]/;
const EMPTY_DOT = /[○◯❍]/;

function normalizeGridCells(cells: string): string {
  let out = "";
  for (const ch of cells) {
    if (ch >= "1" && ch <= "9") {
      out += "f".repeat(Number(ch));
      continue;
    }
    if (FILL_DOT.test(ch)) {
      out += "f";
      continue;
    }
    if (EMPTY_DOT.test(ch)) {
      out += "e";
      continue;
    }
    out += ch;
  }
  return out;
}

function asCellsString(value: unknown): unknown {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.join("");
  return value;
}

export function parseGridCells(cells: string): GridMark[] {
  const marks: GridMark[] = [];
  for (const ch of normalizeGridCells(cells).toLowerCase()) {
    if (MARK_SET.has(ch)) marks.push(ch as GridMark);
  }
  return marks;
}

export function parseGridExpr(cells: string): GridPiece[] {
  const pieces: GridPiece[] = [];
  let marks: GridMark[] = [];
  const flush = () => {
    if (!marks.length) return;
    pieces.push({ kind: "group", marks });
    marks = [];
  };
  for (const ch of normalizeGridCells(cells)) {
    const lower = ch.toLowerCase();
    if (MARK_SET.has(lower)) {
      marks.push(lower as GridMark);
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "=" || ch === "×" || ch === "÷" || ch === "*" || ch === "/" || lower === "x") {
      flush();
      const op = ch === "*" || lower === "x" ? "×" : ch === "/" ? "÷" : ch;
      pieces.push({ kind: "op", op });
    }
  }
  flush();
  return pieces;
}

export const gridSchema = z
  .object({
    type: z.literal("grid").optional(),
    cols: z.number().int().min(1).max(10).optional(),
    cells: z.preprocess(asCellsString, z.string().min(1).max(80)),
    result: z.string().max(80).optional(),
    note: z.string().max(80).optional(),
  })
  .superRefine((value, ctx) => {
    const marks = parseGridCells(value.cells);
    if (marks.length < 1 || marks.length > 40) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Need 1–40 marks.", path: ["cells"] });
    }
  });

export type GridBlock = z.infer<typeof gridSchema>;

export const gridBlock: ChatBlockDef<GridBlock> = {
  id: "grid",
  keys: [
    "add",
    "adding",
    "addition",
    "plus",
    "sum",
    "multiply",
    "multiplication",
    "times table",
    "array",
    "ten frame",
    "ten-frame",
    "counting",
    "counter",
    "counters",
    "shaded",
    "groups of",
    "apple",
    "apples",
    "მიმატებ",
    "შეკრებ",
    "გამრავლებ",
    "ნამრავლ",
    "ჯამი",
    "თვლა",
    "ვაშლ",
    "ვამატ",
    "გავამრავლ",
  ],
  when: "Centered circle symbols (fill/outline). + between groups. Latex only under the dots. No quiz.",
  schema: gridSchema,
  card: () =>
    `grid — circle symbols only (not emoji). f filled, e outline, d dim, h accent. Put + × − between groups. Latex ONLY under the dots. Lead-in above the fence, then JSON only (no "3+2:" label). Groups color blue, red, yellow, green.
\`\`\`toby grid
{"cells":"fff+ee","result":"$3+2=5$"}
\`\`\`
Array: {"cols":3,"cells":"ffffff","result":"$2\\times 3=6$"}`,
};
