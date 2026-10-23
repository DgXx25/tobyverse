import { assertAdminSession } from "@/lib/admin/assert";
import { adminPlanDetail, assertBillingOrigin, mutateAdminGrant } from "@/lib/billing/admin-server";
import { billingErrorResponse, billingJson } from "@/lib/billing/http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ uid: string }> };
export async function GET(request: Request, context: Context) {
  try {
    await assertAdminSession(request);
    return Response.json(await adminPlanDetail((await context.params).uid), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return billingErrorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    assertBillingOrigin(request);
    const session = await assertAdminSession(request);
    return Response.json(await mutateAdminGrant((await context.params).uid, session.uid, await billingJson(request)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return billingErrorResponse(error); }
}
