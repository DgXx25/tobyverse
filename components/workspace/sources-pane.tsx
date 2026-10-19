"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileKindIcon } from "@/components/workspace/file-kind-icon";
import { MaterialText } from "@/components/workspace/material-text";
import { MaterialViewer } from "@/components/workspace/material-viewer";
import { UiIcon } from "@/components/workspace/ui-icon";
import { newChipId } from "@/lib/composer/attach";
import { ingestMaterialFile, ingestMaterialPaste, ingestMaterialUrl } from "@/lib/materials/ingest-client";
import { removeMaterial } from "@/lib/materials/save";
import { renameMaterial } from "@/lib/materials/store";
import { createSourceFolder, deleteSourceFolder, groupSourcesByFolder, moveSourcesToFolder, renameSourceFolder, SOURCE_DRAG_TYPE, subscribeSourceFolders, type SourceFolder } from "@/lib/materials/folders";
import { MATERIAL_FILE_ACCEPT } from "@/lib/materials/types";
import { positionContextMenu } from "@/lib/workspace/context-menu-position";
import { markProjectActivityComplete } from "@/lib/workspace/project-activity";
import type { LibraryFileKind } from "@/lib/library/media";
import type { Material } from "@/types/material";

type Pending = { id: string; name: string; state: "uploading" | "error"; error?: string; file?: File; folderId?: string; phase?: "uploading" | "reading"; progress?: number };

const UPLOAD_CONCURRENCY = 2;
const UPLOAD_PROGRESS_WEIGHT = 0.4;
const NONE = "__none__";

function totalIngestProgress(phasePercent: number): number {
  return Math.min(99, Math.round(UPLOAD_PROGRESS_WEIGHT * 100 + (1 - UPLOAD_PROGRESS_WEIGHT) * phasePercent));
}

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

function statusOf(material: Material): { text: string; tone: "busy" | "error"; progress?: number } | null {
  if (material.status === "failed" || material.index?.status === "failed") return { text: "Could not read", tone: "error" };
  if (material.status === "uploading" || material.status === "processing" || material.index?.status === "indexing") {
    const nextPage = material.index?.nextPage;
    const pageProgress = material.type === "pdf" && material.pageCount > 0 && typeof nextPage === "number"
      ? Math.min(100, Math.max(0, Math.round(((nextPage - 1) / material.pageCount) * 100)))
      : typeof material.index?.total === "number" && material.index.total > 0
        ? Math.min(100, Math.max(0, Math.round((material.index.chunks / material.index.total) * 100)))
        : undefined;
    const progress = pageProgress == null ? Math.round(UPLOAD_PROGRESS_WEIGHT * 100) : totalIngestProgress(pageProgress);
    return { text: "Reading…", tone: "busy", progress };
  }
  return null;
}

