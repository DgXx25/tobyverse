import { getAdminAuth, getAdminFirestore } from "@/lib/server/firestore-admin";
import { isAdminUid } from "@/lib/admin/constants";
import { asBillingAccount, planPolicies, resolveAccountAccess } from "./access";
import type { AccountAccess, PlanPolicy } from "@/types/billing-admin";
import { paddleConfiguration } from "./paddle";

export const billingAccountRef = (uid: string) => getAdminFirestore().collection("billingAccounts").doc(uid);
export const billingPoliciesRef = () => getAdminFirestore().collection("billingConfig").doc("plans");

/** The legacy bootstrap identity is checked in Auth, never in the client-editable profile. */
export async function billingAdministrator(uid: string, profile: Record<string, unknown>): Promise<boolean> {
  if (isAdminUid(uid) || profile.admin === true) return true;
  if (profile.email !== "davit.gvakharia@gmail.com") return false;
  const user = await getAdminAuth().getUser(uid);
  return user.emailVerified && user.email?.toLowerCase() === "davit.gvakharia@gmail.com";
}

export async function readPlanPolicies(): Promise<PlanPolicy[]> {
  return planPolicies((await billingPoliciesRef().get()).data()?.policies);
}

export async function readAccountAccess(uid: string): Promise<AccountAccess> {
  const db = getAdminFirestore();
  const [profile, account, config] = await db.getAll(db.collection("users").doc(uid), billingAccountRef(uid), billingPoliciesRef());
  const data = profile.data() ?? {};
  return resolveAccountAccess({ storedPlan: data.plan, admin: await billingAdministrator(uid, data), account: asBillingAccount(account.data()), policies: planPolicies(config.data()?.policies), environment: paddleConfiguration().environment });
}
