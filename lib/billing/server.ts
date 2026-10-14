import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/server/firestore-admin";
import { isAdminUid } from "@/lib/admin/constants";
import { DEFAULT_GEMINI_MODEL } from "@/lib/ai/catalog";
import { createAiUsageCollector } from "@/lib/billing/collector";
import { FREE_BETA_WEEKLY_MICROS, resolveEffectivePlan, utcWeekWindow } from "@/lib/billing/plans";
import { emptyAiUsageWeek, mergeAiUsage, MODEL_PRICES } from "@/lib/billing/pricing";
import type { AiUsageDelta, AiUsageReporter, AiUsageWeek, EffectivePlanId } from "@/types/billing";

const DEFAULT_MODEL = DEFAULT_GEMINI_MODEL;
const LEGACY_ADMIN_EMAIL = "davit.gvakharia@gmail.com";

export class AiUsageLimitError extends Error {
  readonly code = "weekly_ai_budget_exhausted";
  readonly resetsAt: string;

  constructor(resetsAt: string) {
    super(`Your weekly AI beta budget is used up. It resets at ${resetsAt}.`);
    this.name = "AiUsageLimitError";
    this.resetsAt = resetsAt;
  }
}

export function decideAiBudget(input: { plan: EffectivePlanId; costMicros: number; resetsAt: string }): { allowed: true } {
  if (input.plan !== "admin" && input.costMicros >= FREE_BETA_WEEKLY_MICROS) {
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

export type AiUsageSession = {
  plan: EffectivePlanId;
  weekStart: string;
  resetsAt: string;
  report: AiUsageReporter;
  commit(): Promise<void>;
};

function missingServerCredentials(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /default credentials|certificate credential|Server Firebase is not signed in|invalid-credential|Unable to detect a Project Id/i.test(message);
}

/** Generation must not stop because this machine has no Google service account. */
function skippedUsageSession(): AiUsageSession {
  const { weekStart, resetsAt } = utcWeekWindow();
  const collector = createAiUsageCollector({ allowUnpriced: true });
  return {
    plan: "free_beta",
    weekStart,
    resetsAt,
    report: collector.report,
    async commit() {},
  };
}

export async function startAiUsageSession(uid: string, options: { models?: string[] } = {}): Promise<AiUsageSession> {
  const models = options.models?.length ? options.models : [DEFAULT_MODEL];
  let db: ReturnType<typeof getAdminFirestore>;
  try {
    db = getAdminFirestore();
  } catch (error) {
    if (missingServerCredentials(error)) return skippedUsageSession();
    throw error;
  }
  const { weekStart, resetsAt } = utcWeekWindow();
  let profileSnapshot;
  let usageSnapshot;
  try {
    [profileSnapshot, usageSnapshot] = await Promise.all([
      db.collection("users").doc(uid).get(),
      weekRef(db, uid, weekStart).get(),
    ]);
  } catch (error) {
    if (missingServerCredentials(error)) return skippedUsageSession();
    throw error;
  }
  const profile = profileSnapshot.data() ?? {};
  const plan = resolveEffectivePlan({
    storedPlan: profile.plan,
    admin: isAdminUid(uid) || profile.admin === true || profile.email === LEGACY_ADMIN_EMAIL,
  });
  const unknown = models.find((model) => !MODEL_PRICES[model]);
  if (unknown && plan !== "admin") throw new Error(`No AI price configured for model ${unknown}`);
  const current = asWeek(weekStart, usageSnapshot.data());
  decideAiBudget({ plan, costMicros: current.costMicros, resetsAt });
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
        decideAiBudget({ plan, costMicros: merged.costMicros, resetsAt });
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
  if (error instanceof AiUsageLimitError) {
    return Response.json({ error: error.message, code: error.code, resetsAt: error.resetsAt }, { status: 429 });
  }
  const message = error instanceof Error ? error.message : "AI usage could not be started.";
  return Response.json({ error: message }, { status: 500 });
}
