"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { changeInsights, getInsights, INSIGHTS_CHANGED, type InsightsView } from "@/lib/adaptation/client";
import type { KnowledgeGraph, KnowledgeNode } from "@/lib/adaptation/model";
import { UiIcon } from "@/components/workspace/ui-icon";

const STATUS: Record<KnowledgeNode["status"], { label: string; color: string }> = {
  explored: { label: "Explored", color: "var(--text-muted)" },
  developing: { label: "Working through", color: "var(--file-doc)" },
  revisit: { label: "Worth revisiting", color: "var(--tone-yellow)" },
  applied: { label: "Applied in conversation", color: "var(--file-sheet)" },
};

/** Small bounded graph, laid out locally. Physics, selection and navigation never call a model. */
function layout(graph: KnowledgeGraph) {
  const points = graph.nodes.map((n, i) => ({ key: n.key, x: 360 + Math.cos(i * 2.399) * (70 + i * 6), y: 230 + Math.sin(i * 2.399) * (60 + i * 4) }));
  const byKey = new Map(points.map(p => [p.key, p]));
  for (let step = 0; step < 160; step++) {
    const moves = points.map(p => ({ x: (360 - p.x) * 0.006, y: (230 - p.y) * 0.006 }));
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x || 0.1, dy = points[i].y - points[j].y || 0.1;
      const d2 = Math.max(100, dx * dx + dy * dy), force = 1300 / d2;
      moves[i].x += dx * force; moves[i].y += dy * force; moves[j].x -= dx * force; moves[j].y -= dy * force;
    }
    for (const l of graph.links) {
      const a = byKey.get(l.from), b = byKey.get(l.to);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 1, force = (distance - 150) * 0.018;
      const ai = points.indexOf(a), bi = points.indexOf(b);
      moves[ai].x += dx / distance * force; moves[ai].y += dy / distance * force;
      moves[bi].x -= dx / distance * force; moves[bi].y -= dy / distance * force;
    }
    points.forEach((p, i) => { p.x = Math.max(100, Math.min(620, p.x + Math.max(-5, Math.min(5, moves[i].x)))); p.y = Math.max(55, Math.min(405, p.y + Math.max(-5, Math.min(5, moves[i].y)))); });
  }
  return byKey;
}

