import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { PLAN_CATALOG } from "@/lib/billing/plans";
import type { GrantPlanId, PaddleReadiness } from "@/types/billing-admin";

type PaddleEnvironment = "sandbox" | "production";
type PaddleConfiguration = {
  enabled: boolean;
  environment: PaddleEnvironment;
  apiKey: string;
  clientToken: string;
  webhookSecret: string;
  priceIds: Partial<Record<GrantPlanId, string>>;
  checkoutUrl: string;
};

const PRICE_ENV = {
  lite: "PADDLE_PRICE_LITE", pro: "PADDLE_PRICE_PRO", max: "PADDLE_PRICE_MAX", team: "PADDLE_PRICE_TEAM",
} satisfies Record<GrantPlanId, string>;
const PLANS = Object.keys(PRICE_ENV) as GrantPlanId[];
const PRICE_ID = /^pri_[a-z\d]{26}$/;
const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created", "subscription.updated", "subscription.activated", "subscription.trialing",
  "subscription.resumed", "subscription.paused", "subscription.canceled", "subscription.past_due",
]);
const SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "paused", "canceled"]);

function env(name: string): string { return (process.env[name] ?? "").trim(); }

/** Server only: never serialize this object or import it into a client component. */
export function paddleConfiguration(): PaddleConfiguration {
  const priceIds: PaddleConfiguration["priceIds"] = {};
  for (const plan of PLANS) {
    const priceId = env(PRICE_ENV[plan]);
    if (priceId) priceIds[plan] = priceId;
  }
  return {
    enabled: process.env.PADDLE_BILLING_ENABLED === "1",
    // An invalid value remains unready; it can never select the production API.
    environment: env("PADDLE_ENVIRONMENT") === "production" ? "production" : "sandbox",
    apiKey: env("PADDLE_API_KEY"), clientToken: env("PADDLE_CLIENT_TOKEN"),
    webhookSecret: env("PADDLE_WEBHOOK_SECRET"), priceIds, checkoutUrl: env("PADDLE_CHECKOUT_URL"),
  };
}

function validCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return value.length <= 2048 && url.protocol === "https:" && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

/** Safe diagnostic data for administrator responses; credentials and prices are omitted. */
export function paddleReadiness(): PaddleReadiness {
  const config = paddleConfiguration();
  const missing: string[] = [];
  const rawEnvironment = env("PADDLE_ENVIRONMENT");
  if (rawEnvironment && rawEnvironment !== "sandbox" && rawEnvironment !== "production") missing.push("PADDLE_ENVIRONMENT");
  const keyEnvironment = config.environment === "sandbox" ? "sdbx" : "live";
  const apiKeyPattern = new RegExp(`^pdl_${keyEnvironment}_apikey_[a-z\\d]{26}_[a-zA-Z\\d]{22}_[a-zA-Z\\d]{3}$`);
  if (!apiKeyPattern.test(config.apiKey)) missing.push("PADDLE_API_KEY");
  const clientPrefix = config.environment === "sandbox" ? "test" : "live";
  if (!new RegExp(`^${clientPrefix}_[a-zA-Z\\d_-]+$`).test(config.clientToken)) missing.push("PADDLE_CLIENT_TOKEN");
  if (!/^pdl_ntfset_\S+$/.test(config.webhookSecret)) missing.push("PADDLE_WEBHOOK_SECRET");
  if (!validCheckoutUrl(config.checkoutUrl)) missing.push("PADDLE_CHECKOUT_URL");
  const plans: PaddleReadiness["plans"] = {};
  const prices = Object.values(config.priceIds);
  for (const plan of PLANS) {
    const price = config.priceIds[plan];
    plans[plan] = !!price && PRICE_ID.test(price) && prices.filter((candidate) => candidate === price).length === 1;
    if (price && !plans[plan]) missing.push(PRICE_ENV[plan]);
  }
  if (!prices.length) missing.push("PADDLE_PRICE_MAPPING");
  return { enabled: config.enabled, environment: config.environment, ready: config.enabled && missing.length === 0, missing, plans };
}

