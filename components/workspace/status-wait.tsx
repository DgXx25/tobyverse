"use client";

import { useEffect, useRef, useState } from "react";

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

export function formatWorked(ms: number, ka = false): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return ka ? `იმუშავა ${s} წმ` : `Worked for ${s}s`;
}

export function StatusWait({
  label,
  since,
  timer = false,
  settled = false,
  className = "text-sm",
}: {
  label: string;
  since?: number;
  /** Stopwatch while waiting for the student. Off while the model is working. */
  timer?: boolean;
  /** Finished turn: no shimmer. */
  settled?: boolean;
  className?: string;
}) {
  const fallback = useRef(since ?? Date.now());
  if (since) fallback.current = since;
  const [now, setNow] = useState(() => Date.now());
  const [current, setCurrent] = useState(label);
  const [outgoing, setOutgoing] = useState<string | null>(null);
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

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <span className="status-wait-clip min-w-0 flex-1">
        {outgoing ? (
          <span className={`status-wait-line status-wait-out ${settled ? "text-muted" : "status-shimmer"}`}>{outgoing}</span>
        ) : null}
        <span
          key={current}
          className={`status-wait-line ${settled ? "text-muted" : "status-shimmer"}${outgoing ? " status-wait-in" : ""}`}
        >
          {current}
        </span>
      </span>
      {timer ? (
        <span className="shrink-0 tabular-nums text-muted">{formatWait(now - fallback.current)}</span>
      ) : null}
    </div>
  );
}
