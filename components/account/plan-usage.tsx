"use client";

import { resolveEffectivePlan } from "@/lib/billing/plans";
import type { UserProfile } from "@/types/user";
import { useAuth } from "@/components/auth-provider";
import { useEffect, useState } from "react";
import { PlanOptions } from "@/components/account/plan-options";

function displayPlan(plan: ReturnType<typeof resolveEffectivePlan>): string {
  return plan === "free_beta" || plan === "lite" ? "Tobyverse" : "Premium";
}

export function PlanUsage({ profile }: { profile: UserProfile | null }) {
  const { user } = useAuth();
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [aiUsage, setAiUsage] = useState<{ weekStart: string; resetsAt: string; costMicros: number; requestCount: number } | null>(null);
  const [aiUsageLoading, setAiUsageLoading] = useState(true);
  const [aiUsageError, setAiUsageError] = useState("");
  const plan = resolveEffectivePlan({ storedPlan: profile?.plan, admin: profile?.admin });
  const access = profile?.access;
  const accessReady = access !== undefined;
  const weeklyBudget = access?.weeklyBudgetMicros;
  const aiUsageRatio = aiUsage && weeklyBudget != null && weeklyBudget > 0 ? Math.min(1, aiUsage.costMicros / weeklyBudget) : 0;
  const aiUsagePercent = Math.round(aiUsageRatio * 100);
  const aiUsageLabel = aiUsageLoading || !accessReady
    ? "Loading"
    : !aiUsage
      ? "Usage unavailable"
      : weeklyBudget == null
        ? "Unlimited"
        : `${aiUsagePercent}% used`;

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setAiUsage(null);
      setAiUsageLoading(false);
      return;
    }
    let alive = true;
    let loading = false;
    const refresh = async () => {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/account/usage", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || "AI usage is temporarily unavailable.");
        if (alive) {
          setAiUsage(value.usage);
          setAiUsageError("");
          setAiUsageLoading(false);
        }
      } catch (problem) {
        if (alive) {
          setAiUsageError(problem instanceof Error ? problem.message : "AI usage is temporarily unavailable.");
          setAiUsageLoading(false);
        }
      } finally {
        loading = false;
      }
    };
    setAiUsageLoading(true);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [user]);

  async function manageSubscription() {
    if (!user || portalLoading) return;
    setPortalLoading(true); setPortalError("");
    try {
      const response = await fetch("/api/billing/portal", { method: "POST", headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Subscription management is temporarily unavailable.");
      window.location.assign(value.url);
    } catch (problem) { setPortalError(problem instanceof Error ? problem.message : "Subscription management is temporarily unavailable."); setPortalLoading(false); }
  }

  return (
    <div className="max-w-4xl">
      {plan === "admin" ? (
        <section className="rounded-xl border border-border bg-surface-2 px-5 py-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Current plan</p>
          <div className="mt-2 text-[18px] font-semibold text-foreground">Admin</div>
          <p className="mt-1 text-[13px] text-muted">Unlimited access</p>
        </section>
      ) : (
        <PlanOptions currentPlan={plan} subscriptions={access?.subscriptions ?? []} onManageSubscription={() => void manageSubscription()} managingSubscription={portalLoading} />
      )}

      {plan !== "admin" ? (
        <section className="mt-6 rounded-xl bg-surface-2 px-4 py-4">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="font-medium text-foreground">Included in {displayPlan(plan)}</span>
            <span className="shrink-0 text-muted">{aiUsageLabel}</span>
          </div>
          {accessReady && weeklyBudget != null && weeklyBudget > 0 ? (
            <div className="mt-3 h-[7px] overflow-hidden rounded-full bg-border" role="progressbar" aria-label="Plan usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={aiUsagePercent}>
              <div className="h-full rounded-full bg-sky-400 transition-[width] duration-300" style={{ width: `${aiUsageRatio * 100}%` }} />
            </div>
          ) : null}
          {aiUsageError ? <p role="alert" className="mt-2 text-[12px] text-red-500">{aiUsageError}</p> : null}
          {aiUsage && !aiUsageLoading ? <p className="mt-2 text-[11px] text-muted">Resets {new Date(aiUsage.resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p> : null}
        </section>
      ) : null}
      {portalError ? <p role="alert" className="mt-3 text-[12px] text-red-500">{portalError}</p> : null}
    </div>
  );
}
