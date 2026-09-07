import { z } from "zod";
import type { VisualBlock } from "@/types/visual";

const short = z.string().min(1).max(80);
const line = z.string().min(1).max(90);
const phrase = z.string().min(1).max(72);
const icon = z.string().min(1).max(24).optional();

export const termCardFieldsSchema = z.object({
  title: short,
  text: phrase,
  icon,
});

export const termCardSchema = termCardFieldsSchema.extend({
  type: z.literal("term_card"),
});

export const conceptRowSchema = z.object({
  type: z.literal("concept_row"),
  items: z.array(termCardFieldsSchema).min(2).max(4),
});

export const compareVsSchema = z.object({
  type: z.literal("compare_vs"),
  title: short.optional(),
  left: termCardFieldsSchema,
  right: termCardFieldsSchema,
});

export const formulaCardSchema = z.object({
  type: z.literal("formula_card"),
  title: short.optional(),
  formula: z.string().min(1).max(160),
});

export const tableVisualSchema = z.object({
  type: z.literal("table"),
  headers: z.array(short).min(2).max(5),
  rows: z.array(z.array(z.string().max(80)).min(1).max(5)).min(1).max(8),
});

export const stepsVisualSchema = z.object({
  type: z.literal("steps"),
  items: z.array(line).min(3).max(6),
});

export const exampleSchema = z.object({
  type: z.literal("example"),
  text: line,
});

export const pitfallSchema = z.object({
  type: z.literal("pitfall"),
  text: line,
});

export const sparklineSchema = z.object({
  type: z.literal("sparkline"),
  title: short.optional(),
  points: z.array(z.number().finite()).min(2).max(24),
  caption: z.string().max(120).optional(),
});

export const sourceImageSchema = z.object({
  type: z.literal("source_image"),
  path: z.string().min(8).max(240).refine((value) => value.startsWith("users/") && value.includes("/materials/"), {
    message: "path must be a stored material image",
  }),
  slide: z.number().int().min(1).max(200).optional(),
  caption: z.string().max(120).optional(),
});

export const visualBlockSchema: z.ZodType<VisualBlock> = z.discriminatedUnion("type", [
  termCardSchema,
  conceptRowSchema,
  compareVsSchema,
  formulaCardSchema,
  tableVisualSchema,
  stepsVisualSchema,
  exampleSchema,
  pitfallSchema,
  sparklineSchema,
  sourceImageSchema,
]);

export const visualBlockListSchema = z.array(visualBlockSchema).max(8);

export const notesDocumentSchema = z.object({
  title: z.string().min(1).max(80),
  blocks: z.array(z.unknown()).max(8).optional(),
  content: z.string().optional(),
  sections: z.unknown().optional(),
});
