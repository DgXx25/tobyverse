import { createHash, randomUUID } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { z } from "zod";
import { AuthError } from "@/lib/api/assert";
import { getAdminAuth, getAdminFirestore } from "@/lib/server/firestore-admin";
import { asBillingAccount, allowanceSchema, grantPlanSchema, planPolicies, resolveAccountAccess, storageLimitSchema, CONFIGURABLE_PLANS } from "./access";
import { billingAccountRef, billingAdministrator, billingPoliciesRef, readPlanPolicies } from "./account-server";
import { paddleConfiguration, paddleReadiness } from "./paddle";
import type { AdminPlanDetail, AdminPlansResponse, AdminPlanUser, BillingAccount, BillingAuditEntry } from "@/types/billing-admin";

const uidSchema = z.string().min(1).max(128).refine((value) => !value.includes("/") && value !== "." && value !== "..");
const base = { expectedRevision: z.number().int().min(0), requestId: z.string().uuid(), reason: z.string().trim().min(3).max(400) };
export const grantMutationSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("grant"), planId: grantPlanSchema, expiresAt: z.string().datetime({ offset: true }).nullable() }).strict(),
  z.object({ ...base, action: z.literal("revoke") }).strict(),
]);
export const policyMutationSchema = z.object({ ...base, planId: z.enum(CONFIGURABLE_PLANS), weeklyBudgetMicros: allowanceSchema, storageLimitBytes: storageLimitSchema }).strict();
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const str = (value: unknown) => typeof value === "string" ? value : "";
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const conflict = () => new AuthError("Access changed since you opened it. Reload and try again.", 409);

export function assertBillingOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Firebase's SSR proxy may use its internal Cloud Run URL in request.url.
  // Never trust forwarded-host as an allowlist supplied by the requester.
  const allowed = new Set([new URL(request.url).origin, "https://tobyverse.ge", "https://tobyverse.web.app", "https://ugstuff-c351a.web.app"]);
  if (!origin || !allowed.has(origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new AuthError("Invalid request origin.", 403);
}

async function adminUser(uid: string, policies = [] as Awaited<ReturnType<typeof readPlanPolicies>>, identity?: { displayName?: string; email?: string; photoURL?: string }): Promise<AdminPlanUser> {
  const id = uidSchema.parse(uid);
  const db = getAdminFirestore();
  const [profile, account] = await db.getAll(db.collection("users").doc(id), billingAccountRef(id));
  const data = profile.data() ?? {};
  return {
    uid: id, displayName: identity?.displayName || str(data.displayName) || "Unnamed account", email: identity ? identity.email ?? "" : str(data.email), photoURL: identity?.photoURL || str(data.photoURL) || null,
    access: resolveAccountAccess({ storedPlan: data.plan, admin: await billingAdministrator(id, data), account: asBillingAccount(account.data()), policies, environment: paddleConfiguration().environment }),
  };
}

export async function listAdminPlans(search: string, cursor: string): Promise<AdminPlansResponse> {
  const policies = await readPlanPolicies();
  if (search.trim()) {
    if (search.length > 320) throw new AuthError("Search by an exact email address or account UID.", 400);
    try {
      const user = search.includes("@") ? await getAdminAuth().getUserByEmail(search.trim()) : await getAdminAuth().getUser(uidSchema.parse(search.trim()));
      return { users: [await adminUser(user.uid, policies, user)], nextCursor: null, policies, paddle: paddleReadiness() };
    } catch (error) {
      if (record(error).code === "auth/user-not-found") return { users: [], nextCursor: null, policies, paddle: paddleReadiness() };
      throw error;
    }
  }
  let query = getAdminFirestore().collection("users").orderBy(FieldPath.documentId()).limit(26);
  if (cursor) query = query.startAfter(uidSchema.parse(cursor));
  const page = await query.get();
  const visible = page.docs.slice(0, 25);
  // Never use client-editable profile email as the identity an administrator grants to.
  const identities = visible.length ? (await getAdminAuth().getUsers(visible.map((doc) => ({ uid: doc.id })))).users : [];
  const byUid = new Map(identities.map((identity) => [identity.uid, identity]));
  const users = await Promise.all(visible.filter((doc) => byUid.has(doc.id)).map((doc) => adminUser(doc.id, policies, byUid.get(doc.id))));
  return { users, nextCursor: page.docs.length > 25 ? visible.at(-1)!.id : null, policies, paddle: paddleReadiness() };
}

export async function adminPlanDetail(uid: string): Promise<AdminPlanDetail> {
  uidSchema.parse(uid);
  const identity = await getAdminAuth().getUser(uid);
  const [policies, history] = await Promise.all([
    readPlanPolicies(), billingAccountRef(uid).collection("events").orderBy("createdAt", "desc").limit(50).get(),
  ]);
  const entries: BillingAuditEntry[] = history.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, action: str(data.action), actorId: str(data.actorId), planId: str(data.planId) || null, reason: str(data.reason), createdAt: str(data.createdAt), expiresAt: str(data.expiresAt) || null };
  });
  return { user: await adminUser(uid, policies, identity), policies, history: entries };
}

