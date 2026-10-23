import { assertAccountRequest } from "@/lib/api/assert";
import { assertBillingOrigin } from "@/lib/billing/admin-server";
import { billingErrorResponse } from "@/lib/billing/http";
import { accountPortal } from "@/lib/billing/paddle-server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try { assertBillingOrigin(request); const session = await assertAccountRequest(request); return Response.json(await accountPortal(session.uid), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return billingErrorResponse(error); }
}