export function KnowledgeMapDetails({ projectId }: { projectId: string }) {
  const [data, setData] = useState<InsightsView | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const reload = useCallback(() => { void getInsights(projectId).then(next => { setData(next); setError(""); }).catch(e => setError(e.message)); }, [projectId]);
  useEffect(() => {
    reload();
    const refresh = (event: Event) => {
      const id = (event as CustomEvent).detail?.projectId;
      if (!id || id === projectId) reload();
    };
    window.addEventListener(INSIGHTS_CHANGED, refresh);
    return () => window.removeEventListener(INSIGHTS_CHANGED, refresh);
  }, [projectId, reload]);
  const graph = useMemo(() => data?.graph ?? { nodes: [], links: [] }, [data]);
  const positions = useMemo(() => layout(graph), [graph]);
  const node = graph.nodes.find(n => n.key === selected) ?? graph.nodes[0];
  async function clear() {
    setClearing(true);
    try { await changeInsights({ projectId, clearGraph: true }); setConfirmClear(false); setSelected(""); reload(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not clear map."); }
    finally { setClearing(false); }
  }
  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface-2 text-foreground" aria-label="Project knowledge connections">
        <header className="px-4 pb-3 pt-4">
          <p className="text-[13px] leading-6 text-muted">Topics and connections from this project&apos;s conversations. They show what you have explored and applied, not a score of what you know.</p>
        </header>
        {error ? <p role="alert" className="px-6 pb-4 text-sm text-red-400">{error} <button onClick={reload} className="underline">Try again</button></p> : null}
        {!data && !error ? <p className="px-6 py-16 text-center text-sm text-muted">Loading your map…</p> : null}
        {data && !graph.nodes.length ? <div className="px-8 py-20 text-center"><UiIcon name="brain" size={32} className="mx-auto text-muted" /><p className="mt-5 text-lg">Your conversations will grow this map.</p><p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted">Discuss a few connected ideas, work through a problem, or explore a project. TobyVerse will connect the topics as you go.</p></div> : null}
        {graph.nodes.length > 0 ? <div>
          <div className="min-w-0 px-3 pb-4">
            <svg viewBox="0 0 720 460" className="w-full" role="img" aria-label="Connected project topics. Choose a topic below to inspect it.">
              {graph.links.map(l => { const a = positions.get(l.from), b = positions.get(l.to); return a && b ? <line key={`${l.from}:${l.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" opacity={node && (l.from === node.key || l.to === node.key) ? 0.35 : 0.09} /> : null; })}
              {graph.nodes.map(n => { const p = positions.get(n.key)!; return <g key={n.key} onClick={() => setSelected(n.key)} className="cursor-pointer"><circle cx={p.x} cy={p.y} r={n.key === node?.key ? 16 : 10} fill={STATUS[n.status].color} opacity={n.key === node?.key ? 1 : 0.7} /><circle cx={p.x} cy={p.y} r="25" fill="transparent" /><text x={p.x} y={p.y + 34} textAnchor="middle" fill="currentColor" fontSize="13">{n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label}</text></g>; })}
            </svg>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 px-4">{Object.entries(STATUS).map(([key, status]) => <span key={key} className="flex items-center gap-2 text-[11px] text-muted"><span className="h-1.5 w-1.5 rounded-full" style={{ background: status.color }} />{status.label}</span>)}</div>
            <div className="mt-5 flex flex-wrap gap-2 px-3" aria-label="Topics">{graph.nodes.map(n => <button key={n.key} type="button" aria-pressed={n.key === node?.key} onClick={() => setSelected(n.key)} className={`rounded-full border px-3 py-1.5 text-[12px] ${n.key === node?.key ? "border-foreground/40 bg-surface-2" : "border-border text-muted hover:text-foreground"}`}>{n.label}</button>)}</div>
          </div>
          {node ? <aside className="min-w-0 border-t border-border px-5 py-4">
            <p className="text-[12px] text-muted">{STATUS[node.status].label}</p><h3 className="mt-2 text-lg font-medium">{node.label}</h3><p className="mt-3 text-sm leading-7 text-muted">{node.summary}</p>
            {graph.links.filter(l => l.from === node.key || l.to === node.key).map(l => { const other = graph.nodes.find(n => n.key === (l.from === node.key ? l.to : l.from)); return other ? <button key={`${l.from}:${l.to}`} type="button" onClick={() => setSelected(other.key)} className="mt-3 block text-left text-[13px] leading-6 text-muted hover:text-foreground">{l.label}: <span className="text-foreground">{other.label}</span></button> : null; })}
            {node.nextQuestion ? <p className="mt-4 text-sm leading-6"><span className="mb-1 block text-[11px] text-muted">Possible next connection</span>{node.nextQuestion}</p> : null}
            {node.whatIf ? <p className="mt-3 text-sm leading-6"><span className="mb-1 block text-[11px] text-muted">A different assumption</span>{node.whatIf}</p> : null}
          </aside> : null}
        </div> : null}
        {graph.nodes.length ? <footer className="flex items-center justify-between gap-3 border-t border-border px-6 py-4 text-xs text-muted"><span>Based on your conversations.</span>{confirmClear ? <div className="flex gap-4"><button type="button" disabled={clearing} onClick={() => void clear()} className="text-red-400">Confirm clear</button><button type="button" onClick={() => setConfirmClear(false)}>Cancel</button></div> : <button type="button" onClick={() => setConfirmClear(true)}>Clear map</button>}</footer> : null}
    </section>
  );
}
