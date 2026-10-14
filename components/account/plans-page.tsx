"use client";

import Link from "next/link";
import { PLAN_CATALOG, resolveEffectivePlan } from "@/lib/billing/plans";
import { useUserProfile } from "@/components/account/use-user-profile";

const cards = [
  { id: "free_beta" as const, label: "Free Beta", price: "$0", features: ["Beta access included", "Material notes and practice", "1 GB material storage"] },
  { id: "lite" as const, label: "Lite", price: "$10", features: ["More room for everyday AI work", "Usage analytics", "Priority plan controls"] },
  { id: "pro" as const, label: "Pro", price: "$20", features: ["Deeper study workflows", "Higher future allowance", "Advanced workspace tools"] },
  { id: "max" as const, label: "Max", price: "$50", features: ["Maximum individual access", "Highest future allowance", "Early feature access"] },
  { id: "team" as const, label: "Team", price: "Team", features: ["One payer for multiple seats", "Invite people to your team", "Shared administration"] },
];

export function PlansPage() {
  const { profile } = useUserProfile();
  const effective = resolveEffectivePlan({ storedPlan: profile?.plan, admin: profile?.admin });
  return (
    <main className="min-h-dvh bg-background px-5 py-10 text-foreground md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4"><div><p className="text-sm text-muted">TobyVerse</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Plans</h1><p className="mt-2 max-w-2xl text-sm text-muted">One shared AI meter, transparent cost tracking, and future plans ready when beta ends.</p></div><Link href="/account" className="rounded-full border border-border px-4 py-2 text-sm">Account</Link></div>
        {effective === "admin" ? <div className="mt-8 rounded-2xl border border-border bg-surface-2 p-5"><p className="text-xs text-muted">Current plan</p><p className="mt-1 text-xl font-semibold">Admin</p><p className="mt-1 text-sm text-muted">Unlimited beta access with admin controls.</p></div> : null}
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => {
            const plan = PLAN_CATALOG[card.id];
            const current = effective === card.id;
            return <article key={card.id} className={`flex flex-col rounded-2xl border p-5 ${current ? "border-foreground" : "border-border bg-surface-2"}`}><p className="text-xl font-semibold">{card.label}</p><p className="mt-4 text-3xl font-semibold">{card.price}{card.id !== "team" ? <span className="text-sm font-normal text-muted"> / month</span> : null}</p><ul className="mt-6 flex-1 space-y-3 text-sm text-muted">{card.features.map((feature) => <li key={feature}>• {feature}</li>)}</ul><button type="button" disabled={!plan.available || current} className="mt-8 rounded-full border border-border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60">{current ? "Current plan" : plan.available ? "Available" : "Available after beta"}</button></article>;
          })}
        </div>
      </div>
    </main>
  );
}
