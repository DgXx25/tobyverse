import { getExerciseTemplate } from "@/lib/exercises/templates";
import type { ExerciseType } from "@/types/exercise";

export function exerciseSystemPrompt(type: ExerciseType): string {
  const template = getExerciseTemplate(type);
  return `Fill one ${type} exercise JSON. No markdown. No HTML. No SVG.
Use this shape:
${JSON.stringify(template.example)}
Optional visual: {"kind":"icon|flag|element|formula|slide|none","id":"short catalog id or stored slide path","placement":"after_question"|"in_option"}. Flag id is ISO like JP. Element id like Fe or H2O. Formula id is latex. Slide id MUST be an exact storage path from source Images lines. Options may include visual {kind,id}. Unknown ids are dropped. Ground every field in the sources.`;
}

export function knowledgeSystemNote(): string {
  return `Prefer unseen facts from the knowledge list. Do not repeat learned items.`;
}
