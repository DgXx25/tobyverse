"use client";

import { RichContent } from "@/components/rich-content";
import { VisualList } from "@/components/visuals/visual-block";
import type { StudySheet } from "@/types/study-sheet";

export function NoteDocument({ note }: { note: StudySheet }) {
  if (note.blocks.length > 0) {
    return <VisualList blocks={note.blocks} />;
  }
  const article = note.prose || note.content;
  if (article.trim()) {
    return (
      <article>
        <RichContent text={article} />
      </article>
    );
  }
  return <p className="text-[13px] leading-5 text-muted">This note is empty.</p>;
}
