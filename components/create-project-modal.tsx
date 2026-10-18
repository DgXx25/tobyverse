"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UiIcon } from "@/components/workspace/ui-icon";
import { MaterialChip } from "@/components/workspace/material-chip";
import { isImageAttachment, newChipId } from "@/lib/composer/attach";
import {
  collectFolderUpload,
  folderChipTitle,
  formatUploadFailure,
  mapPool,
  type FolderUploadFile,
  type UploadFailure,
} from "@/lib/materials/folder-upload";
import { ingestMaterialFile } from "@/lib/materials/ingest-client";
import { MATERIAL_FILE_ACCEPT } from "@/lib/materials/types";
import { createListedProject } from "@/lib/workspace/start-project";

type Attach =
  | { id: string; kind: "file"; file: File; previewUrl?: string }
  | { id: string; kind: "folder"; name: string; files: FolderUploadFile[] };

type PendingUpload = { file: File; title?: string };

const CLOSE_MS = 180;
const INGEST_CONCURRENCY = 4;
const PICKER_GUARD_MS = 500;

function pendingUploads(items: Attach[]): PendingUpload[] {
  const out: PendingUpload[] = [];
  for (const item of items) {
    if (item.kind === "file") {
      out.push({ file: item.file });
    } else {
      for (const entry of item.files) {
        out.push({ file: entry.file, title: entry.relativePath });
      }
    }
  }
  return out;
}

