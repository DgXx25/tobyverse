"use client";

import Link from "next/link";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ForceMarketingDark } from "@/components/force-marketing-dark";
import { PLAN_CATALOG, resolveEffectivePlan } from "@/lib/billing/plans";
import { storageLimitForPlan } from "@/lib/account/plan";
import { formatBytes } from "@/lib/format";
import { useUserProfile } from "@/components/account/use-user-profile";
import { useAuth } from "@/components/auth-provider";
import { useEffect, useRef, useState } from "react";
import { closePaddleCheckout, initializePaddleCheckout, openPaddleCheckout } from "@/lib/billing/paddle-client";
import type { GrantPlanId } from "@/types/billing-admin";

const cards = [
  { id: "free_beta" as const, label: "Free Beta", note: "A good place to begin." },
  { id: "lite" as const, label: "Lite", note: "For everyday work and study." },
  { id: "pro" as const, label: "Pro", note: "For bigger projects and deeper work.", featured: true },
  { id: "max" as const, label: "Max", note: "For your most demanding work." },
];

type Availability = {
  ready: boolean;
  environment: "sandbox" | "production" | string;
  clientToken: string;
  plans: Partial<Record<GrantPlanId, boolean>>;
  allowances: Partial<Record<GrantPlanId, number | null>>;
  storageLimits: Partial<Record<"free_beta" | GrantPlanId, number | null>>;
};

