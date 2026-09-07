"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { readSseStream } from "@/lib/ai/sse";
import {
  DEFAULT_PLAYGROUND_MATERIALS,
  DEFAULT_PLAYGROUND_PROMPTS,
  PLAYGROUND_LABELS,
  PLAYGROUND_VERSIONS,
} from "@/lib/admin/playground";
import { savePlaygroundSnapshot } from "@/lib/admin/snapshots";
import type { PlaygroundAudit, PlaygroundVersionId } from "@/types/admin";

type ColumnStatus = "idle" | "running" | "done" | "error";

type ColumnState = {
  systemPrompt: string;
  materials: string;
  output: string;
  status: ColumnStatus;
  error: string | null;
};

function emptyColumns(): Record<PlaygroundVersionId, ColumnState> {
  return {
    1: {
      systemPrompt: DEFAULT_PLAYGROUND_PROMPTS[1],
      materials: DEFAULT_PLAYGROUND_MATERIALS[1],
      output: "",
      status: "idle",
      error: null,
    },
    2: {
      systemPrompt: DEFAULT_PLAYGROUND_PROMPTS[2],
      materials: DEFAULT_PLAYGROUND_MATERIALS[2],
      output: "",
      status: "idle",
      error: null,
    },
    3: {
      systemPrompt: DEFAULT_PLAYGROUND_PROMPTS[3],
      materials: DEFAULT_PLAYGROUND_MATERIALS[3],
      output: "",
      status: "idle",
      error: null,
    },
  };
}

