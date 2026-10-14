import { COLLECTIONS } from "@/lib/firestore";
import { isAdminUid } from "@/lib/admin/constants";
import { getAdminFirestore } from "@/lib/server/firestore-admin";
import { uploadLimitForPlan, type MaterialUploadPlan } from "@/lib/materials/upload-cap";

export async function uploadPolicyForUser(uid: string): Promise<{ plan: MaterialUploadPlan; maxBytes: number }> {
  const user = await getAdminFirestore().collection(COLLECTIONS.users).doc(uid).get();
  const data = user.data() ?? {};
  const admin = data.admin === true || isAdminUid(uid) ||
    (typeof data.email === "string" && data.email.toLowerCase() === "davit.gvakharia@gmail.com");
  const stored = data.plan;
  const plan: MaterialUploadPlan = admin
    ? "admin"
    : stored === "lite" || stored === "pro" || stored === "max"
      ? stored
      : "free_beta";
  return { plan, maxBytes: uploadLimitForPlan(plan) };
}
