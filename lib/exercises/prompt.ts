import { getExerciseTemplate } from "@/lib/exercises/templates";
import type { ExerciseType } from "@/types/exercise";

function clickFirstNote(type: ExerciseType): string {
  if (type === "mcq" || type === "connect") {
    return " Clickable choices only. Never a free-text blank for a one-word fact.";
  }
  if (type === "open_short" || type === "essay" || type === "analysis") {
    return " Use a text answer only because the response must be written.";
  }
  return "";
}

const VISUAL_NOTE =
  'Optional visual: {"kind":"icon|flag|element|formula|slide|none","id":"short catalog id or stored slide path","placement":"after_question"|"in_option"}. Flag id is ISO like JP. Element id like Fe or H2O. Formula id is latex. Slide id MUST be an exact storage path from source Images lines. Options may include visual {kind,id}. Unknown ids are dropped. Ground every field in the sources.';

export function exerciseSystemPrompt(type: ExerciseType): string {
  const template = getExerciseTemplate(type);
  return `Fill one ${type} exercise JSON. No markdown. No HTML. No SVG.${clickFirstNote(type)}
Use this shape:
${JSON.stringify(template.example)}
${VISUAL_NOTE}`;
}

export function exerciseSetSystemPrompt(types: ExerciseType[]): string {
  const unique = [...new Set(types)];
  const shapes = unique
    .map((type) => `${type}:${clickFirstNote(type)}\n${JSON.stringify(getExerciseTemplate(type).example)}`)
    .join("\n");
  return `Fill one practice-set JSON. No markdown. No HTML. No SVG.
Return {"items":[{"type":"...","data":{...}}]} with ${types.length} items in this type order: ${types.join(", ")}.
Shapes:
${shapes}
${VISUAL_NOTE}`;
}

export function knowledgeSystemNote(): string {
  return `Prefer unseen facts from the knowledge list. Do not repeat learned items.`;
}
