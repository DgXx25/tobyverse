import { assertAccountRequest } from "@/lib/api/assert";
import { assertBillingOrigin } from "@/lib/billing/admin-server";
import { billingErrorResponse, billingJson } from "@/lib/billing/http";
import { changeAccountSubscriptionPlan } from "@/lib/billing/paddle-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertBillingOrigin(request);
    const session = await assertAccountRequest(request);
    return Response.json(await changeAccountSubscriptionPlan(session.uid, await billingJson(request)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
