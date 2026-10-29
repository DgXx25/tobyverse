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
const formatMonthlyBudget = (weeklyMicros: number | null) => weeklyMicros == null ? "Not configured" : `$${(weeklyMicros * 4 / 1_000_000).toFixed(2)} AI / month`;
const formatPlanPrice = (cents: number | null) => cents == null ? "—" : cents === 0 ? "Free" : `$${(cents / 100).toFixed(2)} / month`;

export function PlanSettingsView() {
  const { user } = useAuth();
  const [policies, setPolicies] = useState<PlanPolicy[]>([]);
  const [selectedId, setSelectedId] = useState<ConfigurablePlanId>("pro");
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [storageGiB, setStorageGiB] = useState("");
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
    setMonthlyBudget(selected.weeklyBudgetMicros == null ? "" : (selected.weeklyBudgetMicros * 4 / 1_000_000).toFixed(2));
    setStorageGiB(selected.storageLimitBytes == null ? "" : (selected.storageLimitBytes / GIB).toFixed(3).replace(/0+$/, "").replace(/\.$/, ""));
  }, [selected]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !selected || saving) return;
    setError(""); setNotice("");
    const monthlyDollars = Number(monthlyBudget);
    const gib = Number(storageGiB);
    // The plan policy remains a weekly allowance; each monthly amount is split into four equal renewals.
    const weeklyMicros = Math.round(monthlyDollars * 1_000_000 / 4);
    const bytes = Math.round(gib * GIB);
    if (!Number.isFinite(monthlyDollars) || monthlyDollars < 0.04 || monthlyDollars > 4000 || Math.abs(monthlyDollars * 1_000_000 - Math.round(monthlyDollars * 1_000_000)) > 0.000001) { setError("Monthly AI budget must be between $0.04 and $4,000."); return; }
    if (!Number.isFinite(gib) || bytes < 50 * 1024 * 1024 || bytes > 5 * 1024 ** 4) { setError("Storage must be between 0.05 GB and 5,120 GB."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/plans/policies", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedId, weeklyBudgetMicros: weeklyMicros, storageLimitBytes: bytes, expectedRevision: selected.revision, requestId: crypto.randomUUID() }),
      });
      const result = await response.json() as { policies?: PlanPolicy[]; error?: string };
      if (response.status === 409) throw new Error(`${result.error || "These settings changed elsewhere."} Reload before saving again.`);
      if (!response.ok || !result.policies) throw new Error(result.error || "Plan settings could not be saved.");
      setPolicies(result.policies);
      setNotice(`${LABELS[selectedId]} settings saved and applied.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Plan settings could not be saved.");
    } finally { setSaving(false); }
  }

  return <section className="plan-settings-page">
    <div className="plan-settings-wrap">
      <header className="plan-settings-heading">
        <div><Link href="/admin/plans" className="plan-settings-back"><ArrowLeft size={15} />Accounts and access</Link><h1>Plan settings</h1></div>
        <span className="plan-settings-heading-icon"><Settings2 size={20} /></span>
      </header>

      {error && !policies.length ? <div className="plan-settings-message is-error" role="alert"><CircleAlert size={17} />{error}<button type="button" onClick={() => void load()}>Reload</button></div> : null}
      <div className="plan-settings-layout" aria-busy={loading}>
        <nav className="plan-settings-list" aria-label="Plans">
          {PLANS.map((id) => {
            const policy = policies.find((item) => item.planId === id);
            return <button key={id} type="button" aria-current={selectedId === id ? "true" : undefined} className={`plan-settings-item ${selectedId === id ? "is-selected" : ""}`} onClick={() => { setSelectedId(id); setError(""); setNotice(""); }} disabled={loading || saving}>
              <span className="plan-settings-item-copy"><strong>{LABELS[id]}</strong><small>{formatPlanPrice(PLAN_CATALOG[id].monthlyPriceCents)} · {formatMonthlyBudget(policy?.weeklyBudgetMicros ?? null)}</small></span>
              <span className="plan-settings-item-storage">{policy?.storageLimitBytes == null ? "—" : formatBytes(policy.storageLimitBytes)}</span>
            </button>;
          })}
        </nav>

        <main className="plan-settings-editor">
          <div className="plan-settings-editor-title"><h2>{LABELS[selectedId]}</h2><span>{formatPlanPrice(PLAN_CATALOG[selectedId].monthlyPriceCents)}</span></div>
          {loading ? <p className="plan-settings-empty" role="status">Loading plan settings…</p> : selected ? <form onSubmit={save}>
            <div className="plan-settings-fields">
              <label><span>Monthly AI budget <small>4 weekly resets</small></span><span className="plan-settings-input"><b>$</b><input type="number" min="0.04" max="4000" step="0.01" inputMode="decimal" value={monthlyBudget} onChange={(event) => setMonthlyBudget(event.target.value)} required disabled={saving} /></span><small className="plan-settings-budget-preview">Per week: {monthlyBudget && Number.isFinite(Number(monthlyBudget)) ? `$${(Number(monthlyBudget) / 4).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}` : "—"}</small></label>
              <label><span>Material storage <small>Per account</small></span><span className="plan-settings-input"><input type="number" min="0.05" max="5120" step="0.05" inputMode="decimal" value={storageGiB} onChange={(event) => setStorageGiB(event.target.value)} required disabled={saving} /><b>GB</b></span></label>
            </div>
            {notice ? <p className="plan-settings-message is-success" role="status"><Check size={16} />{notice}</p> : null}
            {error ? <p className="plan-settings-message is-error" role="alert"><CircleAlert size={16} />{error}<button type="button" onClick={() => void load()} disabled={saving}>Reload</button></p> : null}
            <footer className="plan-settings-actions"><span>Last updated {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : "Using defaults"}</span><button type="submit" disabled={saving}><Save size={15} />{saving ? "Saving…" : "Save settings"}</button></footer>
          </form> : null}
        </main>
      </div>
    </div>
  </section>;
}
