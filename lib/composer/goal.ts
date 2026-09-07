import { DEFAULT_PROJECT_GOAL } from "@/lib/core/constants";
import type { ProjectGoal } from "@/types/goals";

function hasPhrase(text: string, key: string): boolean {
  if (/[ა-ჰ]/.test(key)) return text.includes(key);
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$|[.,!?])`, "i").test(text);
}

function hasAny(text: string, keys: string[]): boolean {
  return keys.some((key) => hasPhrase(text, key));
}

/** Infer an internal learning goal from chat text. Returns null when unknown. */
export function inferProjectGoal(text: string): ProjectGoal | null {
  const value = text.toLowerCase();
  if (hasAny(value, ["exam prep", "midterm", "final exam", "გამოცდა", "ტესტი"]) || hasPhrase(value, "exam")) {
    return "exam_prep";
  }
  if (hasAny(value, ["review", "recap", "revise", "გავიმეორო", "განმეორება"])) {
    return "review";
  }
  if (hasAny(value, ["first principles", "deeply", "thoroughly", "ღრმად", "საფუძვლიანად"])) {
    return "deep_understanding";
  }
  if (hasAny(value, ["drill me", "quiz me", "practice problems", "დამავარჯიშე", "გამომცადე"])) {
    return "practice";
  }
  return null;
}

export function goalOrDefault(text: string, current?: ProjectGoal): ProjectGoal {
  return inferProjectGoal(text) ?? current ?? DEFAULT_PROJECT_GOAL;
}
