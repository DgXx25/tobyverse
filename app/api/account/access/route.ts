import { assertAccountRequest } from "@/lib/api/assert";
import { readAccountAccess } from "@/lib/billing/account-server";
import { billingErrorResponse } from "@/lib/billing/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const session = await assertAccountRequest(request);
    return Response.json({ access: await readAccountAccess(session.uid) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return billingErrorResponse(error); }
}
