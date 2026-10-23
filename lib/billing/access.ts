import { z } from "zod";
import { FREE_BETA_WEEKLY_MICROS, normalizeStoredPlan, PLAN_CATALOG } from "./plans";
import type { AccountAccess, BillingAccount, BillingSubscription, ConfigurablePlanId, GrantPlanId, PlanPolicy } from "@/types/billing-admin";
import { STORAGE_LIMITS_BYTES } from "@/lib/account/plan";

export const GRANT_PLANS = ["lite", "pro", "max", "team"] as const;
export const grantPlanSchema = z.enum(GRANT_PLANS);
export const CONFIGURABLE_PLANS = ["free_beta", ...GRANT_PLANS] as const;
const instant = z.string().datetime({ offset: true });
export const grantSchema = z.object({ id: z.string().uuid(), planId: grantPlanSchema, startsAt: instant, expiresAt: instant.nullable(), revokedAt: instant.nullable(), actorId: z.string().min(1), reason: z.string().min(3).max(400) });
export const subscriptionSchema = z.object({ id: z.string().min(1), customerId: z.string().min(1), planId: grantPlanSchema, environment: z.enum(["sandbox", "production"]), status: z.string(), periodEndsAt: instant.nullable(), scheduledEndsAt: instant.nullable(), occurredAt: instant, priceId: z.string().min(1) });
const accountSchema = z.object({ revision: z.number().int().min(0), grant: grantSchema.nullable(), subscriptions: z.record(z.string(), subscriptionSchema) });
export const allowanceSchema = z.number().int().min(10_000).max(1_000_000_000);
export const storageLimitSchema = z.number().int().min(50 * 1024 * 1024).max(5 * 1024 ** 4);
const policySchema = z.object({ planId: z.enum(CONFIGURABLE_PLANS), weeklyBudgetMicros: allowanceSchema.nullable(), storageLimitBytes: storageLimitSchema.nullable().optional(), revision: z.number().int().min(0), updatedAt: instant.nullable() });

export function asBillingAccount(value: unknown): BillingAccount | null {
  if (value == null) return null;
  return accountSchema.parse(value);
}

export function planPolicies(value: unknown): PlanPolicy[] {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return CONFIGURABLE_PLANS.map((planId) => {
    const parsed = policySchema.safeParse(record[planId]);
    const valid = parsed.success && parsed.data.planId === planId;
    return {
      planId,
      weeklyBudgetMicros: valid && parsed.data.weeklyBudgetMicros != null ? parsed.data.weeklyBudgetMicros : PLAN_CATALOG[planId].weeklyBudgetMicros,
      storageLimitBytes: valid && parsed.data.storageLimitBytes != null ? parsed.data.storageLimitBytes : STORAGE_LIMITS_BYTES[planId],
      revision: valid ? parsed.data.revision : 0,
      updatedAt: valid ? parsed.data.updatedAt : null,
    };
  });
}

const rank = { free_beta: 0, lite: 1, pro: 2, max: 3, team: 4 };
const time = (value: string | null) => value ? Date.parse(value) : Infinity;
export function subscriptionExpiry(subscription: BillingSubscription): string | null {
  if (!subscription.periodEndsAt) return null;
  return time(subscription.scheduledEndsAt) < time(subscription.periodEndsAt) ? subscription.scheduledEndsAt : subscription.periodEndsAt;
}

/** All inputs are server-owned. A tier name by itself never means unlimited access. */
export function resolveAccountAccess(input: { storedPlan?: unknown; admin?: boolean; account: BillingAccount | null; policies: PlanPolicy[]; now?: Date; environment?: "sandbox" | "production" }): AccountAccess {
  const now = input.now ?? new Date();
  const ms = now.getTime();
  const account = input.account;
  const base = { grant: account?.grant ?? null, subscriptions: Object.values(account?.subscriptions ?? {}), revision: account?.revision ?? 0, serverNow: now.toISOString() };
  if (input.admin) return { ...base, plan: "admin", source: "admin", expiresAt: null, weeklyBudgetMicros: null, storageLimitBytes: null };
  const budget = (id: ConfigurablePlanId) => input.policies.find((policy) => policy.planId === id)?.weeklyBudgetMicros ?? PLAN_CATALOG[id].weeklyBudgetMicros;
  const storage = (id: ConfigurablePlanId) => input.policies.find((policy) => policy.planId === id)?.storageLimitBytes ?? STORAGE_LIMITS_BYTES[id];
  const candidates: Array<{ plan: GrantPlanId; source: "manual" | "subscription" | "legacy"; expiresAt: string | null; weeklyBudgetMicros: number }> = [];
  const grant = account?.grant;
  if (grant && !grant.revokedAt && time(grant.startsAt) <= ms && time(grant.expiresAt) > ms && budget(grant.planId) != null) {
    candidates.push({ plan: grant.planId, source: "manual", expiresAt: grant.expiresAt, weeklyBudgetMicros: budget(grant.planId)! });
  }
  for (const subscription of base.subscriptions) {
    const expiresAt = subscriptionExpiry(subscription);
    if (subscription.environment === (input.environment ?? "production") && ["active", "trialing"].includes(subscription.status) && expiresAt && time(expiresAt) > ms && budget(subscription.planId) != null) {
      candidates.push({ plan: subscription.planId, source: "subscription", expiresAt, weeklyBudgetMicros: budget(subscription.planId)! });
    }
  }
  const legacy = normalizeStoredPlan(input.storedPlan);
  // A promotional grant cannot erase an older, server-protected entitlement.
  if (legacy !== "free_beta" && budget(legacy) != null) candidates.push({ plan: legacy, source: "legacy", expiresAt: null, weeklyBudgetMicros: budget(legacy)! });
  const priority = { manual: 0, subscription: 1, legacy: 2 };
  candidates.sort((a, b) => rank[b.plan] - rank[a.plan] || (time(b.expiresAt) > time(a.expiresAt) ? 1 : time(b.expiresAt) < time(a.expiresAt) ? -1 : 0) || priority[a.source] - priority[b.source]);
  const selected = candidates[0];
  return selected ? { ...base, ...selected, storageLimitBytes: storage(selected.plan) } : { ...base, plan: "free_beta", source: "free", expiresAt: null, weeklyBudgetMicros: budget("free_beta") ?? FREE_BETA_WEEKLY_MICROS, storageLimitBytes: storage("free_beta") };
}
