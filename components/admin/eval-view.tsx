"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ArtifactCard } from "@/components/workspace/artifact-card";
import { RichContent } from "@/components/rich-content";
import {
  EVAL_SUITE_IDS,
  EVAL_SUITE_META,
  EVAL_SUITES,
} from "@/lib/admin/eval";
import { runEvalSuite } from "@/lib/admin/eval-run";
import { saveEvalSnapshot } from "@/lib/admin/snapshots";
import type {
  EvalArtifactPreview,
  EvalCaseResult,
  EvalRun,
  EvalSuiteId,
  EvalTranscriptMessage,
} from "@/types/admin";
import type { ChatArtifact } from "@/types/chat";

type SaveState = "idle" | "saving" | "saved" | "error";
type CenterTab = "chat" | "results";

function emptyRows(suiteId: EvalSuiteId): EvalCaseResult[] {
  return EVAL_SUITES[suiteId].map((spec) => ({
    id: spec.id,
    prompt: spec.prompt,
    expected: spec.expected,
    actual: "—",
    pass: false,
    note: "",
  }));
}

function asCardArtifact(message: EvalTranscriptMessage): ChatArtifact | null {
  const artifact = message.artifact;
  if (!artifact || artifact.kind === "plan") return null;
  return {
    kind: artifact.kind,
    id: artifact.id,
    title: artifact.title,
    count: artifact.count,
  };
}

