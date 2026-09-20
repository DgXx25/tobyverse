import { z } from "zod";
import type { VisualBlock } from "@/types/visual";

const title = z.string().min(1).max(80);
const icon = z.string().min(1).max(24).optional();
const sentence = z.string().min(1).max(220);
const paragraph = z.string().min(1).max(720);
const formula = z.string().min(1).max(800);

const emoji = z.string().min(1).max(8).optional();

const fromToEmbedVisualSchema = z.object({
  kind: z.enum(["icon", "flag", "element", "compound", "emoji"]),
  id: z.string().min(1).max(40),
  label: z.string().max(80).optional(),
});

const fromToSideSchema = z.object({
  formula: formula.optional(),
  text: sentence.optional(),
  embed: fromToEmbedVisualSchema.optional(),
});

export const fromToEmbedSchema = z.object({
  via: z.string().min(1).max(160).optional(),
  left: fromToSideSchema,
  right: fromToSideSchema,
});

export const termCardFieldsSchema = z.object({
  title,
  text: z.string().min(1).max(360),
  icon,
  iconName: icon,
  emoji,
  from_to: fromToEmbedSchema.optional(),
});

export const sectionSchema = z.object({
  type: z.literal("section"),
  title: title.optional(),
  text: paragraph,
  from_to: fromToEmbedSchema.optional(),
});

export const termCardSchema = termCardFieldsSchema.extend({
  type: z.literal("term_card"),
});

export const conceptRowSchema = z.object({
  type: z.literal("concept_row"),
  items: z.array(z.object({ title, text: sentence, icon, iconName: icon, emoji })).min(2).max(4),
});

export const compareVsSchema = z.object({
  type: z.literal("compare_vs"),
  title: title.optional(),
  left: z.object({ title, text: sentence, icon, iconName: icon, emoji }),
  right: z.object({ title, text: sentence, icon, iconName: icon, emoji }),
});

export const formulaCardSchema = z.object({
  type: z.literal("formula_card"),
  title: title.optional(),
  text: z.string().min(1).max(360).optional(),
  formula,
});

export const diagramSchema = z.object({
  type: z.literal("diagram"),
  title: title.optional(),
  text: z.string().min(1).max(400),
});

export const graphSchema = z.object({
  type: z.literal("graph"),
  title: title.optional(),
  slope: z.number().finite().optional(),
  intercept: z.number().finite().optional(),
  points: z.array(z.number().finite()).min(2).max(24).optional(),
  caption: z.string().max(120).optional(),
});

export const highlightSchema = z.object({
  type: z.literal("highlight"),
  text: z.string().min(1).max(220),
  from_to: fromToEmbedSchema.optional(),
});

export const tableVisualSchema = z.object({
  type: z.literal("table"),
  headers: z.array(title).min(2).max(5),
  rows: z.array(z.array(z.string().max(80)).min(1).max(5)).min(1).max(8),
});

export const stepsVisualSchema = z.object({
  type: z.literal("steps"),
  items: z.array(z.string().min(1).max(160)).min(3).max(6),
});

export const exampleSchema = z.object({
  type: z.literal("example"),
  text: paragraph,
  steps: z.array(z.string().min(1).max(700)).min(2).max(8).optional(),
  from_to: fromToEmbedSchema.optional(),
});

export const pitfallSchema = z.object({
  type: z.literal("pitfall"),
  text: paragraph,
  from_to: fromToEmbedSchema.optional(),
});

export const sparklineSchema = z.object({
  type: z.literal("sparkline"),
  title: title.optional(),
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

export const embedSchema = z.object({
  type: z.literal("embed"),
  kind: z.enum(["icon", "flag", "element", "compound", "emoji"]),
  id: z.string().min(1).max(40),
  label: z.string().max(80).optional(),
  text: sentence.optional(),
});

export const clusterSchema = z.object({
  type: z.literal("cluster"),
  center: title,
  items: z
    .array(
      z.object({
        title,
        text: z.string().max(220).optional(),
        icon,
        emoji,
      }),
    )
    .min(3)
    .max(8),
});

export const flowSchema = z.object({
  type: z.literal("flow"),
  title: title.optional(),
  items: z.array(z.string().min(1).max(80)).min(2).max(6),
});

export const walkSchema = z.object({
  type: z.literal("walk"),
  title: title.optional(),
  slides: z
    .array(
      z.object({
        title: title.optional(),
        formula: formula.optional(),
        text: z.string().max(220).optional(),
        from_to: fromToEmbedSchema.optional(),
      }),
    )
    .min(2)
    .max(8),
});

export const fromToSchema = z.object({
  type: z.literal("from_to"),
  title: title.optional(),
  via: z.string().min(1).max(160).optional(),
  left: fromToSideSchema,
  right: fromToSideSchema,
});

export const visualBlockSchema: z.ZodType<VisualBlock> = z.discriminatedUnion("type", [
  sectionSchema,
  termCardSchema,
  conceptRowSchema,
  compareVsSchema,
  formulaCardSchema,
  diagramSchema,
  graphSchema,
  highlightSchema,
  tableVisualSchema,
  stepsVisualSchema,
  exampleSchema,
  pitfallSchema,
  sparklineSchema,
  sourceImageSchema,
  embedSchema,
  clusterSchema,
  flowSchema,
  walkSchema,
  fromToSchema,
]);

export const visualBlockListSchema = z.array(visualBlockSchema).max(12);

export const notesDocumentSchema = z.object({
  title: z.string().min(1).max(80),
  blocks: z.array(z.unknown()).max(12).optional(),
  content: z.string().optional(),
  sections: z.unknown().optional(),
}).refine(
  (data) =>
    (Array.isArray(data.blocks) && data.blocks.length > 0) ||
    (typeof data.content === "string" && data.content.trim().length > 0),
  { message: "blocks required" },
);