function bindFolderInput(node: HTMLInputElement | null) {
  if (!node) return;
  node.multiple = true;
  node.setAttribute("webkitdirectory", "");
  node.setAttribute("directory", "");
  (node as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
}

function previewUrlFor(file: File): string | undefined {
  return isImageAttachment(file.type, file.name) ? URL.createObjectURL(file) : undefined;
}

function revokeAttach(item: Attach) {
  if (item.kind === "file" && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
}

export function CreateProjectModal({
  userId,
  onClose,
  onCreated,
}: {
  userId: string;
  onClose: () => void;
  onCreated: (projectId: string) => void;
}) {
  const titleId = useId();
  const nameId = useId();
  const addMenuId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const filesRef = useRef<Attach[]>([]);
  const pickingRef = useRef(false);
  const pickerGuard = useRef<number>(0);
  const [name, setName] = useState("");
  const [files, setFiles] = useState<Attach[]>([]);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);
  const closing = useRef(false);
  filesRef.current = files;

  const requestClose = useCallback(() => {
    if (pending || closing.current) return;
    closing.current = true;
    if (doneId) onCreated(doneId);
    setAddOpen(false);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setOpen(false);
    if (reduced) {
      onClose();
      return;
    }
    window.setTimeout(onClose, CLOSE_MS);
  }, [doneId, onClose, onCreated, pending]);

  const armPicker = useCallback(() => {
    pickingRef.current = true;
    window.clearTimeout(pickerGuard.current);
  }, []);

  const disarmPicker = useCallback(() => {
    window.clearTimeout(pickerGuard.current);
    pickerGuard.current = window.setTimeout(() => {
      pickingRef.current = false;
    }, PICKER_GUARD_MS);
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setOpen(true);
      return;
    }
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setOpen(true));
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(pickerGuard.current);
      for (const item of filesRef.current) revokeAttach(item);
    };
  }, []);

  useEffect(() => {
    function onFocus() {
      if (pickingRef.current) disarmPicker();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [disarmPicker]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || pending) return;
      if (addOpen) {
        setAddOpen(false);
        return;
      }
      requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen, pending, requestClose]);

  useEffect(() => {
    if (!addOpen) return;
    function onPointer(event: MouseEvent) {
      if (pickingRef.current) return;
      if (addRef.current?.contains(event.target as Node)) return;
      setAddOpen(false);
    }
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [addOpen]);

  function addFiles(list: FileList | File[] | null) {
    const picked = list ? [...list] : [];
    if (picked.length === 0) return;
    setFiles((current) => [
      ...current,
      ...picked.map((file) => ({
        id: newChipId(),
        kind: "file" as const,
        file,
        previewUrl: previewUrlFor(file),
      })),
    ]);
    setError(null);
    setAddOpen(false);
  }

  function addFolder(list: FileList | File[] | null) {
    if (!list || [...list].length === 0) {
      setError("That folder is empty.");
      setAddOpen(false);
      return;
    }
    const collected = collectFolderUpload(list);
    if (collected.files.length === 0) {
      setError(collected.picked === 0 ? "That folder is empty." : "That folder has no files we can use.");
      setAddOpen(false);
      return;
    }
    setFiles((current) => [
      ...current,
      { id: newChipId(), kind: "folder", name: collected.name, files: collected.files },
    ]);
    setError(null);
    setAddOpen(false);
  }

  function removeChip(id: string) {
    if (pending || doneId) return;
    setFiles((current) => {
      const item = current.find((file) => file.id === id);
      if (item) revokeAttach(item);
      return current.filter((file) => file.id !== id);
    });
  }

  function finishCreated(projectId: string) {
    onCreated(projectId);
    closing.current = true;
    setOpen(false);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) onClose();
    else window.setTimeout(onClose, CLOSE_MS);
  }

  async function create() {
    if (pending || doneId) return;
    const emptyFolder = files.find((item) => item.kind === "folder" && item.files.length === 0);
    if (emptyFolder) {
      setError("That folder is empty.");
      return;
    }
    const uploads = pendingUploads(files);
    if (files.some((item) => item.kind === "folder") && uploads.length === 0) {
      setError("That folder is empty.");
      return;
    }
    setPending(true);
    setError(null);
    setProgress(uploads.length > 0 ? { done: 0, total: uploads.length } : null);
    try {
      const projectId = await createListedProject({
        userId,
        title: name.trim() || "New project",
      });
      const failed: UploadFailure[] = [];
      if (uploads.length > 0) {
        let done = 0;
        const results = await mapPool(uploads, INGEST_CONCURRENCY, async (item) => {
          try {
            await ingestMaterialFile({
              projectId,
              userId,
              file: item.file,
              title: item.title,
            });
          } finally {
            done += 1;
            setProgress({ done, total: uploads.length });
          }
        });
        for (let index = 0; index < results.length; index += 1) {
          const result = results[index];
          if (result.status === "rejected") {
            failed.push({
              name: uploads[index].title || uploads[index].file.name,
              reason: result.reason,
            });
          }
        }
      }
      const kept = uploads.length - failed.length;
      if (failed.length > 0) {
        setError(failed.map(formatUploadFailure).join("\n"));
        setPending(false);
        setProgress(null);
        setDoneId(projectId);
        if (kept > 0) onCreated(projectId);
        return;
      }
      finishCreated(projectId);
    } catch (err) {
      setPending(false);
      setProgress(null);
      setError(err instanceof Error && err.message.trim() ? err.message : "Could not create project.");
    }
  }

  if (typeof document === "undefined") return null;

  const ease = "duration-[180ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none";
  const createLabel = pending
    ? progress
      ? `Uploading ${progress.done}/${progress.total}`
      : "Creating…"
    : "Create";

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
      <div
        className={`popup-overlay absolute inset-0 transition-opacity ${ease} ${open ? "opacity-100" : "opacity-0"}`}
        onMouseDown={() => {
          if (pickingRef.current) return;
          requestClose();
        }}
        onClick={() => {
          if (pickingRef.current) return;
          requestClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          event.preventDefault();
          const dropped = [...(event.dataTransfer.files ?? [])];
          if (dropped.length === 0) return;
          if (dropped.every((file) => file.webkitRelativePath)) addFolder(dropped);
          else addFiles(dropped);
        }}
        className={`relative w-full max-w-[420px] overflow-hidden rounded-2xl bg-surface-2 p-5 shadow-2xl ring-1 ring-border transition-[opacity,transform] ${ease} ${
          open ? "scale-100 opacity-100" : "scale-[0.96] opacity-0"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-[15px] font-medium text-foreground">
            Create Project
          </h2>
          <button
            type="button"
            onClick={requestClose}
            disabled={pending}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-foreground disabled:opacity-40"
            aria-label="Close"
          >
            <UiIcon name="close" size={16} />
          </button>
        </div>
        <label htmlFor={nameId} className="mb-1.5 block text-[13px] text-muted">
          Project name
        </label>
        <input
          ref={nameRef}
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (doneId) requestClose();
              else void create();
            }
          }}
          placeholder="New project"
          disabled={pending || Boolean(doneId)}
          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-[14px] text-foreground outline-none placeholder:text-muted focus:border-accent"
        />
        {files.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-3">
            {files.map((item) =>
              item.kind === "folder" ? (
                <span key={item.id} className="composer-chip-in inline-flex">
                  <MaterialChip
                    title={folderChipTitle(item.name, item.files.length)}
                    type="folder"
                    busy={pending}
                    onRemove={() => removeChip(item.id)}
                  />
                </span>
              ) : (
                <span key={item.id} className="composer-chip-in inline-flex">
                  <MaterialChip
                    title={item.file.name}
                    type={item.file.type || item.file.name}
                    previewUrl={item.previewUrl}
                    busy={pending}
                    onRemove={() => removeChip(item.id)}
                  />
                </span>
              ),
            )}
          </div>
        ) : null}
        {error ? <p className="pt-3 text-[12px] text-red-400">{error}</p> : null}
        <div className="flex items-center justify-between pt-4">
          <div ref={addRef} className="relative">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={MATERIAL_FILE_ACCEPT}
              className="hidden"
              onClick={() => armPicker()}
              onChange={(event) => {
                const picked = event.target.files ? [...event.target.files] : [];
                event.target.value = "";
                addFiles(picked);
                disarmPicker();
              }}
            />
            <input
              ref={(node) => {
                folderRef.current = node;
                bindFolderInput(node);
              }}
              type="file"
              multiple
              className="hidden"
              onClick={() => armPicker()}
              onChange={(event) => {
                const picked = event.target.files ? [...event.target.files] : [];
                event.target.value = "";
                addFolder(picked);
                disarmPicker();
              }}
            />
            <button
              type="button"
              disabled={pending || Boolean(doneId)}
              aria-haspopup="menu"
              aria-expanded={addOpen}
              aria-controls={addMenuId}
              onClick={() => setAddOpen((value) => !value)}
              className="flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[13px] text-foreground hover:bg-surface disabled:opacity-40"
            >
              <UiIcon name="attach" size={15} />
              Add
            </button>
            {addOpen ? (
              <div
                id={addMenuId}
                role="menu"
                className="absolute bottom-[calc(100%+8px)] left-0 z-10 min-w-[200px] rounded-xl border border-border bg-surface p-1 shadow-2xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    armPicker();
                    fileRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-surface-2"
                >
                  <UiIcon name="file" size={16} className="text-muted" />
                  Choose files
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    armPicker();
                    folderRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-surface-2"
                >
                  <UiIcon name="materials" size={16} className="text-muted" />
                  Choose folder
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => (doneId ? requestClose() : void create())}
            className="h-9 rounded-full bg-foreground px-4 text-[13px] font-medium text-background disabled:opacity-40"
          >
            {doneId ? "Done" : createLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
