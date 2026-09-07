import type {
  ConnectPayload,
  ExerciseType,
  FillBlankPayload,
  McqPayload,
  TrueFalsePayload,
} from "@/types/exercise";

function norm(value: string, caseSensitive = false): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

export function gradeObjective(
  type: ExerciseType,
  data: unknown,
  answer: unknown,
): boolean | null {
  if (type === "mcq") {
    const payload = data as McqPayload;
    return typeof answer === "string" && answer === payload.correctOptionId;
  }
  if (type === "true_false") {
    const payload = data as TrueFalsePayload;
    return typeof answer === "boolean" && answer === payload.answer;
  }
  if (type === "connect") {
    const payload = data as ConnectPayload;
    if (!Array.isArray(answer)) return false;
    const expected = new Set(payload.pairs.map((pair) => `${pair.leftId}:${pair.rightId}`));
    const got = new Set(
      answer.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as { leftId?: unknown; rightId?: unknown };
        if (typeof row.leftId !== "string" || typeof row.rightId !== "string") return [];
        return [`${row.leftId}:${row.rightId}`];
      }),
    );
    if (expected.size !== got.size) return false;
    for (const pair of expected) {
      if (!got.has(pair)) return false;
    }
    return true;
  }
  if (type === "fill_blank") {
    const payload = data as FillBlankPayload;
    if (!answer || typeof answer !== "object") return false;
    const map = answer as Record<string, unknown>;
    return payload.blanks.every((blank) => {
      const value = typeof map[blank.id] === "string" ? map[blank.id] : "";
      const needle = norm(String(value), blank.caseSensitive);
      return blank.answers.some((item) => norm(item, blank.caseSensitive) === needle);
    });
  }
  return null;
}

export function isObjectiveType(type: ExerciseType): boolean {
  return type === "mcq" || type === "true_false" || type === "connect" || type === "fill_blank";
}

export function isProblemTypeForHints(type: ExerciseType): boolean {
  return type === "problem_steps" || type === "case_tree" || type === "essay" || type === "analysis";
}
