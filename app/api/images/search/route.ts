import { assertSignedInRequest, authErrorResponse } from "@/lib/api/assert";
import { allowImageSearch, clampImageCount, ImageSearchError, searchWebImages } from "@/lib/images/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let uid = "";
  try {
    const session = await assertSignedInRequest(request);
    uid = session.uid;
  } catch (error) {
    return authErrorResponse(error);
  }

  let body: { query?: unknown; count?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid search request." }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return Response.json({ error: "Missing search query." }, { status: 400 });
  }

  if (!allowImageSearch(uid)) {
    return Response.json({ error: "Too many image searches. Try again in a minute." }, { status: 429 });
  }

  const rawCount = typeof body.count === "number" ? body.count : typeof body.count === "string" ? Number(body.count) : NaN;

  try {
    const images = await searchWebImages(query, Number.isFinite(rawCount) ? clampImageCount(rawCount) : undefined);
    return Response.json({ images });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image search failed.";
    const status = error instanceof ImageSearchError && /missing/i.test(message) ? 400 : 502;
    return Response.json({ error: message }, { status });
  }
}
