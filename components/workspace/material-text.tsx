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
      <div className="flex h-11 shrink-0 items-center gap-1 px-2 md:pl-16">
        <button type="button" onClick={onBack} aria-label="Back to sources" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-foreground">
          <UiIcon name="back" size={16} />
        </button>
        <p className="min-w-0 flex-1 truncate text-[13px] text-foreground">{material.title}</p>
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
