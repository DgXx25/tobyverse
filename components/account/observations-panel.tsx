"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { changeInsights, getInsights, INSIGHTS_CHANGED, type InsightsView } from "@/lib/adaptation/client";
import { UiIcon } from "@/components/workspace/ui-icon";
import { KnowledgeMapDetails } from "@/components/workspace/knowledge-map";
import type { ChatMemoryContext } from "@/types/memory";

export function ObservationsPanel({ userId, memories, preferences, loading, loadError, onRemoveShared }: {
  userId: string; memories: ChatMemoryContext[]; preferences: string; loading: boolean; loadError: string;
  onRemoveShared: (id: string) => Promise<void>;
}) {
  const params = useParams();
  const currentProjectId = typeof params.projectId === "string" ? params.projectId : undefined;
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
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
    ...memories.map(m => ({ id: `shared:${m.id}`, sharedId: m.id, patternKey: "", text: m.content, detail: "", source: "Shared with TobyVerse" })),
    ...(preferences ? [{ id: "shared:preferences", sharedId: "preferences", patternKey: "", text: preferences, detail: "", source: "Shared with TobyVerse" }] : []),
    ...(data?.patterns ?? []).map(p => ({ id: `observed:${p.projectId ?? "general"}:${p.key}`, sharedId: "", patternKey: `${p.projectId ?? "general"}:${p.key}`, text: p.observation, detail: `${p.when}: ${p.approach}`, source: p.support.length < 2 ? "Tentative · still being learned" : p.projectId ? "Learned from this project" : "Learned across conversations" })),
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
  const projects = data?.projects ?? [];
  const projectId = selectedProjectId || currentProjectId || projects[0]?.id;
  return <section>
    <p className="text-[14px] leading-6 text-muted">TobyVerse continually learns how you think, understand, and work. What you share, your response preferences, and patterns from conversation form one evolving memory. Your current request always comes first.</p>
    {entries.length ? <ul className="mt-5 divide-y divide-border">
      {entries.map(entry => <li key={entry.id} className="py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-muted">{entry.source}</p>
            <p className="mt-1 whitespace-pre-wrap text-[14px] leading-6 text-foreground">{entry.text}</p>
            {entry.detail ? <p className="mt-1 text-[13px] leading-6 text-muted">{entry.detail}</p> : null}
          </div>
          <button type="button" disabled={busy} onClick={() => setRemoving(entry.id)} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-foreground" aria-label={`Remove memory: ${entry.text}`}><UiIcon name="close" size={16} /></button>
        </div>
        {removing === entry.id ? <div className="mt-3 text-[13px] leading-6 text-muted">
          <p>Remove this from memory? Future conversations can introduce new information.</p>
          <div className="mt-2 flex gap-4"><button type="button" disabled={busy} onClick={() => void remove(entry)} className="text-red-400">Remove</button><button type="button" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button></div>
        </div> : null}
      </li>)}
    </ul> : loading || (!data && !error) ? <p className="mt-5 text-[14px] text-muted">Loading memory…</p> : <p className="mt-5 text-[14px] leading-6 text-muted">Your memory develops naturally as you talk and work with TobyVerse.</p>}
    {error || loadError ? <div role="alert" className="mt-3 text-[13px] text-red-400">{error || loadError} <button type="button" onClick={reload} className="underline">Try again</button></div> : null}
    {projectId ? <details className="mt-6" onToggle={event => setMapOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-[14px] text-foreground">Knowledge connections</summary>
      {mapOpen ? <>
        {projects.length > 0 ? <select value={projectId} aria-label="Knowledge connections project" onChange={event => setSelectedProjectId(event.target.value)} className="mt-4 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] text-foreground">
          {currentProjectId && !projects.some(p => p.id === currentProjectId) ? <option value={currentProjectId}>Current project</option> : null}
          {projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
        </select> : null}
        <KnowledgeMapDetails key={projectId} projectId={projectId} />
      </> : null}
    </details> : null}
  </section>;
}
