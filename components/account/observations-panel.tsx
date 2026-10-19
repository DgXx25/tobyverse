"use client";

import { useCallback, useEffect, useState } from "react";
import { changeInsights, getInsights, INSIGHTS_CHANGED, type InsightsView } from "@/lib/adaptation/client";
import { UiIcon } from "@/components/workspace/ui-icon";
import type { ChatMemoryContext } from "@/types/memory";

export function ObservationsPanel({ userId, memories, preferences, loading, loadError, onRemoveShared }: {
  userId: string; memories: ChatMemoryContext[]; preferences: string; loading: boolean; loadError: string;
  onRemoveShared: (id: string) => Promise<void>;
}) {
  const [data, setData] = useState<InsightsView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const reload = useCallback(() => {
    void getInsights().then(next => { setData(next); setError(""); }).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    void getInsights().then(next => { if (active) setData(next); }).catch(e => { if (active) setError(e.message); });
    window.addEventListener(INSIGHTS_CHANGED, reload);
    return () => { active = false; window.removeEventListener(INSIGHTS_CHANGED, reload); };
  }, [userId, reload]);
  const entries = [
    ...memories.map(m => ({ id: `shared:${m.id}`, sharedId: m.id, patternKey: "", text: m.content, source: "Shared with TobyVerse" })),
    ...(preferences ? [{ id: "shared:preferences", sharedId: "preferences", patternKey: "", text: preferences, source: "Shared with TobyVerse" }] : []),
    ...(data?.patterns ?? []).map(p => ({ id: `observed:${p.projectId ?? "general"}:${p.key}`, sharedId: "", patternKey: `${p.projectId ?? "general"}:${p.key}`, text: p.observation, source: "From conversations" })),
  ];
  async function remove(entry: (typeof entries)[number]) {
    setBusy(true); setError("");
    try {
      if (entry.sharedId) await onRemoveShared(entry.sharedId);
      else { const next = await changeInsights({ removeKey: entry.patternKey }); setData(current => ({ ...current, ...next })); }
      setRemoving(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove memory."); }
    finally { setBusy(false); }
  }
  return <section>
    <p className="text-[14px] leading-6 text-muted">Preferences and useful context from your conversations. Your current request always comes first. You can remove anything here.</p>
    {entries.length ? <ul className="mt-5 divide-y divide-border">
      {entries.map(entry => <li key={entry.id} className="py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-muted">{entry.source}</p>
            <p className="mt-1 whitespace-pre-wrap text-[14px] leading-6 text-foreground">{entry.text}</p>
          </div>
          <button type="button" disabled={busy} onClick={() => setRemoving(entry.id)} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-foreground" aria-label={`Remove memory: ${entry.text}`}><UiIcon name="close" size={16} /></button>
        </div>
        {removing === entry.id ? <div className="mt-3 text-[13px] leading-6 text-muted">
          <p>Remove this from memory? Future conversations can introduce new information.</p>
          <div className="mt-2 flex gap-4"><button type="button" disabled={busy} onClick={() => void remove(entry)} className="text-red-400">Remove</button><button type="button" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button></div>
        </div> : null}
      </li>)}
    </ul> : loading || (!data && !error) ? <p className="mt-5 text-[14px] text-muted">Loading memory…</p> : <p className="mt-5 text-[14px] leading-6 text-muted">Useful preferences you share will appear here.</p>}
    {error || loadError ? <div role="alert" className="mt-3 text-[13px] text-red-400">{error || loadError} <button type="button" onClick={reload} className="underline">Try again</button></div> : null}
  </section>;
}
