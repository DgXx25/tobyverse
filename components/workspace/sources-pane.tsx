"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileKindIcon } from "@/components/workspace/file-kind-icon";
import { MaterialText } from "@/components/workspace/material-text";
import { UiIcon } from "@/components/workspace/ui-icon";
import { newChipId } from "@/lib/composer/attach";
import { ingestMaterialFile, ingestMaterialPaste, ingestMaterialUrl } from "@/lib/materials/ingest-client";
import { removeMaterial } from "@/lib/materials/save";
import { renameMaterial } from "@/lib/materials/store";
import { MATERIAL_FILE_ACCEPT } from "@/lib/materials/types";
import type { LibraryFileKind } from "@/lib/library/media";
import type { Material } from "@/types/material";

type Pending = { id: string; name: string; state: "uploading" | "error"; error?: string; file?: File };

const UPLOAD_CONCURRENCY = 2;
const NONE = "__none__";

function kindFromName(name: string, type?: Material["type"]): LibraryFileKind {
  const lower = name.toLowerCase();
  if (type === "pdf" || lower.endsWith(".pdf")) return "pdf";
  if (type === "docx" || lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".doc")) return "doc";
  if (type === "pptx" || lower.endsWith(".pptx")) return "pptx";
  if (lower.endsWith(".ppt")) return "ppt";
  if (lower.endsWith(".csv")) return "csv";
  if (type === "xlsx" || /\.(?:xlsx?|xlsm)$/.test(lower)) return "excel";
  if (type === "md" || lower.endsWith(".md")) return "md";
  if (type === "paste") return "notes";
  if (type === "txt" || lower.endsWith(".txt")) return "txt";
  if (type === "image" || lower.endsWith(".png")) return "png";
  if (/\.jpe?g$/.test(lower)) return "jpg";
  return "other";
}

function fileStem(name: string): string {
  return name.trim().toLowerCase().replace(/\.[^.]+$/, "");
}

function sameFile(entryName: string, material: Material): boolean {
  const pending = entryName.trim().toLowerCase();
  const original = (material.originalName || "").trim().toLowerCase();
  if (original && original === pending) return true;
  const title = material.title.trim().toLowerCase();
  return title === pending || title === fileStem(pending);
}

function statusOf(material: Material): { text: string; tone: "busy" | "error" } | null {
  if (material.status === "failed" || material.index?.status === "failed") return { text: "Could not read", tone: "error" };
  if (material.status === "uploading" || material.status === "processing" || material.index?.status === "indexing") {
    return { text: "Reading…", tone: "busy" };
  }
  return null;
}

/**
 * The notebook's sources. A checked source is one the chat may draw from. When nothing is
 * restricted (selectedIds empty) every source is used, which is the default for a new notebook.
 */