export function EvalView() {
  const { user } = useAuth();
  const [suiteId, setSuiteId] = useState<EvalSuiteId>("core");
  const [variant, setVariant] = useState("");
  const [run, setRun] = useState<EvalRun | null>(null);
  const [rows, setRows] = useState<EvalCaseResult[]>(() => emptyRows("core"));
  const [messages, setMessages] = useState<EvalTranscriptMessage[]>([]);
  const [stream, setStream] = useState("");
  const [previews, setPreviews] = useState<Record<string, EvalArtifactPreview>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("Idle");
  const [running, setRunning] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [banner, setBanner] = useState<string | null>(null);
  const [centerTab, setCenterTab] = useState<CenterTab>("chat");
  const scrollerRef = useRef<HTMLDivElement>(null);

  const selected = selectedId ? previews[selectedId] ?? null : null;
  const passed = rows.filter((row) => row.actual !== "—" && row.pass).length;
  const scored = rows.filter((row) => row.actual !== "—").length;
  const failed = rows.filter((row) => row.actual !== "—" && !row.pass).length;

  useEffect(() => {
    if (!running) return;
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, stream, running, status]);

  function selectSuite(next: EvalSuiteId) {
    if (running) return;
    setSuiteId(next);
    setRows(emptyRows(next));
    setRun(null);
    setSaveState("idle");
  }

  function openPreview(id: string) {
    if (previews[id]) setSelectedId(id);
  }

  async function runSuite() {
    if (!user || running) return;
    setRunning(true);
    setSaveState("idle");
    setBanner(null);
    setRun(null);
    setRows(emptyRows(suiteId));
    setMessages([]);
    setStream("");
    setPreviews({});
    setSelectedId(null);
    setCenterTab("chat");
    setStatus("Starting…");
    try {
      const result = await runEvalSuite({
        userId: user.uid,
        suiteId,
        variant,
        onStatus: setStatus,
        onUser: (message) => {
          setStream("");
          setMessages((current) => [...current, message]);
        },
        onStream: setStream,
        onAssistant: (message) => {
          setStream("");
          setMessages((current) => [...current, message]);
        },
        onArtifact: (preview) => {
          setPreviews((current) => ({ ...current, [preview.id]: preview }));
          setSelectedId(preview.id);
        },
        onRow: (row) => {
          setRows((current) => current.map((item) => (item.id === row.id ? row : item)));
        },
      });
      setRun(result);
      setRows(result.cases);
      setStream("");
      setStatus(result.failed === 0 ? "All passed" : `${result.passed}/${result.cases.length} passed`);
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Suite failed.");
      setStatus("Failed");
    } finally {
      setRunning(false);
    }
  }

  async function saveSnapshot() {
    if (!run || !user || saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");
    try {
      await saveEvalSnapshot({ userId: user.uid, run });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-border">
        <div className="border-b border-border px-3 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">Suite</p>
          <div className="mt-2 space-y-1">
            {EVAL_SUITE_IDS.map((id) => {
              const meta = EVAL_SUITE_META[id];
              const active = suiteId === id;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={running}
                  onClick={() => selectSuite(id)}
                  className={`block w-full rounded-md px-2.5 py-2 text-left disabled:opacity-40 ${
                    active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface hover:text-foreground"
                  }`}
                >
                  <p className="text-xs">{meta.label}</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-muted">{meta.blurb}</p>
                </button>
              );
            })}
          </div>
        </div>
        <label className="block border-b border-border px-3 py-3">
          <span className="text-[11px] uppercase tracking-wide text-muted">Variant</span>
          <textarea
            value={variant}
            onChange={(event) => setVariant(event.target.value)}
            disabled={running}
            rows={3}
            placeholder="Optional topic or prefix"
            className="mt-1.5 w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted/50 focus:border-white/20 disabled:opacity-40"
          />
        </label>
        <div className="flex flex-col gap-2 px-3 py-3">
          <button
            type="button"
            onClick={() => void runSuite()}
            disabled={running}
            className="rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background disabled:opacity-40"
          >
            {running ? "Running…" : "Run"}
          </button>
          <button
            type="button"
            onClick={() => void saveSnapshot()}
            disabled={!run || running || saveState === "saving" || saveState === "saved"}
            className="rounded-md border border-border px-3 py-2 text-xs text-muted disabled:opacity-40"
          >
            {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : "Save snapshot"}
          </button>
        </div>
        <div className="mt-auto space-y-1 px-3 py-3 text-[11px] text-muted">
          <p className="text-foreground">{running ? status : scored ? `${passed} passed · ${failed} failed` : "Idle"}</p>
          {run?.projectTitle && <p className="truncate">{run.projectTitle}</p>}
          {banner && <p className="text-red-400">{banner}</p>}
          {saveState === "error" && <p className="text-red-400">Could not save snapshot.</p>}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col border-r border-border">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
          <div className="flex rounded-md bg-surface p-0.5">
            {(["chat", "results"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setCenterTab(tab)}
                className={`rounded-md px-2.5 py-1 text-[11px] ${
                  centerTab === tab ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {tab === "chat" ? "Transcript" : "Results"}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted">{scored ? `${passed}/${rows.length}` : `${rows.length} cases`}</p>
        </div>

        {centerTab === "chat" ? (
          <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {messages.length === 0 && !stream && (
              <p className="pt-16 text-center text-sm text-muted">
                Run the suite to watch the fixture chat.
              </p>
            )}
            <div className="space-y-5">
              {messages.map((message) => (
                <TranscriptBubble key={message.id} message={message} onOpen={openPreview} />
              ))}
              {stream.trim() ? (
                <div>
                  <RichContent text={stream} streaming />
                </div>
              ) : running && status !== "Idle" && status !== "Done" ? (
                <p className="text-xs text-muted">{status}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <ResultsTable rows={rows} />
          </div>
        )}

        {centerTab === "chat" && (
          <div className="max-h-40 shrink-0 overflow-auto border-t border-border px-4 py-2">
            <ResultsTable rows={rows} compact />
          </div>
        )}
      </section>

      <aside className="flex w-[380px] shrink-0 flex-col">
        <div className="shrink-0 border-b border-border px-4 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted">Artifact</p>
          <p className="mt-0.5 truncate text-xs text-foreground">
            {selected ? (selected.kind === "practice" ? selected.title : selected.title) : "None selected"}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {!selected && <p className="text-sm text-muted">Create/edit opens the preview here.</p>}
          {selected?.kind === "practice" && <PracticePreview preview={selected} />}
          {selected?.kind === "sheet" && <SheetPreview preview={selected} />}
        </div>
      </aside>
    </div>
  );
}

function TranscriptBubble({
  message,
  onOpen,
}: {
  message: EvalTranscriptMessage;
  onOpen: (id: string) => void;
}) {
  const artifact = asCardArtifact(message);
  if (message.role === "user") {
    return (
      <article className="flex justify-end">
        <div className="chat-body max-w-[80%] rounded-2xl bg-surface-2 px-4 py-2.5 text-foreground">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </article>
    );
  }
  return (
    <article>
      {artifact ? (
        <ArtifactCard artifact={artifact} onOpen={() => onOpen(artifact.id)} />
      ) : (
        <RichContent text={message.content} />
      )}
    </article>
  );
}

function ResultsTable({ rows, compact = false }: { rows: EvalCaseResult[]; compact?: boolean }) {
  return (
    <table className="w-full border-collapse text-left text-[11px]">
      <thead>
        <tr className="border-b border-border text-muted">
          <th className="py-1.5 pr-2 font-medium">Case</th>
          {!compact && <th className="py-1.5 pr-2 font-medium">Expected</th>}
          <th className="py-1.5 pr-2 font-medium">Actual</th>
          <th className="py-1.5 pr-2 font-medium">Pass</th>
          <th className="py-1.5 font-medium">Note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const pending = row.actual === "—";
          return (
            <tr key={row.id} className="border-b border-border/60 align-top">
              <td className="py-1.5 pr-2 text-foreground">
                {row.id}. {compact ? row.prompt.slice(0, 42) : row.prompt}
              </td>
              {!compact && <td className="py-1.5 pr-2 text-muted">{row.expected}</td>}
              <td className="py-1.5 pr-2 text-foreground">{row.actual}</td>
              <td className="py-1.5 pr-2">
                {pending ? (
                  <span className="text-muted">—</span>
                ) : row.pass ? (
                  <span className="text-emerald-400">pass</span>
                ) : (
                  <span className="text-red-400">fail</span>
                )}
              </td>
              <td className="py-1.5 text-muted">{row.note}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PracticePreview({ preview }: { preview: EvalArtifactPreview & { kind: "practice" } }) {
  const featured = preview.items.slice(0, 3);
  const rest = preview.items.slice(3);
  return (
    <div>
      <p className="text-sm text-foreground">
        {preview.title} · {preview.count} items
      </p>
      <ol className="mt-3 space-y-3">
        {featured.map((item, index) => (
          <li key={item.id} className="rounded-md border border-border bg-surface px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted">
              {index + 1}. {item.type}
            </p>
            <p className="mt-1 text-xs leading-5 text-foreground">{item.stem}</p>
          </li>
        ))}
      </ol>
      {rest.length > 0 && (
        <ol className="mt-3 list-decimal space-y-1 pl-4 text-[11px] text-muted" start={4}>
          {rest.map((item) => (
            <li key={item.id}>
              {item.type}: {item.stem.slice(0, 80)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function SheetPreview({ preview }: { preview: EvalArtifactPreview & { kind: "sheet" } }) {
  return (
    <div>
      <p className="mb-3 text-sm text-foreground">{preview.title}</p>
      <RichContent text={preview.content} />
    </div>
  );
}
