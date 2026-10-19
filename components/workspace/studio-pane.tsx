"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { UiIcon, type UiIconName } from "@/components/workspace/ui-icon";
import { shortDate } from "@/lib/format";
import { STUDIO_TILES, type StudioJob, type StudioSavedArtifact, type StudioTile } from "@/lib/workspace/studio";
import type { AcceptedChatTool } from "@/types/chat";
import type { ChatArtifact } from "@/types/chat";
import type { StudyPath } from "@/types/path";
import type { StudySheet } from "@/types/study-sheet";

const TILE_COLOR: Record<StudioTile["id"], string> = {
  practice: "var(--file-doc)",
  quiz: "var(--file-sheet)",
  flashcards: "var(--tone-yellow)",
  table: "var(--file-slides)",
  notes: "var(--file-notes)",
  path: "var(--tone-pink)",
};

/**
 * Studio: one tap makes something from the sources. A tile is an ordinary request,
 * so the result lands back in the list the same way any other output does.
 */
export function StudioPane({
  sheets,
  practiceSets,
  paths,
  sourceCount = 0,
  studioArtifacts = [],
  job = null,
  onRetry,
  error,
  busy,
  generatingLabel,
  onCreate,
  onOpenSheet,
  onOpenPractice,
  onOpenPath,
}: {
  sheets: StudySheet[];
  practiceSets: ChatArtifact[];
  paths: StudyPath[];
  sourceCount?: number;
  studioArtifacts?: StudioSavedArtifact[];
  job?: StudioJob | null;
  onRetry?: () => void;
  error?: string | null;
  busy: boolean;
  generatingLabel?: string | null;
  onCreate: (tile: StudioTile, run?: { prompt: string; tool?: AcceptedChatTool }) => void;
  onOpenSheet: (id: string) => void;
  onOpenPractice: (id: string) => void;
  onOpenPath: () => void;
}) {
  const [config, setConfig] = useState<StudioTile | null>(null);

  function openTile(tile: StudioTile) {
    setConfig(tile);
  }

  const registeredKeys = new Set(studioArtifacts.map((item) => `${item.artifact.kind}:${item.artifact.id}`));
  const registeredOutputs = studioArtifacts.map((item) => {
    const tile = STUDIO_TILES.find((tile) => tile.id === item.type)!;
    return {
      key: `${item.artifact.kind}:${item.artifact.id}`,
      icon: tile.icon,
      color: TILE_COLOR[tile.id],
      title: item.artifact.title,
      meta: [tile.label, shortDate(item.createdAt)].filter(Boolean).join(" · "),
      open: () => item.artifact.kind === "practice" ? onOpenPractice(item.artifact.id) : item.artifact.kind === "path" ? onOpenPath() : onOpenSheet(item.artifact.id),
    };
  });
  const legacyOutputs = [
    ...paths.slice(0, 1).map((item) => ({
      key: `path:${item.id}`,
      icon: "plan" as const,
      color: TILE_COLOR.path,
      title: item.title || "Course path",
      meta: "Course path",
      open: onOpenPath,
    })),
    ...sheets.map((item) => ({
      key: `sheet:${item.id}`,
      icon: (item.kind === "note" ? "checkmarkSquare02" : "notes") as UiIconName,
      color: TILE_COLOR.notes,
      title: item.title || "Notes",
      meta: [item.kind === "note" ? item.pendingSave ? "Note · Saving…" : "Note · Saved" : "Study notes", shortDate(item.createdAt)].filter(Boolean).join(" · "),
      open: () => onOpenSheet(item.id),
    })),
    ...practiceSets.map((item) => {
      const count = item.count ?? item.ids?.length ?? 0;
      const exam = item.mode === "exam";
      return {
        key: `practice:${item.id}`,
        icon: (exam ? "check" : "practice") as UiIconName,
        color: TILE_COLOR.quiz,
        title: item.title || `${exam ? "Exam" : "Quiz"} · ${count}`,
        meta: `${exam ? "Exam" : "Quiz"} · ${count}`,
        open: () => onOpenPractice(item.id),
      };
    }),
  ];
  const outputs = [...registeredOutputs, ...legacyOutputs.filter((item) => !registeredKeys.has(item.key))];
  const resultVisible = job?.artifact && outputs.some((item) => item.key === `${job.artifact!.kind}:${job.artifact!.id}`);
  const showJob = job?.phase === "failed" || job?.phase === "pending" || (job?.phase === "complete" && !resultVisible);
  const activeJob = showJob ? job : null;
  const generatingTile = STUDIO_TILES.find((tile) => tile.id === activeJob?.request.type) ?? STUDIO_TILES.find((tile) => tile.label === generatingLabel);

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        {STUDIO_TILES.map((tile) => (
          <button
            key={tile.id}
            type="button"
            disabled={busy}
            onClick={() => openTile(tile)}
            className="panel-selectable flex h-11 items-center gap-2 rounded-full px-3 text-left disabled:opacity-60"
          >
            <span className="inline-flex shrink-0" style={{ color: TILE_COLOR[tile.id] }}>
              <UiIcon name={tile.icon} size={18} />
            </span>
            <span className="min-w-0 truncate text-[14px] font-medium text-foreground">
              {tile.label}
            </span>
          </button>
        ))}
      </div>

      {showJob || (busy && generatingLabel) ? (
        <div role={job?.phase === "failed" ? "alert" : "status"} aria-live="polite" className={`studio-job flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2.5 ${job?.phase === "failed" ? "studio-job-failed" : "studio-job-generating"}`}>
          <span className="relative inline-flex shrink-0" style={{ color: generatingTile ? TILE_COLOR[generatingTile.id] : TILE_COLOR.notes }}>
            <UiIcon name={generatingTile?.icon ?? "notes"} size={18} />
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="block truncate text-[14px] text-foreground">{activeJob?.phase === "failed" ? `${activeJob.request.label} · Could not finish` : `Generating ${activeJob?.request.label ?? generatingLabel}…`}</span>
            {job?.error ? <span className="mt-0.5 block text-[12px] text-muted">{job.error}</span> : null}
          </span>
          {job?.phase === "failed" ? <button type="button" disabled={busy} onClick={onRetry} className="relative shrink-0 rounded-full px-2 py-1 text-[12px] text-foreground hover:bg-foreground/10 disabled:opacity-50">Retry</button> : <span className="studio-spin relative" aria-hidden />}
        </div>
      ) : null}
      {error ? <p role="alert" className="text-[12px] text-red-400">Could not load Studio outputs: {error}</p> : null}

      {outputs.length > 0 ? (
        <ul className="space-y-1">
          {outputs.map((item) => (
            <li key={item.key} className="list-none">
              <button type="button" onClick={item.open} className="panel-selectable flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left">
                <span className="inline-flex shrink-0" style={{ color: item.color }}>
                  <UiIcon name={item.icon} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-foreground">{item.title}</span>
                  <span className="block truncate text-[12px] text-muted">{item.meta}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {config ? (
        <StudioConfig
          tile={config}
          sourceCount={sourceCount}
          busy={busy}
          onClose={() => setConfig(null)}
          onGenerate={(prompt) => {
            onCreate(config, { prompt, tool: config.tool });
            setConfig(null);
          }}
        />
      ) : null}
    </div>
  );
}

function StudioConfig({
  tile,
  sourceCount,
  busy,
  onClose,
  onGenerate,
}: {
  tile: StudioTile;
  sourceCount: number;
  busy: boolean;
  onClose: () => void;
  onGenerate: (prompt: string) => void;
}) {
  const [size, setSize] = useState(tile.id === "quiz" ? "10" : "Standard");
  const [level, setLevel] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [language, setLanguage] = useState("Georgian");
  const [topic, setTopic] = useState("");
  const graded = tile.id === "practice" || tile.id === "quiz" || tile.id === "flashcards";

  function generate() {
    const lines = [
      tile.prompt.replace("Write in the language of my sources.", "").trim(),
      tile.id === "quiz" ? `Number of questions: ${size}.` : `Length: ${size}.`,
      graded ? `Difficulty: ${level}.` : "",
      `Language: ${language}.`,
      sourceCount > 0 ? `Use my selected sources (${sourceCount}).` : "Use the topic below.",
      topic.trim() ? `Topic: ${topic.trim()}` : "Use the sources as the topic.",
    ].filter(Boolean);
    onGenerate(lines.join("\n"));
  }

  return createPortal(
    <div className="popup-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="studio-config-title" className="popup-surface w-full max-w-[640px] rounded-2xl bg-surface p-5 text-foreground shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="studio-config-title" className="flex items-center gap-2 text-[16px] font-medium">
            <span style={{ color: TILE_COLOR[tile.id] }}><UiIcon name={tile.icon} size={18} /></span>
            {tile.label}
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground">
            <UiIcon name="close" size={16} />
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Choice label={tile.id === "quiz" ? "Number of questions" : tile.id === "flashcards" ? "Number of cards" : "Length"} value={size} options={tile.id === "quiz" ? ["5", "8", "10"] : ["Fewer", "Standard", "More"]} onChange={setSize} />
          {graded ? <Choice label="Level of difficulty" value={level} options={["Easy", "Medium", "Hard"]} onChange={setLevel} /> : null}
          <label className="block text-[13px] text-muted">
            Language
            <select value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-1 h-9 w-full rounded-full bg-background px-3 text-[13px] text-foreground outline-none">
              <option>Georgian</option>
              <option>English</option>
              <option>The language of my sources</option>
            </select>
          </label>
          <p className="self-end text-[13px] text-muted">Sources · {sourceCount}</p>
        </div>
        <label className="mt-4 block text-[13px] text-muted">
          What should the topic be?
          <textarea value={topic} onChange={(event) => setTopic(event.target.value)} rows={4} required={sourceCount === 0} placeholder={sourceCount ? "Leave empty to use the selected sources" : "Describe what you want to generate"} className="mt-1 w-full resize-none rounded-xl bg-background px-3 py-2 text-[14px] text-foreground outline-none placeholder:text-muted" />
        </label>
        <div className="mt-4 flex justify-end">
          <button type="button" disabled={busy || (sourceCount === 0 && !topic.trim())} onClick={generate} className="h-9 rounded-full bg-foreground px-4 text-[13px] font-medium text-background disabled:opacity-50">
            Generate now
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[13px] text-muted">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`h-8 rounded-full px-3 text-[13px] ${value === option ? "bg-foreground text-background" : "bg-background text-foreground hover:bg-surface"}`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
