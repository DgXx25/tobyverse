import { assertAdminSession, adminErrorResponse } from "@/lib/admin/assert";
import { readAdminReports } from "@/lib/admin/reports";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await assertAdminSession(request);
    return Response.json({ reports: await readAdminReports(session) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
