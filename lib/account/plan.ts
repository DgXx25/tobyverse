import type { UserPlan, UserUsage } from "@/types/user";
import { normalizeStoredPlan, PLAN_CATALOG } from "@/lib/billing/plans";
import { formatBytes } from "@/lib/format";
import type { EffectivePlanId } from "@/types/billing";

export const BETA_PLAN: UserPlan = "free_beta";

export const STORAGE_LIMITS_BYTES = {
  free_beta: 300 * 1024 * 1024,
  lite: 2 * 1024 * 1024 * 1024,
  pro: 10 * 1024 * 1024 * 1024,
  max: 50 * 1024 * 1024 * 1024,
  team: 200 * 1024 * 1024 * 1024,
} as const;

export function storageLimitForPlan(plan: EffectivePlanId): number | null {
  return plan === "admin" ? null : STORAGE_LIMITS_BYTES[plan];
}

/** Default cap is for the free tier; server reservations resolve paid access separately. */
export const STORAGE_CAP_BYTES = STORAGE_LIMITS_BYTES.free_beta;
export const STORAGE_CAP_LABEL = "300 MB";

export const FREE_CAPS = {
  chatTurns: 100,
  practiceGenerated: 20,
  notesGenerated: 20,
  memories: 40,
  storageBytes: STORAGE_LIMITS_BYTES.free_beta,
} as const;

export type UsageCounter = "chatTurns" | "practiceGenerated" | "notesGenerated";

/** Monday 00:00 UTC as YYYY-MM-DD. */
export function utcWeekStart(now = new Date()): string {
  const day = now.getUTCDay();
  const offset = (day + 6) % 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
  return monday.toISOString().slice(0, 10);
}

export function emptyUsage(weekStart = utcWeekStart()): UserUsage {
  return {
    weekStart,
    chatTurns: 0,
    practiceGenerated: 0,
    notesGenerated: 0,
    storageBytes: 0,
  };
}

/** Plan is never taken from a client flag, query, or paid claim. */
export function asUserPlan(value: unknown): UserPlan {
  return normalizeStoredPlan(value) as UserPlan;
}

export function planLabel(plan: UserPlan | "admin" = BETA_PLAN): string {
  return plan === "admin" ? "Admin" : PLAN_CATALOG[plan].name;
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function asUserUsage(value: unknown, weekStart = utcWeekStart()): UserUsage {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const storedWeek = typeof row.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.weekStart)
    ? row.weekStart
    : weekStart;
  const sameWeek = storedWeek === weekStart;
  return {
    weekStart: sameWeek ? storedWeek : weekStart,
    chatTurns: sameWeek ? asCount(row.chatTurns) : 0,
    practiceGenerated: sameWeek ? asCount(row.practiceGenerated) : 0,
    notesGenerated: sameWeek ? asCount(row.notesGenerated) : 0,
    storageBytes: asCount(row.storageBytes),
  };
}

export function usageRatio(used: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.min(1, Math.max(0, used / cap));
}

export function wouldExceedStorage(used: number, extra: number, cap = FREE_CAPS.storageBytes): boolean {
  return Math.max(0, used) + Math.max(0, extra) > cap;
}

export function storageQuotaMessage(): string {
  return storageInsufficientMessage(0, 0);
}

export function storageInsufficientMessage(remainingBytes: number, requiredBytes: number, capBytes = STORAGE_CAP_BYTES): string {
  const left = formatBytes(Math.max(0, remainingBytes)) || "0 B";
  const need = formatBytes(Math.max(0, requiredBytes)) || "more space";
  const cap = formatBytes(capBytes) || STORAGE_CAP_LABEL;
  return `Not enough storage. This needs ${need}; ${left} left of ${cap}.`;
}
