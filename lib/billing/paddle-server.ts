import { createHash } from "node:crypto";
import { z } from "zod";
import { AuthError } from "@/lib/api/assert";
import { getAdminFirestore } from "@/lib/server/firestore-admin";
import { asBillingAccount, grantPlanSchema, planPolicies, subscriptionExpiry } from "./access";
import { billingAccountRef, billingPoliciesRef, readAccountAccess } from "./account-server";
import { changePaddleSubscriptionPlan, createPaddlePortalSession, createPaddleTransaction, paddleConfiguration, paddleReadiness, type PaddleSubscriptionEvent } from "./paddle";
import { PLAN_CATALOG } from "./plans";
import type { BillingAccount, BillingSubscription, GrantPlanId } from "@/types/billing-admin";

const checkoutSchema = z.object({ planId: grantPlanSchema, requestId: z.string().uuid() }).strict();
const subscriptionChangeSchema = z.object({ planId: grantPlanSchema }).strict();
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (value: unknown) => typeof value === "string" ? value : "";
const key = (value: string) => createHash("sha256").update(value).digest("hex");
const active = (subscription: BillingSubscription, environment: string) => subscription.environment === environment && ["active", "trialing"].includes(subscription.status) && Date.parse(subscriptionExpiry(subscription) ?? "") > Date.now();
const checkouts = () => getAdminFirestore().collection("billingCheckouts");
// Preserve the provider's sub-millisecond precision (Date alone keeps only milliseconds).
const eventOrder = (value: string) => BigInt(Math.floor(Date.parse(value) / 1000)) * BigInt(1_000_000_000) + BigInt((value.match(/\.(\d+)/)?.[1] ?? "").padEnd(9, "0").slice(0, 9));
const statusPriority = (status: string) => ["active", "trialing"].includes(status) ? 0 : 1;

export async function checkoutAvailability(uid: string) {
  const config = paddleConfiguration();
  const readiness = paddleReadiness();
  const [access, policies] = await Promise.all([readAccountAccess(uid), billingPoliciesRef().get()]);
  const configured = planPolicies(policies.data()?.policies);
  const sandboxUser = access.source === "admin" || (process.env.PADDLE_SANDBOX_UIDS ?? "").split(",").map((id) => id.trim()).includes(uid);
  const ready = readiness.ready && (config.environment !== "sandbox" || sandboxUser);
  return { ready, environment: config.environment, clientToken: ready ? config.clientToken : "", allowances: Object.fromEntries(configured.map((policy) => [policy.planId, policy.weeklyBudgetMicros])), storageLimits: Object.fromEntries(configured.map((policy) => [policy.planId, policy.storageLimitBytes])), plans: Object.fromEntries(configured.filter((policy) => policy.planId !== "free_beta").map((policy) => [policy.planId, ready && !!readiness.plans[policy.planId as GrantPlanId] && policy.weeklyBudgetMicros != null && PLAN_CATALOG[policy.planId].monthlyPriceCents != null])) };
}

