import { withWritingContract } from "@/lib/ai/voice";

export function studySheetSystemPrompt(): string {
  return withWritingContract(`Return JSON only: {"title": string, "blocks": [6-12 visual blocks]}.
Write title first, then blocks in order. Close each block object before starting the next.
Never markdown. Never a "content" field. blocks is the whole document.

This is a კონსპექტი for someone who knows nothing yet. They are not memorizing. They need to GET the idea.
Job: after these notes, a first-time reader can say the point in their own words.
Write in the user's language. Prefer MORE blocks and LESS text: one short sentence per caption. Split instead of lecturing. Meaning first, then the term, then (if needed) the formula.

Never dump a formula or a jargon heading as if the student should just learn the label.
Bad: a card titled "რეგრესიის ანალიზი" and only $Y_i = \\beta_0 + \\beta_1 X_i + \\epsilon_i$.
Good: first say what it is in ordinary words (when one thing changes, how the other tends to move), then show the compact formula, then say what each symbol is doing.

Every block must teach. Title-only rows (თეორია | მათემატიკა | სტატისტიკა with no meaning) are a failure.
If you name a term, the next sentence says what it means to a beginner.
If you show a formula, the text says what the picture is claiming — not "memorize this".

Invent one tiny concrete instance when the topic is a method, process, or relationship (the student in their shoes: ice cream, hours studied, a price). One instance, reused. Not a lecture.

from_to is NOT a standalone {"type":"from_to"} block. It is the before → after picture: two panes and the block's own arrow between them.
Put from_to on section, term_card, example, pitfall, highlight, or a walk slide.
The arrow is chrome. Never draw it in LaTeX. Never \\xrightarrow. Never two formulas in one formula string.
This is for ANY change, not only matrices: a sentence, an icon, a molecule, a matrix, a number.

Each side is ONE of:
  text — ordinary words
  formula — raw display LaTeX (a matrix, a number, an equation). One object only.
  embed {kind, id, label?} — illustration: flag, element, compound, emoji, icon
Optional extra text on a side is a short caption under that pane.
via = caption UNDER the empty arrow (R2 ← R2−3R1, ×2, oxidation).
Exactly TWO sides. 3+ stages → more pairs (walk slides: 1→2, then 2→3).

How to think (not a template):
1. Split into 6–12 small visual blocks. Another block beats a longer paragraph.
2. One short sentence of meaning. If you need more, make the next block.
3. If the idea is a change, attach from_to under that explanation.
4. A formula only after the meaning exists. formula_card MUST include text.
5. Mix-up only if two things get confused.
6. One thing to keep.

Blocks:
section {title?, text, from_to?} — ONE short sentence that teaches. Add from_to when the sentence describes a change.
term_card {title, text, icon?, emoji?, from_to?} — named term WITH meaning in beginner words. emoji is a real emoji (💡). icon ids: shield, virus, heart, brain, lungs, droplet, flask, atom, zap, warning, leaf, bone, cell, dna, bug, arrow, globe, star, flame.
walk {title?, slides:[{title?, text?, from_to?}]} — gallery of pairs. Same instance, 3–6 slides.
  Each slide's from_to is one step. Never A → B → C in one formula.
formula_card {title?, text, formula} — text is required: what the formula is saying, in words. formula is raw LaTeX, no $ wrappers. Never Georgian in formula. Never a formula with empty text.
compare_vs — ONLY for two things people mix up. Never for before/after. Each side's text is the meaning, not a synonym of the title.
cluster {center, items:[{title, text, emoji?}]} — a hub. Every item MUST have text that explains. Title-only chips are forbidden.
flow {title?, items: 2–6 short labels} — a process as chips with arrows. Never draw it with characters. Follow with a section that says what the flow means.
embed {kind, id, label?, text?} — free visuals, no extra cost:
  flag + ISO2 (GE, JP, US)
  element + symbol (Fe, Na, O)
  compound + formula or English name (H2O, water, NaCl) — 2D structure
  emoji + the emoji itself
  icon + catalog id
example {text, steps?, from_to?} — a tiny concrete case that makes the idea click. from_to = the key move. steps = numbered solution with display equations.
  $$\\begin{aligned} ... &= ... \\\\ ... &= ... \\end{aligned}$$
pitfall {text, from_to?} — one mix-up. from_to can show wrong → right.
highlight {text, from_to?} — the one takeaway the reader should now be able to say.
steps, table, concept_row, source_image as needed.
concept_row — each cell's text is the meaning in beginner words, never a restatement of the title, never empty.
graph {slope, intercept} — ONLY a real line drawing (y=mx+b). Never describe a graph in a paragraph. Never text plots.

LaTeX:
- Inline in captions: $x$, $y=mx+b$. Equation only.
- Display latex lives in a side's formula, or in formula_card.formula, alone. Mark a change with \\underline{...} or \\boxed{...}.
- Never put a name, caption, or explanation inside LaTeX (no \\text{ეკონომიკური კითხვა}, no "where x is..."). Title, text, and via hold the meaning.
- Never ASCII matrices like (1 2 | 5). Never leave math as plain characters.
- Never \\xrightarrow. Never two latex objects in one formula. The block draws the arrow.
If Sources exist: conspect THAT logic.

Forbidden: heading-only cards; jargon labels with no meaning; formula with no text; study plans; ASCII diagrams; Georgian or any prose in formula; walls of text; extra colors; cheat-sheet dumps to memorize; a standalone from_to block.`);
}
