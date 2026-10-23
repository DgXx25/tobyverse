import { ZodError } from "zod";
import { AuthError, authErrorResponse } from "@/lib/api/assert";

export async function billingJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError("A request body is required.", 400);
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) throw new AuthError("Request too large.", 413);
      parts.push(value);
    }
  } finally { void reader.cancel().catch(() => undefined); }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { throw new AuthError("Invalid request body.", 400); }
}

export function billingErrorResponse(error: unknown): Response {
  if (error instanceof ZodError) return Response.json({ error: "Check the plan, duration, allowance and required reason." }, { status: 400 });
  if (error instanceof AuthError) return authErrorResponse(error);
  // Log only fixed, non-sensitive diagnostics. Never forward provider bodies, arbitrary
  // error messages, credentials, or customer data into application logs.
  const message = error instanceof Error ? error.message : "";
  const status = message.match(/^Paddle (?:plan price could not be verified|checkout could not be prepared) \((\d{3})\)\.$/)?.[1];
  const subscriptionStatus = message.match(/^Paddle subscription (?:could not be verified|change failed) \((\d{3})\)\.$/)?.[1];
  const diagnostic = status
    ? `paddle_http_${status}`
    : subscriptionStatus
      ? `paddle_subscription_http_${subscriptionStatus}`
    : message === "Paddle billing is not configured."
      ? "paddle_not_configured"
      : message === "Paddle plan price does not match the published monthly plan."
        ? "paddle_price_mismatch"
        : message === "Paddle returned an invalid transaction."
          ? "paddle_invalid_transaction"
          : error instanceof TypeError
            ? "network_error"
            : "unclassified_error";
  console.error("[billing] request failed", error instanceof Error ? error.name : "Error", diagnostic);
  return Response.json({ error: "Billing controls are temporarily unavailable. Try again." }, { status: 503 });
}
