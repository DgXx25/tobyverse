import type { EffectivePlanId } from "@/types/billing";

export const FREE_BETA_WEEKLY_MICROS = 2_000_000;

export const PAID_WEEKLY_BUDGET_MICROS = {
  lite: 5_000_000,
  pro: 15_000_000,
  max: 40_000_000,
  team: 100_000_000,
} as const;

export type PlanDefinition = {
  id: EffectivePlanId;
  monthlyPriceCents: number | null;
  weeklyBudgetMicros: number | null;
  available: boolean;
  name: string;
  description: string;
};

export const PLAN_CATALOG: Record<EffectivePlanId, PlanDefinition> = {
  free_beta: {
    id: "free_beta",
    monthlyPriceCents: 0,
    weeklyBudgetMicros: FREE_BETA_WEEKLY_MICROS,
    available: true,
    name: "Tobyverse",
    description: "Claude Haiku and automatic model selection.",
  },
  lite: {
    id: "lite",
    monthlyPriceCents: 799,
    weeklyBudgetMicros: PAID_WEEKLY_BUDGET_MICROS.lite,
    available: false,
    name: "Tobyverse",
    description: "Claude Haiku and automatic model selection.",
  },
  pro: {
    id: "pro",
    monthlyPriceCents: 1_499,
    weeklyBudgetMicros: PAID_WEEKLY_BUDGET_MICROS.pro,
    available: false,
    name: "Premium",
    description: "Everything in Tobyverse, plus Claude Sonnet and higher usage limits.",
  },
  max: {
    id: "max",
    monthlyPriceCents: 2_999,
    weeklyBudgetMicros: PAID_WEEKLY_BUDGET_MICROS.max,
    available: false,
    name: "Premium Max",
    description: "Premium access with the highest individual usage limits.",
  },
  team: {
    id: "team",
    monthlyPriceCents: null,
    weeklyBudgetMicros: PAID_WEEKLY_BUDGET_MICROS.team,
    available: false,
    name: "Team",
    description: "One payer, shared workspace, and seats for your team.",
  },
  admin: {
    id: "admin",
    monthlyPriceCents: 0,
    weeklyBudgetMicros: null,
    available: true,
    name: "Admin",
    description: "Unlimited beta access with admin controls.",
  },
};

export function normalizeStoredPlan(value: unknown): Exclude<EffectivePlanId, "admin"> {
  if (value === "lite" || value === "pro" || value === "max" || value === "team") return value;
  return "free_beta";
}

export function resolveEffectivePlan(input: { storedPlan: unknown; admin?: boolean }): EffectivePlanId {
  return input.admin === true ? "admin" : normalizeStoredPlan(input.storedPlan);
}

export function utcWeekWindow(now = new Date()): { weekStart: string; resetsAt: string } {
  const day = now.getUTCDay();
  const offset = (day + 6) % 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
  return { weekStart: monday.toISOString().slice(0, 10), resetsAt: nextMonday.toISOString() };
}
