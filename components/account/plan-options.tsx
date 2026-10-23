"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { openPaddleCheckout } from "@/lib/billing/paddle-client";
import { PLAN_CATALOG } from "@/lib/billing/plans";
import { formatBytes } from "@/lib/format";
import { storageLimitForPlan } from "@/lib/account/plan";
import type { EffectivePlanId } from "@/types/billing";
import type { BillingSubscription, GrantPlanId } from "@/types/billing-admin";

const PLAN_OPTIONS = [
  { id: "lite", description: "For everyday work and study." },
  { id: "pro", description: "For bigger projects and deeper work." },
  { id: "max", description: "For your most demanding work." },
] as const satisfies ReadonlyArray<{ id: GrantPlanId; description: string }>;

type Availability = {
  ready: boolean;
  environment: "sandbox" | "production" | string;
  plans: Partial<Record<GrantPlanId, boolean>>;
  allowances: Partial<Record<GrantPlanId, number | null>>;
  storageLimits: Partial<Record<GrantPlanId, number | null>>;
};

export function PlanOptions({
  currentPlan,
  subscriptions,
  onManageSubscription,
  managingSubscription,
}: {
  currentPlan: EffectivePlanId;
  subscriptions: BillingSubscription[];
  onManageSubscription: () => void;
  managingSubscription: boolean;
}) {
  const { user } = useAuth();
  const signedIn = !!user && !user.isAnonymous;
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availabilityState, setAvailabilityState] = useState<"loading" | "ready" | "error">("loading");
  const [pending, setPending] = useState<GrantPlanId | null>(null);
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

  async function subscribe(planId: GrantPlanId) {
    if (!user || !signedIn || pending) return;
    setPending(planId);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ planId, requestId: crypto.randomUUID() }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Checkout could not be opened. Try again shortly.");
      await openPaddleCheckout(value);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Checkout could not be opened.");
    } finally {
      setPending(null);
    }
  }

  const hasCurrentSubscription = !!availability && subscriptions.some(
    (subscription) => subscription.environment === availability.environment && subscription.status !== "canceled",
  );

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h3 className="text-[15px] font-medium text-foreground">Available plans</h3>
          <p className="mt-1 text-[12px] text-muted">Change or manage your plan here.</p>
        </div>
      </div>
      <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface-2">
        {PLAN_OPTIONS.map((option, index) => {
          const plan = PLAN_CATALOG[option.id];
          const isCurrent = currentPlan === option.id;
          const available = availability?.plans[option.id] === true;
          const allowance = availability?.allowances[option.id] ?? plan.weeklyBudgetMicros;
          const storage = availability?.storageLimits?.[option.id] ?? storageLimitForPlan(option.id);
          const price = plan.monthlyPriceCents;
          let action: React.ReactNode;
          if (isCurrent) {
            action = <span className="inline-flex items-center gap-1.5 text-[12px] text-muted"><Check size={14} aria-hidden="true" />Current plan</span>;
          } else if (hasCurrentSubscription) {
            action = <button type="button" onClick={onManageSubscription} disabled={managingSubscription || pending !== null} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] text-foreground hover:bg-border disabled:opacity-50">{managingSubscription ? "Opening…" : "Manage subscription"}<ArrowRight size={13} aria-hidden="true" /></button>;
          } else if (available) {
            action = <button type="button" onClick={() => void subscribe(option.id)} disabled={pending !== null} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[12px] font-medium text-background hover:opacity-90 disabled:cursor-wait disabled:opacity-60">{pending === option.id ? "Opening…" : "Choose plan"}<ArrowRight size={13} aria-hidden="true" /></button>;
          } else if (availabilityState === "loading") {
            action = <span className="text-[12px] text-muted">Checking…</span>;
          } else if (availabilityState === "error") {
            action = <button type="button" onClick={() => void loadAvailability()} className="text-[12px] text-muted underline underline-offset-4 hover:text-foreground">Retry</button>;
          } else {
            action = <span className="inline-flex items-center gap-1.5 text-[12px] text-muted"><LockKeyhole size={13} aria-hidden="true" />Not available yet</span>;
          }

          return (
            <article key={option.id} className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${index > 0 ? "border-t border-border" : ""}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h4 className="text-[14px] font-medium text-foreground">{plan.name}</h4>
                  <span className="text-[13px] text-muted">{price === null ? "Coming soon" : `$${(price / 100).toFixed(2)} / month`}</span>
                </div>
                <p className="mt-1 text-[12px] text-muted">{option.description}</p>
                <p className="mt-1 text-[11px] text-muted">{storage == null ? "Unlimited" : formatBytes(storage)} storage{allowance == null ? "" : ` · $${(allowance / 1_000_000).toFixed(2)} AI usage / week`}</p>
              </div>
              <div className="flex shrink-0 items-center sm:justify-end">{action}</div>
            </article>
          );
        })}
      </div>
      {error ? <p role="alert" className="mt-3 text-[12px] text-red-500">{error}</p> : null}
      {availabilityState === "error" && signedIn ? <p className="mt-3 text-[12px] text-muted">Plan availability could not be loaded.</p> : null}
    </section>
  );
}