/** Verify exact bytes before parsing JSON. The five-second window also rejects future signatures. */
export function verifyPaddleSignature(rawBody: Uint8Array | string, signature: string | null, secret: string, nowMs = Date.now()): boolean {
  if (!signature || signature.length > 4096 || !secret || !Number.isFinite(nowMs)) return false;
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of signature.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) return false;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name === "ts") {
      if (timestamp !== null || !/^\d{1,16}$/.test(value)) return false;
      timestamp = value;
    } else if (name === "h1") {
      if (!/^[a-fA-F\d]{64}$/.test(value)) return false;
      signatures.push(value);
    }
  }
  if (!timestamp || !signatures.length) return false;
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isSafeInteger(timestampMs) || Math.abs(nowMs - timestampMs) > 5000) return false;
  const digest = createHmac("sha256", secret).update(`${timestamp}:`).update(rawBody).digest();
  // Paddle may send multiple h1 values while a destination secret is rotating.
  let matched = false;
  for (const value of signatures) matched = timingSafeEqual(digest, Buffer.from(value, "hex")) || matched;
  return matched;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown, maxLength = 256): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}
function date(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}

export type PaddleSubscriptionEvent = {
  eventId: string; eventType: string; occurredAt: string; subscriptionId: string; customerId: string;
  status: string; priceIds: string[]; periodEndsAt: string | null; scheduledEndsAt: string | null;
  checkoutId: string | null; uid: string | null; transactionId: string | null;
};

/** Normalization is not authorization. The caller must verify signatures and persisted bindings. */
export function parsePaddleSubscriptionEvent(raw: unknown): PaddleSubscriptionEvent | null {
  const event = object(raw);
  const data = object(event?.data);
  if (!event || !data) return null;
  const eventId = text(event.event_id);
  const eventType = text(event.event_type);
  const occurredAt = date(event.occurred_at);
  const subscriptionId = text(data.id);
  const customerId = text(data.customer_id);
  const status = text(data.status);
  if (!eventId || !/^evt_[a-z\d]{26}$/.test(eventId) || !eventType || !SUBSCRIPTION_EVENTS.has(eventType)
    || !occurredAt || !subscriptionId || !/^sub_[a-z\d]{26}$/.test(subscriptionId)
    || !customerId || !/^ctm_[a-z\d]{26}$/.test(customerId) || !status || !SUBSCRIPTION_STATUSES.has(status)
    || !Array.isArray(data.items) || data.items.length === 0 || data.items.length > 100) return null;
  const priceIds: string[] = [];
  for (const item of data.items) {
    const priceId = text(object(object(item)?.price)?.id);
    if (!priceId || !PRICE_ID.test(priceId)) return null;
    priceIds.push(priceId);
  }
  const period = object(data.current_billing_period);
  const periodEndsAt = date(period?.ends_at);
  if (data.current_billing_period != null && (!period || !periodEndsAt)) return null;
  const scheduled = object(data.scheduled_change);
  let scheduledEndsAt: string | null = null;
  if (data.scheduled_change != null) {
    if (!scheduled || !["cancel", "pause", "resume"].includes(String(scheduled.action)) || !date(scheduled.effective_at)) return null;
    if (scheduled.action === "cancel" || scheduled.action === "pause") scheduledEndsAt = date(scheduled.effective_at);
  }
  const custom = object(data.custom_data);
  return {
    eventId, eventType, occurredAt, subscriptionId, customerId, status, priceIds,
    periodEndsAt, scheduledEndsAt, checkoutId: text(custom?.checkout_id), uid: text(custom?.uid, 128),
    transactionId: typeof data.transaction_id === "string" && /^txn_[a-z\d]{26}$/.test(data.transaction_id) ? data.transaction_id : null,
  };
}

