"use client";

import { useEffect, useState } from "react";
import { fileTypeBadge, isImageAttachment } from "@/lib/composer/attach";
import { looksLikeUrl } from "@/lib/materials/ingest-client";
import { storageDownloadUrl, isMissingMaterialFile } from "@/lib/materials/storage";
import { getMaterialFile, type MaterialFileAccess } from "@/lib/materials/file-client";
import { storedObjectName } from "@/lib/materials/storage-path";
import type { ChatAttachment } from "@/types/chat";

export function MessageAttachments({
  items,
  onOpenMaterial,
  fileAccess,
}: {
  items: ChatAttachment[];
  onOpenMaterial?: (id: string) => void;
  fileAccess?: MaterialFileAccess;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {items.map((item, index) => (
        <AttachmentChip
          key={`${item.materialId || item.title}-${index}`}
          item={item}
          onOpenMaterial={onOpenMaterial}
          fileAccess={fileAccess}
        />
      ))}
    </div>
  );
}

function AttachmentChip({ item, onOpenMaterial, fileAccess }: { item: ChatAttachment; onOpenMaterial?: (id: string) => void; fileAccess?: MaterialFileAccess }) {
  if (isImageAttachment(item.type, item.title) && item.storagePath && !item.storagePath.endsWith("/extracted.txt")) {
    return (
      <ImageThumb
        path={item.storagePath}
        title={item.title}
        materialId={item.materialId}
        fileAccess={fileAccess}
        onClick={item.materialId && onOpenMaterial ? () => onOpenMaterial(item.materialId!) : undefined}
      />
    );
  }
  const className = "inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-full bg-surface pl-1 pr-2.5 text-[11px] leading-none";
  const badge = (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface font-mono text-[8px] font-medium uppercase tracking-wide text-muted">
      {fileTypeBadge(item.type, item.title)}
    </span>
  );
  const label = looksLikeUrl(item.title) && !item.materialId ? (
    <a href={item.title} target="_blank" rel="noopener noreferrer" className="chat-link min-w-0 truncate">
      {item.title}
    </a>
  ) : (
    <span className="min-w-0 truncate text-foreground">{item.title}</span>
  );
  const content = (
    <>
      {badge}
      {label}
    </>
  );
  if (item.materialId && onOpenMaterial) {
    return (
      <button type="button" onClick={() => onOpenMaterial(item.materialId!)} className={className}>
        {content}
      </button>
    );
  }
  return <span className={className}>{content}</span>;
}

function ImageThumb({ path, title, onClick, materialId, fileAccess }: { path: string; title: string; onClick?: () => void; materialId?: string; fileAccess?: MaterialFileAccess }) {
  const [url, setUrl] = useState<string | null>(null);
  const shareId = fileAccess?.shareId;
  useEffect(() => {
    if (!shareId && (!path.startsWith("users/") || isMissingMaterialFile(path))) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    const sharedFileId = materialId || path.match(/^(chat-image-[A-Za-z0-9_-]+)\/[^/]+$/)?.[1];
    const load = shareId && sharedFileId
      ? getMaterialFile("", sharedFileId, storedObjectName(path) || "", { shareId }).then(file => {
        if (!file.ok) throw new Error(file.message);
        return URL.createObjectURL(new Blob([new Uint8Array(file.bytes)], { type: file.contentType }));
      })
      : storageDownloadUrl(path);
    load
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
  }, [path, shareId, materialId]);

  if (!url) {
    const content = (
      <span className="inline-flex h-8 max-w-[160px] items-center gap-1.5 rounded-full bg-surface pl-1 pr-2.5 text-[11px] leading-none">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface font-mono text-[8px] font-medium uppercase tracking-wide text-muted">
          IMG
        </span>
        <span className="min-w-0 truncate text-foreground">{title}</span>
      </span>
    );
    return onClick ? <button type="button" onClick={onClick}>{content}</button> : content;
  }

  const content = (
    <span className="block h-10 w-10 overflow-hidden rounded-xl bg-surface">
      <img src={url} alt={title} className="h-full w-full object-cover" />
    </span>
  );
  return onClick ? <button type="button" onClick={onClick}>{content}</button> : content;
}
