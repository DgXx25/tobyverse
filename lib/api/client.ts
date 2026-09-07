import { requireSignedInUser } from "@/lib/auth";

export async function getIdToken(): Promise<string> {
  const user = await requireSignedInUser();
  return user.getIdToken();
}

export async function authHeaders(json = true): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await getIdToken()}`,
  };
  if (json) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}
