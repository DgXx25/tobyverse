import { AuthError, assertSignedInRequest, authErrorResponse } from "@/lib/api/assert";
import { isAdminEmail } from "@/lib/admin/constants";

export class AdminAuthError extends AuthError {
  constructor(message: string, status = 403) {
    super(message, status);
    this.name = "AdminAuthError";
  }
}

export async function assertAdminRequest(request: Request): Promise<string> {
  const session = await assertSignedInRequest(request);
  if (!isAdminEmail(session.email)) {
    throw new AdminAuthError("Admin access required.");
  }
  return session.uid;
}

export function adminErrorResponse(error: unknown): Response {
  return authErrorResponse(error);
}
