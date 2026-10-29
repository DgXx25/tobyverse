import type { EffectivePlanId } from "@/types/billing";

export type UsageMeterState = {
  label: string;
  widthPercent: number;
  unlimited: boolean;
  ariaValueText: string;
  ariaValueNow?: number;
};

/** Keep visual fill semantics and accessible progress text consistent across plans. */
export function usageMeterState(
  plan: EffectivePlanId,
  weeklyBudgetMicros: number | null | undefined,
  costMicros: number,
): UsageMeterState {
  if (plan === "admin" || weeklyBudgetMicros == null) {
    return { label: "∞", widthPercent: 100, unlimited: true, ariaValueText: "Unlimited usage" };
  }

  const ratio = weeklyBudgetMicros > 0
    ? Math.max(0, Math.min(1, costMicros / weeklyBudgetMicros))
    : 0;
  const percent = Math.round(ratio * 100);
  const label = `${percent}% used`;
  return { label, widthPercent: ratio * 100, unlimited: false, ariaValueText: label, ariaValueNow: percent };
}
