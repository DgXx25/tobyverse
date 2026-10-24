"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UiIcon, type UiIconName } from "@/components/workspace/ui-icon";
import { shortDate } from "@/lib/format";
import { positionContextMenu } from "@/lib/workspace/context-menu-position";
import { STUDIO_TILES, type StudioJob, type StudioSavedArtifact, type StudioTile } from "@/lib/workspace/studio";
import { renameStudioArtifact, removeStudioArtifact } from "@/lib/workspace/studio-store";
import { deleteStudySheet, getStudySheet, updateStudySheet } from "@/lib/study-sheets/store";
import { deleteExercise, listExercises } from "@/lib/exercises/store";
import { deleteStudyPath, listStudyPaths, patchStudyPath } from "@/lib/paths/store";
import type { Material } from "@/types/material";
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

type StudioOutput = {
  key: string;
  artifact: ChatArtifact;
  icon: UiIconName;
  color: string;
  title: string;
  meta: string;
  prompt?: string;
  sourceMaterialIds: string[];
  open: () => void;
};

/**
 * Studio: one tap makes something from the sources. A tile is an ordinary request,
 * so the result lands back in the list the same way any other output does.
 */
export function StudioPane({
  projectId,
  sheets,
  practiceSets,
  paths,
  materials,
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
  projectId: string;
  sheets: StudySheet[];
  practiceSets: ChatArtifact[];
  paths: StudyPath[];
  materials: Material[];
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
  const [menu, setMenu] = useState<{ key: string; x: number; y: number; view: "main" | "rename" | "delete" } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [details, setDetails] = useState<StudioOutput | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openTile(tile: StudioTile) {
    setConfig(tile);
  }

  const registeredKeys = new Set(studioArtifacts.map((item) => `${item.artifact.kind}:${item.artifact.id}`));
  const registeredOutputs: StudioOutput[] = studioArtifacts.filter((item) => !item.removed).map((item) => {
    const tile = STUDIO_TILES.find((tile) => tile.id === item.type)!;
    return {
      key: `${item.artifact.kind}:${item.artifact.id}`,
      artifact: item.artifact,
      icon: tile.icon,
      color: TILE_COLOR[tile.id],
      title: item.artifact.title,
      meta: [tile.label, shortDate(item.createdAt)].filter(Boolean).join(" · "),
      prompt: item.prompt,
      sourceMaterialIds: item.sourceMaterialIds ?? [],
      open: () => item.artifact.kind === "practice" ? onOpenPractice(item.artifact.id) : item.artifact.kind === "path" ? onOpenPath() : onOpenSheet(item.artifact.id),
    };
  });
  const legacyOutputs: StudioOutput[] = [
    ...paths.slice(0, 1).map((item) => ({
      key: `path:${item.id}`,
      artifact: { kind: "path", id: item.id, title: item.title },
      icon: "plan" as const,
      color: TILE_COLOR.path,
      title: item.title || "Course path",
      meta: "Course path",
      sourceMaterialIds: item.sourceMaterialIds,
      open: onOpenPath,
    })),
    ...sheets.map((item) => ({
      key: `sheet:${item.id}`,
      artifact: { kind: "sheet", id: item.id, title: item.title },
      icon: (item.kind === "note" ? "checkmarkSquare02" : "notes") as UiIconName,
      color: TILE_COLOR.notes,
      title: item.title || "Notes",
      meta: [item.kind === "note" ? item.pendingSave ? "Note · Saving…" : "Note · Saved" : "Study notes", shortDate(item.createdAt)].filter(Boolean).join(" · "),
      sourceMaterialIds: item.sourceMaterialIds,
      open: () => onOpenSheet(item.id),
    })),
    ...practiceSets.map((item) => {
      const count = item.count ?? item.ids?.length ?? 0;
      const exam = item.mode === "exam";
      return {
        key: `practice:${item.id}`,
        artifact: item,
        icon: (exam ? "check" : "practice") as UiIconName,
        color: TILE_COLOR.quiz,
        title: item.title || `${exam ? "Exam" : "Quiz"} · ${count}`,
        meta: `${exam ? "Exam" : "Quiz"} · ${count}`,
        sourceMaterialIds: [],
        open: () => onOpenPractice(item.id),
      };
    }),
  ];
  const outputs = [...registeredOutputs, ...legacyOutputs.filter((item) => !registeredKeys.has(item.key))];
  const activeMenuOutput = outputs.find((item) => item.key === menu?.key) ?? null;
  const menuPosition = menu && typeof window !== "undefined"
    ? positionContextMenu(menu.x, menu.y, 244, menu.view === "delete" ? 142 : 116, window.innerWidth, window.innerHeight)
    : null;
  const resultVisible = job?.artifact && outputs.some((item) => item.key === `${job.artifact!.kind}:${job.artifact!.id}`);
  const showJob = job?.phase === "failed" || job?.phase === "pending" || (job?.phase === "complete" && !resultVisible);
  const activeJob = showJob ? job : null;
  const generatingTile = STUDIO_TILES.find((tile) => tile.id === activeJob?.request.type) ?? STUDIO_TILES.find((tile) => tile.label === generatingLabel);

  useEffect(() => {
    if (!menu) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);

  function showMenu(output: StudioOutput, point: { x: number; y: number }) {
    setActionError(null);
    setRenameDraft(output.title);
    setMenu({ key: output.key, ...point, view: "main" });
  }

  async function renameOutput(output: StudioOutput) {
    const title = renameDraft.replace(/\s+/g, " ").trim();
    if (!title) return;
    setBusyKey(output.key);
    setActionError(null);
    try {
      if (output.artifact.kind === "sheet" || output.artifact.kind === "plan") {
        await updateStudySheet(projectId, output.artifact.id, { title });
      } else if (output.artifact.kind === "path") {
        await patchStudyPath(projectId, output.artifact.id, { title });
      }
      await renameStudioArtifact(projectId, output.artifact, title);
      setMenu(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not rename this item.");
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteOutput(output: StudioOutput) {
    setBusyKey(output.key);
    setActionError(null);
    try {
      if (output.artifact.kind === "sheet" || output.artifact.kind === "plan") {
        await deleteStudySheet(projectId, output.artifact.id);
      } else if (output.artifact.kind === "path") {
        await deleteStudyPath(projectId, output.artifact.id);
      } else if (output.artifact.kind === "practice") {
        await Promise.all((output.artifact.ids?.length ? output.artifact.ids : [output.artifact.id]).map((id) => deleteExercise(projectId, id)));
      }
      await removeStudioArtifact(projectId, output.artifact);
      setMenu(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not delete this item.");
    } finally {
      setBusyKey(null);
    }
  }

  async function downloadOutput(output: StudioOutput) {
    setBusyKey(output.key);
    setActionError(null);
    try {
      let content: unknown = output.artifact;
      if (output.artifact.kind === "sheet" || output.artifact.kind === "plan") {
        content = await getStudySheet(projectId, output.artifact.id) ?? output.artifact;
      } else if (output.artifact.kind === "practice") {
        const ids = output.artifact.ids?.length ? output.artifact.ids : [output.artifact.id];
        content = (await listExercises(projectId)).filter((item) => ids.includes(item.id));
      } else if (output.artifact.kind === "path") {
        content = (await listStudyPaths(projectId)).find((item) => item.id === output.artifact.id) ?? output.artifact;
      }
      const payload = JSON.stringify({ title: output.title, type: output.meta, prompt: output.prompt ?? null, content }, null, 2);
      const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${output.title.replace(/[^a-z0-9ა-ჰ_-]+/gi, "-").replace(/^-|-$/g, "") || "tobyverse-output"}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setMenu(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not download this item.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        {STUDIO_TILES.map((tile) => (
          <button
            key={tile.id}
            type="button"
            disabled={busy}
            onClick={() => openTile(tile)}
            className="studio-generation-button panel-selectable flex h-11 items-center gap-2 rounded-full px-3 text-left disabled:opacity-60"
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
            <li
              key={item.key}
              className="group relative list-none rounded-2xl hover:bg-surface-2"
              onContextMenu={(event) => {
                event.preventDefault();
                showMenu(item, { x: event.clientX, y: event.clientY });
              }}
            >
              <button type="button" onClick={item.open} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 pr-11 text-left">
                <span className="inline-flex shrink-0" style={{ color: item.color }}>
                  <UiIcon name={item.icon} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-foreground">{item.title}</span>
                  <span className="block truncate text-[12px] text-muted">{item.meta}</span>
                </span>
              </button>
              <button
                type="button"
                aria-label={`Options for ${item.title}`}
                aria-haspopup="menu"
                aria-expanded={menu?.key === item.key}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  showMenu(item, { x: rect.right, y: rect.top });
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  showMenu(item, { x: event.clientX, y: event.clientY });
                }}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted opacity-0 transition hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
              >
                <UiIcon name="moreVertical" size={18} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {menu && activeMenuOutput && menuPosition && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[100] w-[244px] rounded-xl border border-border bg-[var(--item-active-bg)] p-1 text-[13px] text-foreground shadow-xl"
          style={menuPosition}
          onContextMenu={(event) => event.preventDefault()}
        >
          {menu.view === "main" ? (
            <>
              <OutputMenuItem icon="edit" label="Rename" onClick={() => { setRenameDraft(activeMenuOutput.title); setMenu({ ...menu, view: "rename" }); }} />
              <OutputMenuItem icon="download" label="Download" disabled={busyKey === activeMenuOutput.key} onClick={() => void downloadOutput(activeMenuOutput)} />
              <OutputMenuItem icon="trash" label="Delete" danger onClick={() => setMenu({ ...menu, view: "delete" })} />
            </>
          ) : menu.view === "rename" ? (
            <form className="p-1.5" onSubmit={(event) => { event.preventDefault(); void renameOutput(activeMenuOutput); }}>
              <input autoFocus maxLength={100} value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} aria-label="Output name" className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none" />
              <div className="mt-1.5 flex justify-end gap-1">
                <button type="button" onClick={() => setMenu({ ...menu, view: "main" })} className="h-8 rounded-lg px-2.5 text-[12px] text-muted hover:bg-foreground/10">Cancel</button>
                <button type="submit" disabled={!renameDraft.trim() || busyKey === activeMenuOutput.key} className="h-8 rounded-lg bg-foreground px-3 text-[12px] font-medium text-background disabled:opacity-50">{busyKey === activeMenuOutput.key ? "Saving…" : "Save"}</button>
              </div>
            </form>
          ) : (
            <div className="p-2">
              <p className="text-[13px] leading-5">Delete “{activeMenuOutput.title}”?</p>
              <p className="mt-1 text-[12px] text-muted">This removes the generated item and its saved questions or notes.</p>
              <div className="mt-2 flex justify-end gap-1">
                <button type="button" onClick={() => setMenu({ ...menu, view: "main" })} className="h-8 rounded-lg px-2.5 text-[12px] text-muted hover:bg-foreground/10">Cancel</button>
                <button type="button" disabled={busyKey === activeMenuOutput.key} onClick={() => void deleteOutput(activeMenuOutput)} className="h-8 rounded-lg bg-red-500 px-3 text-[12px] font-medium text-white disabled:opacity-50">{busyKey === activeMenuOutput.key ? "Deleting…" : "Delete"}</button>
              </div>
            </div>
          )}
          {actionError ? <p role="alert" className="px-2 pb-1.5 pt-1 text-[12px] text-red-400">{actionError}</p> : null}
        </div>,
        document.body,
      ) : null}

      {details && typeof document !== "undefined" ? createPortal(
        <div className="popup-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetails(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="studio-output-details-title" className="popup-surface max-h-[min(80vh,680px)] w-full max-w-xl overflow-y-auto rounded-2xl bg-surface p-5 text-foreground shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="studio-output-details-title" className="truncate text-[16px] font-medium">{details.title}</h2>
              <button type="button" aria-label="Close" onClick={() => setDetails(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground"><UiIcon name="close" size={16} /></button>
            </div>
            <h3 className="mb-1 text-[12px] font-medium text-muted">Prompt</h3>
            <p className="whitespace-pre-wrap break-words rounded-xl bg-background p-3 text-[13px] leading-5">{details.prompt || "Prompt details are unavailable for this older output."}</p>
            <h3 className="mb-1 mt-4 text-[12px] font-medium text-muted">Sources</h3>
            {details.sourceMaterialIds.length ? (
              <ul className="space-y-1 text-[13px]">
                {details.sourceMaterialIds.map((id) => <li key={id} className="truncate rounded-lg bg-background px-3 py-2">{materials.find((item) => item.id === id)?.title ?? id}</li>)}
              </ul>
            ) : <p className="rounded-xl bg-background p-3 text-[13px] text-muted">No source list was saved with this output.</p>}
          </section>
        </div>,
        document.body,
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

function OutputMenuItem({
  icon,
  label,
  onClick,
  disabled = false,
  danger = false,
}: {
  icon: UiIconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left disabled:opacity-50 ${danger ? "text-red-400 hover:bg-red-500/10" : "text-foreground hover:bg-foreground/10"}`}
    >
      <UiIcon name={icon} size={16} />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}
