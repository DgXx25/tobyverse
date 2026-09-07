"use client";

import { VisualList } from "@/components/visuals/visual-block";
import { normalizeNoteBlocks } from "@/lib/notes/blocks";
import type { StudySheet } from "@/types/study-sheet";

export function NoteDocument({ note }: { note: StudySheet }) {
  const blocks = note.blocks.length > 0 ? note.blocks : normalizeNoteBlocks([], note.prose);
  if (blocks.length > 0) {
    return <VisualList blocks={blocks} />;
  }
  return <p className="text-[13px] leading-5 text-muted">This note is empty.</p>;
}
