"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PLAN_LIMIT_EVENT, requestPlanUpgrade, type PlanLimitReason } from "@/lib/billing/limit-prompt";

export function PlanLimitDialog() {
  const [reason, setReason] = useState<PlanLimitReason | null>(null);

  useEffect(() => {
    const onLimit = (event: Event) => {
      const detail = (event as CustomEvent<PlanLimitReason>).detail;
      if (detail === "storage" || detail === "ai") setReason(detail);
    };
    window.addEventListener(PLAN_LIMIT_EVENT, onLimit);
    const nativeFetch = window.fetch;
    const observedFetch: typeof window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      if (response.status === 429 || response.status === 413) {
        void response.clone().json().then((body: { code?: unknown; remainingBytes?: unknown }) => {
          if (body.code === "weekly_ai_budget_exhausted") requestPlanUpgrade("ai");
          else if (response.status === 413 && typeof body.remainingBytes === "number") requestPlanUpgrade("storage");
        }).catch(() => undefined);
      }
      return response;
    };
    window.fetch = observedFetch;
    return () => {
      window.removeEventListener(PLAN_LIMIT_EVENT, onLimit);
      if (window.fetch === observedFetch) window.fetch = nativeFetch;
    };
  }, []);

  useEffect(() => {
    if (!reason) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setReason(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reason]);

  if (!reason) return null;

  const copy = reason === "storage"
    ? { title: "Storage is full", body: "Upgrade your plan for more room to add materials." }
    : { title: "AI usage is used up", body: "Your weekly AI allowance renews on Monday. Upgrade for a larger allowance." };

  return (
    <div className="popup-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setReason(null)}>
      <section role="dialog" aria-modal="true" aria-labelledby="plan-limit-title" className="popup-surface w-full max-w-[420px] rounded-2xl bg-surface p-6 text-foreground shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <h2 id="plan-limit-title" className="text-lg font-semibold">{copy.title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{copy.body}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm" onClick={() => setReason(null)}>Maybe later</button>
          <Link href="/pricing" onClick={() => setReason(null)} className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background">View plans</Link>
        </div>
      </section>
    </div>
  );
}
