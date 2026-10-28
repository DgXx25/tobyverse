"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { openPaddleCheckout } from "@/lib/billing/paddle-client";
import { formatBytes } from "@/lib/format";
import { storageLimitForPlan } from "@/lib/account/plan";
import type { EffectivePlanId } from "@/types/billing";
import type { BillingSubscription, GrantPlanId } from "@/types/billing-admin";

const PLAN_OPTIONS = [
  { id: "lite", publicName: "Tobyverse", description: "Gemini 3.5 Flash, Gemini 3.1 Pro, and Auto mode.", current: (plan: EffectivePlanId) => plan === "free_beta" || plan === "lite", tint: false },
  { id: "pro", publicName: "Premium", description: "Everything in Tobyverse plus Gemini 4 Argon and higher weekly limits.", current: (plan: EffectivePlanId) => plan === "pro" || plan === "max" || plan === "team" || plan === "admin", tint: true },
] as const satisfies ReadonlyArray<{ id: GrantPlanId; publicName: string; description: string; current: (plan: EffectivePlanId) => boolean; tint: boolean }>;

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
  usagePercent,
}: {
  currentPlan: EffectivePlanId;
  subscriptions: BillingSubscription[];
  onManageSubscription: () => void;
  managingSubscription: boolean;
  usagePercent?: number;
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
          <h3 className="text-[15px] font-medium text-foreground">Plans</h3>
          <p className="mt-1 text-[12px] text-muted">Choose the model access and usage limit that fit your work.</p>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {PLAN_OPTIONS.map((option) => {
          const isCurrent = option.current(currentPlan);
          const available = availability?.plans[option.id] === true;
          const storage = availability?.storageLimits?.[option.id] ?? storageLimitForPlan(option.id);
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
            action = <button type="button" disabled className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-foreground/10 px-3 text-[12px] font-medium text-muted" title="Premium checkout is not enabled yet"><LockKeyhole size={13} aria-hidden="true" />Upgrade · coming soon</button>;
          }

          return (
            <article key={option.id} className={`flex min-h-48 flex-col justify-between rounded-2xl border p-5 ${option.tint ? "border-sky-400/40 bg-sky-400/[0.06]" : "border-border bg-surface-2"}`}>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">{isCurrent ? "Current plan" : "Upgrade available"}</p>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h4 className="text-[17px] font-semibold text-foreground">{option.publicName}</h4>
                </div>
                <p className="mt-2 text-[12px] leading-5 text-muted">{option.description}</p>
                <p className="mt-2 text-[11px] text-muted">{isCurrent && currentPlan === "free_beta" ? "Beta access" : "Weekly AI usage included"} · {storage == null ? "Unlimited" : formatBytes(storage)} storage</p>
                {option.id === "lite" ? <p className="mt-1 text-[11px] text-muted">Current usage: {usagePercent == null ? "Loading…" : `${usagePercent}% this week`}</p> : null}
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
