"use client";

import { useEffect, useRef, useState } from "react";
import { storageDownloadUrl, isMissingMaterialFile } from "@/lib/materials/storage";
import { UiIcon } from "@/components/workspace/ui-icon";
import type { ChatMessage } from "@/types/chat";

export type SourceItem = {
  title: string;
  host: string;
  license: string;
  thumb?: string;
  url: string;
};

/** Link-search citations. Photo hits are not sources. */
export function sourcesForTurn(_assistant: ChatMessage): SourceItem[] {
  return [];
}

export function SourcesChip({ items }: { items: SourceItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  const label = items.length === 1 ? "1 source" : `${items.length} sources`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-[22px] items-center gap-1.5 rounded-full border border-white/12 bg-[#1c1c1c] px-2 text-[13px] leading-none text-white/90 shadow-none"
        aria-expanded={open}
      >
        <UiIcon name="pages" size={12} className="text-white/80" />
        {label}
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-[280px] overflow-hidden rounded-xl border border-border bg-surface p-1">
          {items.map((item, index) => (
            <SourceRow
              key={`${item.url}-${index}`}
              item={item}
              onOpen={() => {
                window.open(item.url, "_blank", "noopener,noreferrer");
                setOpen(false);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SourceRow({ item, onOpen }: { item: SourceItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-surface-2"
    >
      <SourceThumb item={item} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] text-foreground">{item.title}</span>
        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
          <UiIcon name="file" size={12} className="shrink-0" />
          <span className="truncate">{item.host}</span>
          {item.license ? <span className="shrink-0">· {item.license}</span> : null}
        </span>
      </span>
    </button>
  );
}

function SourceThumb({ item }: { item: SourceItem }) {
  if (item.thumb) {
    return (
      <span className="h-8 w-8 shrink-0 overflow-hidden rounded-md bg-surface-2">
        <img src={item.thumb} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted">
      <UiIcon name="file" size={14} />
    </span>
  );
}

export function StorageThumb({ path, className = "h-8 w-8", alt = "" }: { path: string; className?: string; alt?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path.startsWith("users/") || isMissingMaterialFile(path)) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    storageDownloadUrl(path)
      .then((next) => {
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        objectUrl = next;
        setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (!url) {
    return (
      <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2 text-muted ${className}`}>
        <UiIcon name="file" size={14} />
      </span>
    );
  }
  return (
    <span className={`block shrink-0 overflow-hidden rounded-md bg-surface-2 ${className}`}>
      <img src={url} alt={alt} className="h-full w-full object-cover" />
    </span>
  );
}
