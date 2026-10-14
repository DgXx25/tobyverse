"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MaterialViewer } from "@/components/workspace/material-viewer";
import { UiIcon } from "@/components/workspace/ui-icon";
import { subscribeMaterials } from "@/lib/materials/store";
import type { Material } from "@/types/material";
import type { LibraryItem } from "@/lib/library/items";
import { removeMaterial } from "@/lib/materials/save";

export function LibraryFilePreview({ target, onClose, items, onSelect, onDeleted }: {
  target: { projectId: string; id: string; title?: string };
  onClose: () => void;
  items: LibraryItem[];
  onSelect: (item: LibraryItem) => void;
  onDeleted: (id: string, projectId: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [material, setMaterial] = useState<Material | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const index = items.findIndex((item) => item.id === target.id && item.projectId === target.projectId);

  async function deleteFile() {
    if (!material || deleting) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await removeMaterial(material);
      onDeleted(material.id, material.projectId);
      onClose();
    } catch {
      setError("Could not delete file.");
      setDeleting(false);
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  useEffect(() => subscribeMaterials(target.projectId, (items) => {
    const selected = items.find((item) => item.id === target.id) ?? null;
    setMaterial(selected);
    setError(selected ? null : "File is no longer available.");
  }, () => setError("Could not load file.")), [target.projectId, target.id]);

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={target.title || "File preview"}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
        const next = event.key === "ArrowRight" ? items[index + 1] : event.key === "ArrowLeft" ? items[index - 1] : null;
        if (next) { event.preventDefault(); onSelect(next); }
      }}
      className="m-auto h-[96dvh] max-h-none w-[min(1040px,90vw)] max-w-none overflow-visible border-0 bg-transparent p-0 text-foreground backdrop:bg-black/60"
    >
      <div className="h-full min-h-0">
        {error && material ? <p role="alert" className="absolute left-1/2 top-0 z-20 -translate-x-1/2 bg-surface p-3 text-sm">{error}</p> : null}
        {material ? <MaterialViewer key={material.id} material={material} onClose={onClose} presentation="overlay" onDelete={() => void deleteFile()} deleting={deleting} confirmDelete={confirmDelete} /> : (
          <div className="flex h-full flex-col">
            <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-3">
              <span className="min-w-0 flex-1 truncate text-[13px]">{target.title || "File preview"}</span>
              <button type="button" aria-label="Close" title="Close" onClick={onClose} className="flex h-8 w-8 items-center justify-center text-muted hover:text-foreground">
                <UiIcon name="close" size={16} />
              </button>
            </header>
            <p role="status" className="p-8 text-center text-sm text-muted">{error || "Loading..."}</p>
          </div>
        )}
      </div>
      {index > 0 ? <button type="button" title="Previous file" aria-label="Previous file" onClick={() => onSelect(items[index - 1])} className="fixed left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-foreground shadow-sm"><UiIcon name="prev" size={18} /></button> : null}
      {index >= 0 && index < items.length - 1 ? <button type="button" title="Next file" aria-label="Next file" onClick={() => onSelect(items[index + 1])} className="fixed right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-foreground shadow-sm"><UiIcon name="forward" size={18} /></button> : null}
    </dialog>, document.body,
  );
}
