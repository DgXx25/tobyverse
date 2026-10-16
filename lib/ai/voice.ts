import { CORE_SYSTEM_INSTRUCTION } from "@/lib/ai/core-instruction";

/** Compatibility alias. Chat assembly owns conditional context; keep one canonical core. */
export const ASK_WRITING_CONTRACT = CORE_SYSTEM_INSTRUCTION;

/** Artifact guidance for Notes and Audit, never injected into ordinary chat. */
export const WRITING_CONTRACT =
  "Write clearly and completely for a first-time reader. Use a table when aligned names and meanings are easier to scan; prose or lists can serve simpler material. Use side-by-side comparisons when they clarify a distinction. LaTeX contains the equation only; put names, captions, and explanations in ordinary text.";

/** Legacy opt-in formatting preference, not an additional always-on chat contract. */
export const OUTPUT_SHAPE =
  "Choose structure for utility. Prose suits conversation and factual accounts. A table can help compare three or more items across multiple attributes, or any aligned values the user wants to scan. Use math, code, or visuals when they make the answer clearer; respect explicit format requests.";

export function withAskWritingContract(instruction: string): string {
  return instruction.trim() ? `${CORE_SYSTEM_INSTRUCTION}\n\n${instruction.trim()}` : CORE_SYSTEM_INSTRUCTION;
}

export function withWritingContract(instruction: string): string {
  return `${WRITING_CONTRACT}\n\n${instruction}`;
}
