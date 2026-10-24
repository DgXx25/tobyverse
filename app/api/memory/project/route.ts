import { assertAccountRequest, authErrorResponse } from "@/lib/api/assert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Older clients may expose this editor; project memory is no longer captured or used. */
export async function PUT(request: Request) {
  try {
    await assertAccountRequest(request);
    return Response.json({ error: "Project memory has been retired. Personal memory is available in account settings." }, { status: 410 });
  } catch (error) { return authErrorResponse(error); }
}
