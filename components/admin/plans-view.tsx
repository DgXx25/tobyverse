"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { UiIcon } from "@/components/workspace/ui-icon";
import type { AdminPlanDetail, AdminPlansResponse, AdminPlanUser, GrantPlanId } from "@/types/billing-admin";
import "./plans-view.css";

const PLANS: GrantPlanId[] = ["lite", "pro", "max", "team"];
const PLAN_NAMES: Record<string, string> = { free_beta: "Free beta", lite: "Lite", pro: "Pro", max: "Max", team: "Team", admin: "Admin" };
const SOURCES: Record<string, string> = { admin: "Administrator", manual: "Manual grant", subscription: "Subscription", legacy: "Existing access", free: "Free access" };
const money = (micros: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 6 }).format(micros / 1_000_000);
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Permanent";
const isAborted = (cause: unknown) => cause instanceof Error && cause.name === "AbortError";
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "Something went wrong. Try again.";

class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function Modal({ children, titleId, className = "", busy, onClose }: { children: ReactNode; titleId: string; className?: string; busy: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className={`plans-dialog ${className}`} aria-labelledby={titleId} aria-busy={busy} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !busy) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    {children}
  </dialog>;
}

function Identity({ account, large = false }: { account: AdminPlanUser; large?: boolean }) {
  const name = account.displayName || account.email || "Unnamed account";
  return <div className={`plans-identity ${large ? "plans-identity-large" : ""}`}>
    {account.photoURL ? <img className="plans-avatar" src={account.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="plans-avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>}
    <div className="plans-identity-copy"><strong title={name}>{name}</strong><span title={account.email || account.uid}>{account.email || account.uid}</span></div>
  </div>;
}

export function PlansView() {
  const { user } = useAuth();
  const [data, setData] = useState<AdminPlansResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminPlanDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [grantPlan, setGrantPlan] = useState<GrantPlanId>("pro");
  const [duration, setDuration] = useState("30");
  const [customDate, setCustomDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const listRequest = useRef<AbortController | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const mutationRequest = useRef<AbortController | null>(null);

  const request = useCallback(async <T,>(url: string, signal: AbortSignal, body?: object): Promise<T> => {
    if (!user) throw new Error("Sign in to manage plans.");
    const token = await user.getIdToken();
    signal.throwIfAborted();
    const response = await fetch(url, { method: body ? "POST" : "GET", signal, cache: "no-store", headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json() as T & { error?: string };
    if (!response.ok) throw new ApiError(result.error || "Could not complete the request.", response.status);
    return result;
  }, [user]);

  const loadList = useCallback(async (query: string, cursor?: string) => {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setLoading(true);
    setListError("");
    try {
      const params = new URLSearchParams();
      if (query) params.set("search", query);
      if (cursor) params.set("cursor", cursor);
      const result = await request<AdminPlansResponse>(`/api/admin/plans?${params}`, controller.signal);
      if (!controller.signal.aborted) setData((previous) => ({ ...result, users: cursor && previous ? [...previous.users, ...result.users.filter((account) => !previous.users.some((item) => item.uid === account.uid))] : result.users }));
      return !controller.signal.aborted;
    } catch (cause) { if (!controller.signal.aborted) setListError(errorText(cause)); }
    finally { if (!controller.signal.aborted) setLoading(false); }
    return false;
  }, [request]);

  const loadDetail = useCallback(async (uid: string, resetForm = false) => {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setDetailLoading(true);
    setDetailError("");
    try {
      const result = await request<AdminPlanDetail>(`/api/admin/plans/${encodeURIComponent(uid)}`, controller.signal);
      if (!controller.signal.aborted) {
        setDetail(result);
        if (resetForm) { setGrantPlan(result.user.access.grant?.planId || "pro"); setDuration("30"); setCustomDate(""); }
      }
      return !controller.signal.aborted;
    } catch (cause) { if (!controller.signal.aborted) setDetailError(errorText(cause)); }
    finally { if (!controller.signal.aborted) setDetailLoading(false); }
    return false;
  }, [request]);

  useEffect(() => { if (user) void loadList(search); return () => listRequest.current?.abort(); }, [user, search, loadList]);
  useEffect(() => {
    if (selectedUid) { setDetail(null); setNotice(""); void loadDetail(selectedUid, true); }
    return () => detailRequest.current?.abort();
  }, [selectedUid, loadDetail]);
  useEffect(() => () => { listRequest.current?.abort(); detailRequest.current?.abort(); mutationRequest.current?.abort(); }, []);

  const policies = detail?.policies ?? data?.policies ?? [];
  const selectedPolicy = policies.find((policy) => policy.planId === grantPlan);
  const grantConfigured = selectedPolicy?.weeklyBudgetMicros != null;
  const activeGrant = detail?.user.access.grant && !detail.user.access.grant.revokedAt;
  const manualGrant = detail?.user.access.grant;

  function closeDetail() {
    if (saving) return;
    detailRequest.current?.abort();
    setSelectedUid(null);
    setDetail(null);
    setDetailError("");
  }

  async function changeGrant(action: "grant" | "revoke") {
    if (!detail || saving) return;
    setDetailError("");
    setNotice("");
    let expiresAt: string | null = null;
    if (action === "grant") {
      if (!grantConfigured) { setDetailError("Configure this plan’s weekly AI allowance before granting access."); return; }
      if (duration === "custom") {
        const chosen = new Date(customDate);
        if (!Number.isFinite(chosen.getTime()) || chosen.getTime() <= Date.now()) { setDetailError("Choose an expiry date and time in the future."); return; }
        expiresAt = chosen.toISOString();
      } else if (duration !== "permanent") expiresAt = new Date(Date.now() + Number(duration) * 86_400_000).toISOString();
    }
    const controller = new AbortController();
    mutationRequest.current = controller;
    setSaving(true);
    try {
      const result = await request<AdminPlanDetail>(`/api/admin/plans/${encodeURIComponent(detail.user.uid)}`, controller.signal, { action, ...(action === "grant" ? { planId: grantPlan, expiresAt } : {}), expectedRevision: detail.user.access.revision, requestId: crypto.randomUUID() });
      if (controller.signal.aborted) return;
      setDetail(result);
      setNotice(action === "grant" ? `${PLAN_NAMES[grantPlan]} grant saved.` : "Manual grant revoked. Purchased subscriptions are unchanged.");
      void loadList(search);
    } catch (cause) {
      if (!isAborted(cause)) {
        if (cause instanceof ApiError && cause.status === 409) {
          const reloaded = await loadDetail(detail.user.uid);
          setDetailError(`${errorText(cause)} ${reloaded ? "Account access has been reloaded. Review it before saving again." : "Could not reload account access. Try again before saving."}`);
          void loadList(search);
        } else setDetailError(errorText(cause));
      }
    } finally { if (!controller.signal.aborted) setSaving(false); }
  }

  return <section className="plans-view">
    <div className="plans-content">
      <header className="plans-heading"><div><h1>Plans</h1><p>Manage account access and assignments.</p></div><Link className="plans-button" href="/admin/plan-settings"><UiIcon name="settings" size={16} />Plan settings</Link></header>
      <form className="plans-search" onSubmit={(event) => { event.preventDefault(); const query = searchInput.trim(); if (query === search) void loadList(query); else { setData(null); setSearch(query); } }}>
        <label className="plans-search-field"><UiIcon name="search" size={18} /><span className="plans-sr-only">Search by exact email or account UID</span><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search by exact email or account UID" autoComplete="off" /></label>
        <button className="plans-button" type="submit" disabled={loading}>Search</button>
        {search ? <button className="plans-text-button" type="button" onClick={() => { setSearchInput(""); setData(null); setSearch(""); }}>Clear</button> : null}
      </form>
      {notice && !selectedUid ? <p className="plans-notice" role="status">{notice}</p> : null}
      {listError ? <div className="plans-error" role="alert">{listError} <button type="button" className="plans-text-button" onClick={() => void loadList(search)}>Try again</button></div> : null}
      <div className="plans-table" role="table" aria-label="Account plans" aria-busy={loading}>
        <div className="plans-row plans-table-head" role="row"><span role="columnheader">Account</span><span role="columnheader">Plan</span><span className="plans-origin" role="columnheader">Access from</span><span className="plans-expiry" role="columnheader">Expires</span><span role="columnheader" className="plans-sr-only">Actions</span></div>
        <div role="rowgroup">{data?.users.map((account) => <div className="plans-row" role="row" key={account.uid}>
          <div role="cell"><Identity account={account} /></div>
          <div role="cell"><span className={`plans-plan ${account.access.plan === "free_beta" ? "plans-plan-free" : ""}`}>{PLAN_NAMES[account.access.plan] || account.access.plan}</span><span className="plans-mobile-expiry">{account.access.expiresAt ? `Until ${dateTime(account.access.expiresAt)}` : "Permanent"}</span></div>
          <span className="plans-origin plans-secondary" role="cell">{SOURCES[account.access.source] || account.access.source}</span>
          <span className="plans-expiry plans-secondary" role="cell">{dateTime(account.access.expiresAt)}</span>
          <div role="cell" className="plans-row-action"><button type="button" className="plans-manage" onClick={() => setSelectedUid(account.uid)} aria-label={`Manage ${account.displayName || account.email || account.uid}`}>Manage<UiIcon name="forward" size={14} /></button></div>
        </div>)}</div>
      </div>
      {loading ? <p className="plans-empty" role="status">Loading accounts…</p> : !listError && data?.users.length === 0 ? <div className="plans-empty"><UiIcon name="search" size={24} /><p>{search ? "No account found." : "No registered accounts yet."}</p>{search ? <span>Use the complete email address or account UID.</span> : null}</div> : null}
      {data?.nextCursor ? <div className="plans-pagination"><span>{data.users.length} accounts loaded</span><button type="button" className="plans-button" disabled={loading} onClick={() => void loadList(search, data.nextCursor || undefined)}>Load more</button></div> : null}
      {data ? <details className="plans-provider"><summary><UiIcon name="billing" size={16} /><span>Paddle</span><span className="plans-provider-state">{data.paddle.enabled && data.paddle.ready ? `Ready · ${data.paddle.environment}` : "Pending configuration"}</span></summary><div><p>{data.paddle.enabled && data.paddle.ready ? `Checkout is configured for ${data.paddle.environment}.` : `Checkout remains pending until the owner completes ${data.paddle.environment} configuration.`}</p>{data.paddle.missing.length ? <p>Missing settings: {data.paddle.missing.map((key) => <code key={key}>{key} </code>)}</p> : null}<p>Price mappings: {PLANS.map((plan) => `${PLAN_NAMES[plan]} ${data.paddle.plans[plan] ? "configured" : "pending"}`).join(" · ")}</p></div></details> : null}
    </div>

    {selectedUid ? <Modal className="plans-drawer" titleId="plan-detail-title" busy={saving} onClose={closeDetail}>
      <header className="plans-dialog-heading"><div><h2 id="plan-detail-title">Manage access</h2><p>Account plans and history</p></div><button type="button" className="plans-icon-button" aria-label="Close account details" onClick={closeDetail} disabled={saving}><UiIcon name="close" size={20} /></button></header>
      <div className="plans-drawer-body">
        {detailLoading ? <p className="plans-secondary" role="status">Loading account access…</p> : null}
        {detailError ? <p className="plans-error" role="alert">{detailError}{!detailLoading ? <> <button type="button" className="plans-text-button" disabled={saving} onClick={() => void loadDetail(selectedUid, !detail)}>Reload access</button></> : null}</p> : null}
        {notice ? <p className="plans-notice" role="status">{notice}</p> : null}
        {detail ? <>
          <Identity account={detail.user} large /><p className="plans-uid">UID: {detail.user.uid}</p>
          <section className="plans-detail-section"><h3>Effective access</h3><dl className="plans-facts"><div><dt>Plan</dt><dd>{PLAN_NAMES[detail.user.access.plan]}</dd></div><div><dt>Access from</dt><dd>{SOURCES[detail.user.access.source]}</dd></div><div><dt>Expires</dt><dd>{dateTime(detail.user.access.expiresAt)}</dd></div><div><dt>Weekly AI allowance</dt><dd>{detail.user.access.source === "admin" ? "Unlimited" : detail.user.access.weeklyBudgetMicros == null ? "Not configured" : money(detail.user.access.weeklyBudgetMicros)}</dd></div></dl></section>
          <section className="plans-detail-section"><h3>Manual grant</h3><p className="plans-help">Assign a plan for a chosen time. The highest valid plan determines account access.</p>
            {manualGrant ? <div className="plans-current-grant"><strong>{PLAN_NAMES[manualGrant.planId]}</strong><span>{manualGrant.revokedAt ? `Revoked ${dateTime(manualGrant.revokedAt)}` : manualGrant.expiresAt && new Date(manualGrant.expiresAt).getTime() <= new Date(detail.user.access.serverNow).getTime() ? `Expired ${dateTime(manualGrant.expiresAt)}` : `Expires: ${dateTime(manualGrant.expiresAt)}`}</span><p>{manualGrant.reason}</p></div> : <p className="plans-help">No manual grant on this account.</p>}
            <form onSubmit={(event) => { event.preventDefault(); void changeGrant("grant"); }}>
              <fieldset className="plans-fieldset" disabled={saving || detailLoading}><div className="plans-form-grid"><label className="plans-field">Plan<select value={grantPlan} onChange={(event) => setGrantPlan(event.target.value as GrantPlanId)}>{PLANS.map((plan) => <option key={plan} value={plan}>{PLAN_NAMES[plan]}</option>)}</select></label><label className="plans-field">Duration<select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="permanent">Permanent</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="custom">Custom date</option></select></label></div>
                {duration === "custom" ? <label className="plans-field">Expires at (your local time)<input type="datetime-local" value={customDate} onChange={(event) => setCustomDate(event.target.value)} required /></label> : null}
                {!grantConfigured ? <p className="plans-help plans-configuration">{PLAN_NAMES[grantPlan]} needs a weekly AI allowance. <Link className="plans-text-button" href="/admin/plan-settings">Configure plan</Link></p> : <p className="plans-help">{money(selectedPolicy.weeklyBudgetMicros!)} of provider AI spend per UTC week.</p>}
                <div className="plans-grant-actions"><button type="submit" className="plans-button plans-primary" disabled={!grantConfigured}>{saving ? "Saving…" : activeGrant ? "Replace manual grant" : "Grant plan"}</button>{activeGrant ? <button type="button" className="plans-text-button plans-danger" onClick={() => void changeGrant("revoke")}>Revoke manual grant</button> : null}</div>
                {activeGrant ? <p className="plans-help">Revoking removes the manual grant. Purchased subscriptions continue separately.</p> : null}
              </fieldset>
            </form>
          </section>
          <section className="plans-detail-section"><h3>Subscriptions</h3><p className="plans-help">Provider subscriptions are read only here.</p>{detail.user.access.subscriptions.length ? <div className="plans-record-list">{detail.user.access.subscriptions.map((subscription) => <article key={subscription.id}><div className="plans-record-title"><strong>{PLAN_NAMES[subscription.planId]}</strong><span>{subscription.status.replaceAll("_", " ")}</span></div><p>Period ends: {subscription.periodEndsAt ? dateTime(subscription.periodEndsAt) : "Not recorded"}</p>{subscription.scheduledEndsAt ? <p>Scheduled end: {dateTime(subscription.scheduledEndsAt)}</p> : null}<p className="plans-record-id">{subscription.id}</p></article>)}</div> : <p className="plans-help">No provider subscriptions.</p>}</section>
          <section className="plans-detail-section"><h3>Access history</h3>{detail.history.length ? <ol className="plans-history">{detail.history.map((entry) => <li key={entry.id}><div className="plans-record-title"><strong>{entry.action.replaceAll("_", " ")}{entry.planId ? ` · ${PLAN_NAMES[entry.planId] || entry.planId}` : ""}</strong><time dateTime={entry.createdAt}>{dateTime(entry.createdAt)}</time></div><p>{entry.reason}</p><span className="plans-record-id">By {entry.actorId}</span>{entry.expiresAt ? <span className="plans-help">Expires {dateTime(entry.expiresAt)}</span> : null}</li>)}</ol> : <p className="plans-help">No access changes recorded.</p>}</section>
        </> : null}
      </div>
    </Modal> : null}

  </section>;
}
