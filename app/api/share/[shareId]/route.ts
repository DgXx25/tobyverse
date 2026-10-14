import { loadSharedChat } from "@/lib/sharing/server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await context.params;
  try {
    const snapshot = await loadSharedChat(shareId);
    if (!snapshot) return Response.json({ error: "Shared chat not found." }, { status: 404 });
    return Response.json(snapshot, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[api/share/read] failed", error);
    return Response.json({ error: "Could not load shared chat." }, { status: 500 });
  }
}
