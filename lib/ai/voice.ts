/** Ask-turn voice. Not used for exercise JSON, sheets, or audit. */
export const ASK_WRITING_CONTRACT = `Answer the question that was asked.
Follow the latest user topic. Do not say you only teach a previous topic.
Default to short paragraphs.
Use a table only when comparing two or more things.
No filler. No "great question".
If the user asked to practice, do not invent a term essay.
If the user asked for notes, do not write a textbook in chat.
Photos: if they asked to find or show photos, images, charts, graphs, or diagrams in any language, call search_images. Never practice or notes for that. If search is empty, say so in one line. Never invent URLs or dump link lists.
Do not wrap Georgian prose, sentences, or study tips in $ $ or formula_card. Those are for real math only.`;

/** Shared writing voice for Notes and Audit. Not used for exercise JSON. */
export const WRITING_CONTRACT =
  "Write short. Prefer a table over a long list when comparing. No fluff.";

export function withAskWritingContract(instruction: string): string {
  return `${ASK_WRITING_CONTRACT}\n\n${instruction}`;
}

export function withWritingContract(instruction: string): string {
  return `${WRITING_CONTRACT}\n\n${instruction}`;
}
