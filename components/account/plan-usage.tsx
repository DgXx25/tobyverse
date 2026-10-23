"use client";

import { PLAN_CATALOG, resolveEffectivePlan } from "@/lib/billing/plans";
import { storageLimitForPlan } from "@/lib/account/plan";
import { formatBytes } from "@/lib/format";
import type { EffectivePlanId } from "@/types/billing";
import type { UserProfile } from "@/types/user";
import { useAuth } from "@/components/auth-provider";
import { useEffect, useState } from "react";

const PLAN_FEATURES: Record<EffectivePlanId, string[]> = {
  free_beta: ["Core TobyVerse workspace", "Material notes and practice", "Core AI model access"],
  lite: ["Everyday work and study", "Chat, sources and Studio", "All released AI models"],
  pro: ["Bigger projects and deeper work", "Chat, sources and Studio", "All released AI models"],
  max: ["Your most demanding work", "Chat, sources and Studio", "All released AI models"],
  team: ["Chat, sources and Studio", "All released AI models"],
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
  const { user } = useAuth();
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [aiUsage, setAiUsage] = useState<{ weekStart: string; resetsAt: string; costMicros: number; requestCount: number } | null>(null);
  const [aiUsageLoading, setAiUsageLoading] = useState(true);
  const [aiUsageError, setAiUsageError] = useState("");
  const plan = resolveEffectivePlan({ storedPlan: profile?.plan, admin: profile?.admin });
  const definition = PLAN_CATALOG[plan];
  const storage = profile?.usage.storageBytes ?? 0;
  const access = profile?.access;
  const storageCap = access?.storageLimitBytes ?? storageLimitForPlan(plan);
  const storageRatio = storageCap == null ? 0 : Math.min(1, Math.max(0, storage / storageCap));
  const accessReady = access !== undefined;
  const weeklyBudget = access?.weeklyBudgetMicros;
  const aiUsageRatio = aiUsage && weeklyBudget != null && weeklyBudget > 0 ? Math.min(1, aiUsage.costMicros / weeklyBudget) : 0;
  const aiUsageLabel = aiUsageLoading || !accessReady
    ? "Loading…"
    : !aiUsage
      ? "Usage unavailable"
      : weeklyBudget == null
        ? `$${(aiUsage.costMicros / 1_000_000).toFixed(2)} used · Unlimited`
        : `$${(aiUsage.costMicros / 1_000_000).toFixed(2)} / $${(weeklyBudget / 1_000_000).toFixed(2)}`;

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
    <div className="max-w-2xl">
      <section className="rounded-2xl border border-border bg-surface-2 p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Current plan</p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-lg font-semibold text-foreground">{displayPlan(plan)}</h3>
          <span className="text-[13px] text-muted">{priceLabel(plan)}</span>
        </div>
        <p className="mt-2 text-[13px] leading-5 text-muted">{plan === "admin" ? "Unlimited access with plan and storage visibility." : definition.description}</p>
      </section>

      {access ? <section className="mt-5 rounded-2xl border border-border bg-surface-2 p-5 text-[13px]">
        <p className="font-medium text-foreground">{access.source === "manual" ? "Access provided by TobyVerse" : access.source === "subscription" ? "Subscription access" : access.source === "admin" ? "Administrator access" : "Account access"}</p>
        <p className="mt-2 text-muted">{access.expiresAt ? `Available until ${new Date(access.expiresAt).toLocaleString()}` : access.source === "manual" ? "Permanent access" : "No scheduled expiry"}</p>
        {access.subscriptions.length ? <button type="button" disabled={portalLoading} onClick={() => void manageSubscription()} className="mt-4 rounded-lg border border-border px-3 py-2 disabled:opacity-50">{portalLoading ? "Opening…" : "Manage subscription"}</button> : null}
        {portalError ? <p role="alert" className="mt-3 text-red-500">{portalError}</p> : null}
      </section> : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface-2 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="font-medium text-foreground">AI usage this week</p>
              <p className="mt-1 text-[12px] text-muted">Shared across chat and AI tools · resets Monday UTC</p>
            </div>
            <p className="text-[13px] text-muted">{aiUsageLabel}</p>
          </div>
          {accessReady && weeklyBudget != null && weeklyBudget > 0 ? (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-label="Weekly AI usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(aiUsageRatio * 100)}>
              <div className="h-full rounded-full bg-foreground/80 transition-[width] duration-300" style={{ width: `${aiUsageRatio * 100}%` }} />
            </div>
          ) : null}
          {aiUsage && accessReady && weeklyBudget != null ? <p className="mt-2 text-[12px] text-muted">${(Math.max(0, weeklyBudget - aiUsage.costMicros) / 1_000_000).toFixed(2)} remaining · {aiUsage.requestCount} AI requests</p> : null}
          {aiUsage && accessReady && weeklyBudget == null ? <p className="mt-2 text-[12px] text-muted">{aiUsage.requestCount} AI requests tracked this week.</p> : null}
          {aiUsageError ? <p role="alert" className="mt-2 text-[12px] text-red-500">{aiUsageError}</p> : null}
        </section>

        <section className="rounded-2xl border border-border bg-surface-2 p-5">
          <div className="flex items-baseline justify-between gap-4">
            <div><p className="font-medium text-foreground">Material storage</p><p className="mt-1 text-[12px] text-muted">Your actual uploaded material usage.</p></div>
            <p className="text-[13px] text-muted">{formatBytes(storage) || "0 B"} / {storageCap == null ? "Unlimited" : formatBytes(storageCap)}</p>
          </div>
          {storageCap != null ? <div className="mt-4 h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-label="Material storage" aria-valuemin={0} aria-valuemax={storageCap} aria-valuenow={Math.min(storage, storageCap)}>
            <div className="h-full rounded-full bg-foreground/80 transition-[width] duration-300" style={{ width: `${storageRatio * 100}%` }} />
          </div> : null}
        </section>
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

    </div>
  );
}
