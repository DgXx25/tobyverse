"use client";

import { useEffect, useState } from "react";
import { fileTypeBadge, isImageAttachment } from "@/lib/composer/attach";
import { looksLikeUrl } from "@/lib/materials/ingest-client";
import { storageDownloadUrl, isMissingMaterialFile } from "@/lib/materials/storage";
import type { ChatAttachment } from "@/types/chat";

export function MessageAttachments({ items }: { items: ChatAttachment[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {items.map((item, index) => (
        <AttachmentChip key={`${item.materialId || item.title}-${index}`} item={item} />
      ))}
    </div>
  );
}

function AttachmentChip({ item }: { item: ChatAttachment }) {
  if (isImageAttachment(item.type, item.title) && item.storagePath) {
    return <ImageThumb path={item.storagePath} title={item.title} />;
  }
  return (
    <span className="inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-full border border-border bg-surface-2 pl-1 pr-2.5 text-[11px] leading-none">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface font-mono text-[8px] font-medium uppercase tracking-wide text-muted">
        {fileTypeBadge(item.type, item.title)}
      </span>
      <span className="min-w-0 truncate">
        {looksLikeUrl(item.title) ? (
          <a href={item.title} target="_blank" rel="noopener noreferrer" className="chat-link block truncate">
            {item.title}
          </a>
        ) : (
          <span className="text-foreground">{item.title}</span>
        )}
      </span>
    </span>
  );
}

function ImageThumb({ path, title }: { path: string; title: string }) {
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
      <span className="inline-flex h-8 max-w-[160px] items-center gap-1.5 rounded-full border border-border bg-surface-2 pl-1 pr-2.5 text-[11px] leading-none">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface font-mono text-[8px] font-medium uppercase tracking-wide text-muted">
          IMG
        </span>
        <span className="min-w-0 truncate text-foreground">{title}</span>
      </span>
    );
  }

  return (
    <span className="block h-10 w-10 overflow-hidden rounded-xl border border-border bg-surface-2">
      <img src={url} alt={title} className="h-full w-full object-cover" />
    </span>
  );
}
