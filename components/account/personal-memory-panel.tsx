"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/components/auth-provider";
import { authHeaders } from "@/lib/api/client";
import { clearCachedLearningProfile } from "@/lib/memory/profile";

type MemoryView = { summary: string; revision: number; updatedAt: string | null; needsReview?: boolean; usage: { savedFacts: number }; limits: { savedFacts: number | null } };

export function PersonalMemoryPanel() {
  const { user } = useAuth();
  const userId = user?.uid ?? "";
  const [view, setView] = useState<MemoryView | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [loadingVisible, setLoadingVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [conflict, setConflict] = useState(false);
  const generation = useRef(0);
  const invalidateRead = useCallback(() => { generation.current++; }, []);
  const account = useRef(userId);
  account.current = userId;
  const reload = useCallback(async () => {
    if (!userId) return;
    const current = ++generation.current;
    try {
      const response = await fetch("/api/memory", { headers: await authHeaders(), cache: "no-store" });
      if (!response.ok) throw new Error("Could not load memory. Try again.");
      const next = await response.json() as MemoryView;
      if (current === generation.current) { setView(next); setError(""); }
      return next;
    } catch (error) { if (current === generation.current) setError(error instanceof Error ? error.message : "Could not load memory."); }
  }, [userId]);
  useEffect(() => {
    setView(null); setEditing(false); setConfirmDelete(false); setConflict(false); setSaving(false); setUpdating(false); setLoadingVisible(false); setFading(false); setError("");
    void reload();
    const refresh = () => { void reload(); };
    window.addEventListener("tobyverse:memory-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => { invalidateRead(); window.removeEventListener("tobyverse:memory-changed", refresh); window.removeEventListener("focus", refresh); };
  }, [reload, invalidateRead]);

  async function save(summary: string, revision: number) {
    if (saving) return;
    setSaving(true); setError(""); setConflict(false);
    try {
      const response = await fetch("/api/memory", { method: "PUT", headers: await authHeaders(), body: JSON.stringify({ summary, revision }) });
      const next = await response.json() as MemoryView & { error?: string };
      if (account.current !== userId) return;
      if (!response.ok) { setConflict(response.status === 409); throw new Error(next.error || "Could not update memory."); }
      setView(next); setEditing(false); setConfirmDelete(false);
      clearCachedLearningProfile(userId);
      window.dispatchEvent(new CustomEvent("tobyverse:memory-changed"));
    } catch (error) { if (account.current === userId) setError(error instanceof Error ? error.message : "Could not update memory."); }
    finally { if (account.current === userId) setSaving(false); }
  }

  async function updateFromPrompt() {
    if (!view || !draft.trim() || updating || saving) return;
    setUpdating(true); setError(""); setConflict(false); setFading(true);
    await new Promise(resolve => window.setTimeout(resolve, 220));
    setLoadingVisible(true);
    try {
      const response = await fetch("/api/memory/edit", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ instruction: draft.trim(), revision: view.revision }) });
      const next = await response.json() as MemoryView & { error?: string };
      if (account.current !== userId) return;
      if (!response.ok) { setConflict(response.status === 409); throw new Error(next.error || "Could not update memory."); }
      setView(next); setEditing(false); setDraft(""); setLoadingVisible(false);
      clearCachedLearningProfile(userId);
      window.dispatchEvent(new CustomEvent("tobyverse:memory-changed"));
      window.requestAnimationFrame(() => setFading(false));
    } catch (error) {
      if (account.current === userId) { setLoadingVisible(false); setFading(false); setError(error instanceof Error ? error.message : "Could not update memory."); }
    } finally { if (account.current === userId) setUpdating(false); }
  }

  if (!userId) return <p className="text-[14px] text-muted">Sign in to manage memory.</p>;
  return <section>
    <p className="text-[14px] leading-6 text-muted">Useful things you’ve shared about yourself. This summary updates as you chat, and you can edit it anytime.</p>
    {view ? <>
      <div className="mt-5 flex items-center justify-between gap-3 text-[12px] text-muted"><span>{view.updatedAt ? `Updated ${new Date(view.updatedAt).toLocaleDateString()}` : "Personal memory"}</span><span>{view.usage.savedFacts}{view.limits.savedFacts === null ? " memories" : ` / ${view.limits.savedFacts} memories`}</span></div>
      {view.needsReview ? <p className="mt-2 text-[12px] leading-5 text-muted">Older response preferences need your review. Edit and save to use the ones you keep.</p> : null}
      <div aria-live="polite" className={`mt-2 overflow-y-auto rounded-2xl border border-border bg-background/40 px-5 py-4 text-[14px] leading-7 text-foreground transition-opacity duration-300 ease-out motion-reduce:transition-none [&_li]:my-2 [&_ul]:list-disc [&_ul]:space-y-3 [&_ul]:pl-4 [&_p]:my-2 ${editing ? "max-h-[280px]" : "max-h-[440px]"} ${fading ? "opacity-0" : "opacity-100"}`}>
        {view.summary ? <ReactMarkdown allowedElements={["p", "ul", "ol", "li", "strong", "em", "h2", "h3"]} unwrapDisallowed>{view.summary}</ReactMarkdown> : <p className="text-muted">No memory yet. Lasting preferences and useful facts you share will appear here.</p>}
      </div>
      {loadingVisible ? <p role="status" className="mt-3 flex items-center gap-3 text-[13px] text-muted"><span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />Updating your memory…</p> : null}
      {editing ? <form className="mt-3" onSubmit={event => { event.preventDefault(); void updateFromPrompt(); }}>
        <label htmlFor="memory-change-prompt" className="sr-only">Describe a change to your memory</label>
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2 focus-within:border-muted">
          <textarea id="memory-change-prompt" autoFocus rows={2} maxLength={2000} value={draft} onChange={event => setDraft(event.target.value)} disabled={updating} className="max-h-32 min-h-12 flex-1 resize-y bg-transparent px-3 py-2 text-[14px] leading-6 text-foreground outline-none placeholder:text-muted disabled:opacity-60" placeholder="Describe what you’d like to change about your memory" />
          <button type="button" disabled={updating || saving} onClick={() => { setEditing(false); setDraft(""); setError(""); setConflict(false); }} className="mb-1 rounded-full px-3 py-2 text-[13px] text-muted hover:bg-surface-2 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={!draft.trim() || updating || saving} aria-label={updating ? "Updating memory" : "Update memory"} className="mb-1 rounded-full bg-foreground px-4 py-2 text-[13px] text-background disabled:opacity-50">{updating ? "Updating…" : "Update"}</button>
        </div>
      </form> : <div className="mt-4 flex items-center justify-end gap-2">{view.summary ? <button type="button" disabled={saving || updating} onClick={() => { setConfirmDelete(true); setError(""); }} className="rounded-full px-4 py-2 text-[13px] text-red-400 hover:bg-red-500/10">Delete memory</button> : null}<button type="button" disabled={saving || updating} onClick={() => { setDraft(""); setEditing(true); setConfirmDelete(false); setError(""); }} className="rounded-full bg-surface-2 px-4 py-2 text-[13px] text-foreground hover:bg-border">{view.summary ? "Edit" : "Add memory"}</button></div>}
      {confirmDelete ? <div role="alertdialog" aria-label="Delete personal memory" className="mt-4 rounded-xl border border-border p-4"><p className="text-[13px] leading-6 text-foreground">Delete your saved personal memory? Your chats and materials will stay.</p><div className="mt-3 flex justify-end gap-4"><button type="button" disabled={saving} onClick={() => setConfirmDelete(false)} className="text-[13px] text-muted">Cancel</button><button type="button" disabled={saving} onClick={() => void save("", view.revision)} className="text-[13px] text-red-400">{saving ? "Deleting…" : "Delete"}</button></div></div> : null}
    </> : !error ? <p role="status" className="mt-5 text-[14px] text-muted">Loading memory…</p> : null}
    {error ? <div role="alert" className="mt-4 text-[13px] leading-6 text-red-400">{error} <button type="button" onClick={() => void reload().then(next => { if (conflict && next) { setConflict(false); setError(""); } })} className="underline">{conflict ? "Load latest memory" : "Try again"}</button></div> : null}
  </section>;
}
