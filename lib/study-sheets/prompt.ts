import { withWritingContract } from "@/lib/ai/voice";

export function studySheetSystemPrompt(): string {
  return withWritingContract(`Return JSON only: {"title": string, "blocks": [1-8 visual blocks]}.
This is a handwritten cheat-sheet (კონსპექტი), not a study plan and not an article.
Each block must include the fact you would jot by hand. Title alone is not a block.
No HTML, SVG, markdown essays, content, or sections fields.
If the user is vague (პირდაპირ, რაც გინდა, just make one, I don't know the topic): pick a default core of the subject and write facts. Do not stall, ask, or write how-to-study steps.
Allowed block types ONLY:
term_card {title,text,icon?} — title + ONE short fact line. Under 12 words in text. Never a paragraph. Never title-only.
concept_row {items: 2-4 term_cards} — short labels with a fact each
compare_vs {title?, left:{title,text,icon?}, right:{title,text,icon?}} — TWO sides in ONE block. One fact line each side. Optional icon/iconName from the catalog.
formula_card {title?, formula}
table {headers, rows}
steps {items: exactly 3-6 short FACT strings about the topic itself}
example {text}
pitfall {text}
Forbidden: heading-only cards. Forbidden: "how to study this" / plan / read / review / memorize step lists unless the user asked for a plan.
For two-sided topics (cell types, AS-AD, demand vs supply, short vs long run): one compare_vs, not two term_cards. Add formula_card if there is an identity. Steps only for a real process (mitosis stages, not study tips).
Example: უჯრედი → compare_vs(პროკარიოტული vs ევკარიოტული) + term_cards with definitions + steps of cell functions. Not four essays.
icon / iconName ids: shield, virus, heart, brain, lungs, droplet, flask, atom, zap, warning, leaf, bone, cell, dna, bug.
Prefer one screen. Short strings.`);
}
