"use client";

import { useEffect, useRef, useState } from "react";
import { promptIsKa } from "@/lib/composer/intent";
import { storageDownloadUrl, isMissingMaterialFile } from "@/lib/materials/storage";
import { IconFile, IconPages } from "@/components/workspace/icons";
import type { ChatImageHit, ChatMessage } from "@/types/chat";

export type SourceItem = {
  title: string;
  host: string;
  license: string;
  thumb?: string;
  url: string;
};

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function webSourceUrl(hit: ChatImageHit): string | null {
  if (hit.kind === "upload" || hit.storagePath) return null;
  const url = (hit.pageUrl || hit.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  const title = hit.title?.trim() || hit.alt?.trim();
  if (!title) return null;
  return url;
}

/** Web results the model actually used. Never counts uploaded files / project materials. */
export function sourcesForTurn(assistant: ChatMessage): SourceItem[] {
  const items: SourceItem[] = [];
  const seen = new Set<string>();

  for (const hit of assistant.images ?? []) {
    const url = webSourceUrl(hit);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const thumb = (hit.thumb || hit.thumbnail || "").trim();
    items.push({
      title: (hit.title || hit.alt || "").trim(),
      host: hostOf(url) || hit.source,
      license: hit.license,
      thumb: thumb && !thumb.startsWith("users/") ? thumb : undefined,
      url,
    });
  }

  return items;
}

function localeOf(messages: { content: string }[]): "ka" | "en" {
  const last = [...messages].reverse().find((item) => item.content.trim());
  return last && promptIsKa(last.content) ? "ka" : "en";
}

export function SourcesChip({ items, locale }: { items: SourceItem[]; locale: "ka" | "en" }) {
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

  const label =
    locale === "ka" ? `${items.length} წყარო` : items.length === 1 ? "1 source" : `${items.length} sources`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-[22px] items-center gap-1.5 rounded-full border border-white/12 bg-[#1c1c1c] px-2 text-[13px] leading-none text-white/90 shadow-none"
        aria-expanded={open}
      >
        <IconPages className="h-3 w-3 text-white/80" />
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
          <IconFile className="h-3 w-3 shrink-0" />
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
      <IconFile className="h-3.5 w-3.5" />
    </span>
  );
}

export function StorageThumb({ path, className = "h-8 w-8" }: { path: string; className?: string }) {
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
        <IconFile className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span className={`block shrink-0 overflow-hidden rounded-md bg-surface-2 ${className}`}>
      <img src={url} alt="" className="h-full w-full object-cover" />
    </span>
  );
}

export function turnLocale(assistant: ChatMessage, previous?: ChatMessage): "ka" | "en" {
  return localeOf([previous, assistant].filter(Boolean) as ChatMessage[]);
}
