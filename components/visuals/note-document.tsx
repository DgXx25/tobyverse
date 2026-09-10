"use client";

import { RichContent } from "@/components/rich-content";
import { MixedText } from "@/components/visuals/mixed-text";
import { VisualList } from "@/components/visuals/visual-block";
import type { StudySheet } from "@/types/study-sheet";

export function NoteTitle({ text }: { text: string }) {
  const value = text.trim();
  if (!value || /^notes$/i.test(value)) return null;
  return (
    <h1 className="note-title">
      <MixedText text={value} />
    </h1>
  );
}

export function NoteDocument({ note }: { note: StudySheet }) {
  if (note.blocks.length > 0) {
    return (
      <>
        <NoteTitle text={note.title} />
        <VisualList blocks={note.blocks} />
      </>
    );
  }
  const article = note.prose || note.content;
  if (article.trim()) {
    return (
      <article>
        <NoteTitle text={note.title} />
        <RichContent text={article} />
      </article>
    );
  }
  return <p className="text-[13px] leading-5 text-muted">This note is empty.</p>;
}
