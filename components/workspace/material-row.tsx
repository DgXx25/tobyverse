"use client";

import { formatBytes, shortDate } from "@/lib/format";
import type { Material } from "@/types/material";

export function MaterialRow({
  item,
  selected = false,
  onSelect,
  onDelete,
  pendingDelete,
}: {
  item: Material;
  selected?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
  pendingDelete?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
        selected ? "bg-surface-2" : "hover:bg-surface-2"
      }`}
    >
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="w-9 shrink-0 rounded bg-surface-2 px-1 py-0.5 text-center font-mono text-[9px] uppercase tracking-wide text-muted">
              {item.type}
            </span>
            <span className="truncate text-xs text-foreground">{item.title}</span>
          </div>
          <p className="mt-0.5 pl-11 text-[10px] text-muted">
            {[formatBytes(item.sizeBytes), shortDate(item.createdAt)].filter(Boolean).join(" · ")}
          </p>
        </button>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="w-9 shrink-0 rounded bg-surface-2 px-1 py-0.5 text-center font-mono text-[9px] uppercase tracking-wide text-muted">
              {item.type}
            </span>
            <span className="truncate text-xs text-foreground">{item.title}</span>
          </div>
          <p className="mt-0.5 pl-11 text-[10px] text-muted">
            {[formatBytes(item.sizeBytes), shortDate(item.createdAt)].filter(Boolean).join(" · ")}
          </p>
        </div>
      )}
      {onDelete && (
        pendingDelete ? (
          <button type="button" onClick={onDelete} className="shrink-0 text-[10px] text-red-400">
            Confirm
          </button>
        ) : (
          <button type="button" onClick={onDelete} className="shrink-0 text-[10px] text-muted hover:text-red-400">
            Remove
          </button>
        )
      )}
    </div>
  );
}
