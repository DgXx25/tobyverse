import type { UserPlan, UserUsage } from "@/types/user";

export const BETA_PLAN: UserPlan = "free";

export const FREE_CAPS = {
  chatTurns: 100,
  practiceGenerated: 20,
  notesGenerated: 20,
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
export function asUserPlan(_value: unknown): UserPlan {
  return BETA_PLAN;
}

export function planLabel(_plan: UserPlan = BETA_PLAN): string {
  return "Free";
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
