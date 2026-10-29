import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/server/firestore-admin";
import { readAccountAccess } from "@/lib/billing/account-server";
import { DEFAULT_CLAUDE_MODEL, isAllowedAiModel } from "@/lib/ai/catalog";
import { createAiUsageCollector } from "@/lib/billing/collector";
import { FREE_BETA_WEEKLY_MICROS, utcWeekWindow } from "@/lib/billing/plans";
import { emptyAiUsageWeek, mergeAiUsage, MODEL_PRICES } from "@/lib/billing/pricing";
import type { AiUsageDelta, AiUsageReporter, AiUsageWeek, EffectivePlanId } from "@/types/billing";

const DEFAULT_MODEL = DEFAULT_CLAUDE_MODEL;

export class AiUsageLimitError extends Error {
  readonly code = "weekly_ai_budget_exhausted";
  readonly resetsAt: string;

  constructor(resetsAt: string) {
    super(`Your weekly AI allowance is used up. It resets at ${resetsAt}.`);
    this.name = "AiUsageLimitError";
    this.resetsAt = resetsAt;
  }
}

export class PremiumModelRequiredError extends Error {
  readonly code = "premium_model_required";
  constructor() {
    super("This model is available on Premium plans.");
    this.name = "PremiumModelRequiredError";
  }
}

export function decideAiBudget(input: { plan: EffectivePlanId; costMicros: number; resetsAt: string; weeklyBudgetMicros?: number | null }): { allowed: true } {
  if (input.plan !== "admin" && input.costMicros >= (input.weeklyBudgetMicros ?? FREE_BETA_WEEKLY_MICROS)) {
    throw new AiUsageLimitError(input.resetsAt);
  }
  return { allowed: true };
}

function n(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function mergeCommittedUsage(base: AiUsageWeek, delta: Partial<AiUsageDelta>): AiUsageWeek {
  const safe: AiUsageDelta = {
    inputTokens: n(delta.inputTokens),
    outputTokens: n(delta.outputTokens),
    thinkingTokens: n(delta.thinkingTokens),
    totalTokens: n(delta.totalTokens),
    cacheReadInputTokens: n(delta.cacheReadInputTokens),
    cacheWriteInputTokens: n(delta.cacheWriteInputTokens),
    cacheWrite1hInputTokens: n(delta.cacheWrite1hInputTokens),
    webSearchRequests: n(delta.webSearchRequests),
    requestCount: n(delta.requestCount),
    costMicros: n(delta.costMicros),
    byModel: delta.byModel ?? {},
    pricingVersion: delta.pricingVersion ?? base.pricingVersion,
  };
  return mergeAiUsage(base, safe);
}

function asWeek(weekStart: string, value: FirebaseFirestore.DocumentData | undefined): AiUsageWeek {
  return {
    ...emptyAiUsageWeek(weekStart),
    ...(value ?? {}),
    weekStart,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : null,
    byModel: value?.byModel && typeof value.byModel === "object" ? value.byModel : {},
  };
}

function weekRef(db: ReturnType<typeof getAdminFirestore>, uid: string, weekStart: string) {
  return db.collection("users").doc(uid).collection("aiUsageWeeks").doc(weekStart);
}

/** Current week's server-metered AI usage for the signed-in account's Plan & usage view. */
export async function readAiUsageSummary(uid: string) {
  const { weekStart, resetsAt } = utcWeekWindow();
  const snapshot = await weekRef(getAdminFirestore(), uid, weekStart).get();
  const week = asWeek(weekStart, snapshot.data());
  return { weekStart, resetsAt, costMicros: week.costMicros, requestCount: week.requestCount };
}

export type AiUsageSession = {
  plan: EffectivePlanId;
  weekStart: string;
  resetsAt: string;
  report: AiUsageReporter;
  commit(): Promise<void>;
};

export async function startAiUsageSession(uid: string, options: { models?: string[] } = {}): Promise<AiUsageSession> {
  const models = options.models?.length ? options.models : [DEFAULT_MODEL];
  const db = getAdminFirestore();
  const { weekStart, resetsAt } = utcWeekWindow();
  const [access, usageSnapshot] = await Promise.all([readAccountAccess(uid), weekRef(db, uid, weekStart).get()]);
  const plan = access.plan;
  if (models.some((model) => !isAllowedAiModel(model, plan))) throw new PremiumModelRequiredError();
  const unknown = models.find((model) => !MODEL_PRICES[model]);
  if (unknown && plan !== "admin") throw new Error(`No AI price configured for model ${unknown}`);
  const current = asWeek(weekStart, usageSnapshot.data());
  decideAiBudget({ plan, costMicros: current.costMicros, resetsAt, weeklyBudgetMicros: access.weeklyBudgetMicros });
  const collector = createAiUsageCollector({ allowUnpriced: plan === "admin" });
  let committed = false;

  return {
    plan,
    weekStart,
    resetsAt,
    report: collector.report,
    async commit() {
      if (committed) return;
      const delta = collector.snapshot();
      if (delta.requestCount === 0) {
        committed = true;
        return;
      }
      await db.runTransaction(async (transaction) => {
        const ref = weekRef(db, uid, weekStart);
        const snapshot = await transaction.get(ref);
        const latest = asWeek(weekStart, snapshot.data());
        const merged = mergeCommittedUsage(latest, delta);
        // Always record incurred usage, including the final request that crosses its budget.
        transaction.set(ref, {
          ...merged,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      committed = true;
    },
  };
}

export function aiUsageErrorResponse(error: unknown): Response {
  if (error instanceof PremiumModelRequiredError) {
    return Response.json({ error: error.message, code: error.code }, { status: 403 });
  }
  if (error instanceof AiUsageLimitError) {
    return Response.json({ error: error.message, code: error.code, resetsAt: error.resetsAt }, { status: 429 });
  }
  console.error("[ai-usage] access check failed", error instanceof Error ? error.name : "Error");
  return Response.json({ error: "Account access could not be checked. Please try again shortly." }, { status: 503 });
}
