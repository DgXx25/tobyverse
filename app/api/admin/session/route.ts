import { assertAdminRequest, adminErrorResponse } from "@/lib/admin/assert";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const uid = await assertAdminRequest(request);
    return Response.json({ uid }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
