import { FieldValue } from "firebase-admin/firestore";
import { COLLECTIONS } from "@/lib/firestore";
import { getAdminFirestore } from "@/lib/server/firestore-admin";
import { STORAGE_CAP_BYTES, storageInsufficientMessage } from "@/lib/account/plan";

export class MaterialStorageQuotaError extends Error {
  readonly status = 413;
  readonly remainingBytes: number;

  constructor(remainingBytes: number, requestedBytes: number) {
    super(storageInsufficientMessage(remainingBytes, requestedBytes));
    this.name = "MaterialStorageQuotaError";
    this.remainingBytes = remainingBytes;
  }
}

function usageRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function usedStorage(value: unknown): number {
  const usage = usageRecord(value);
  const bytes = usage.storageBytes;
  return typeof bytes === "number" && Number.isFinite(bytes) ? Math.max(0, Math.floor(bytes)) : 0;
}

export async function reserveMaterialStorage(uid: string, bytes: number): Promise<void> {
  const amount = Math.ceil(bytes);
  if (!uid || amount <= 0) return;
  const ref = getAdminFirestore().collection(COLLECTIONS.users).doc(uid);
  await getAdminFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() ?? {};
    const oldUsage = usageRecord(data.usage);
    const used = usedStorage(oldUsage);
    const remaining = Math.max(0, STORAGE_CAP_BYTES - used);
    if (amount > remaining) throw new MaterialStorageQuotaError(remaining, amount);
    transaction.set(ref, {
      usage: { ...oldUsage, storageBytes: used + amount },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

export async function releaseMaterialStorage(uid: string, bytes: number): Promise<void> {
  const amount = Math.ceil(bytes);
  if (!uid || amount <= 0) return;
  const ref = getAdminFirestore().collection(COLLECTIONS.users).doc(uid);
  await getAdminFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() ?? {};
    const oldUsage = usageRecord(data.usage);
    transaction.set(ref, {
      usage: { ...oldUsage, storageBytes: Math.max(0, usedStorage(oldUsage) - amount) },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}
