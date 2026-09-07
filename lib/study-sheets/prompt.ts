import { withWritingContract } from "@/lib/ai/voice";

export function studySheetSystemPrompt(): string {
  return withWritingContract(`Return JSON only: {"title": string, "blocks": [1-8 visual blocks]}.
This is a note (კონსპექტი), not an article. No HTML, SVG, markdown essays, content, or sections fields.
Allowed block types ONLY:
term_card {title,text,icon?} — title + ONE short line. Under 12 words in text. Never a paragraph.
concept_row {items: 2-4 term_cards} — only short labels, never essays
compare_vs {title?, left:{title,text,icon?}, right:{title,text,icon?}} — one line each side
formula_card {title?, formula}
table {headers, rows}
steps {items: exactly 3-6 short strings}
example {text}
pitfall {text}
Never put a paragraph in a rounded card. Never four essay term_cards. Never article-cards.
For two-sided topics (AS-AD, demand vs supply, short vs long run): compare_vs + formula_card if there is an identity + steps with 3 short items.
Example: AS-AD → compare_vs(AD vs AS) + formula_card + 3 steps. Not four essays.
icon ids: shield, virus, heart, brain, lungs, droplet, flask, atom, zap, warning, leaf, bone.
Prefer one screen. Short strings.`);
}
