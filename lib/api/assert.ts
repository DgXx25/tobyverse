export type AuthSession = {
  uid: string;
  email: string | null;
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
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey) {
    throw new AuthError("Firebase API key is not configured.", 500);
  }

  let response: Response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      },
    );
  } catch {
    throw new AuthError("Could not verify session.");
  }

  if (!response.ok) {
    throw new AuthError("Invalid session.");
  }

  const data = (await response.json()) as {
    users?: { email?: string; localId?: string }[];
  };
  const uid = data.users?.[0]?.localId;
  if (!uid) {
    throw new AuthError("Invalid session.");
  }

  return { uid, email: data.users?.[0]?.email ?? null };
}

export function authErrorResponse(error: unknown): Response {
  const status = error instanceof AuthError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Request failed.";
  return Response.json({ error: message }, { status });
}
