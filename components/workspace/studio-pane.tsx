"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { UiIcon, type UiIconName } from "@/components/workspace/ui-icon";
import { shortDate } from "@/lib/format";
import { STUDIO_ASK, STUDIO_TILES, type StudioTile } from "@/lib/workspace/studio";
import type { AcceptedChatTool } from "@/types/chat";
import type { ChatArtifact } from "@/types/chat";
import type { StudyPath } from "@/types/path";
import type { StudySheet } from "@/types/study-sheet";

const TILE_COLOR: Record<StudioTile["id"], string> = {
  practice: "#0a84ff",
  quiz: "#30d158",
  flashcards: "#ffd60a",
  table: "#ff9f0a",
  notes: "#bf5af2",
  path: "#ff375f",
};

/**
 * Studio: one tap makes something from the sources. A tile is an ordinary request,
 * so the result lands back in the list the same way any other output does.
 */
export function StudioPane({
  sheets,
  practiceSets,
  paths,
  hasSources = false,
  sourceCount = 0,
  busy,
  generatingLabel,
  onCreate,
  onOpenSheet,
  onOpenPractice,
  onOpenPath,
  onAddNote,
}: {
  sheets: StudySheet[];
  practiceSets: ChatArtifact[];
  paths: StudyPath[];
  hasSources?: boolean;
  sourceCount?: number;
  busy: boolean;
  generatingLabel?: string | null;
  onCreate: (tile: StudioTile, run?: { prompt: string; tool?: AcceptedChatTool }) => void;
  onOpenSheet: (id: string) => void;
  onOpenPractice: (id: string) => void;
  onOpenPath: () => void;
  onAddNote: (input: { title: string; text: string }) => Promise<void>;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<StudioTile | null>(null);

  function openTile(tile: StudioTile) {
    if (!hasSources) {
      onCreate(tile, { prompt: STUDIO_ASK[tile.id] });
      return;
    }
    setConfig(tile);
  }

  async function saveNote() {
    if (!text.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onAddNote({ title: title.trim(), text: text.trim() });
      setTitle("");
      setText("");
      setNoteOpen(false);
    } catch (err) {
      setError(err instanceof Error && err.message.trim() ? err.message : "Could not save the note.");
    } finally {
      setSaving(false);
    }
  }

  const outputs: { key: string; icon: UiIconName; color: string; title: string; meta: string; open: () => void }[] = [
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
      icon: "notes" as const,
      color: TILE_COLOR.notes,
      title: item.title || "Notes",
      meta: ["Notes", shortDate(item.createdAt)].filter(Boolean).join(" · "),
      open: () => onOpenSheet(item.id),
    })),
    ...practiceSets.map((item) => {
      const count = item.count ?? item.ids?.length ?? 0;
      const exam = item.mode === "exam";
      return {
        key: `practice:${item.id}`,
        icon: (exam ? "check" : "practice") as UiIconName,
        color: exam ? TILE_COLOR.quiz : TILE_COLOR.practice,
        title: `${exam ? "Quiz" : "Practice"} · ${count}`,
        meta: exam ? "Quiz" : "Practice",
        open: () => onOpenPractice(item.id),
      };
    }),
  ];

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        {STUDIO_TILES.map((tile) => (
          <button
            key={tile.id}
            type="button"
            disabled={busy}
            onClick={() => openTile(tile)}
            className="flex h-11 items-center gap-2 rounded-full bg-background px-3 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            <span className="inline-flex shrink-0" style={{ color: TILE_COLOR[tile.id] }}>
              <UiIcon name={tile.icon} size={18} />
            </span>
            <span className="min-w-0 truncate text-[14px] font-medium" style={{ color: TILE_COLOR[tile.id] }}>
              {tile.label}
            </span>
          </button>
        ))}
      </div>

      {busy && generatingLabel ? (
        <div className="flex h-12 items-center gap-3 rounded-2xl bg-background px-3">
          <span className="studio-spin" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-[14px] text-foreground">Generating {generatingLabel}…</span>
          </span>
        </div>
      ) : null}

      {outputs.length > 0 ? (
        <ul className="space-y-1">
          {outputs.map((item) => (
            <li key={item.key} className="list-none">
              <button type="button" onClick={item.open} className="flex w-full items-center gap-3 rounded-2xl bg-background px-3 py-2.5 text-left hover:bg-surface-2">
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

      {noteOpen ? (
        <form
          className="rounded-2xl bg-background p-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            void saveNote();
          }}
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            aria-label="Note title"
            maxLength={80}
            className="h-8 w-full bg-transparent px-1 text-[14px] font-medium text-foreground outline-none placeholder:text-muted"
          />
          <textarea
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            placeholder="Write a note"
            aria-label="Note"
            className="w-full resize-none bg-transparent px-1 py-1 text-[13px] leading-5 text-foreground outline-none placeholder:text-muted"
          />
          {error ? <p role="alert" className="px-1 text-[12px] text-red-400">{error}</p> : null}
          <div className="mt-1 flex justify-end gap-1.5">
            <button type="button" onClick={() => setNoteOpen(false)} className="h-7 rounded-full px-3 text-[12px] text-muted hover:text-foreground">Cancel</button>
            <button type="submit" disabled={saving || !text.trim()} className="h-7 rounded-full bg-foreground px-3 text-[12px] font-medium text-background disabled:opacity-40">{saving ? "Saving…" : "Save"}</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setNoteOpen(true)} className="flex h-11 items-center gap-2 rounded-full bg-background px-3 text-[14px] font-medium text-foreground hover:bg-surface-2">
          <UiIcon name="plus" size={16} />
          Add note
        </button>
      )}
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
  const [size, setSize] = useState<"Fewer" | "Standard" | "More">("Standard");
  const [level, setLevel] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [language, setLanguage] = useState("Georgian");
  const [topic, setTopic] = useState("");
  const graded = tile.id === "practice" || tile.id === "quiz" || tile.id === "flashcards";

  function generate() {
    const lines = [
      STUDIO_ASK[tile.id],
      `Length: ${size}.`,
      graded ? `Difficulty: ${level}.` : "",
      `Language: ${language}.`,
      `Use my selected sources (${sourceCount}).`,
      topic.trim() ? `Topic: ${topic.trim()}` : "Use the sources as the topic.",
    ].filter(Boolean);
    onGenerate(lines.join("\n"));
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="studio-config-title" className="w-full max-w-[640px] rounded-2xl bg-surface p-5 text-foreground shadow-2xl">
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
          <Choice label={tile.id === "quiz" ? "Number of questions" : tile.id === "flashcards" ? "Number of cards" : "Length"} value={size} options={["Fewer", "Standard", "More"]} onChange={setSize} />
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
          <textarea value={topic} onChange={(event) => setTopic(event.target.value)} rows={4} placeholder="Leave empty to use the sources" className="mt-1 w-full resize-none rounded-xl bg-background px-3 py-2 text-[14px] text-foreground outline-none placeholder:text-muted" />
        </label>
        <div className="mt-4 flex justify-end">
          <button type="button" disabled={busy} onClick={generate} className="h-9 rounded-full bg-foreground px-4 text-[13px] font-medium text-background disabled:opacity-50">
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
            className={`h-8 rounded-full px-3 text-[13px] ${value === option ? "bg-foreground text-background" : "bg-background text-foreground hover:bg-surface-2"}`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
