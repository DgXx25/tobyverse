import { assertAccountRequest } from "@/lib/api/assert";
import { billingErrorResponse } from "@/lib/billing/http";
import { readAiUsageSummary } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await assertAccountRequest(request);
    return Response.json({ usage: await readAiUsageSummary(session.uid) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
