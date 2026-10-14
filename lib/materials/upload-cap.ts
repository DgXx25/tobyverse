export type MaterialUploadPlan = "free_beta" | "lite" | "pro" | "max" | "admin";

const MIB = 1024 * 1024;

const BYTE_CAPS: Record<MaterialUploadPlan, number> = {
  free_beta: 15 * MIB,
  lite: 25 * MIB,
  pro: 50 * MIB,
  max: 100 * MIB,
  admin: 600 * MIB,
};

export function uploadLimitForPlan(plan: unknown): number {
  return BYTE_CAPS[plan as MaterialUploadPlan] ?? BYTE_CAPS.free_beta;
}

export function uploadLimitLabel(plan: unknown): string {
  return `${uploadLimitForPlan(plan) / MIB} MB`;
}

export function isUploadWithinPlan(bytes: number, plan: unknown): boolean {
  return Number.isFinite(bytes) && bytes >= 0 && bytes <= uploadLimitForPlan(plan);
}

export function uploadTooLargeForPlan(plan: unknown): string {
  return `File is too large (max ${uploadLimitLabel(plan)})`;
}
