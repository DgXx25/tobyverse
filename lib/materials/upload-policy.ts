import { readAccountAccess } from "@/lib/billing/account-server";
import { uploadLimitForPlan, type MaterialUploadPlan } from "@/lib/materials/upload-cap";

export async function uploadPolicyForUser(uid: string): Promise<{ plan: MaterialUploadPlan; maxBytes: number }> {
  const access = await readAccountAccess(uid);
  const plan: MaterialUploadPlan = access.plan === "team" ? "max" : access.plan;
  return { plan, maxBytes: uploadLimitForPlan(plan) };
}
