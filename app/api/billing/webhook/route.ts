import { paddleConfiguration, parsePaddleSubscriptionEvent, verifyPaddleSignature } from "@/lib/billing/paddle";
import { applyPaddleSubscription } from "@/lib/billing/paddle-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const config = paddleConfiguration();
  if (!config.webhookSecret) return Response.json({ error: "Webhook is not configured." }, { status: 503 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Missing payload." }, { status: 400 });
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262_144) return Response.json({ error: "Payload too large." }, { status: 413 });
      parts.push(value);
    }
  } finally { void reader.cancel().catch(() => undefined); }
  const raw = Buffer.concat(parts);
  if (!verifyPaddleSignature(raw, request.headers.get("paddle-signature"), config.webhookSecret)) return Response.json({ error: "Invalid signature." }, { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return Response.json({ error: "Invalid payload." }, { status: 400 }); }
  const event = parsePaddleSubscriptionEvent(payload);
  if (!event) {
    const type = payload && typeof payload === "object" && "event_type" in payload ? payload.event_type : "";
    return typeof type === "string" && type.startsWith("subscription.") ? Response.json({ error: "Invalid subscription payload." }, { status: 400 }) : Response.json({ received: true, ignored: true });
  }
  try { await applyPaddleSubscription(event); return Response.json({ received: true }); }
  catch (error) { console.error("[paddle-webhook] provisioning failed", event.eventId, error instanceof Error ? error.name : "Error"); return Response.json({ error: "Provisioning could not be completed. Retry delivery." }, { status: 503 }); }
}
