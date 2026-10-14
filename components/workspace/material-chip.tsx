"use client";

import { fileTypeBadge } from "@/lib/composer/attach";
import { UiIcon } from "@/components/workspace/ui-icon";

export function MaterialChip({
  title,
  type = "",
  previewUrl,
  busy = false,
  error = false,
  onRemove,
}: {
  title: string;
  type?: string;
  previewUrl?: string;
  busy?: boolean;
  error?: boolean;
  onRemove: () => void;
}) {
  const folder = type === "folder";
  const image = Boolean(!folder && previewUrl);
  return (
    <span
      className={`inline-flex h-10 max-w-[min(100%,280px)] items-center gap-1 rounded-full border bg-surface pl-1.5 pr-0.5 ${
        error ? "border-red-400/40" : "border-border"
      }`}
    >
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
        {busy ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border border-muted/40 border-t-foreground" />
        ) : image ? (
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : folder ? (
          <UiIcon name="materials" size={15} className="text-muted" />
        ) : (
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wide text-muted">
            {fileTypeBadge(type, title)}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate px-1 text-[13px] leading-none text-foreground">{title}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-foreground/10 hover:text-foreground"
        aria-label="Remove file"
      >
        <UiIcon name="close" size={16} />
      </button>
    </span>
  );
}
