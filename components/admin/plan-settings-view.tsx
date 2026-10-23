"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CircleAlert, Save, Settings2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { PLAN_CATALOG } from "@/lib/billing/plans";
import { formatBytes } from "@/lib/format";
import type { ConfigurablePlanId, PlanPolicy } from "@/types/billing-admin";
import "./plan-settings-view.css";

const PLANS: ConfigurablePlanId[] = ["free_beta", "lite", "pro", "max", "team"];
const LABELS: Record<ConfigurablePlanId, string> = { free_beta: "Free Beta", lite: "Lite", pro: "Pro", max: "Max", team: "Team" };
const GIB = 1024 ** 3;
const formatMoney = (micros: number | null) => micros == null ? "Not configured" : `$${(micros / 1_000_000).toFixed(2)} / week`;
const formatPlanPrice = (cents: number | null) => cents == null ? "Not set in catalog" : cents === 0 ? "Free" : `$${(cents / 100).toFixed(2)} / month`;

export function PlanSettingsView() {
  const { user } = useAuth();
  const [policies, setPolicies] = useState<PlanPolicy[]>([]);
  const [selectedId, setSelectedId] = useState<ConfigurablePlanId>("pro");
  const [weeklyBudget, setWeeklyBudget] = useState("");
  const [storageGiB, setStorageGiB] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selected = useMemo(() => policies.find((item) => item.planId === selectedId), [policies, selectedId]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/plans/policies", { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
      const result = await response.json() as { policies?: PlanPolicy[]; error?: string };
      if (!response.ok || !result.policies) throw new Error(result.error || "Plan settings could not be loaded.");
      setPolicies(result.policies);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Plan settings could not be loaded.");
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selected) return;
    setWeeklyBudget(selected.weeklyBudgetMicros == null ? "" : (selected.weeklyBudgetMicros / 1_000_000).toFixed(2));
    setStorageGiB(selected.storageLimitBytes == null ? "" : (selected.storageLimitBytes / GIB).toFixed(3).replace(/0+$/, "").replace(/\.$/, ""));
    setReason("");
  }, [selected]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !selected || saving) return;
    setError(""); setNotice("");
    const dollars = Number(weeklyBudget);
    const gib = Number(storageGiB);
    const micros = Math.round(dollars * 1_000_000);
    const bytes = Math.round(gib * GIB);
    if (!Number.isFinite(dollars) || dollars < 0.01 || dollars > 1000 || Math.abs(dollars * 1_000_000 - micros) > 0.000001) { setError("Weekly AI allowance must be between $0.01 and $1,000."); return; }
    if (!Number.isFinite(gib) || bytes < 50 * 1024 * 1024 || bytes > 5 * 1024 ** 4) { setError("Storage must be between 0.05 GB and 5,120 GB."); return; }
    if (reason.trim().length < 3) { setError("Add a short reason for the change."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/plans/policies", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedId, weeklyBudgetMicros: micros, storageLimitBytes: bytes, expectedRevision: selected.revision, reason: reason.trim(), requestId: crypto.randomUUID() }),
      });
      const result = await response.json() as { policies?: PlanPolicy[]; error?: string };
      if (response.status === 409) throw new Error(`${result.error || "These settings changed elsewhere."} Reload before saving again.`);
      if (!response.ok || !result.policies) throw new Error(result.error || "Plan settings could not be saved.");
      setPolicies(result.policies);
      setNotice(`${LABELS[selectedId]} settings saved and applied.`);
      setReason("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Plan settings could not be saved.");
    } finally { setSaving(false); }
  }

  return <section className="plan-settings-page">
    <div className="plan-settings-wrap">
      <header className="plan-settings-heading">
        <div><Link href="/admin/plans" className="plan-settings-back"><ArrowLeft size={15} />Accounts and access</Link><h1>Plan settings</h1><p>Set the weekly AI budget and material storage limit applied to each plan.</p></div>
        <span className="plan-settings-heading-icon"><Settings2 size={20} /></span>
      </header>

      {error && !policies.length ? <div className="plan-settings-message is-error" role="alert"><CircleAlert size={17} />{error}<button type="button" onClick={() => void load()}>Reload</button></div> : null}
      <div className="plan-settings-layout" aria-busy={loading}>
        <nav className="plan-settings-list" aria-label="Plans">
          {PLANS.map((id) => {
            const policy = policies.find((item) => item.planId === id);
            return <button key={id} type="button" aria-current={selectedId === id ? "true" : undefined} className={`plan-settings-item ${selectedId === id ? "is-selected" : ""}`} onClick={() => { setSelectedId(id); setError(""); setNotice(""); }} disabled={loading || saving}>
              <span className="plan-settings-item-copy"><strong>{LABELS[id]}</strong><small>{formatPlanPrice(PLAN_CATALOG[id].monthlyPriceCents)} · {formatMoney(policy?.weeklyBudgetMicros ?? null)}</small></span>
              <span className="plan-settings-item-storage">{policy?.storageLimitBytes == null ? "—" : formatBytes(policy.storageLimitBytes)}</span>
            </button>;
          })}
        </nav>

        <main className="plan-settings-editor">
          <div className="plan-settings-editor-title"><div><h2>{LABELS[selectedId]}</h2><p>{PLAN_CATALOG[selectedId].description}</p></div><span>{formatPlanPrice(PLAN_CATALOG[selectedId].monthlyPriceCents)}</span></div>
          {loading ? <p className="plan-settings-empty" role="status">Loading plan settings…</p> : selected ? <form onSubmit={save}>
            <p className="plan-settings-note">Changes apply to every account on this plan. Storage caps are checked by the server; lowering a cap does not remove existing files, but may prevent new uploads until usage is below the limit.</p>
            <div className="plan-settings-fields">
              <label><span>Weekly AI allowance <small>USD in provider AI costs per UTC week</small></span><span className="plan-settings-input"><b>$</b><input type="number" min="0.01" max="1000" step="0.01" inputMode="decimal" value={weeklyBudget} onChange={(event) => setWeeklyBudget(event.target.value)} required disabled={saving} /></span></label>
              <label><span>Material storage <small>Per account · 1 GB = 1,024 MB</small></span><span className="plan-settings-input"><input type="number" min="0.05" max="5120" step="0.05" inputMode="decimal" value={storageGiB} onChange={(event) => setStorageGiB(event.target.value)} required disabled={saving} /><b>GB</b></span></label>
            </div>
            <label className="plan-settings-reason">Reason for this change<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} minLength={3} maxLength={400} placeholder="For example: increase storage for the new plan limits" required disabled={saving} /></label>
            {notice ? <p className="plan-settings-message is-success" role="status"><Check size={16} />{notice}</p> : null}
            {error ? <p className="plan-settings-message is-error" role="alert"><CircleAlert size={16} />{error}<button type="button" onClick={() => void load()} disabled={saving}>Reload</button></p> : null}
            <footer className="plan-settings-actions"><span>Last updated {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : "Using defaults"}</span><button type="submit" disabled={saving || !reason.trim()}><Save size={15} />{saving ? "Saving…" : "Save settings"}</button></footer>
          </form> : null}
          <aside className="plan-settings-billing-note"><strong>Subscription prices are managed in Paddle</strong><p>Keep the Paddle product price and app plan in sync before accepting a price change. This page controls TobyVerse access limits only.</p></aside>
        </main>
      </div>
    </div>
  </section>;
}
