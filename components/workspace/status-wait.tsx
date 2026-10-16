"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatArtifactStep } from "@/types/chat";

/** Elapsed wait, like a stopwatch: 0:05, 1:03, 1:02:03. */
export function formatWait(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}

export function formatWorked(ms: number, _ka = false): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return `Worked for ${s}s ›`;
}

export function StatusWait({
  label,
  since,
  timer = false,
  settled = false,
  savedStep,
  savedActivity = [],
  className = "text-sm",
}: {
  label: string;
  since?: number;
  /** Stopwatch while waiting for the student. Off while the model is working. */
  timer?: boolean;
  /** Finished turn: no shimmer. */
  settled?: boolean;
  savedStep?: ChatArtifactStep;
  /** Brief app-observed actions for the completed turn. Never model reasoning. */
  savedActivity?: string[];
  className?: string;
}) {
  const fallback = useRef(since ?? Date.now());
  if (since) fallback.current = since;
  const [now, setNow] = useState(() => Date.now());
  const [current, setCurrent] = useState(label);
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const slideRef = useRef<number>(0);

  useEffect(() => {
    if (!timer) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  useEffect(() => {
    if (label === current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.clearTimeout(slideRef.current);
    if (reduce) {
      setOutgoing(null);
      setCurrent(label);
      return;
    }
    setOutgoing(current);
    setCurrent(label);
    slideRef.current = window.setTimeout(() => setOutgoing(null), 340);
    return () => window.clearTimeout(slideRef.current);
  }, [label, current]);

  const canExpand = settled && current.startsWith("Worked for ") && (savedActivity.length > 0 || Boolean(savedStep));
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="status-wait-clip min-w-0 flex-1">
          {outgoing ? (
            <span className={`status-wait-line status-wait-out ${settled ? "text-muted" : "status-shimmer"}`}>{outgoing}</span>
          ) : null}
          {canExpand ? (
            <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="status-wait-line text-left text-muted">
              {current}
            </button>
          ) : (
            <span key={current} className={`status-wait-line ${settled ? "text-muted" : "status-shimmer"}${outgoing ? " status-wait-in" : ""}`}>
              {current}
            </span>
          )}
        </span>
        {timer ? (
          <span className="shrink-0 tabular-nums text-muted">{formatWait(now - fallback.current)}</span>
        ) : null}
      </div>
      {expanded ? (
        <div className="pl-1 text-xs text-muted">
          {savedActivity.length ? (
            <ul className="ml-3 list-disc space-y-0.5">
              {savedActivity.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
            </ul>
          ) : null}
          {savedStep ? (
            <p>{[savedStep.from, savedStep.to].filter(Boolean).join(" → ")}{savedStep.done != null ? ` · ${savedStep.done}${savedStep.total != null ? `/${savedStep.total}` : ""}` : ""}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
