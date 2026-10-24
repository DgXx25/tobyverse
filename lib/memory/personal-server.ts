import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/server/firestore-admin";
import { memoryKey, sanitizeMemoryContent, sanitizePersonalization } from "@/lib/memory/normalize";
import { formatPersonalMemory, parsePersonalMemory } from "@/lib/memory/summary";
import { hasMemoryCapacity, memoryLimitsForPlan, type MemoryLimits } from "@/lib/memory/limits";
import { readAccountAccess } from "@/lib/billing/account-server";
import { AuthError } from "@/lib/api/assert";
import type { MemoryOp, UserMemory } from "@/types/memory";

function iso(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString();
  return null;
}
const revisionOf = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;

export async function memoryStatus(uid: string) {
  const db = getAdminFirestore();
  const access = await readAccountAccess(uid);
  return db.runTransaction(async tx => {
    const [facts, learning, state] = await Promise.all([
      tx.get(db.collection("users").doc(uid).collection("memories")),
      tx.get(db.collection("users").doc(uid).collection("profile").doc("learning")),
      tx.get(db.collection("users").doc(uid).collection("profile").doc("memory-state")),
    ]);
    const memories: UserMemory[] = facts.docs.flatMap(doc => {
      const row = doc.data(), content = sanitizeMemoryContent(row.content);
      return content ? [{ id: doc.id, content, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) }] : [];
    }).sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
    const personalization = sanitizePersonalization(learning.data()?.text);
    const summary = formatPersonalMemory(memories, personalization);
    return {
      plan: access.plan, limits: memoryLimitsForPlan(access.plan),
      usage: { savedFacts: parsePersonalMemory(summary).length },
      summary, memories, personalization, needsReview: Boolean(personalization), revision: revisionOf(state.data()?.revision),
      updatedAt: iso(state.data()?.updatedAt) ?? memories.map(m => m.updatedAt ?? m.createdAt).filter((v): v is string => !!v).sort().at(-1) ?? null,
    };
  });
}

export async function persistMemoryChanges(input: {
  uid: string; operations: MemoryOp[];
  limits?: MemoryLimits; expectedRevision?: number;
}) {
  const db = getAdminFirestore();
  const limits = input.limits ?? memoryLimitsForPlan((await readAccountAccess(input.uid)).plan);
  const factsRef = db.collection("users").doc(input.uid).collection("memories");
  const profileRef = db.collection("users").doc(input.uid).collection("profile").doc("learning");
  const stateRef = db.collection("users").doc(input.uid).collection("profile").doc("memory-state");
  return db.runTransaction(async tx => {
    const [factsSnap, profileSnap, stateSnap] = await Promise.all([tx.get(factsRef), tx.get(profileRef), tx.get(stateRef)]);
    const revision = revisionOf(stateSnap.data()?.revision);
    if (input.expectedRevision !== undefined && input.expectedRevision !== revision) return { savedFacts: false, createdId: null, factCount: factsSnap.size, stale: true };
    const now = FieldValue.serverTimestamp();
    const facts = new Map(factsSnap.docs.map(doc => [doc.id, { ref: doc.ref, data: doc.data() }]));
    const deleted = new Set(input.operations.flatMap(op => op.op === "delete" && facts.has(op.id) ? [op.id] : []));
    const keys = new Set([...facts].filter(([id]) => !deleted.has(id)).map(([, row]) => memoryKey(String(row.data.content ?? ""))));
    let savedFacts = deleted.size > 0, createdId: string | null = null;
    for (const id of deleted) tx.delete(facts.get(id)!.ref);
    let count = facts.size - deleted.size;
    const legacyCount = parsePersonalMemory(formatPersonalMemory([], sanitizePersonalization(profileSnap.data()?.text))).length;
    for (const op of input.operations) {
      if (op.op === "delete") continue;
      const content = sanitizeMemoryContent(op.content);
      if (!content) continue;
      const key = memoryKey(content);
      if (op.op === "update") {
        const current = facts.get(op.id), previous = memoryKey(String(current?.data.content ?? ""));
        if (!current || deleted.has(op.id) || key === previous || keys.has(key)) continue;
        tx.set(current.ref, { ...current.data, content, updatedAt: now });
        keys.delete(previous); keys.add(key); savedFacts = true;
      } else {
        if (keys.has(key) || !hasMemoryCapacity(count + legacyCount, Math.min(limits.savedFacts ?? 320, 320))) continue;
        const ref = factsRef.doc();
        tx.create(ref, { id: ref.id, content, createdAt: now, updatedAt: now });
        createdId = ref.id; keys.add(key); count++; savedFacts = true;
      }
    }
    if (savedFacts) tx.set(stateRef, { revision: revision + 1, updatedAt: now });
    return { savedFacts, createdId, factCount: count, stale: false };
  });
}

/** Manual summary edits are atomic, quota checked, and invalidate extraction that started earlier. */
export async function replacePersonalMemory(uid: string, summary: string, expectedRevision: number) {
  const entries = parsePersonalMemory(summary);
  const limits = memoryLimitsForPlan((await readAccountAccess(uid)).plan);
  const db = getAdminFirestore(), userRef = db.collection("users").doc(uid);
  const factsRef = userRef.collection("memories"), stateRef = userRef.collection("profile").doc("memory-state");
  const profileRef = userRef.collection("profile").doc("learning");
  await db.runTransaction(async tx => {
    const [facts, state, profile] = await Promise.all([tx.get(factsRef), tx.get(stateRef), tx.get(profileRef)]);
    const revision = revisionOf(state.data()?.revision);
    if (revision !== expectedRevision) throw new AuthError("Memory changed while you were editing. Reload the latest summary before saving. Your draft is still here.", 409);
    const existing = facts.docs.map(doc => ({ id: doc.id, content: String(doc.data().content ?? ""), createdAt: iso(doc.data().createdAt), updatedAt: iso(doc.data().updatedAt) }));
    const currentCount = parsePersonalMemory(formatPersonalMemory(existing, sanitizePersonalization(profile.data()?.text))).length;
    const cap = Math.min(limits.savedFacts ?? 320, 320);
    if (entries.length > cap && entries.length > currentCount) throw new AuthError(`Your plan has room for ${cap} memories. Remove some lines before adding more.`, 403);
    if (entries.length > 400) throw new AuthError("Memory summary exceeds the storage limit.", 400);
    const desired = new Map(entries.map(entry => [memoryKey(entry.content), entry]));
    const kept = new Set<string>();
    for (const doc of facts.docs) {
      const key = memoryKey(String(doc.data().content ?? ""));
      if (!desired.has(key) || kept.has(key)) tx.delete(doc.ref);
      else kept.add(key);
    }
    const now = FieldValue.serverTimestamp();
    for (const [key, entry] of desired) {
      if (kept.has(key)) continue;
      const ref = factsRef.doc();
      tx.create(ref, { id: ref.id, content: entry.content, createdAt: now, updatedAt: now });
    }
    if (profile.exists) tx.delete(profileRef);
    tx.set(stateRef, { revision: revision + 1, updatedAt: now });
  });
  return memoryStatus(uid);
}