export async function prepareAccountCheckout(uid: string, raw: unknown) {
  const input = checkoutSchema.parse(raw);
  const available = await checkoutAvailability(uid);
  if (!available.ready || !available.plans[input.planId]) throw new AuthError("This subscription is not available for purchase yet.", 503);
  const config = paddleConfiguration();
  const priceId = config.priceIds[input.planId]!;
  const id = key(`${uid}:${input.requestId}`);
  const ref = checkouts().doc(id);
  const lockRef = checkouts().doc(`lock-${key(`${config.environment}:${uid}`)}`);
  const accountRef = billingAccountRef(uid);
  const binding = await getAdminFirestore().runTransaction(async (transaction) => {
    const [previous, account, policySnapshot, lockSnapshot] = await Promise.all([transaction.get(ref), transaction.get(accountRef), transaction.get(billingPoliciesRef()), transaction.get(lockRef)]);
    const policy = planPolicies(policySnapshot.data()?.policies).find((item) => item.planId === input.planId);
    if (policy?.weeklyBudgetMicros == null) throw new AuthError("This plan is not configured.", 409);
    const existing = object(previous.data());
    const subscriptions = asBillingAccount(account.data())?.subscriptions ?? {};
    if (Object.values(subscriptions).some((item) => item.environment === config.environment && item.status !== "canceled")) throw new AuthError("Manage your existing subscription before starting another.", 409);
    if (previous.exists) {
      if (existing.uid !== uid || existing.planId !== input.planId || existing.environment !== config.environment || existing.priceId !== priceId) throw new AuthError("Checkout request changed. Start again.", 409);
      if (existing.state === "ready" && !existing.consumedSubscription) return existing;
      throw new AuthError("Checkout is being prepared. Try again shortly.", 409);
    }
    const lock = object(lockSnapshot.data());
    if (lock.state === "ready" && /^[a-f\d]{64}$/.test(str(lock.id))) {
      const outstanding = object((await transaction.get(checkouts().doc(str(lock.id)))).data());
      if (outstanding.uid !== uid || outstanding.environment !== config.environment || outstanding.state !== "ready" || outstanding.consumedSubscription) throw new AuthError("Your existing checkout needs to be reconciled. Contact support.", 409);
      if (outstanding.planId !== input.planId || outstanding.priceId !== priceId) throw new AuthError("You already have a checkout for another plan. Complete it or contact support to change plans.", 409);
      return outstanding;
    }
    if (Number(lock.until) > Date.now()) throw new AuthError("A checkout is already being prepared. Try again shortly.", 429);
    const created = { uid, planId: input.planId, priceId, environment: config.environment, state: "creating", createdAt: new Date().toISOString(), transactionId: null, consumedSubscription: null };
    transaction.create(ref, created);
    // Preparing times out; a ready, still-payable checkout remains durably reserved.
    // Checkout preparation alone must never change an account's entitlement.
    transaction.set(lockRef, { uid, id, state: "creating", until: Date.now() + 120_000 });
    return created;
  });
  if (binding.state === "ready") return { transactionId: binding.transactionId, environment: config.environment, clientToken: config.clientToken };
  try {
    const prepared = await createPaddleTransaction({ priceId, checkoutId: id, uid });
    await getAdminFirestore().runTransaction(async (transaction) => {
      const lock = (await transaction.get(lockRef)).data();
      if (lock?.id !== id || lock.state !== "creating") throw new AuthError("Checkout preparation expired. Please try again.", 409);
      transaction.update(ref, { state: "ready", transactionId: prepared.transactionId, preparedAt: new Date().toISOString() });
      transaction.set(lockRef, { uid, id, state: "ready", until: null });
    });
    return { transactionId: prepared.transactionId, environment: config.environment, clientToken: config.clientToken };
  } catch (error) {
    // Keep the intent for investigation/idempotency; no access has been granted.
    await ref.update({ state: "failed", failedAt: new Date().toISOString() }).catch(() => undefined);
    throw error;
  }
}

