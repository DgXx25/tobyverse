import type { EffectivePlanId } from "./billing";

export type GrantPlanId = Exclude<EffectivePlanId, "admin" | "free_beta">;
export type ConfigurablePlanId = Exclude<EffectivePlanId, "admin">;
export type PlanPolicy = { planId: ConfigurablePlanId; weeklyBudgetMicros: number | null; storageLimitBytes: number | null; revision: number; updatedAt: string | null };
export type ManualPlanGrant = { id: string; planId: GrantPlanId; startsAt: string; expiresAt: string | null; revokedAt: string | null; actorId: string; reason: string };
export type BillingSubscription = { id: string; customerId: string; planId: GrantPlanId; environment: "sandbox" | "production"; status: string; periodEndsAt: string | null; scheduledEndsAt: string | null; occurredAt: string; priceId: string };
export type BillingAccount = { revision: number; grant: ManualPlanGrant | null; subscriptions: Record<string, BillingSubscription> };
export type AccountAccess = { plan: EffectivePlanId; source: "admin" | "manual" | "subscription" | "legacy" | "free"; expiresAt: string | null; weeklyBudgetMicros: number | null; storageLimitBytes: number | null; grant: ManualPlanGrant | null; subscriptions: BillingSubscription[]; revision: number; serverNow: string };
export type BillingAuditEntry = { id: string; action: string; actorId: string; planId: string | null; reason: string; createdAt: string; expiresAt: string | null };
export type AdminPlanUser = { uid: string; displayName: string; email: string; photoURL: string | null; access: AccountAccess };
export type PaddleReadiness = { enabled: boolean; environment: "sandbox" | "production"; ready: boolean; missing: string[]; plans: Partial<Record<GrantPlanId, boolean>> };
export type AdminPlansResponse = { users: AdminPlanUser[]; nextCursor: string | null; policies: PlanPolicy[]; paddle: PaddleReadiness };
export type AdminPlanDetail = { user: AdminPlanUser; history: BillingAuditEntry[]; policies: PlanPolicy[] };
