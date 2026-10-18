"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { changeInsights, getInsights, INSIGHTS_CHANGED, type InsightsView } from "@/lib/adaptation/client";
import { UiIcon } from "@/components/workspace/ui-icon";
import { KnowledgeMapDetails } from "@/components/workspace/knowledge-map";

export function ObservationsPanel({ userId }: { userId: string }) {
  const params = useParams();
  const currentProjectId = typeof params.projectId === "string" ? params.projectId : undefined;
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const [data, setData] = useState<InsightsView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const reload = useCallback(() => {
    void getInsights().then(setData).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    void getInsights().then(next => { if (active) setData(next); }).catch(e => { if (active) setError(e.message); });
    window.addEventListener(INSIGHTS_CHANGED, reload);
    return () => { active = false; window.removeEventListener(INSIGHTS_CHANGED, reload); };
  }, [userId, reload]);
  async function change(input: Parameters<typeof changeInsights>[0]) {
    setBusy(true); setError("");
    try { const next = await changeInsights(input); setData(current => ({ ...current, ...next })); setConfirmClear(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save change."); }
    finally { setBusy(false); }
  }
  const projects = data?.projects ?? [];
  const projectId = selectedProjectId || currentProjectId || projects[0]?.id;
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-[15px] font-medium text-foreground">Adapts to you</h3>
        <button type="button" role="switch" aria-checked={data?.enabled ?? false} aria-label="Learn from conversations"
          disabled={!data || busy} onClick={() => void change({ enabled: !data?.enabled })}
          className="rounded-full border border-border px-3 py-1 text-[13px] text-foreground hover:bg-surface-2 disabled:opacity-50">
          {data ? data.enabled ? "On" : "Paused" : "Loading…"}
        </button>
      </div>
      <p className="mt-1 text-[14px] leading-6 text-muted">TobyVerse notices how you reason and work during ordinary conversations, then uses recurring patterns to make its help more useful. These observations can be wrong. Your current request always comes first.</p>
      {data && !data.enabled ? <p className="mt-3 text-[13px] text-muted">New observations and their use in replies are paused. Your saved memories still work.</p> : null}
      {data?.patterns.length ? (
        <ul className="mt-4 divide-y divide-border">
          {data.patterns.map(p => (
            <li key={`${p.projectId}:${p.key}`} className="flex items-start gap-3 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-muted">{p.support.length >= 2 ? "Recurring observation" : "Tentative · not used in replies yet"}{p.projectId ? " · In one project" : " · Across tasks"}</p>
                <p className="mt-1 text-[14px] leading-6 text-foreground">{p.observation}</p>
                <p className="mt-1 text-[13px] leading-6 text-muted">{p.when}: {p.approach}</p>
              </div>
              <button type="button" disabled={busy} onClick={() => void change({ removeKey: `${p.projectId ?? "general"}:${p.key}` })}
                className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-foreground" aria-label={`Remove observation: ${p.observation}`}><UiIcon name="close" size={16} /></button>
            </li>
          ))}
        </ul>
      ) : data ? <p className="mt-4 text-[14px] leading-6 text-muted">Patterns will appear as you talk and work. You do not need to fill in a profile or explain how you learn.</p> : null}
      {error ? <div role="alert" className="mt-3 text-[13px] text-red-400">{error} <button type="button" onClick={reload} className="underline">Try again</button></div> : null}
      {data?.patterns.length ? confirmClear ? (
        <div className="mt-3 rounded-xl border border-border p-3 text-[13px] leading-6">
          <p>Clear these observations? TobyVerse can notice new patterns in future conversations.</p>
          <div className="mt-2 flex gap-4"><button disabled={busy} onClick={() => void change({ clear: true })} className="text-red-400">Clear observations</button><button onClick={() => setConfirmClear(false)} className="text-muted">Cancel</button></div>
        </div>
      ) : <button type="button" onClick={() => setConfirmClear(true)} className="mt-3 text-[13px] text-muted underline underline-offset-4">Clear observations</button> : null}
      {projectId ? <details className="mt-6" onToggle={event => setMapOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer text-[14px] text-foreground">Project knowledge connections</summary>
        {mapOpen ? <>
          {projects.length > 0 ? <select value={projectId} aria-label="Knowledge connections project" onChange={event => setSelectedProjectId(event.target.value)} className="mt-4 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] text-foreground">
            {currentProjectId && !projects.some(p => p.id === currentProjectId) ? <option value={currentProjectId}>Current project</option> : null}
            {projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select> : null}
          <KnowledgeMapDetails key={projectId} projectId={projectId} />
        </> : null}
      </details> : null}
    </section>
  );
}
