import { assertSignedInRequest, authErrorResponse } from "@/lib/api/assert";
import { ImageSearchError, searchWebImages } from "@/lib/images/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await assertSignedInRequest(request);
  } catch (error) {
    return authErrorResponse(error);
  }

  let body: { query?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return Response.json({ error: "query is required." }, { status: 400 });
  }

  try {
    const images = await searchWebImages(query);
    return Response.json({ images });
  } catch (error) {
    const message = error instanceof ImageSearchError ? error.message : "Image search failed.";
    const status = error instanceof ImageSearchError ? 422 : 500;
    return Response.json({ error: message, images: [] }, { status });
  }
}
