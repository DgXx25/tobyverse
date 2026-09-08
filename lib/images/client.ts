import { authHeaders } from "@/lib/api/client";
import type { ChatImageHit } from "@/types/chat";

export class ImageSearchRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ImageSearchRequestError";
    this.status = status;
  }
}

export async function searchImagesClient(query: string): Promise<ChatImageHit[]> {
  let response: Response;
  try {
    response = await fetch("/api/images/search", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ query }),
    });
  } catch {
    throw new ImageSearchRequestError("Could not reach image search.", 0);
  }
  const data = (await response.json().catch(() => ({}))) as { images?: ChatImageHit[]; error?: string };
  if (!response.ok) {
    throw new ImageSearchRequestError(
      data.error?.trim() || (response.status === 401 ? "Sign in." : "Image search failed."),
      response.status,
    );
  }
  return Array.isArray(data.images) ? data.images : [];
}
