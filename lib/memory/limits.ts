import type { EffectivePlanId } from "@/types/billing";

export type MemoryLimits = {
  savedFacts: number | null;
  inferredPatterns: number | null;
  projectFacts: number | null;
  topicsPerProject: number | null;
};

const FREE: MemoryLimits = { savedFacts: 40, inferredPatterns: 3, projectFacts: 12, topicsPerProject: 20 };
const LIMITS: Record<Exclude<EffectivePlanId, "admin">, MemoryLimits> = {
  free_beta: FREE,
  lite: { savedFacts: 80, inferredPatterns: 6, projectFacts: 20, topicsPerProject: 30 },
  pro: { savedFacts: 160, inferredPatterns: 12, projectFacts: 40, topicsPerProject: 50 },
  max: { savedFacts: 320, inferredPatterns: 24, projectFacts: 80, topicsPerProject: 100 },
  team: { savedFacts: 320, inferredPatterns: 24, projectFacts: 80, topicsPerProject: 100 },
};

export function memoryLimitsForPlan(plan: EffectivePlanId): MemoryLimits {
  return plan === "admin" ? { savedFacts: null, inferredPatterns: null, projectFacts: null, topicsPerProject: null } : LIMITS[plan];
}

export function hasMemoryCapacity(used: number, limit: number | null): boolean {
  return limit === null || used < limit;
}
