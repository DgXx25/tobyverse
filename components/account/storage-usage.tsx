import { storageLimitForPlan } from "@/lib/account/plan";
import { formatBytes } from "@/lib/format";
import { resolveEffectivePlan } from "@/lib/billing/plans";
import type { UserProfile } from "@/types/user";

export function StorageUsage({ profile }: { profile: UserProfile | null }) {
  const plan = resolveEffectivePlan({ storedPlan: profile?.plan, admin: profile?.admin });
  const used = profile?.usage.storageBytes ?? 0;
  const limit = profile?.access?.storageLimitBytes ?? storageLimitForPlan(plan);
  const ratio = limit == null ? 0 : Math.min(1, Math.max(0, used / limit));
  const percent = Math.round(ratio * 100);

  return (
    <section className="rounded-xl bg-surface-2 px-4 py-4">
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="font-medium text-foreground">Material storage</span>
        <span className="shrink-0 text-muted">
          {formatBytes(used) || "0 B"} / {limit == null ? "Unlimited" : formatBytes(limit)}
        </span>
      </div>
      {limit != null ? (
        <div className="mt-3 h-[7px] overflow-hidden rounded-full bg-border" role="progressbar" aria-label="Material storage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="h-full rounded-full bg-sky-400 transition-[width] duration-300" style={{ width: `${ratio * 100}%` }} />
        </div>
      ) : null}
      <p className="mt-2 text-[11px] text-muted">{limit == null ? "Unlimited storage" : `${percent}% used`}</p>
    </section>
  );
}