export async function mutateAdminGrant(uid: string, actorId: string, raw: unknown): Promise<AdminPlanDetail> {
  uidSchema.parse(uid);
  const input = grantMutationSchema.parse(raw);
  await getAdminAuth().getUser(uid);
  const ref = billingAccountRef(uid);
  const audit = ref.collection("events").doc(input.requestId);
  const digest = fingerprint(input);
  await getAdminFirestore().runTransaction(async (transaction) => {
    const [snapshot, config, prior] = await Promise.all([transaction.get(ref), transaction.get(billingPoliciesRef()), transaction.get(audit)]);
    if (prior.exists) {
      if (prior.data()?.actorId !== actorId || prior.data()?.fingerprint !== digest) throw conflict();
      return;
    }
    const account: BillingAccount = asBillingAccount(snapshot.data()) ?? { revision: 0, grant: null, subscriptions: {} };
    if (account.revision !== input.expectedRevision) throw conflict();
    const now = new Date();
    if (input.action === "grant") {
      if (input.expiresAt && (Date.parse(input.expiresAt) <= now.getTime() || Date.parse(input.expiresAt) > now.getTime() + 100 * 366 * 86400_000)) throw new AuthError("Choose a future expiry date or permanent access.", 400);
      const policy = planPolicies(config.data()?.policies).find((item) => item.planId === input.planId);
      if (!policy?.weeklyBudgetMicros) throw new AuthError("Set this plan's AI allowance before granting access.", 409);
      account.grant = { id: randomUUID(), planId: input.planId, startsAt: now.toISOString(), expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : null, revokedAt: null, actorId, reason: input.reason };
    } else {
      if (!account.grant || account.grant.revokedAt) throw new AuthError("There is no manual grant to revoke.", 409);
      account.grant = { ...account.grant, revokedAt: now.toISOString() };
    }
    transaction.set(ref, { ...account, revision: account.revision + 1, updatedAt: now.toISOString() }, { merge: true });
    transaction.create(audit, { actorId, fingerprint: digest, action: input.action, planId: account.grant!.planId, reason: input.reason, createdAt: now.toISOString(), expiresAt: account.grant!.expiresAt });
  });
  return adminPlanDetail(uid);
}

export async function mutatePlanPolicy(actorId: string, raw: unknown) {
  const input = policyMutationSchema.parse(raw);
  const ref = billingPoliciesRef();
  const audit = ref.collection("events").doc(input.requestId);
  const digest = fingerprint(input);
  await getAdminFirestore().runTransaction(async (transaction) => {
    const [snapshot, prior] = await Promise.all([transaction.get(ref), transaction.get(audit)]);
    if (prior.exists) {
      if (prior.data()?.actorId !== actorId || prior.data()?.fingerprint !== digest) throw conflict();
      return;
    }
    const policies = planPolicies(snapshot.data()?.policies);
    const previous = policies.find((item) => item.planId === input.planId)!;
    if (previous.revision !== input.expectedRevision) throw conflict();
    const now = new Date().toISOString();
    const next = { ...previous, weeklyBudgetMicros: input.weeklyBudgetMicros, storageLimitBytes: input.storageLimitBytes, revision: previous.revision + 1, updatedAt: now };
    transaction.set(ref, { policies: Object.fromEntries(policies.map((policy) => [policy.planId, policy.planId === input.planId ? next : policy])) });
    transaction.create(audit, { actorId, action: "policy", planId: input.planId, reason: input.reason, fingerprint: digest, createdAt: now, before: { weeklyBudgetMicros: previous.weeklyBudgetMicros, storageLimitBytes: previous.storageLimitBytes }, after: { weeklyBudgetMicros: next.weeklyBudgetMicros, storageLimitBytes: next.storageLimitBytes } });
  });
  return { policies: await readPlanPolicies() };
}
