import { z } from "zod";
import type { ChatBlockDef } from "@/lib/blocks/types";

export const SCENE_IDS = ["photosynthesis", "plant-cell", "supply-demand", "normal-distribution", "t-distribution", "process", "cycle", "structure", "line-graph"] as const;
const common = {
  type: z.literal("scene").optional(),
  locale: z.enum(["ka", "en"]).default("en"),
  title: z.string().trim().min(1).max(100).optional(),
};
const step = z.object({ label: z.string().trim().min(1).max(80), detail: z.string().trim().max(220).optional() });
export const sceneSchema = z.discriminatedUnion("id", [
  z.object({ ...common, id: z.literal("photosynthesis") }),
  z.object({ ...common, id: z.literal("plant-cell") }),
  z.object({ ...common, id: z.literal("supply-demand") }),
  z.object({ ...common, id: z.literal("normal-distribution") }),
  z.object({ ...common, id: z.literal("t-distribution") }),
  z.object({ ...common, id: z.literal("process"), steps: z.array(step).min(2).max(6) }),
  z.object({ ...common, id: z.literal("cycle"), steps: z.array(step).min(2).max(6) }),
  z.object({ ...common, id: z.literal("structure"), center: z.string().trim().min(1).max(60), parts: z.array(step).min(2).max(6) }),
  z.object({ ...common, id: z.literal("line-graph"), slope: z.number().finite().min(-5).max(5).default(1), intercept: z.number().finite().min(-5).max(5).default(0) }),
]);
export type SceneBlock = z.infer<typeof sceneSchema>;

export const sceneBlock: ChatBlockDef<SceneBlock> = {
  id: "scene",
  keys: ["photosynthes", "ფოტოსინთეზ", "chloroplast", "ქლოროპლასტ", "plant cell", "უჯრედ", "supply", "demand", "მოთხოვნა", "მიწოდება", "normal distribution", "t distribution", "t-distribution", "ნორმალურ", "განაწილებ", "confidence interval", "ნდობის", "z score", "z-score", "cycle", "ციკლ", "process", "პროცეს", "causal", "სტრუქტურ", "structure", "line graph", "წრფივ", "slope", "დახრილობ"],
  when: "An optional interactive explanation makes a process, structure, curve or distribution easier to understand.",
  schema: sceneSchema,
  card: () => `Optional scene: bundled interactive diagrams, no image search or generated code needed. Choose only when the visual adds understanding; do not repeat its contents in a long explanation. Use the user's language (locale ka or en).
Fence: \`\`\`toby scene
JSON: {"id":"photosynthesis","locale":"ka"}
Presets (only id + locale, optional short title): photosynthesis (plant inputs/outputs, animated arrows); plant-cell (organelle locations/functions); supply-demand (illustrative equilibrium with local sliders); normal-distribution (standard Z curve and central area); t-distribution (degrees of freedom and central area).
Reusable scenes: process or cycle require steps:[{"label":"...","detail":"optional"},...] (2–6); structure requires center:"...", parts:[{"label":"...","detail":"optional"},...] (2–6); line-graph accepts slope and intercept (-5 to 5). Optional title for all. Use a preset only for its actual subject. Scenes are not mandatory, do not require a lesson, and cannot create an exercise.`,
};