export function SourcesPane({
  projectId,
  userId,
  items,
  selectedIds,
  onSelectedIds,
  onOpenMaterial,
  readingId = null,
  onCloseReading,
  onClose,
  className = "",
}: {
  projectId: string;
  userId: string;
  items: Material[];
  selectedIds: string[];
  onSelectedIds: (ids: string[]) => void;
  onOpenMaterial: (id: string) => void;
  readingId?: string | null;
  onCloseReading?: () => void;
  onClose?: () => void;
  className?: string;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [adderOpen, setAdderOpen] = useState(false);
  const [adding, setAdding] = useState<"site" | "youtube" | "paste" | null>(null);
  const [linkValue, setLinkValue] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  const [renameTarget, setRenameTarget] = useState<Material | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const visiblePending = pending.filter((entry) => !items.some((item) => sameFile(entry.name, item)));
  const reading = items.find((item) => item.id === readingId) ?? null;
  const allIds = items.map((item) => item.id);
  const none = selectedIds.length === 1 && selectedIds[0] === NONE;
  const picked = selectedIds.filter((id) => allIds.includes(id));
  const allOn = !none && (selectedIds.length === 0 || picked.length >= allIds.length);
  const isOn = (id: string) => !none && (selectedIds.length === 0 || selectedIds.includes(id));

  function toggle(id: string) {
    const current = allOn ? allIds : picked;
    if (current.includes(id)) {
      const next = current.filter((item) => item !== id);
      onSelectedIds(next.length === 0 ? [NONE] : next);
      return;
    }
    const next = [...current, id];
    onSelectedIds(next.length >= allIds.length ? [] : next);
  }

  function toggleAll() {
    onSelectedIds(allOn ? [NONE] : []);
  }

  async function uploadOne(entry: Pending, file: File) {
    try {
      await ingestMaterialFile({ projectId, userId, file });
      setPending((current) => current.filter((item) => item.id !== entry.id));
    } catch (err) {
      const message = err instanceof Error && err.message.trim() ? err.message : "Upload failed.";
      setPending((current) =>
        current.map((item) => (item.id === entry.id ? { ...item, state: "error", error: message, file } : item)),
      );
    }
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    const entries = files.map((file) => ({ id: newChipId(), name: file.name, state: "uploading" as const }));
    setPending((current) => [...current, ...entries]);
    let cursor = 0;
    const worker = async () => {
      while (cursor < files.length) {
        const index = cursor;
        cursor += 1;
        await uploadOne(entries[index], files[index]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker));
  }

  async function retry(entry: Pending) {
    if (!entry.file) return;
    const file = entry.file;
    setPending((current) => current.map((item) => (item.id === entry.id ? { ...item, state: "uploading", error: undefined } : item)));
    await uploadOne(entry, file);
  }

  async function addLink() {
    const url = linkValue.trim();
    if (!url || busy) return;
    if (adding === "youtube" && !/(?:youtu\.be\/|youtube\.com\/)/i.test(url)) {
      setError("Paste a YouTube link.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ingestMaterialUrl({ projectId, userId, url });
      setLinkValue("");
      setAdding(null);
      setAdderOpen(false);
    } catch (err) {
      setError(err instanceof Error && err.message.trim() ? err.message : "Could not add the link.");
    } finally {
      setBusy(false);
    }
  }

  async function addPaste() {
    const text = pasteBody.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await ingestMaterialPaste({ projectId, userId, text, title: pasteTitle.trim() || undefined });
      setPasteBody("");
      setPasteTitle("");
      setAdding(null);
      setAdderOpen(false);
    } catch (err) {
      setError(err instanceof Error && err.message.trim() ? err.message : "Could not save the text.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!menu) return;
    function onPointer(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-source-menu]")) return;
      setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onPointer, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onPointer, true);
    };
  }, [menu]);

  async function remove(item: Material) {
    setError(null);
    setMenu(null);
    try {
      await removeMaterial(item);
      if (selectedIds.includes(item.id)) onSelectedIds(selectedIds.filter((id) => id !== item.id));
    } catch (err) {
      setError(err instanceof Error && err.message.trim() ? err.message : "Could not delete the source.");
    }
  }

  function openRename(item: Material) {
    setMenu(null);
    setRenameTarget(item);
    setRenameValue(item.title);
  }

  async function saveRename() {
    if (!renameTarget || renaming) return;
    const next = renameValue.trim();
    if (!next) return;
    setRenaming(true);
    setError(null);
    try {
      await renameMaterial(projectId, renameTarget.id, next);
      setRenameTarget(null);
    } catch (err) {
      setError(err instanceof Error && err.message.trim() ? err.message : "Could not rename the source.");
    } finally {
      setRenaming(false);
    }
  }

  return (
    <section
      aria-label="Sources"
      className={`relative flex min-h-0 w-full min-w-0 max-w-full flex-col overflow-x-hidden bg-transparent ${className}`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setDragging(false);
        void uploadFiles([...event.dataTransfer.files]);
      }}
    >
      {reading ? (
        <MaterialText material={reading} onBack={() => onCloseReading?.()} />
      ) : <>
      <header className="flex h-11 shrink-0 items-center justify-end px-2">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide sources"
            title="Hide sources"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground md:hidden"
          >
            <UiIcon name="close" size={17} />
          </button>
        ) : null}
      </header>

      <div className="shrink-0 px-3 pt-3">
        <button
          type="button"
          onClick={() => {
            setAdding(null);
            setAdderOpen(true);
          }}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-surface-2 text-[14px] text-foreground transition-colors hover:bg-white/10"
        >
          <UiIcon name="plus" size={16} />
          Add sources
        </button>

        {error ? <p role="alert" className="mt-2 text-[12px] leading-4 text-red-400">{error}</p> : null}
      </div>

      <div className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4 pt-3">
        {items.length > 0 ? (
          <div className="mb-1 flex h-8 items-center justify-end gap-2 px-2 text-[12px] text-muted">
            <span>Select all</span>
            <button type="button" role="checkbox" aria-checked={allOn} aria-label="Select all sources" onClick={toggleAll} className="flex h-8 w-7 items-center justify-center">
              <Check on={allOn} />
            </button>
          </div>
        ) : null}

        <ul className="space-y-0.5">
          {visiblePending.map((entry) => (
            <li key={entry.id} className="list-none">
              <div className="flex items-center gap-1 rounded-lg px-1 py-1">
                <FileKindIcon kind={kindFromName(entry.name)} size={22} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{entry.name}</span>
                {entry.state === "error" ? (
                  <span className="flex shrink-0 gap-1 pr-1 text-[12px]">
                    <button type="button" onClick={() => void retry(entry)} className="text-muted hover:text-foreground">Retry</button>
                    <button
                      type="button"
                      onClick={() => setPending((current) => current.filter((item) => item.id !== entry.id))}
                      className="text-muted hover:text-foreground"
                    >
                      Dismiss
                    </button>
                  </span>
                ) : (
                  <span className="flex h-9 w-7 shrink-0 items-center justify-center" aria-label="Uploading">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border border-muted/40 border-t-foreground" />
                  </span>
                )}
              </div>
              {entry.error ? <p className="mt-0.5 pl-9 text-[12px] leading-4 text-red-400">{entry.error}</p> : null}
            </li>
          ))}

          {items.map((item) => {
            const status = statusOf(item);
            const on = isOn(item.id);
            const busy = status?.tone === "busy";
            const menuOpen = menu?.id === item.id;
            return (
              <li
                key={item.id}
                className="group relative list-none"
                onContextMenu={(event) => {
                  if (busy) return;
                  event.preventDefault();
                  setMenu({ id: item.id, top: event.clientY, right: Math.max(8, window.innerWidth - event.clientX) });
                }}
              >
                <div className={`flex min-w-0 items-center overflow-hidden rounded-lg px-1 hover:bg-background ${menuOpen ? "bg-background" : ""}`}>
                  <button
                    type="button"
                    onClick={() => onOpenMaterial(item.id)}
                    className="flex min-h-9 min-w-0 flex-1 items-center gap-2 py-1 text-left"
                    title={item.title}
                  >
                    <FileKindIcon kind={kindFromName(item.originalName || item.title, item.type)} size={22} />
                    <span className={`min-w-0 flex-1 truncate text-[13px] ${on ? "text-foreground" : "text-muted"} ${!busy && (menuOpen ? "pr-8" : "group-hover:pr-8")}`}>{item.title}</span>
                  </button>
                  {busy ? (
                    <span className="flex h-9 w-7 shrink-0 items-center justify-center" aria-label="Reading">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border border-muted/40 border-t-foreground" />
                    </span>
                  ) : (
                    <>
                      <span data-source-menu className="contents">
                        <button
                          type="button"
                          aria-label={`Source actions for ${item.title}`}
                          aria-expanded={menuOpen}
                          onClick={(event) => {
                            if (menuOpen) {
                              setMenu(null);
                              return;
                            }
                            const rect = event.currentTarget.getBoundingClientRect();
                            setMenu({ id: item.id, top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
                          }}
                          className={`absolute right-8 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-foreground/10 hover:text-foreground ${
                            menuOpen ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
                          }`}
                        >
                          <UiIcon name="moreVertical" size={16} />
                        </button>
                      </span>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`Use ${item.title}`}
                        onClick={() => toggle(item.id)}
                        className="flex h-9 w-7 shrink-0 items-center justify-center"
                      >
                        <Check on={on} />
                      </button>
                    </>
                  )}
                </div>
                {status?.tone === "error" ? <p className="pl-9 text-[12px] leading-4 text-red-400">{status.text}</p> : null}
              </li>
            );
          })}
        </ul>

        {items.length === 0 && visiblePending.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border px-5 py-10 text-center">
            <p className="text-[14px] font-medium tracking-tight text-foreground">Saved sources will appear here</p>
            <p className="mx-auto mt-1.5 max-w-[220px] text-[12px] leading-5 text-muted">
              Add PDFs, slides, documents, images, a link or pasted text. Answers will come from them.
            </p>
          </div>
        ) : null}
      </div>
      </>}

      {dragging && !adderOpen ? (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-2xl border border-dashed border-foreground/40 bg-surface/90 text-[14px] text-foreground">
          Drop to add sources
        </div>
      ) : null}
      {adderOpen ? <AddSourcesDialog
        adding={adding}
        setAdding={setAdding}
        linkValue={linkValue}
        setLinkValue={setLinkValue}
        pasteTitle={pasteTitle}
        setPasteTitle={setPasteTitle}
        pasteBody={pasteBody}
        setPasteBody={setPasteBody}
        busy={busy}
        error={error}
        onClose={() => {
          setAdderOpen(false);
          setAdding(null);
          setError(null);
        }}
        onFiles={(files) => {
          setAdderOpen(false);
          void uploadFiles(files);
        }}
        onLink={() => void addLink()}
        onPaste={() => void addPaste()}
      /> : null}
      {menu ? createPortal(
        <div data-source-menu className="fixed z-[70] w-[196px] overflow-hidden rounded-xl bg-surface-2 p-1 shadow-xl" style={{ top: menu.top, right: menu.right }}>
          <button type="button" onClick={() => { const item = items.find((entry) => entry.id === menu.id); if (item) void remove(item); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] text-foreground hover:bg-background">
            <UiIcon name="trash" size={16} />
            Remove source
          </button>
          <button type="button" onClick={() => { const item = items.find((entry) => entry.id === menu.id); if (item) openRename(item); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] text-foreground hover:bg-background">
            <UiIcon name="edit" size={16} />
            Rename source
          </button>
        </div>,
        document.body,
      ) : null}
      {renameTarget ? createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameTarget(null); }}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-source-title"
            className="w-full max-w-[440px] rounded-2xl bg-surface p-5 text-foreground shadow-2xl"
            onSubmit={(event) => { event.preventDefault(); void saveRename(); }}
          >
            <h2 id="rename-source-title" className="text-[16px] font-medium tracking-tight">Rename {renameTarget.title}?</h2>
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              aria-label="Source name"
              className="mt-4 h-10 w-full rounded-xl bg-background px-3 text-[14px] text-foreground outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRenameTarget(null)} className="h-9 rounded-full px-4 text-[13px] text-foreground hover:bg-background">Cancel</button>
              <button type="submit" disabled={renaming || !renameValue.trim()} className="h-9 rounded-full bg-foreground px-4 text-[13px] font-medium text-background disabled:opacity-40">{renaming ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}

function AddSourcesDialog({
  adding,
  setAdding,
  linkValue,
  setLinkValue,
  pasteTitle,
  setPasteTitle,
  pasteBody,
  setPasteBody,
  busy,
  error,
  onClose,
  onFiles,
  onLink,
  onPaste,
}: {
  adding: "site" | "youtube" | "paste" | null;
  setAdding: (value: "site" | "youtube" | "paste" | null) => void;
  linkValue: string;
  setLinkValue: (value: string) => void;
  pasteTitle: string;
  setPasteTitle: (value: string) => void;
  pasteBody: string;
  setPasteBody: (value: string) => void;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onFiles: (files: File[]) => void;
  onLink: () => void;
  onPaste: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Add sources"
        className="w-full max-w-[560px] rounded-2xl bg-surface p-4 text-foreground shadow-2xl"
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setOver(false);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          setOver(false);
          onFiles([...event.dataTransfer.files]);
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[16px] font-medium tracking-tight">Add sources</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground">
            <UiIcon name="close" size={16} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip icon="file" label="Upload files" onClick={() => fileRef.current?.click()} />
          <Chip icon="globe" label="Website" pressed={adding === "site"} onClick={() => setAdding(adding === "site" ? null : "site")} />
          <Chip icon="arrow" label="YouTube" pressed={adding === "youtube"} onClick={() => setAdding(adding === "youtube" ? null : "youtube")} />
          <Chip icon="notes" label="Copied text" pressed={adding === "paste"} onClick={() => setAdding(adding === "paste" ? null : "paste")} />
        </div>
        <input ref={fileRef} type="file" multiple accept={MATERIAL_FILE_ACCEPT} className="hidden" onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.currentTarget.value = "";
          if (files.length) onFiles(files);
        }} />
        {adding === "site" || adding === "youtube" ? (
          <form className="mt-3" onSubmit={(event) => { event.preventDefault(); onLink(); }}>
            <input autoFocus value={linkValue} onChange={(event) => setLinkValue(event.target.value)} placeholder={adding === "youtube" ? "https://youtube.com/…" : "https://…"} aria-label={adding === "youtube" ? "YouTube link" : "Website"} className="h-10 w-full rounded-xl bg-background px-3 text-[14px] outline-none placeholder:text-muted" />
            <div className="mt-2 flex justify-end">
              <button type="submit" disabled={busy || !linkValue.trim()} className="h-8 rounded-full bg-foreground px-3 text-[13px] font-medium text-background disabled:opacity-40">{busy ? "Adding…" : "Add"}</button>
            </div>
          </form>
        ) : null}
        {adding === "paste" ? (
          <form className="mt-3" onSubmit={(event) => { event.preventDefault(); onPaste(); }}>
            <input value={pasteTitle} onChange={(event) => setPasteTitle(event.target.value)} placeholder="Title (optional)" aria-label="Title" className="h-9 w-full bg-transparent text-[14px] font-medium outline-none placeholder:text-muted" />
            <textarea autoFocus value={pasteBody} onChange={(event) => setPasteBody(event.target.value)} rows={6} placeholder="Paste text to use as a source" aria-label="Text" className="mt-1 w-full resize-none rounded-xl bg-background px-3 py-2 text-[13px] outline-none placeholder:text-muted" />
            <div className="mt-2 flex justify-end">
              <button type="submit" disabled={busy || !pasteBody.trim()} className="h-8 rounded-full bg-foreground px-3 text-[13px] font-medium text-background disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        ) : null}
        {adding ? null : (
          <div className={`mt-3 flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-6 text-center text-[13px] text-muted ${over ? "border-foreground/40 bg-background" : "border-border"}`}>
            <UiIcon name="attach" size={18} />
            <p>Drag and drop PDFs, slides, documents or images</p>
          </div>
        )}
        {error ? <p role="alert" className="mt-2 text-[12px] text-red-400">{error}</p> : null}
      </section>
    </div>,
    document.body,
  );
}

function Chip({ icon, label, onClick, pressed = false }: { icon: "file" | "globe" | "arrow" | "notes"; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] ${pressed ? "bg-foreground text-background" : "bg-background text-foreground hover:bg-surface-2"}`}>
      <UiIcon name={icon} size={15} />
      {label}
    </button>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
        on ? "border-foreground bg-foreground text-background" : "border-border bg-transparent"
      }`}
    >
      {on ? <UiIcon name="check" size={11} /> : null}
    </span>
  );
}
