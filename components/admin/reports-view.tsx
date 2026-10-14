"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { AdminReport } from "@/lib/admin/reports";

function when(iso: string) {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Unknown time";
}

export function ReportsView() {
  const { user } = useAuth();
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void user.getIdToken().then((token) => fetch("/api/admin/reports", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }))
      .then(async (response) => {
        const body = await response.json() as { reports?: AdminReport[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load reports.");
        if (!cancelled) setReports(body.reports ?? []);
      }).catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load reports.");
      }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  return <section className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-[17px] font-medium text-foreground">Reports</h1>
      {loading ? <p className="py-8 text-sm text-muted">Loading reports…</p> : null}
      {error ? <p role="alert" className="py-8 text-sm text-red-400">{error}</p> : null}
      {!loading && !error && reports.length === 0 ? <p className="py-10 text-sm text-muted">No feedback reports yet.</p> : null}
      <div className="divide-y divide-border">
        {reports.map((report) => {
          const open = expanded === report.id;
          const snippet = report.snippet.slice(0, 240);
          return <article key={report.id} className="py-2">
            <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : report.id)} className="flex min-h-10 w-full min-w-0 items-center gap-3 rounded-lg px-2 text-left hover:bg-surface-2">
              <time className="w-[112px] shrink-0 text-[12px] text-muted">{when(report.createdAt)}</time>
              <span className="max-w-32 shrink-0 truncate text-[12px] text-foreground">{report.reason || "No reason"}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{snippet}</span>
              <span className="hidden max-w-32 shrink-0 truncate font-mono text-[11px] text-muted sm:block">{report.chatId}</span>
              <span aria-hidden className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
            </button>
            {open ? <div className="ml-[124px] space-y-2 px-2 py-3 text-[13px]">
              {report.publicUrl ? <a href={report.publicUrl} target="_blank" rel="noreferrer" className="text-foreground underline decoration-border underline-offset-4">Open shared thread</a> : <p className="text-muted">Private thread</p>}
              <p className="whitespace-pre-wrap break-words text-foreground/90">{snippet}</p>
              <p className="truncate font-mono text-[11px] text-muted">{report.chatId}</p>
            </div> : null}
          </article>;
        })}
      </div>
    </div>
  </section>;
}
