import { isAdminUid } from "../../../lib/admin/constants.js";
import { isPaidOnlyAiModel } from "../../../lib/ai/catalog.js";
import { asBillingAccount, planPolicies, resolveAccountAccess } from "../../../lib/billing/access.js";
import { FREE_BETA_WEEKLY_MICROS, utcWeekWindow } from "../../../lib/billing/plans.js";
import { MODEL_PRICES } from "../../../lib/billing/pricing.js";
import { getAdminAuth, getAdminFirestore } from "../firebase/admin.js";
import { JobExecutionError } from "./worker.js";

export type BudgetCheck = {
  plan: string;
  weeklyBudgetMicros: number | null;
  spentMicros: number;
  model: string;
};

export function assertBudgetAvailable(input: BudgetCheck): void {
  if (!MODEL_PRICES[input.model] && input.plan !== "admin") {
    throw new JobExecutionError("model_not_available", "That AI model is not available.", false);
  }
  if (input.plan !== "admin" && isPaidOnlyAiModel(input.model) && input.plan === "free_beta") {
    throw new JobExecutionError("paid_model_required", "This model is available on a paid plan.", false);
  }
  const allowance = input.weeklyBudgetMicros ?? FREE_BETA_WEEKLY_MICROS;
  if (input.plan !== "admin" && input.spentMicros >= allowance) {
    throw new JobExecutionError("weekly_ai_budget_exhausted", "Your weekly AI allowance is used up.", false);
  }
}

async function isAccountAdministrator(uid: string, profile: Record<string, unknown>): Promise<boolean> {
  if (isAdminUid(uid) || profile.admin === true) return true;
  if (profile.email !== "davit.gvakharia@gmail.com") return false;
  const user = await getAdminAuth().getUser(uid);
  return user.emailVerified && user.email?.toLowerCase() === "davit.gvakharia@gmail.com";
}

export async function assertJobBudget(uid: string, model: string): Promise<void> {
  const db = getAdminFirestore();
  const { weekStart } = utcWeekWindow();
  const [profile, account, config, usage] = await db.getAll(
    db.collection("users").doc(uid),
    db.collection("billingAccounts").doc(uid),
    db.collection("billingConfig").doc("plans"),
    db.collection("users").doc(uid).collection("aiUsageWeeks").doc(weekStart),
  );
  const profileData = profile.data() ?? {};
  const admin = await isAccountAdministrator(uid, profileData);
  const access = resolveAccountAccess({
    storedPlan: profileData.plan,
    admin,
    account: asBillingAccount(account.data()),
    policies: planPolicies(config.data()?.policies),
    environment: process.env.PADDLE_ENVIRONMENT === "production" ? "production" : "sandbox",
  });
  const spentMicros = typeof usage.get("costMicros") === "number" && Number.isFinite(usage.get("costMicros"))
    ? Math.max(0, Math.floor(usage.get("costMicros") as number))
    : 0;
  assertBudgetAvailable({
    plan: access.plan,
    weeklyBudgetMicros: access.weeklyBudgetMicros,
    spentMicros,
    model,
  });
}
