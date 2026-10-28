export type PlanLimitReason = "storage" | "ai" | "model";

export const PLAN_LIMIT_EVENT = "tobyverse:plan-limit";

export function requestPlanUpgrade(reason: PlanLimitReason): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PlanLimitReason>(PLAN_LIMIT_EVENT, { detail: reason }));
}
