"use client";

import Link from "next/link";
import { PLAN_CATALOG, resolveEffectivePlan } from "@/lib/billing/plans";
import { formatBytes } from "@/lib/format";
import type { EffectivePlanId } from "@/types/billing";
import type { UserProfile } from "@/types/user";

const NEXT_PLAN: Partial<Record<EffectivePlanId, EffectivePlanId>> = {
  free_beta: "lite",
  lite: "pro",
  pro: "max",
};

const PLAN_FEATURES: Record<EffectivePlanId, string[]> = {
  free_beta: ["Core TobyVerse workspace", "Material notes and practice", "1 GB material storage"],
  lite: ["More room for everyday work", "Usage analytics", "Priority plan controls"],
  pro: ["Deeper study workflows", "Expanded workspace tools", "Higher future allowance"],
  max: ["Maximum individual access", "Highest future allowance", "Early feature access"],
  team: ["Shared workspace", "Member seats and invitations", "Central administration"],
  admin: ["Unlimited TobyVerse access", "Admin controls", "Actual storage tracking"],
};

function displayPlan(plan: EffectivePlanId): string {
  if (plan === "free_beta") return "Beta";
  return PLAN_CATALOG[plan].name;
}

function includedLabel(plan: EffectivePlanId): string {
  if (plan === "free_beta") return "Included in Beta";
  return `Included in ${displayPlan(plan)}`;
}

function priceLabel(plan: EffectivePlanId): string {
  const cents = PLAN_CATALOG[plan].monthlyPriceCents;
  if (plan === "admin") return "Internal";
  if (cents === 0) return "$0/mo";
  if (cents == null) return "Custom";
  return `$${cents / 100}/mo`;
}

export function PlanUsage({ profile }: { profile: UserProfile | null }) {
  const plan = resolveEffectivePlan({ storedPlan: profile?.plan, admin: profile?.admin });
  const definition = PLAN_CATALOG[plan];
  const nextPlan = NEXT_PLAN[plan];
  const nextDefinition = nextPlan ? PLAN_CATALOG[nextPlan] : null;
  const storage = profile?.usage.storageBytes ?? 0;
  const storageRatio = Math.min(1, Math.max(0, storage / (1024 * 1024 * 1024)));

  return (
    <div className="max-w-2xl">
      <div className="grid gap-4 md:grid-cols-2">
        <PlanCard
          eyebrow="Current plan"
          plan={displayPlan(plan)}
          price={priceLabel(plan)}
          copy={plan === "admin" ? "Unlimited access with plan and storage visibility." : definition.description}
          action={<Link href="/plans" className="inline-flex rounded-lg border border-border px-3 py-2 text-[12px] text-foreground hover:bg-border">Adjust plan</Link>}
          current
        />
        {nextPlan && nextDefinition ? (
          <PlanCard
            eyebrow="Upgrade available"
            plan={nextDefinition.name}
            price={priceLabel(nextPlan)}
            copy={`Unlock more room for ${displayPlan(nextPlan).toLowerCase()} work.`}
            action={<Link href="/plans" className="inline-flex rounded-lg bg-foreground px-3 py-2 text-[12px] font-medium text-background">Upgrade</Link>}
          />
        ) : (
          <PlanCard eyebrow="Plan status" plan="Max access" price="" copy="You are on the highest available access level." action={null} />
        )}
      </div>

      <section className="mt-8">
        <p className="mb-3 px-1 text-[13px] font-medium text-foreground">{includedLabel(plan)}</p>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-2">
          {PLAN_FEATURES[plan].map((feature, index) => (
            <div key={feature} className={`flex items-center justify-between gap-4 px-4 py-4 text-[13px] ${index > 0 ? "border-t border-border" : ""}`}>
              <span className="text-foreground">{feature}</span>
              <span className="text-muted">Included</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-border bg-surface-2 p-5">
        <div className="flex items-baseline justify-between gap-4">
          <div><p className="font-medium text-foreground">Material storage</p><p className="mt-1 text-[12px] text-muted">Your actual uploaded material usage.</p></div>
          <p className="text-[13px] text-muted">{formatBytes(storage) || "0 B"} / 1 GB</p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-foreground/80" style={{ width: `${storageRatio * 100}%` }} /></div>
      </section>
    </div>
  );
}

function PlanCard({
  eyebrow,
  plan,
  price,
  copy,
  action,
  current = false,
}: {
  eyebrow: string;
  plan: string;
  price: string;
  copy: string;
  action: React.ReactNode;
  current?: boolean;
}) {
  return (
    <article className={`rounded-2xl border p-5 ${current ? "border-border bg-surface-2" : "border-accent/50 bg-accent/5"}`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{eyebrow}</p>
      <div className="mt-5 flex items-baseline gap-2"><h3 className="text-lg font-semibold text-foreground">{plan}</h3>{price ? <span className="text-[13px] text-muted">{price}</span> : null}</div>
      <p className="mt-2 min-h-10 text-[13px] leading-5 text-muted">{copy}</p>
      <div className="mt-5">{action}</div>
    </article>
  );
}