/** First attachment requires the exact paid server-created transaction, not just custom_data.uid. */
async function verifyCheckoutReceipt(bindingId: string, binding: Record<string, unknown>, event: PaddleSubscriptionEvent) {
  const config = paddleConfiguration();
  const transactionId = str(binding.transactionId);
  if (!/^txn_[a-z\d]{26}$/.test(transactionId) || binding.environment !== config.environment || binding.uid !== event.uid || bindingId !== event.checkoutId) throw new AuthError("Unrecognized checkout binding.", 409);
  if (event.transactionId && event.transactionId !== transactionId) throw new AuthError("Transaction mismatch.", 409);
  const base = config.environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  const response = await fetch(`${base}/transactions/${transactionId}`, { headers: { Authorization: `Bearer ${config.apiKey}`, "Paddle-Version": "1" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error("Could not verify Paddle transaction.");
  const data = object(object(await response.json()).data);
  const custom = object(data.custom_data);
  const prices = Array.isArray(data.items) ? data.items.map((item) => object(object(item).price).id) : [];
  if (data.id !== transactionId || data.status !== "completed" || data.subscription_id !== event.subscriptionId || data.customer_id !== event.customerId || custom.checkout_id !== bindingId || custom.uid !== binding.uid || !prices.length || prices.some((price) => price !== binding.priceId)) throw new Error("Paddle transaction is not ready for subscription provisioning.");
}

export async function applyPaddleSubscription(event: PaddleSubscriptionEvent) {
  const config = paddleConfiguration();
  const mapped = event.priceIds.map((price) => (Object.entries(config.priceIds) as Array<[GrantPlanId, string]>).find(([, configured]) => configured === price)?.[0]);
  const mappedPlan = mapped[0];
  const recognizedPrice = !!mappedPlan && mapped.every((plan) => plan === mappedPlan);
  const db = getAdminFirestore();
  const eventRef = db.collection("billingWebhooks").doc(`${config.environment}-${event.eventId}`);
  const subscriptionRef = db.collection("billingSubscriptions").doc(`${config.environment}-${event.subscriptionId}`);
  const customerRef = db.collection("billingCustomers").doc(`${config.environment}-${event.customerId}`);
  const preliminary = await subscriptionRef.get();
  const bound = object(preliminary.data());
  const planId = recognizedPrice ? mappedPlan! : grantPlanSchema.safeParse(bound.planId).data;
  if (!planId) throw new Error("Unmapped or mixed Paddle subscription prices.");
  let uid = str(bound.uid);
  const bindingId = event.checkoutId && /^[a-f\d]{64}$/.test(event.checkoutId) ? event.checkoutId : null;
  const bindingRef = bindingId ? checkouts().doc(bindingId) : null;
  if (!preliminary.exists) {
    if (!bindingRef || !bindingId) throw new Error("Subscription has no server checkout binding.");
    const binding = object((await bindingRef.get()).data());
    uid = str(binding.uid);
    if (!uid || uid.includes("/") || binding.planId !== planId || binding.priceId !== event.priceIds[0]) throw new Error("Subscription binding does not match its price/account.");
    await verifyCheckoutReceipt(bindingId, binding, event);
  }
  if (!uid || uid.includes("/")) throw new Error("Invalid subscription account.");
  const accountRef = billingAccountRef(uid);
  const lockRef = checkouts().doc(`lock-${key(`${config.environment}:${uid}`)}`);
  await db.runTransaction(async (transaction) => {
    const reads = await Promise.all([transaction.get(eventRef), transaction.get(subscriptionRef), transaction.get(customerRef), transaction.get(accountRef), transaction.get(lockRef), ...(bindingRef ? [transaction.get(bindingRef)] : [])]);
    const [priorEvent, currentSubscription, customer, accountSnapshot, checkoutLock, checkout] = reads;
    if (priorEvent.exists) return;
    const subscriptionData = object(currentSubscription.data());
    const customerData = object(customer.data());
    if ((currentSubscription.exists && (subscriptionData.uid !== uid || subscriptionData.customerId !== event.customerId)) || (customer.exists && customerData.uid !== uid)) throw new Error("Paddle identity is already assigned to another account.");
    const checkoutData = object(checkout?.data());
    if (!currentSubscription.exists && (!checkout?.exists || checkoutData.uid !== uid || checkoutData.environment !== config.environment || (checkoutData.consumedSubscription && checkoutData.consumedSubscription !== event.subscriptionId))) throw new Error("Checkout was not authorized for this subscription.");
    const now = new Date().toISOString();
    const order = currentSubscription.exists ? eventOrder(event.occurredAt) - eventOrder(str(subscriptionData.occurredAt)) : BigInt(1);
    const older = currentSubscription.exists && (order < BigInt(0) || (order === BigInt(0) && statusPriority(event.status) <= statusPriority(str(subscriptionData.status))));
    if (older) { transaction.create(eventRef, { eventType: event.eventType, occurredAt: event.occurredAt, receivedAt: now, uid, outcome: "ignored_old" }); return; }
    const account: BillingAccount = asBillingAccount(accountSnapshot.data()) ?? { revision: 0, grant: null, subscriptions: {} };
    const subscription: BillingSubscription = { id: event.subscriptionId, customerId: event.customerId, planId, environment: config.environment, status: recognizedPrice ? event.status : "unmapped_price", periodEndsAt: event.periodEndsAt ? new Date(event.periodEndsAt).toISOString() : null, scheduledEndsAt: event.scheduledEndsAt ? new Date(event.scheduledEndsAt).toISOString() : null, occurredAt: event.occurredAt, priceId: event.priceIds[0] };
    const subscriptions = { ...account.subscriptions, [subscription.id]: subscription };
    // Historical bindings remain separately available; retain only useful compact state here.
    const historical = Object.values(subscriptions).filter((item) => !active(item, config.environment)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    historical.slice(20).forEach((item) => { delete subscriptions[item.id]; });
    transaction.set(accountRef, { ...account, subscriptions, revision: account.revision + 1, updatedAt: now }, { merge: true });
    transaction.set(subscriptionRef, { uid, customerId: event.customerId, planId, status: event.status, occurredAt: subscription.occurredAt, environment: config.environment });
    transaction.set(customerRef, { uid, environment: config.environment }, { merge: true });
    if (!currentSubscription.exists && bindingRef) transaction.update(bindingRef, { consumedSubscription: event.subscriptionId, consumedAt: now });
    if (bindingId && checkoutLock.data()?.id === bindingId) transaction.set(lockRef, { state: "consumed" }, { merge: true });
    transaction.create(eventRef, { eventType: event.eventType, occurredAt: event.occurredAt, receivedAt: now, uid, outcome: "applied" });
    transaction.create(accountRef.collection("events").doc(`${config.environment}-${event.eventId}`), { actorId: "paddle", action: event.eventType, planId, reason: `Subscription ${event.status}`, createdAt: now, expiresAt: subscriptionExpiry(subscription) });
  });
}

export async function accountPortal(uid: string) {
  const config = paddleConfiguration();
  const access = await readAccountAccess(uid);
  const subscription = access.subscriptions.filter((item) => item.environment === config.environment).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  if (!subscription) throw new AuthError("There is no subscription to manage.", 404);
  const binding = await getAdminFirestore().collection("billingCustomers").doc(`${config.environment}-${subscription.customerId}`).get();
  if (binding.data()?.uid !== uid) throw new AuthError("Subscription ownership could not be verified.", 403);
  return createPaddlePortalSession(subscription.customerId);
}

/** Plan changes are authorized from the webhook-owned subscription mapping, then verified against Paddle. */
export async function changeAccountSubscriptionPlan(uid: string, raw: unknown) {
  const { planId } = subscriptionChangeSchema.parse(raw);
  const config = paddleConfiguration();
  const access = await readAccountAccess(uid);
  const eligible = access.subscriptions.filter((item) => active(item, config.environment));
  if (access.source !== "subscription" || eligible.length !== 1) throw new AuthError("An active Paddle subscription is required to change plans.", 409);
  const subscription = eligible[0];
  if (subscription.scheduledEndsAt) throw new AuthError("This subscription already has a scheduled change. Manage it in the billing portal first.", 409);
  if (subscription.planId === planId) throw new AuthError("This is already your current plan.", 409);
  const targetPriceId = config.priceIds[planId];
  if (!targetPriceId || !paddleReadiness().plans[planId]) throw new AuthError("This plan is not available yet.", 503);
  const policy = planPolicies((await billingPoliciesRef().get()).data()?.policies).find((item) => item.planId === planId);
  if (!policy || policy.weeklyBudgetMicros == null) throw new AuthError("This plan is not configured.", 409);
  const mapping = await getAdminFirestore().collection("billingSubscriptions").doc(`${config.environment}-${subscription.id}`).get();
  const data = object(mapping.data());
  if (data.uid !== uid || data.customerId !== subscription.customerId || data.environment !== config.environment) throw new AuthError("Subscription ownership could not be verified.", 403);
  const from = PLAN_CATALOG[subscription.planId]?.monthlyPriceCents;
  const to = PLAN_CATALOG[planId]?.monthlyPriceCents;
  if (from == null || to == null) throw new AuthError("This plan change is unavailable.", 409);
  const downgrade = to < from;
  await changePaddleSubscriptionPlan({ subscriptionId: subscription.id, customerId: subscription.customerId, currentPriceId: subscription.priceId, targetPlanId: planId, lowerPrice: downgrade });
  return { planId, change: downgrade ? "downgrade" : "upgrade", effective: "immediately", proration: downgrade ? "next_billing_period" : "immediately" };
}
