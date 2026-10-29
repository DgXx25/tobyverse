"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import type { EffectivePlanId } from "@/types/billing";
import type { BillingSubscription, GrantPlanId } from "@/types/billing-admin";

const PLAN_OPTIONS = [
  { id: "lite", publicName: "Tobyverse", description: "Claude Haiku and Auto mode.", current: (plan: EffectivePlanId) => plan === "free_beta" || plan === "lite", tint: false },
  { id: "pro", publicName: "Premium", description: "Everything in Tobyverse plus Claude Sonnet and higher weekly limits.", current: (plan: EffectivePlanId) => plan === "pro" || plan === "max" || plan === "team" || plan === "admin", tint: true },
] as const satisfies ReadonlyArray<{ id: GrantPlanId; publicName: string; description: string; current: (plan: EffectivePlanId) => boolean; tint: boolean }>;

type Availability = {
  ready: boolean;
  environment: "sandbox" | "production" | string;
  plans: Partial<Record<GrantPlanId, boolean>>;
  allowances: Partial<Record<GrantPlanId, number | null>>;
};

export function PlanOptions({
  currentPlan,
  subscriptions,
  onManageSubscription,
  managingSubscription,
  onChoosePlan,
}: {
  currentPlan: EffectivePlanId;
  subscriptions: BillingSubscription[];
  onManageSubscription: () => void;
  managingSubscription: boolean;
  onChoosePlan: () => void;
}) {
  const { user } = useAuth();
  const signedIn = !!user && !user.isAnonymous;
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availabilityState, setAvailabilityState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  async function loadAvailability() {
    if (!user || user.isAnonymous) {
      setAvailability(null);
      setAvailabilityState("error");
      return;
    }
    setAvailabilityState("loading");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/billing/checkout", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) throw new Error("Plan availability could not be checked.");
      setAvailability(await response.json() as Availability);
      setAvailabilityState("ready");
    } catch {
      setAvailability(null);
      setAvailabilityState("error");
    }
  }

  useEffect(() => {
    if (!signedIn || !user) {
      setAvailability(null);
      setAvailabilityState("error");
      return;
    }
    let alive = true;
    void user.getIdToken()
      .then((token) => fetch("/api/billing/checkout", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }))
      .then(async (response) => {
        if (!response.ok) throw new Error("Plan availability could not be checked.");
        return response.json() as Promise<Availability>;
      })
      .then((value) => {
        if (alive) {
          setAvailability(value);
          setAvailabilityState("ready");
        }
      })
      .catch(() => {
        if (alive) {
          setAvailability(null);
          setAvailabilityState("error");
        }
      });
    return () => { alive = false; };
  }, [signedIn, user]);

  const hasCurrentSubscription = !!availability && subscriptions.some(
    (subscription) => subscription.environment === availability.environment && subscription.status !== "canceled",
  );

  return (
    <section>
      <div className="grid gap-3 md:grid-cols-2">
        {PLAN_OPTIONS.map((option) => {
          const isCurrent = option.current(currentPlan);
          const available = availability?.plans[option.id] === true;
          let action: React.ReactNode;
          if (isCurrent) {
            action = hasCurrentSubscription
              ? <button type="button" onClick={onManageSubscription} disabled={managingSubscription} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] text-foreground hover:bg-border disabled:opacity-50">{managingSubscription ? "Opening…" : "Manage plan"}<ArrowRight size={13} aria-hidden="true" /></button>
              : <span className="inline-flex items-center gap-1.5 text-[12px] text-muted"><Check size={14} aria-hidden="true" />Current plan</span>;
          } else if (hasCurrentSubscription) {
            action = <button type="button" onClick={onManageSubscription} disabled={managingSubscription} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] text-foreground hover:bg-border disabled:opacity-50">{managingSubscription ? "Opening…" : "Manage subscription"}<ArrowRight size={13} aria-hidden="true" /></button>;
          } else if (available) {
            action = <button type="button" onClick={onChoosePlan} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[12px] font-medium text-background hover:opacity-90">Choose plan<ArrowRight size={13} aria-hidden="true" /></button>;
          } else if (availabilityState === "loading") {
            action = <span className="text-[12px] text-muted">Checking…</span>;
          } else if (availabilityState === "error") {
            action = <button type="button" onClick={() => void loadAvailability()} className="text-[12px] text-muted underline underline-offset-4 hover:text-foreground">Retry</button>;
          } else {
            action = <button type="button" disabled className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-foreground/10 px-3 text-[12px] font-medium text-muted" title="Premium checkout is not enabled yet"><LockKeyhole size={13} aria-hidden="true" />Upgrade · coming soon</button>;
          }

          return (
            <article key={option.id} className={`flex min-h-[148px] flex-col justify-between rounded-xl border p-4 ${option.tint ? "border-sky-400/40 bg-sky-400/[0.06]" : "border-border bg-surface-2"}`}>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">{isCurrent ? "Current plan" : "Upgrade available"}</p>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h4 className="text-[16px] font-semibold text-foreground">{option.publicName}</h4>
                </div>
                <p className="mt-2 text-[12px] leading-5 text-muted">{option.description}</p>
              </div>
              <div className="mt-4 flex items-center">{action}</div>
            </article>
          );
        })}
      </div>
      {error ? <p role="alert" className="mt-3 text-[12px] text-red-500">{error}</p> : null}
      {availabilityState === "error" && signedIn ? <p className="mt-3 text-[12px] text-muted">Plan availability could not be loaded.</p> : null}
    </section>
  );
}
