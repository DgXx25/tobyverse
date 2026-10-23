import { assertAdminSession } from "@/lib/admin/assert";
import { assertBillingOrigin, mutatePlanPolicy } from "@/lib/billing/admin-server";
import { readPlanPolicies } from "@/lib/billing/account-server";
import { billingErrorResponse, billingJson } from "@/lib/billing/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await assertAdminSession(request);
    return Response.json({ policies: await readPlanPolicies() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return billingErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    assertBillingOrigin(request);
    const session = await assertAdminSession(request);
    return Response.json(await mutatePlanPolicy(session.uid, await billingJson(request)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return billingErrorResponse(error); }
}
