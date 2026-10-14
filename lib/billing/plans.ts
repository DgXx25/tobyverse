import type { EffectivePlanId } from "@/types/billing";

export const FREE_BETA_WEEKLY_MICROS = 2_000_000;

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
    name: "Free beta",
    description: "Core TobyVerse access while the product is in beta.",
  },
  lite: {
    id: "lite",
    monthlyPriceCents: 1_000,
    weeklyBudgetMicros: null,
    available: false,
    name: "Lite",
    description: "A lightweight plan for everyday AI work.",
  },
  pro: {
    id: "pro",
    monthlyPriceCents: 2_000,
    weeklyBudgetMicros: null,
    available: false,
    name: "Pro",
    description: "More room for deeper study and creation.",
  },
  max: {
    id: "max",
    monthlyPriceCents: 5_000,
    weeklyBudgetMicros: null,
    available: false,
    name: "Max",
    description: "Maximum individual access for demanding work.",
  },
  team: {
    id: "team",
    monthlyPriceCents: null,
    weeklyBudgetMicros: null,
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