function ProgressCircle({ value, label }: { value?: number; label: string }) {
  const size = 20;
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const progress = typeof value === "number" ? Math.min(100, Math.max(0, value)) : undefined;
  return (
    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center" role="img" aria-label={progress == null ? label : `${label} ${progress}%`}>
      {progress == null ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border border-muted/40 border-t-foreground" />
      ) : (
        <>
          <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="-rotate-90">
            <circle cx="10" cy="10" r={radius} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-border" />
            <circle
              cx="10"
              cy="10"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress / 100)}
              className="text-foreground transition-[stroke-dashoffset] duration-300"
            />
          </svg>
        </>
      )}
    </span>
  );
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
  hideTopBar = false,
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
  hideTopBar?: boolean;
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
  const [menu, setMenu] = useState<{ id: string; folder?: boolean; top: number; right: number; pointer?: { x: number; y: number } } | null>(null);
  const [renameTarget, setRenameTarget] = useState<Material | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [folders, setFolders] = useState<SourceFolder[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [organizing, setOrganizing] = useState(false);
  const [managedIds, setManagedIds] = useState<string[]>([]);
  const [destination, setDestination] = useState("");
  const [folderDialog, setFolderDialog] = useState<{ id?: string; name: string } | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const selectionAnchor = useRef<string | null>(null);

  useEffect(() => {
    setFolders([]);
    setManagedIds([]);
    setOrganizing(false);
    setCollapsed([]);
    return subscribeSourceFolders(projectId, setFolders, err => setError(err.message));
  }, [projectId]);

  const visiblePending = pending.filter((entry) => !items.some((item) => sameFile(entry.name, item)));
  const reading = items.find((item) => item.id === readingId) ?? null;
  const allIds = items.map((item) => item.id);
  const none = selectedIds.length === 1 && selectedIds[0] === NONE;
  const picked = selectedIds.filter((id) => allIds.includes(id));
  const allOn = !none && (selectedIds.length === 0 || picked.length >= allIds.length);
  const isOn = (id: string) => !none && (selectedIds.length === 0 || selectedIds.includes(id));
  const groups = groupSourcesByFolder(items, folders);
  const managed = managedIds.filter(id => allIds.includes(id));

  function selectForMove(id: string, range = false) {
    setOrganizing(true);
    if (range && selectionAnchor.current) {
      const ordered = [...groups.root, ...folders.flatMap(folder => groups.folders.get(folder.id) ?? [])].map(item => item.id);
      const from = ordered.indexOf(selectionAnchor.current), to = ordered.indexOf(id);
      if (from >= 0 && to >= 0) {
        setManagedIds(current => [...new Set([...current, ...ordered.slice(Math.min(from, to), Math.max(from, to) + 1)])]);
        return;
      }
    }
    selectionAnchor.current = id;
    setManagedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }

  async function move(ids: string[], folderId: string | null) {
    if (!ids.length || folderBusy) return;
    setFolderBusy(true);
    setError(null);
    try {
      await moveSourcesToFolder(projectId, ids, folderId);
      setManagedIds([]);
      setOrganizing(false);
      if (folderId) setCollapsed(current => current.filter(id => id !== folderId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move the sources.");
    } finally { setFolderBusy(false); }
  }

  async function saveFolder() {
    if (!folderDialog || folderBusy || !folderDialog.name.trim()) return;
    setFolderBusy(true);
    setError(null);
    try {
      if (folderDialog.id) await renameSourceFolder(projectId, folderDialog.id, folderDialog.name);
      else {
        const id = await createSourceFolder(projectId, folderDialog.name);
        if (managed.length) {
          try { await moveSourcesToFolder(projectId, managed, id); }
          catch {
            setDestination(id);
            setFolderDialog(null);
            setError("Folder created, but the sources could not be moved. Select Move to try again.");
            return;
          }
          setManagedIds([]);
          setOrganizing(false);
        }
      }
      setFolderDialog(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the folder."); }
    finally { setFolderBusy(false); }
  }

  async function removeFolder(id: string) {
    setMenu(null);
    setFolderBusy(true);
    setError(null);
    try { await deleteSourceFolder(projectId, id); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not remove the folder."); }
    finally { setFolderBusy(false); }
  }

  function dropSources(event: React.DragEvent, folderId: string | null) {
    if (!event.dataTransfer.types.includes(SOURCE_DRAG_TYPE) && !event.dataTransfer.files.length) return;
    event.preventDefault();
    event.stopPropagation();
    setDropFolder(null);
    setDragging(false);
    if (event.dataTransfer.files.length) { void uploadFiles([...event.dataTransfer.files], folderId ?? undefined); return; }
    try {
      const data = JSON.parse(event.dataTransfer.getData(SOURCE_DRAG_TYPE)) as { projectId?: unknown; ids?: unknown };
      if (data.projectId !== projectId || !Array.isArray(data.ids)) return;
      const ids = data.ids.filter((id): id is string => typeof id === "string" && allIds.includes(id));
      void move(ids, folderId);
    } catch { /* An unrelated drag is never a source mutation. */ }
  }

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
      const materialId = await ingestMaterialFile({
        projectId,
        userId,
        file,
        onProgress: ({ phase, percent }) => {
          setPending((current) => current.map((item) => (item.id === entry.id
            ? {
                ...item,
                phase,
                progress: phase === "uploading"
                  ? (typeof percent === "number" ? Math.round(percent * UPLOAD_PROGRESS_WEIGHT) : undefined)
                  : (typeof percent === "number" ? totalIngestProgress(percent) : Math.round(UPLOAD_PROGRESS_WEIGHT * 100)),
              }
            : item)));
        },
      });
      if (entry.folderId) {
        try { await moveSourcesToFolder(projectId, [materialId], entry.folderId); }
        catch { setError("The source was uploaded, but its folder is no longer available. You can find it in Sources."); }
      }
      setPending((current) => current.filter((item) => item.id !== entry.id));
    } catch (err) {
      const message = err instanceof Error && err.message.trim() ? err.message : "Upload failed.";
      setPending((current) =>
        current.map((item) => (item.id === entry.id ? { ...item, state: "error", error: message, file } : item)),
      );
    } finally {
      markProjectActivityComplete(projectId);
    }
  }

  async function uploadFiles(files: File[], folderId?: string) {
    if (files.length === 0) return;
    setError(null);
    const entries = files.map((file) => ({ id: newChipId(), name: file.name, folderId, state: "uploading" as const, phase: "uploading" as const, progress: 0 }));
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
    setPending((current) => current.map((item) => (item.id === entry.id ? { ...item, state: "uploading", phase: "uploading", progress: 0, error: undefined } : item)));
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
      markProjectActivityComplete(projectId);
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
      markProjectActivityComplete(projectId);
    }
  }

  useEffect(() => {
    if (!menu) return;
    function onPointer(event: Event) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-source-menu]")) return;
      setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    function onScroll() {
      setMenu(null);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
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

  function renderSource(item: Material) {
    const status = statusOf(item);
    const on = isOn(item.id);
    const busy = status?.tone === "busy";
    const menuOpen = !menu?.folder && menu?.id === item.id;
    const selected = managed.includes(item.id);
    return (
      <li key={item.id} className="group relative list-none" draggable={!busy && !folderBusy}
        onDragStart={event => {
          const ids = selected ? managed : [item.id];
          event.dataTransfer.setData(SOURCE_DRAG_TYPE, JSON.stringify({ projectId, ids }));
          event.dataTransfer.effectAllowed = "move";
        }}
        onContextMenu={event => {
          if (busy) return;
          event.preventDefault();
          setMenu({ id: item.id, top: event.clientY, right: 0, pointer: { x: event.clientX, y: event.clientY } });
        }}>
        <div className={`source-item flex min-w-0 items-center overflow-hidden rounded-lg px-1 ${menuOpen || (organizing && selected) ? "source-item-active" : ""}`}>
          {organizing ? <button type="button" role="checkbox" aria-checked={selected} aria-label={`Select ${item.title} to move`} className="flex h-9 w-7 shrink-0 items-center justify-center" onClick={event => selectForMove(item.id, event.shiftKey)}><Check on={selected} /></button> : null}
          <button type="button" onClick={event => {
            if (organizing || event.shiftKey || event.ctrlKey || event.metaKey) selectForMove(item.id, event.shiftKey);
            else onOpenMaterial(item.id);
          }} className="flex min-h-9 min-w-0 flex-1 items-center gap-2 py-1 text-left" title={item.title}>
            <FileKindIcon kind={kindFromName(item.originalName || item.title, item.type)} size={22} />
            <span className={`min-w-0 flex-1 truncate text-[13px] text-foreground ${!busy && (menuOpen ? "pr-8" : "group-hover:pr-8")}`}>{item.title}</span>
          </button>
          {busy ? <span className="flex h-9 w-7 shrink-0 items-center justify-center"><ProgressCircle value={status?.progress} label="Reading" /></span> : <>
            <span data-source-menu className="contents">
              <button type="button" aria-label={`Source actions for ${item.title}`} aria-expanded={menuOpen}
                onClick={event => {
                  if (menuOpen) { setMenu(null); return; }
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMenu({ id: item.id, top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
                }}
                className={`absolute ${organizing ? "right-1" : "right-8"} top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-foreground/10 hover:text-foreground ${menuOpen ? "opacity-100" : "opacity-100 md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"}`}>
                <UiIcon name="moreVertical" size={16} />
              </button>
            </span>
            {!organizing ? <button type="button" role="checkbox" aria-checked={on} aria-label={`Use ${item.title}`} onClick={() => toggle(item.id)} className="flex h-9 w-7 shrink-0 items-center justify-center"><Check on={on} /></button> : null}
          </>}
        </div>
        {status?.tone === "error" ? <p className="pl-9 text-[12px] leading-4 text-red-400">{status.text}</p> : null}
      </li>
    );
  }

  return (
    <section
      aria-label="Sources"
      className={`sources-pane relative flex min-h-0 w-full min-w-0 max-w-full flex-col overflow-x-hidden ${className}`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files") && !event.dataTransfer.types.includes(SOURCE_DRAG_TYPE)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer.types.includes("Files")) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        dropSources(event, null);
      }}
    >
      {reading ? (
        reading.type === "image" && !reading.originalRemoved
          ? <MaterialViewer material={reading} onBack={() => onCloseReading?.()} onClose={() => onCloseReading?.()} />
          : <MaterialText material={reading} onBack={() => onCloseReading?.()} />
      ) : <>
      {!hideTopBar ? (
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
      ) : null}

      <div className="shrink-0 px-3 pt-3">
        <button
          type="button"
          onClick={() => {
            setAdding(null);
            setAdderOpen(true);
          }}
          className="sources-add-button flex h-10 w-full items-center justify-center gap-2 rounded-full bg-surface-2 text-[14px] text-foreground"
        >
          <UiIcon name="plus" size={16} />
          Add sources
        </button>

        <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-muted">
          <button type="button" disabled={folderBusy} onClick={() => { setError(null); setFolderDialog({ name: "" }); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-1 hover:text-foreground disabled:opacity-40"><UiIcon name="projectFolder" size={15} />New folder</button>
          {items.length ? <button type="button" onClick={() => { setOrganizing(!organizing); setManagedIds([]); }} className="h-8 rounded-lg px-1 hover:text-foreground">{organizing ? "Done" : "Select"}</button> : null}
        </div>
        {organizing ? <div className="mb-1 rounded-xl bg-background p-2 text-[12px]">
          <div className="mb-2 flex items-center justify-between text-muted"><span>{managed.length} selected</span><button type="button" onClick={() => setManagedIds(managed.length === items.length ? [] : allIds)} className="text-foreground">{managed.length === items.length ? "Clear" : "Select all"}</button></div>
          <div className="flex min-w-0 gap-1.5">
            <select aria-label="Move selected sources to folder" value={destination} onChange={event => setDestination(event.target.value)} className="h-8 min-w-0 flex-1 rounded-lg bg-surface px-2 text-foreground outline-none">
              <option value="">Sources (no folder)</option>
              {folders.filter(folder => !folder.deleting).map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
            <button type="button" disabled={folderBusy || !managed.length} onClick={() => void move(managed, destination || null)} className="h-8 rounded-lg bg-foreground px-3 font-medium text-background disabled:opacity-35">{folderBusy ? "Moving…" : "Move"}</button>
          </div>
        </div> : null}

        {error ? <p role="alert" className="mt-2 text-[12px] leading-4 text-red-400">{error}</p> : null}
      </div>

      <div className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4 pt-3">
        {items.length > 0 && !organizing ? (
          <div className="mb-1 flex h-8 items-center justify-end gap-2 px-1 text-[12px] text-foreground">
            <span>Select all</span>
            <button type="button" role="checkbox" aria-checked={allOn} aria-label="Select all sources" onClick={toggleAll} className="flex h-8 w-7 items-center justify-center">
              <Check on={allOn} />
            </button>
          </div>
        ) : null}

        <ul className="space-y-0.5">
          {visiblePending.map((entry) => (
            <li key={entry.id} className="list-none">
              <div className="source-item flex items-center gap-1 rounded-lg px-1 py-1">
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
                  <span className="flex h-9 w-7 shrink-0 items-center justify-center">
                    <ProgressCircle value={entry.progress} label={entry.phase === "reading" ? "Reading" : "Uploading"} />
                  </span>
                )}
              </div>
              {entry.error ? <p className="mt-0.5 pl-9 text-[12px] leading-4 text-red-400">{entry.error}</p> : null}
            </li>
          ))}

          {folders.map(folder => {
            const members = groups.folders.get(folder.id) ?? [];
            const closed = collapsed.includes(folder.id);
            return <li key={folder.id} className="list-none">
              <div data-source-folder={folder.id} className={`group relative flex h-9 items-center gap-1 rounded-lg px-1 ${dropFolder === folder.id ? "bg-foreground/10 ring-1 ring-foreground/20" : ""}`}
                onDragOver={event => {
                  if (folder.deleting || (!event.dataTransfer.types.includes(SOURCE_DRAG_TYPE) && !event.dataTransfer.types.includes("Files"))) return;
                  event.preventDefault(); event.stopPropagation(); setDropFolder(folder.id);
                }}
                onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropFolder(null); }}
                onDrop={event => { if (!folder.deleting) dropSources(event, folder.id); }}>
                <button type="button" disabled={folder.deleting} aria-expanded={!closed} onClick={() => setCollapsed(current => current.includes(folder.id) ? current.filter(id => id !== folder.id) : [...current, folder.id])} className="flex h-9 min-w-0 flex-1 items-center gap-2 text-left text-[13px] text-foreground disabled:opacity-50">
                  <span className={`flex h-4 w-3 shrink-0 items-center justify-center ${closed ? "-rotate-90" : ""}`}><UiIcon name="chevronDown" size={12} /></span>
                  <UiIcon name="projectFolder" size={18} />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  <span className="mr-8 text-[11px] text-muted">{members.length}</span>
                </button>
                <button data-source-menu type="button" disabled={folderBusy} aria-label={`Folder actions for ${folder.name}`} className="absolute right-0 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-foreground/10 hover:text-foreground" onClick={event => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMenu({ id: folder.id, folder: true, top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
                }}><UiIcon name="moreVertical" size={16} /></button>
              </div>
              {!closed ? <ul aria-label={`${folder.name} sources`} className="ml-4 border-l border-border/40 pl-1">{members.map(item => renderSource(item))}{!members.length ? <li className="list-none px-3 py-2 text-[12px] text-muted">Drop sources here</li> : null}</ul> : null}
            </li>;
          })}
          {groups.root.map(item => renderSource(item))}
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
        <div
          data-source-menu
          className="fixed z-[70] w-[196px] overflow-hidden rounded-xl border border-[var(--panel-border)] bg-[var(--panel-bg)] p-1 shadow-xl"
          style={menu.pointer
            ? positionContextMenu(menu.pointer.x, menu.pointer.y, 196, menu.folder ? 84 : 124, window.innerWidth, window.innerHeight)
            : { top: menu.top, right: menu.right }}
        >
          {menu.folder ? <>
            <button type="button" onClick={() => { const folder = folders.find(item => item.id === menu.id); if (folder) setFolderDialog({ id: folder.id, name: folder.name }); setMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] text-foreground hover:bg-background"><UiIcon name="edit" size={16} />Rename folder</button>
            <button type="button" onClick={() => void removeFolder(menu.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] text-foreground hover:bg-background"><UiIcon name="trash" size={16} />Remove folder</button>
          </> : <>
          <button type="button" onClick={() => { setManagedIds(managed.includes(menu.id) ? managed : [menu.id]); setOrganizing(true); setMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] text-foreground hover:bg-background"><UiIcon name="projectFolder" size={16} />Move to folder</button>
          <button type="button" onClick={() => { const item = items.find((entry) => entry.id === menu.id); if (item) void remove(item); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] text-foreground hover:bg-background">
            <UiIcon name="trash" size={16} />
            Remove source
          </button>
          <button type="button" onClick={() => { const item = items.find((entry) => entry.id === menu.id); if (item) openRename(item); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] text-foreground hover:bg-background">
            <UiIcon name="edit" size={16} />
            Rename source
          </button>
          </>}
        </div>,
        document.body,
      ) : null}
      {folderDialog ? createPortal(
        <div className="popup-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4" onMouseDown={event => { if (event.target === event.currentTarget && !folderBusy) setFolderDialog(null); }}>
          <form role="dialog" aria-modal="true" aria-labelledby="source-folder-title" className="popup-surface w-full max-w-[400px] rounded-2xl bg-surface p-5 text-foreground shadow-2xl" onSubmit={event => { event.preventDefault(); void saveFolder(); }}>
            <h2 id="source-folder-title" className="text-[16px] font-medium">{folderDialog.id ? "Rename folder" : "New folder"}</h2>
            <input autoFocus maxLength={120} aria-label="Folder name" placeholder="Folder name" value={folderDialog.name} onChange={event => setFolderDialog({ ...folderDialog, name: event.target.value })} className="mt-4 h-10 w-full rounded-xl bg-background px-3 text-[14px] outline-none" />
            {!folderDialog.id && managed.length ? <p className="mt-2 text-[12px] text-muted">Move {managed.length} selected sources into this folder.</p> : null}
            {error ? <p role="alert" className="mt-2 text-[12px] text-red-400">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={folderBusy} onClick={() => setFolderDialog(null)} className="h-9 rounded-full px-4 text-[13px] hover:bg-background">Cancel</button>
              <button type="submit" disabled={folderBusy || !folderDialog.name.trim()} className="h-9 rounded-full bg-foreground px-4 text-[13px] font-medium text-background disabled:opacity-40">{folderBusy ? "Saving…" : folderDialog.id ? "Save" : "Create"}</button>
            </div>
          </form>
        </div>, document.body,
      ) : null}
      {renameTarget ? createPortal(
        <div className="popup-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameTarget(null); }}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-source-title"
            className="popup-surface w-full max-w-[440px] rounded-2xl bg-surface p-5 text-foreground shadow-2xl"
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
    <div className="popup-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Add sources"
        className="popup-surface w-full max-w-[560px] rounded-2xl bg-surface p-4 text-foreground shadow-2xl"
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.stopPropagation();
          setOver(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setOver(false);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          // Portal events also reach SourcesPane; only this drop zone should upload the files.
          event.stopPropagation();
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
        on ? "border-foreground bg-foreground text-background" : "border-foreground bg-transparent"
      }`}
    >
      {on ? <UiIcon name="check" size={11} /> : null}
    </span>
  );
}
