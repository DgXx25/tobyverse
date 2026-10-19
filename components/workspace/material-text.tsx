"use client";

import { useEffect, useState } from "react";
import { UiIcon } from "@/components/workspace/ui-icon";
import { loadMaterialText } from "@/lib/materials/storage";
import type { Material } from "@/types/material";

/** Extracted text only. No page image, slide, or paper background. */
export function MaterialText({ material, onBack }: { material: Material; onBack: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setFailed(false);
    loadMaterialText(material)
      .then((value) => {
        if (!cancelled) setText(value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [material.id, material.textPath, material.extractedTextPreview, material.status, material.index?.status]);

  const busy = material.status === "uploading" || material.status === "processing" || material.index?.status === "indexing";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center px-2">
        <button type="button" onClick={onBack} aria-label={`Back to sources: ${material.title}`} className="flex min-w-0 max-w-full items-center gap-1 rounded-lg pr-3 text-left text-muted hover:bg-surface-2 hover:text-foreground">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center">
          <UiIcon name="back" size={16} />
          </span>
          <span className="min-w-0 truncate text-[13px] text-foreground">{material.title}</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {failed ? <p className="text-[13px] text-red-400">Could not read this file.</p> : null}
        {!failed && text === null ? <p className="text-[13px] text-muted">Loading…</p> : null}
        {!failed && text !== null ? (
          <p className="whitespace-pre-wrap text-[14px] leading-6 text-foreground">
            {text.trim() || (busy ? "Still reading this file." : "No text in this file.")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
