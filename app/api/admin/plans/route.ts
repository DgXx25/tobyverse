import { assertAdminSession } from "@/lib/admin/assert";
import { listAdminPlans } from "@/lib/billing/admin-server";
import { billingErrorResponse } from "@/lib/billing/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await assertAdminSession(request);
    const url = new URL(request.url);
    return Response.json(await listAdminPlans(url.searchParams.get("search") ?? "", url.searchParams.get("cursor") ?? ""), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return billingErrorResponse(error); }
}