/** Verify the provider's current price before creating any transaction. No cached catalog claim is trusted. */
export async function validatePaddlePrice(priceId: string, planId: GrantPlanId): Promise<void> {
  const config = paddleConfiguration();
  if (!paddleReadiness().ready) throw new Error("Paddle billing is not configured.");
  const expectedAmount = PLAN_CATALOG[planId]?.monthlyPriceCents;
  if (!Number.isSafeInteger(expectedAmount) || expectedAmount === null || expectedAmount === undefined || expectedAmount <= 0) throw new Error("This plan is unavailable for self-service checkout.");
  if (!PRICE_ID.test(priceId) || config.priceIds[planId] !== priceId) throw new Error("Invalid Paddle plan price.");
  const api = config.environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  const response = await fetch(`${api}/prices/${priceId}`, {
    method: "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${config.apiKey}`, "Paddle-Version": "1" },
  });
  if (!response.ok) throw new Error(`Paddle plan price could not be verified (${response.status}).`);
  const payload: unknown = await response.json();
  const price = object(object(payload)?.data);
  const cycle = object(price?.billing_cycle);
  const unitPrice = object(price?.unit_price);
  if (!price || price.id !== priceId || price.status !== "active"
    || typeof price.product_id !== "string" || !/^pro_[a-z\d]{26}$/.test(price.product_id)
    || cycle?.interval !== "month" || cycle.frequency !== 1
    || unitPrice?.currency_code !== "USD" || unitPrice.amount !== String(expectedAmount)) throw new Error("Paddle price does not match the published monthly plan.");
  // Country overrides must not silently replace the advertised USD amount/currency.
  if (price.unit_price_overrides != null) {
    if (!Array.isArray(price.unit_price_overrides)) throw new Error("Invalid Paddle price overrides.");
    for (const override of price.unit_price_overrides) {
      const amount = object(object(override)?.unit_price);
      if (amount?.currency_code !== "USD" || amount.amount !== String(expectedAmount)) throw new Error("Paddle price overrides do not match the published monthly plan.");
    }
  }
}

