import type { DecodedIdToken } from "firebase-admin/auth";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { verifyAdminIdToken } from "../firebase/admin.js";

export type AuthenticatedUser = {
  uid: string;
  email: string | null;
  anonymous: boolean;
  token: DecodedIdToken;
};

export type AuthenticatedRequest = Request & { authUser?: AuthenticatedUser };
export type TokenVerifier = (token: string) => Promise<DecodedIdToken>;

export class AuthRequiredError extends Error {
  readonly status = 401;
  constructor() {
    super("Sign in required.");
    this.name = "AuthRequiredError";
  }
}

function bearerToken(request: Request): string {
  const value = request.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim() ?? "";
}

export function requireUser(verify: TokenVerifier = verifyAdminIdToken): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction) => {
    const token = bearerToken(request);
    if (!token) {
      response.status(401).json({ error: "Sign in required.", code: "auth_required" });
      return;
    }

    try {
      const decoded = await verify(token);
      if (!decoded.uid) throw new Error("Missing token uid");
      const authUser: AuthenticatedUser = {
        uid: decoded.uid,
        email: typeof decoded.email === "string" ? decoded.email : null,
        anonymous: decoded.firebase?.sign_in_provider === "anonymous",
        token: decoded,
      };
      (request as AuthenticatedRequest).authUser = authUser;
      next();
    } catch {
      response.status(401).json({ error: "Your session could not be verified. Sign in again.", code: "invalid_session" });
    }
  };
}