export function PlansPage() {
  const { profile } = useUserProfile();
  const { user } = useAuth();
  const signedIn = !!user && !user.isAnonymous;
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [syncingPlan, setSyncingPlan] = useState<GrantPlanId | null | undefined>(undefined);
  const knownSubscriptions = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (profile?.access && knownSubscriptions.current === null) knownSubscriptions.current = new Set(profile.access.subscriptions.map((subscription) => subscription.id));
  }, [profile?.access]);

  useEffect(() => {
    const pendingPlan = window.sessionStorage.getItem("tobyverse-plan-activation-pending");
    if (pendingPlan === "any") setSyncingPlan(null);
    else if (["lite", "pro", "max", "team"].includes(pendingPlan ?? "")) setSyncingPlan(pendingPlan as GrantPlanId);
  }, []);

  useEffect(() => {
    if (!signedIn || !user) { setAvailability(null); return; }
    let alive = true;
    setAvailability(null);
    void user.getIdToken()
      .then((token) => fetch("/api/billing/checkout", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }))
      .then(async (response) => { if (!response.ok) throw new Error("Checkout unavailable"); return response.json(); })
      .then((value: Availability) => { if (alive) setAvailability(value); })
      .catch(() => { if (alive) setAvailability(null); });
    return () => { alive = false; };
  }, [signedIn, user]);

  // Paddle's default payment link appends `_ptxn`; initializing Paddle.js on
  // this route lets its supported payment link open the prepared transaction.
  useEffect(() => {
    const pendingTransaction = new URLSearchParams(window.location.search).get("_ptxn");
    if (!pendingTransaction || !/^txn_[a-z\d]{26}$/.test(pendingTransaction) || !availability?.ready || !availability.clientToken) return;
    void initializePaddleCheckout({ environment: availability.environment === "production" ? "production" : "sandbox", clientToken: availability.clientToken }, () => {
      closePaddleCheckout();
      window.sessionStorage.setItem("tobyverse-plan-activation-pending", "any");
      setSyncingPlan(null);
    })
      .catch(() => setError("Paddle checkout could not be loaded. Refresh this page and try again."));
  }, [availability]);

  useEffect(() => {
    if (syncingPlan === undefined || !user) return;
    let alive = true;
    let timer = 0;
    const checkForSubscription = async () => {
      if (!alive) return;
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/account/access", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (response.ok) {
          const value: { access?: { plan?: string; source?: string; subscriptions?: Array<{ id: string; planId: string; environment: string; status: string; periodEndsAt: string | null }> } } = await response.json();
          const subscriptions = value.access?.subscriptions ?? [];
          const active = subscriptions.filter((subscription) => subscription.environment === availability?.environment
            && ["active", "trialing"].includes(subscription.status)
            && Date.parse(subscription.periodEndsAt ?? "") > Date.now());
          const confirmed = syncingPlan
            ? active.some((subscription) => subscription.planId === syncingPlan)
            : active.some((subscription) => !knownSubscriptions.current?.has(subscription.id));
          if (confirmed) {
            window.sessionStorage.removeItem("tobyverse-plan-activation-pending");
            const next = new URL(window.location.href);
            next.searchParams.delete("_ptxn");
            window.history.replaceState(null, "", `${next.pathname}${next.search}${next.hash}`);
            window.location.reload();
            return;
          }
        }
      } catch { /* Retry until the signed webhook has updated access. */ }
      if (alive) timer = window.setTimeout(() => void checkForSubscription(), 2000);
    };
    void checkForSubscription();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [syncingPlan, user, availability?.environment]);

  async function subscribe(planId: GrantPlanId) {
    if (!user || !signedIn || pending) return;
    setPending(planId); setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ planId, requestId: crypto.randomUUID() }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Checkout could not be opened. Try again shortly.");
      await openPaddleCheckout(value, (event) => {
        if (event.data?.transaction_id !== value.transactionId) return;
        closePaddleCheckout();
        window.sessionStorage.setItem("tobyverse-plan-activation-pending", planId);
        setSyncingPlan(planId);
      });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Checkout could not be opened.");
    } finally { setPending(null); }
  }

  async function changePlan(planId: GrantPlanId, downgrade: boolean) {
    if (!user || !signedIn || pending) return;
    if (!downgrade && !window.confirm("Paddle will calculate a prorated upgrade and may charge the difference immediately. Continue?")) return;
    setPending(planId); setError(""); setNotice("");
    try {
      const response = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Your plan could not be changed. Try again shortly.");
      setNotice(downgrade
        ? "Your plan changed to the lower tier. Any proration credit will be applied at your next renewal."
        : "Your upgrade is being applied. Paddle will confirm the updated access shortly.");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Your plan could not be changed.");
    } finally { setPending(null); }
  }

  const effective = resolveEffectivePlan({ storedPlan: profile?.plan, admin: profile?.admin });
  const activeSubscription = profile?.access?.subscriptions.find((subscription) => subscription.environment === availability?.environment
    && ["active", "trialing"].includes(subscription.status) && Date.parse(subscription.periodEndsAt ?? "") > Date.now());
  const currentPlanLabel = effective === "admin" ? "Admin" : effective === "free_beta" ? "Free Beta" : PLAN_CATALOG[effective].name;
  const loginHref = "/login?redirect=%2Fpricing";

  return (
    <main className="min-h-dvh overflow-hidden bg-[#0a0a0a] text-[#ececec]">
      <ForceMarketingDark />
      <header className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5 sm:px-8">
        <BrandMark />
        <Link href={signedIn ? "/account" : "/login"} className="rounded-full border border-[#292929] px-4 py-2 text-sm text-[#dedede] transition hover:border-[#555] hover:bg-[#171717]">
          {signedIn ? "Account" : "Sign in"}
        </Link>
      </header>

      <section className="relative mx-auto max-w-[1200px] px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
        <p className="text-sm text-[#929292]">TobyVerse</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Plans</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#a2a2a2]">Choose access for your work and learning. Your materials stay in TobyVerse when you change plans.</p>

        {signedIn ? (
          <div className="mt-8 rounded-2xl border border-[#282828] bg-[#151514] p-5 sm:p-6">
            <p className="text-xs text-[#8f8f8f]">Current plan</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-2"><p className="text-xl font-semibold">{currentPlanLabel}</p><span className="text-sm text-[#a2a2a2]">{effective === "admin" ? "Internal" : effective === "free_beta" ? "$0 during beta" : `$${(PLAN_CATALOG[effective].monthlyPriceCents ?? 0) / 100} / month`}</span></div>
            <p className="mt-1 text-sm text-[#a2a2a2]">{activeSubscription ? `${activeSubscription.status === "trialing" ? "Trialing" : "Active subscription"}${activeSubscription.scheduledEndsAt ? ` · changes on ${new Date(activeSubscription.scheduledEndsAt).toLocaleDateString()}` : ""}` : effective === "admin" ? "Unlimited beta access with admin controls." : "Your current access and included features."}</p>
          </div>
        ) : null}

        {availability?.ready && availability.environment === "sandbox" ? <p className="mt-6 text-sm text-amber-300">Sandbox checkout is enabled for authorized test accounts.</p> : null}
        {error ? <p role="alert" className="mt-6 text-sm text-red-400">{error}</p> : null}
        {notice ? <p role="status" className="mt-6 text-sm text-emerald-300">{notice}</p> : null}

        <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const plan = PLAN_CATALOG[card.id];
            const current = signedIn && effective === card.id;
            const purchasable = card.id !== "free_beta" && availability?.plans[card.id] === true;
            const allowance = card.id === "free_beta" ? plan.weeklyBudgetMicros : availability?.allowances[card.id] ?? plan.weeklyBudgetMicros;
            const price = plan.monthlyPriceCents;
            const storageCap = availability?.storageLimits?.[card.id] ?? storageLimitForPlan(card.id);
            const features = [
              card.id === "free_beta" ? "Core AI model access" : "All released AI models",
              `${storageCap == null ? "Unlimited" : formatBytes(storageCap)} material storage`,
            ];
            return (
              <article key={card.id} className={`flex min-h-[360px] flex-col rounded-3xl p-6 sm:p-7 ${card.featured ? "bg-[#142333] shadow-[0_16px_48px_#0091ff12]" : "bg-[#151514]"}`}>
                <div>
                  <h2 className="text-xl font-medium tracking-tight">{card.label}</h2>
                  <p className="mt-2 min-h-10 text-sm leading-5 text-[#8f8f8f]">{card.note}</p>
                  <p className="mt-7 flex items-baseline gap-2">
                    <span className="text-[38px] font-semibold tracking-[-0.05em]">{price === null ? "Coming soon" : `$${(price / 100).toFixed(price % 100 === 0 ? 0 : 2)}`}</span>
                    {price !== null ? <span className="text-sm text-[#858585]">{price === 0 ? "during beta" : "/ month"}</span> : null}
                  </p>
                </div>
                <ul className="mt-7 flex-1 space-y-3 text-[13px] leading-5 text-[#c5c5c5]">
                  {features.map((feature) => <li key={feature} className="flex gap-2.5"><span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#56b5ff]" />{feature}</li>)}
                  {allowance != null ? <li className="flex gap-2.5"><span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#56b5ff]" />${(allowance / 1_000_000).toFixed(2)} shared AI usage / UTC week</li> : null}
                </ul>
                {card.id === "free_beta" ? (
                  current || (signedIn && effective === "free_beta") ? (
                    <div className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#222220] px-4 text-sm text-[#b8b8b8]"><Check size={15} aria-hidden="true" />Current plan</div>
                  ) : (
                    <Link href={loginHref} className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ececec] px-4 text-sm font-medium text-[#101010] transition hover:bg-white">Start for free <ArrowRight size={15} aria-hidden="true" /></Link>
                  )
                ) : current ? (
                  <Link href="/account" className="mt-7 inline-flex h-11 items-center justify-center rounded-xl bg-[#222220] px-4 text-sm text-[#b8b8b8]">Current plan</Link>
                ) : purchasable ? (
                  <button type="button" onClick={() => activeSubscription ? void changePlan(card.id, price! < (PLAN_CATALOG[activeSubscription.planId].monthlyPriceCents ?? 0)) : void subscribe(card.id)} disabled={pending !== null || syncingPlan !== undefined} className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ececec] px-4 text-sm font-medium text-[#101010] transition hover:bg-white disabled:cursor-wait disabled:opacity-60">{pending === card.id ? (activeSubscription ? "Updating plan…" : "Opening checkout…") : activeSubscription ? (price! < (PLAN_CATALOG[activeSubscription.planId].monthlyPriceCents ?? 0) ? "Downgrade" : "Upgrade") : "Choose plan"}<ArrowRight size={15} aria-hidden="true" /></button>
                ) : signedIn ? (
                  <div className="mt-7 flex h-11 items-center justify-center gap-2 rounded-xl bg-[#222220] px-4 text-sm text-[#858585]" aria-label={`${card.label} checkout is not available`}><LockKeyhole size={14} aria-hidden="true" />{availability ? "Not available yet" : "Checking availability…"}</div>
                ) : (
                  <Link href={loginHref} className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#222220] px-4 text-sm text-[#d0d0d0] transition hover:bg-[#292929]">Sign in to subscribe <ArrowRight size={14} aria-hidden="true" /></Link>
                )}
              </article>
            );
          })}
        </div>

        <p className="relative mt-7 max-w-[760px] text-xs leading-5 text-[#777]">
          Prices are monthly. Upgrades are prorated and billed immediately; downgrades apply now, with any proration credit applied at renewal. Read the <Link className="text-[#b8b8b8] underline underline-offset-4 hover:text-white" href="/refunds">Refund Policy</Link> and <Link className="text-[#b8b8b8] underline underline-offset-4 hover:text-white" href="/terms">Terms</Link>.
        </p>
      </section>

      <footer><nav aria-label="Policies" className="mx-auto flex max-w-[1200px] flex-wrap gap-x-6 gap-y-3 px-5 py-6 text-sm text-[#999] sm:px-8"><Link href="/privacy" className="hover:text-white">Privacy</Link><Link href="/terms" className="hover:text-white">Terms</Link><Link href="/refunds" className="hover:text-white">Refunds</Link><Link href="/pricing" className="hover:text-white">Pricing</Link></nav></footer>

      {syncingPlan !== undefined ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="plan-sync-title" aria-describedby="plan-sync-description">
          <div className="w-full max-w-sm rounded-2xl border border-[#353535] bg-[#151514] p-7 text-center shadow-2xl">
            <div aria-hidden="true" className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-[#444] border-t-white" />
            <h2 id="plan-sync-title" className="mt-5 text-lg font-semibold">Updating your plan…</h2>
            <p id="plan-sync-description" className="mt-2 text-sm leading-6 text-[#aaa]">We’re confirming the subscription and refreshing your access. Keep this page open for a moment.</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