/** The route must authorize customer ownership. Return this temporary URL with no-store headers. */
export async function createPaddlePortalSession(customerId: string): Promise<{ url: string }> {
  const config = paddleConfiguration();
  // Existing subscribers must be able to cancel even when new purchases are disabled.
  const invalidConnection = paddleReadiness().missing.some((name) => name === "PADDLE_ENVIRONMENT" || name === "PADDLE_API_KEY");
  if (invalidConnection || !/^ctm_[a-z\d]{26}$/.test(customerId)) throw new Error("Paddle subscription management is unavailable.");
  const api = config.environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  const response = await fetch(`${api}/customers/${customerId}/portal-sessions`, {
    method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${config.apiKey}`, "Paddle-Version": "1" },
  });
  if (!response.ok) throw new Error(`Paddle subscription management could not be opened (${response.status}).`);
  const payload: unknown = await response.json();
  const data = object(object(payload)?.data);
  const overview = text(object(object(data?.urls)?.general)?.overview, 16384);
  if (data?.customer_id !== customerId || typeof data.id !== "string" || !/^cpls_[a-z\d]{26}$/.test(data.id) || !overview) throw new Error("Paddle returned an invalid portal session.");
  let url: URL;
  try { url = new URL(overview); } catch { throw new Error("Paddle returned an invalid portal URL."); }
  const expectedHost = config.environment === "sandbox" ? "sandbox-customer-portal.paddle.com" : "customer-portal.paddle.com";
  if (url.protocol !== "https:" || url.hostname !== expectedHost || url.port || url.username || url.password || url.hash
    || !/^\/cpl_[a-z\d]{26}$/.test(url.pathname) || url.searchParams.get("action") !== "overview" || !url.searchParams.get("token")) throw new Error("Paddle returned an invalid portal URL.");
  return { url: url.href };
}

/** Creates an unpaid transaction only; entitlement changes belong to the verified webhook handler. */
export async function createPaddleTransaction(input: { priceId: string; checkoutId: string; uid: string; customerId?: string }): Promise<{ transactionId: string; checkoutUrl: string | null }> {
  const config = paddleConfiguration();
  if (!paddleReadiness().ready) throw new Error("Paddle billing is not configured.");
  if (!Object.values(config.priceIds).includes(input.priceId) || !text(input.checkoutId) || !text(input.uid, 128)
    || (input.customerId !== undefined && !/^ctm_[a-z\d]{26}$/.test(input.customerId))) throw new Error("Invalid Paddle checkout request.");
  const planId = PLANS.find((plan) => config.priceIds[plan] === input.priceId);
  if (!planId) throw new Error("Invalid Paddle plan price.");
  await validatePaddlePrice(input.priceId, planId);
  const api = config.environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  const response = await fetch(`${api}/transactions`, {
    method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Paddle-Version": "1" },
    body: JSON.stringify({
      items: [{ price_id: input.priceId, quantity: 1 }], collection_mode: "automatic",
      ...(input.customerId ? { customer_id: input.customerId } : {}),
      custom_data: { checkout_id: input.checkoutId, uid: input.uid }, checkout: { url: config.checkoutUrl },
    }),
  });
  // Provider error bodies can contain customer details; never copy them into application errors.
  if (!response.ok) throw new Error(`Paddle checkout could not be prepared (${response.status}).`);
  const payload: unknown = await response.json();
  const data = object(object(payload)?.data);
  const transactionId = text(data?.id);
  if (!transactionId || !/^txn_[a-z\d]{26}$/.test(transactionId) || !["draft", "ready"].includes(String(data?.status))) throw new Error("Paddle returned an invalid transaction.");
  const returnedUrl = text(object(data?.checkout)?.url, 2048);
  let checkoutUrl: string | null = null;
  if (returnedUrl) {
    try {
      const url = new URL(returnedUrl);
      const approved = new URL(config.checkoutUrl);
      if (url.origin === approved.origin && url.pathname === approved.pathname && !url.username && !url.password && url.searchParams.get("_ptxn") === transactionId) checkoutUrl = url.href;
    } catch { /* The browser can still open the validated transaction ID. */ }
  }
  return { transactionId, checkoutUrl };
}

/** Changes the single recurring item on an owned subscription after re-reading it from Paddle. */
export async function changePaddleSubscriptionPlan(input: { subscriptionId: string; customerId: string; currentPriceId: string; targetPlanId: GrantPlanId; lowerPrice: boolean }): Promise<void> {
  const config = paddleConfiguration();
  const targetPriceId = config.priceIds[input.targetPlanId];
  if (!paddleReadiness().ready || !targetPriceId || !/^sub_[a-z\d]{26}$/.test(input.subscriptionId) || !/^ctm_[a-z\d]{26}$/.test(input.customerId)) throw new Error("Paddle subscription change is not configured.");
  await validatePaddlePrice(targetPriceId, input.targetPlanId);
  const api = config.environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  const headers = { Authorization: `Bearer ${config.apiKey}`, "Paddle-Version": "1" };
  const currentResponse = await fetch(`${api}/subscriptions/${input.subscriptionId}`, { headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!currentResponse.ok) throw new Error(`Paddle subscription could not be verified (${currentResponse.status}).`);
  const current = object(object(await currentResponse.json())?.data);
  const items = Array.isArray(current?.items) ? current.items : [];
  const item = items.length === 1 ? object(items[0]) : null;
  const price = object(item?.price);
  if (current?.id !== input.subscriptionId || current.customer_id !== input.customerId || !["active", "trialing"].includes(String(current.status))
    || current.scheduled_change != null || price?.id !== input.currentPriceId || !Number.isSafeInteger(item?.quantity) || Number(item?.quantity) < 1) {
    throw new Error("Paddle subscription is not eligible for this plan change.");
  }
  const response = await fetch(`${api}/subscriptions/${input.subscriptionId}`, {
    method: "PATCH", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000),
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ price_id: targetPriceId, quantity: item!.quantity }],
      proration_billing_mode: input.lowerPrice ? "prorated_next_billing_period" : "prorated_immediately",
    }),
  });
  if (!response.ok) throw new Error(`Paddle subscription change failed (${response.status}).`);
  const updated = object(object(await response.json())?.data);
  const updatedItem = Array.isArray(updated?.items) && updated.items.length === 1 ? object(updated.items[0]) : null;
  if (updated?.id !== input.subscriptionId || updated.customer_id !== input.customerId || object(updatedItem?.price)?.id !== targetPriceId) throw new Error("Paddle returned an invalid subscription update.");
}
