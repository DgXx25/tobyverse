import { AuthError, assertSignedInRequest, authErrorResponse, readIdToken } from "@/lib/api/assert";
import { isAdminUid } from "@/lib/admin/constants";

export type AdminSession = { uid: string; token: string };

export class AdminAuthError extends AuthError {
  constructor(message: string, status = 404) {
    super(message, status);
    this.name = "AdminAuthError";
  }
}

export async function assertAdminSession(request: Request): Promise<AdminSession> {
  const session = await assertSignedInRequest(request);
  const token = await readIdToken(request);
  if (isAdminUid(session.uid) || (session.emailVerified === true && session.email?.toLowerCase() === "davit.gvakharia@gmail.com")) {
    return { uid: session.uid, token };
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!projectId) throw new AuthError("Firebase project ID is not configured.", 500);
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(session.uid)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (response.status === 404) throw new AdminAuthError("Not found.");
  if (!response.ok) throw new AuthError("Could not verify admin access.", 500);
  const user = await response.json() as { fields?: { admin?: { booleanValue?: boolean } } };
  if (user.fields?.admin?.booleanValue !== true) {
    throw new AdminAuthError("Not found.");
  }
  return { uid: session.uid, token };
}

export async function assertAdminRequest(request: Request): Promise<string> {
  return (await assertAdminSession(request)).uid;
}

export function adminErrorResponse(error: unknown): Response {
  return authErrorResponse(error);
}
