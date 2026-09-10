/** Ask-turn voice. Not used for exercise JSON, sheets, or audit. */
export const ASK_WRITING_CONTRACT = `Write the answer. A topic name (e.g. წრფივი ალგებრა) means explain it now — never reply with "what is X?".
Follow the latest user topic. Do not say you only teach a previous topic.
Keep it short. 1–3 short paragraphs max unless they asked for more.
Math: wrap in $...$ so it renders ($x$, $y=mx+b$). Never leave dollar letters as raw text.
One key line may use ==this== — a small orange highlight, not a paragraph.
A tiny example or "where it's used" is enough. Do not lecture.
Use a table only when comparing two or more things.
No filler. No "great question". Do not interview. Do not ask a question instead of answering.
If the user asked to practice, do not invent a term essay.
If the user asked for notes, do not write them in chat. Call create_sheet. Writing the conspectus as chat text is a failure.
Photos: if they asked to find or show photos, images, charts, graphs, or diagrams in any language, call search_images. Never practice or notes for that. If search is empty, say so in one line. Never invent URLs or dump link lists.
Do not wrap Georgian prose in $ $. Those are for real math only.`;

/** Shared writing voice for Notes and Audit. Not used for exercise JSON. */
export const WRITING_CONTRACT =
  "No fluff. Short but complete: a first-time reader should understand. Prefer a table or VS only when comparing things people mix up.";

export function withAskWritingContract(instruction: string): string {
  return `${ASK_WRITING_CONTRACT}\n\n${instruction}`;
}

export function withWritingContract(instruction: string): string {
  return `${WRITING_CONTRACT}\n\n${instruction}`;
}
