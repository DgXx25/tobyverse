export const EXAM_PASS_RATIO = 0.5;

export type SetMode = "practice" | "exam";

export type SetResult = {
  setId: string;
  mode: SetMode;
  total: number;
  correct: number;
  firstTryCorrect: number;
  retried: number;
  passed?: boolean;
  /** Short stems of items they missed on the first try. */
  gaps?: string[];
};

const PRAISE = ["Nice.", "Well done.", "Excellent.", "You got it.", "Perfect."] as const;
const MISS = ["Not quite.", "Almost.", "That's not it.", "Keep going.", "Close."] as const;

export function isSetMode(value: unknown): value is SetMode {
  return value === "practice" || value === "exam";
}

export function examPassed(correct: number, total: number): boolean {
  if (total <= 0) return false;
  return correct / total >= EXAM_PASS_RATIO;
}

export function percentScore(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 100);
}

export function pickFooterLine(correct: boolean): string {
  const pool = correct ? PRAISE : MISS;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

function gapList(gaps?: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of gaps ?? []) {
    const next = raw.replace(/\s+/g, " ").trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    if (out.length >= 5) break;
  }
  return out;
}

export function workFinishedPrompt(result: SetResult): string {
  const pct = percentScore(result.correct, result.total);
  const score = `${result.correct}/${result.total} (${pct}%)`;
  const gaps = gapList(result.gaps);
  const spots = gaps.length
    ? `Problem areas only (remember for later; do not recap the set): ${gaps.map((gap) => `"${gap}"`).join("; ")}.`
    : "No problem areas to flag.";
  if (result.mode === "exam") {
    const pass = result.passed
      ? `This counts as a pass (threshold ${Math.round(EXAM_PASS_RATIO * 100)}%). If a path is active, you may advance_path.`
      : `Below ${Math.round(EXAM_PASS_RATIO * 100)}% — does not count as a pass. Do not shame. They may ask to practice. Do not auto-create.`;
    return `Work-finished (not a user request): they finished an exam. Score ${score}. ${pass} ${spots} One short reply in their language. Mention only where they struggle, if at all. Do not write another exam in chat. Do not pass \`question\`. Do not dump items.`;
  }
  return `Work-finished (not a user request): they finished a practice set. ${score} correct. This is practice, not an exam — no pass/fail. ${spots} One short reply in their language. Mention only where they struggle, if at all. Do not create another set unless they ask. Do not pass \`question\`. Do not recap the items.`;
}
