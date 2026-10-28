import { verifyAdminIdToken } from "@/lib/server/firestore-admin";

export type AuthSession = {
  uid: string;
  email: string | null;
  emailVerified?: boolean;
  anonymous: boolean;
};

export class AuthError extends Error {
  readonly status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export async function readIdToken(request: Request): Promise<string> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    throw new AuthError("Sign in required.");
  }
  return token;
}

export async function assertSignedInRequest(request: Request): Promise<AuthSession> {
  const token = await readIdToken(request);
  let decoded;
  try {
    // Firebase Admin validates the signature against Google's cached public certs.
    // Identity Toolkit accounts:lookup did a network user lookup on every API call.
    decoded = await verifyAdminIdToken(token);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code.startsWith("auth/")) throw new AuthError("Invalid session.");
    throw new AuthError("Could not verify session.", 503);
  }
  const uid = decoded.uid;
  if (!uid) {
    throw new AuthError("Invalid session.");
  }

  return {
    uid,
    email: decoded.email ?? null,
    emailVerified: decoded.email_verified === true,
    anonymous: decoded.firebase?.sign_in_provider === "anonymous",
  };
}

export async function assertAccountRequest(request: Request): Promise<AuthSession> {
  const session = await assertSignedInRequest(request);
  if (session.anonymous) {
    throw new AuthError("Sign in with Google to continue.", 403);
  }
  return session;
}

export function authErrorResponse(error: unknown): Response {
  const status = error instanceof AuthError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Request failed.";
  return Response.json({ error: message }, { status });
}