async function authHeader(): Promise<HeadersInit> {
  const { getFirebaseAuth } = await import("@/lib/firebase");
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

export function PlaygroundView() {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("Explain photosynthesis in simple terms.");
  const [columns, setColumns] = useState(emptyColumns);
  const [audit, setAudit] = useState<PlaygroundAudit | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [banner, setBanner] = useState<string | null>(null);

  const running = PLAYGROUND_VERSIONS.some((id) => columns[id].status === "running");
  const ready = PLAYGROUND_VERSIONS.every((id) => columns[id].status === "done" && columns[id].output.trim());

  function patch(id: PlaygroundVersionId, partial: Partial<ColumnState>) {
    setColumns((current) => ({ ...current, [id]: { ...current[id], ...partial } }));
  }

  async function runAll() {
    const text = prompt.trim();
    if (!text || running) return;

    setAudit(null);
    setSaveState("idle");
    setBanner(null);
    const snapshot = columns;
    const headers = await authHeader();

    await Promise.all(
      PLAYGROUND_VERSIONS.map(async (id) => {
        patch(id, { status: "running", output: "", error: null });
        try {
          const response = await fetch("/api/admin/run", {
            method: "POST",
            headers,
            body: JSON.stringify({
              systemPrompt: snapshot[id].systemPrompt,
              prompt: text,
              materials: snapshot[id].materials,
            }),
          });
          let output = "";
          await readSseStream(response, (delta) => {
            output += delta;
            patch(id, { output, status: "running" });
          });
          if (!output.trim()) throw new Error("Empty response.");
          patch(id, { output, status: "done" });
        } catch (error) {
          patch(id, {
            status: "error",
            error: error instanceof Error ? error.message : "Failed.",
          });
        }
      }),
    );
  }

  async function generateAudit() {
    if (!ready || !user) return;
    setAuditBusy(true);
    setBanner(null);
    try {
      const headers = await authHeader();
      const response = await fetch("/api/admin/audit", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt,
          versions: PLAYGROUND_VERSIONS.map((id) => ({
            systemPrompt: columns[id].systemPrompt,
            materials: columns[id].materials,
            output: columns[id].output,
          })),
        }),
      });
      const data = (await response.json()) as { audit?: PlaygroundAudit; error?: string };
      if (!response.ok || !data.audit) throw new Error(data.error ?? "Audit failed.");
      setAudit(data.audit);
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Audit failed.");
    } finally {
      setAuditBusy(false);
    }
  }

  async function saveSnapshot() {
    if (!audit || !user) return;
    setSaveState("saving");
    try {
      await savePlaygroundSnapshot({
        userId: user.uid,
        prompts: {
          1: columns[1].systemPrompt,
          2: columns[2].systemPrompt,
          3: columns[3].systemPrompt,
        },
        audit,
      });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  const totals = useMemo(() => {
    if (!audit) return null;
    return PLAYGROUND_VERSIONS.map((id) => {
      const s = audit.versions[id].scores;
      return s.clarity + s.usefulness + s.correctness + s.compactness;
    });
  }, [audit]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-5 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="min-w-0 flex-1 space-y-1">
            <span className="text-[11px] uppercase tracking-wide text-muted">Shared prompt</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-white/20"
            />
          </label>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void runAll()}
              disabled={running || !prompt.trim()}
              className="rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background disabled:opacity-40"
            >
              {running ? "Running…" : "Run all 3"}
            </button>
            <button
              type="button"
              onClick={() => void generateAudit()}
              disabled={!ready || auditBusy}
              className="rounded-md border border-border px-3 py-2 text-xs text-foreground disabled:opacity-40"
            >
              {auditBusy ? "Auditing…" : "Generate Audit"}
            </button>
            <button
              type="button"
              onClick={() => void saveSnapshot()}
              disabled={!audit || saveState === "saving" || saveState === "saved"}
              className="rounded-md border border-border px-3 py-2 text-xs text-muted disabled:opacity-40"
            >
              {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : "Save snapshot"}
            </button>
          </div>
        </div>
        {banner && <p className="mt-2 text-xs text-red-400">{banner}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid gap-3 lg:grid-cols-3">
          {PLAYGROUND_VERSIONS.map((id) => (
            <PlaygroundColumn
              key={id}
              id={id}
              state={columns[id]}
              onChange={(partial) => patch(id, partial)}
            />
          ))}
        </div>

        {audit && (
          <section className="mt-4 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Audit</p>
                <p className="mt-1 text-sm text-foreground">
                  Winner: v{audit.winner} · {PLAYGROUND_LABELS[audit.winner]}
                </p>
                <p className="mt-1 text-sm text-muted">{audit.reason}</p>
              </div>
              {totals && (
                <p className="text-xs text-muted">
                  {totals.map((score, index) => `v${index + 1} ${score}`).join(" · ")}
                </p>
              )}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {PLAYGROUND_VERSIONS.map((id) => {
                const row = audit.versions[id];
                return (
                  <div key={id} className="rounded-md border border-border/80 p-3">
                    <p className="text-xs text-foreground">v{id} {PLAYGROUND_LABELS[id]}</p>
                    <p className="mt-2 text-[11px] text-muted">
                      + {row.strengths[0]} · {row.strengths[1]}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      − {row.weaknesses[0]} · {row.weaknesses[1]}
                    </p>
                    <div className="mt-3 grid grid-cols-4 gap-1 text-center">
                      {(["clarity", "usefulness", "correctness", "compactness"] as const).map((key) => (
                        <div key={key}>
                          <p className="text-sm text-foreground">{row.scores[key]}</p>
                          <p className="text-[10px] capitalize text-muted">{key.slice(0, 4)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {audit.improvements.map((item) => (
                <span key={item} className="rounded-md bg-background px-2 py-1 text-[11px] text-muted">
                  {item}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function PlaygroundColumn({
  id,
  state,
  onChange,
}: {
  id: PlaygroundVersionId;
  state: ColumnState;
  onChange: (partial: Partial<ColumnState>) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(state.output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <section className="flex min-h-[28rem] flex-col rounded-lg border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <p className="text-xs text-foreground">v{id} {PLAYGROUND_LABELS[id]}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted">
            {state.status === "running" ? "Streaming" : state.status}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!state.output}
          className="text-[11px] text-muted hover:text-foreground disabled:opacity-30"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </header>

      <div className="space-y-2 border-b border-border p-3">
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-muted">System</span>
          <textarea
            value={state.systemPrompt}
            onChange={(event) => onChange({ systemPrompt: event.target.value })}
            rows={4}
            className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs leading-5 text-foreground outline-none focus:border-white/20"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-muted">
            Materials{id === 3 ? "" : " (optional)"}
          </span>
          <textarea
            value={state.materials}
            onChange={(event) => onChange({ materials: event.target.value })}
            rows={id === 3 ? 3 : 2}
            placeholder={id === 3 ? "Source notes…" : "None"}
            className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs leading-5 text-foreground outline-none placeholder:text-muted/50 focus:border-white/20"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm leading-6 text-foreground/90">
        {state.status === "idle" && <p className="text-xs text-muted">Waiting.</p>}
        {state.status === "running" && !state.output && <p className="text-xs text-muted">Thinking…</p>}
        {state.output && (
          <p className="whitespace-pre-wrap text-xs leading-5">
            {state.output}
            {state.status === "running" && (
              <span className="streaming-caret ml-0.5 inline-block w-1.5 bg-foreground">&nbsp;</span>
            )}
          </p>
        )}
        {state.error && <p className="text-xs text-red-400">{state.error}</p>}
      </div>
    </section>
  );
}
