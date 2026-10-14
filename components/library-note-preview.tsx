"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NoteDocument } from "@/components/visuals/note-document";
import { UiIcon } from "@/components/workspace/ui-icon";
import { getStudySheet } from "@/lib/study-sheets/store";
import type { LibraryItem } from "@/lib/library/items";
import type { StudySheet } from "@/types/study-sheet";

export function LibraryNotePreview({
  item,
  onClose,
  onOpenInChat,
}: {
  item: LibraryItem;
  onClose: () => void;
  onOpenInChat: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState<StudySheet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    void getStudySheet(item.projectId, item.id)
      .then((result) => {
        if (!result) throw new Error("Note is no longer available.");
        setNote(result);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load note."));
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [item.id, item.projectId]);

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={item.title}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="m-auto h-[min(90dvh,900px)] max-h-none w-[min(760px,94vw)] max-w-none overflow-hidden rounded-2xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60 max-md:h-dvh max-md:w-screen max-md:rounded-none max-md:border-0"
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{item.title}</span>
          <button type="button" onClick={onOpenInChat} className="rounded-full px-3 py-1.5 text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-foreground">Open in chat</button>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground"><UiIcon name="close" size={17} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 max-md:px-4">
          {error ? <p role="alert" className="text-sm text-muted">{error}</p> : note ? <NoteDocument note={note} /> : <p role="status" className="text-sm text-muted">Loading note…</p>}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
