"use client";

import { useEffect, useState } from "react";
import { listAnalyticsEvents } from "@/lib/analytics/track";
import { summarizeInsights, type InsightsSummary } from "@/lib/analytics/insights";

function formatPct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function Bar({ label, a, b, aLabel, bLabel }: { label: string; a: number; b: number; aLabel: string; bLabel: string }) {
  const total = a + b;
  const aPct = total === 0 ? 50 : Math.round((a / total) * 100);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
        <div className="h-full bg-foreground/80" style={{ width: `${aPct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{aLabel} {a}</span>
        <span>{bLabel} {b}</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-lg tracking-tight text-foreground">{value}</p>
    </div>
  );
}

export function InsightsView() {
  const [summary, setSummary] = useState<InsightsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listAnalyticsEvents()
      .then((events) => {
        if (!cancelled) setSummary(summarizeInsights(events));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load insights.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-muted">Crunching signals…</div>;
  }

  if (error || !summary) {
    return <div className="p-6 text-sm text-red-400">{error ?? "No insights."}</div>;
  }

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-7">
        <Stat label="Active today" value={summary.activeToday} />
        <Stat label="Active 7d" value={summary.active7d} />
        <Stat label="Projects" value={summary.projectsCreated} />
        <Stat label="Messages" value={summary.messagesSent} />
        <Stat label="Exercises done" value={summary.exercisesCompleted} />
        <Stat label="Completion" value={formatPct(summary.completionRate)} />
        <Stat label="Return / hints" value={`${formatPct(summary.returnRate)} · ${formatPct(summary.hintRate)}`} />
      </div>

      <section className="mt-5 rounded-lg border border-border bg-surface p-4">
        <p className="text-[11px] uppercase tracking-wide text-muted">What this means</p>
        <ul className="mt-3 space-y-2">
          {summary.conclusions.map((line) => (
            <li key={line} className="text-sm leading-6 text-foreground/90">
              {line}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <Bar
          label="Theory vs problems"
          a={summary.theoryStarted}
          b={summary.problemsStarted}
          aLabel="Theory"
          bLabel="Problems"
        />
        <Bar
          label="Completion vs drop-off"
          a={summary.exercisesCompleted}
          b={summary.dropoff.chat + summary.dropoff.exercise + summary.dropoff.project}
          aLabel="Completed"
          bLabel="Dropped"
        />
        <Bar
          label="Returning vs one-time"
          a={summary.returningUsers}
          b={summary.oneTimeUsers}
          aLabel="Returning"
          bLabel="One-time"
        />
      </div>
    </div>
  );
}
