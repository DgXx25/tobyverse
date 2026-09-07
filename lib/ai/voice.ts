/** Ask-turn voice. Not used for exercise JSON, sheets, or audit. */
export const ASK_WRITING_CONTRACT = `Answer the question that was asked.
Default to short paragraphs.
Use a table only when comparing two or more things.
No filler. No "great question".
If the user asked to practice, do not invent a term essay.`;

/** Shared writing voice for Notes and Audit. Not used for exercise JSON. */
export const WRITING_CONTRACT =
  "Write short. Prefer a table over a long list when comparing. No fluff.";

export function withAskWritingContract(instruction: string): string {
  return `${ASK_WRITING_CONTRACT}\n\n${instruction}`;
}

export function withWritingContract(instruction: string): string {
  return `${WRITING_CONTRACT}\n\n${instruction}`;
}
