"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  IconBack,
  IconDeck,
  IconDownload,
  IconFile,
  IconForward,
  IconPractice,
  IconSheet,
  IconTrash,
  IconX,
} from "@/components/workspace/icons";
import { fileTypeBadge } from "@/lib/composer/attach";
import { librarySlidePaths, libraryThumbPaths, isLibraryPptx } from "@/lib/library/media";
import type { LibraryItem } from "@/lib/library/items";
import { removeLibraryMaterial } from "@/lib/materials/save";
import { storageDownloadUrl, isMissingMaterialFile } from "@/lib/materials/storage";

function useFirstObjectUrl(paths: string[]) {
  const key = paths.join("|");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (paths.length === 0) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      setUrl(null);
      for (const path of paths) {
        if (isMissingMaterialFile(path)) continue;
        try {
          const next = await storageDownloadUrl(path);
          if (cancelled) {
            URL.revokeObjectURL(next);
            return;
          }
          objectUrl = next;
          setUrl(next);
          return;
        } catch {
          // Object gone — fall through to the next stored path, then the icon.
        }
      }
      if (!cancelled) setUrl(null);
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  return url;
}

function downloadFile(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function fileNameFor(item: LibraryItem, url?: string | null) {
  if (/\.[a-z0-9]{2,5}$/i.test(item.title)) return item.title;
  const fromPath = (item.storagePath || item.images?.[0]?.path || "").split("/").pop() || "";
  const extMatch = /\.[a-z0-9]{2,5}$/i.exec(fromPath);
  if (extMatch) return `${item.title}${extMatch[0]}`;
  if (url?.startsWith("blob:")) return `${item.title}.jpg`;
  return item.title;
}

function IconFallback({ item }: { item: LibraryItem }) {
  if (item.kind === "practice") {
    return <IconPractice className="h-10 w-10 text-muted" />;
  }
  if (item.kind === "sheet") {
    return (
      <div className="flex h-full w-full flex-col px-4 py-4">
        <IconSheet className="h-5 w-5 text-muted" />
        <p className="mt-3 line-clamp-5 text-left text-[12px] leading-5 text-muted">{item.preview || item.title}</p>
      </div>
    );
  }
  if (isLibraryPptx(item)) {
    return (
      <div className="flex flex-col items-center gap-2">
        <IconDeck className="h-10 w-10 text-muted" />
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted">PPT</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <IconFile className="h-10 w-10 text-muted" />
      <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
        {fileTypeBadge(item.materialType || item.meta, item.title)}
      </span>
    </div>
  );
}

export function LibraryCardThumb({ item }: { item: LibraryItem }) {
  const paths = useMemo(() => libraryThumbPaths(item), [item]);
  const url = useFirstObjectUrl(paths);

  if (url) {
    return <img src={url} alt="" className="h-full w-full object-cover" />;
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <IconFallback item={item} />
    </div>
  );
}

function ViewerChrome({
  title,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onDownload,
  onDelete,
  onClose,
  deleting,
  confirmDelete,
  children,
}: {
  title: string;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  onClose: () => void;
  deleting?: boolean;
  confirmDelete?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onNext?.();
      if (event.key === "ArrowLeft") onPrev?.();
    }
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, onNext, onPrev]);

  if (typeof document === "undefined") return null;

  const actionBtn =
    "flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30";

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-full flex-col">
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0 flex items-center justify-center px-16 py-8">{children}</div>
          {canPrev ? (
            <button
              type="button"
              onClick={onPrev}
              className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label="Previous"
            >
              <IconBack className="h-6 w-6" />
            </button>
          ) : null}
          {canNext ? (
            <button
              type="button"
              onClick={onNext}
              className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label="Next"
            >
              <IconForward className="h-6 w-6" />
            </button>
          ) : null}
        </div>

        <div className="flex justify-center pb-7 pt-2">
          <div className="flex items-center gap-1 rounded-full bg-[#2a2a2a] px-1.5 py-1 shadow-[0_8px_28px_rgba(0,0,0,0.45)]">
            <button type="button" onClick={onDownload} disabled={!onDownload} className={actionBtn} aria-label="Download">
              <IconDownload className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={!onDelete || deleting}
              className={`${actionBtn} ${confirmDelete ? "text-red-400" : "text-red-500 hover:text-red-400"}`}
              aria-label={confirmDelete ? "Confirm delete" : "Delete"}
              title={confirmDelete ? "Click again to delete" : "Delete"}
            >
              <IconTrash className="h-[18px] w-[18px]" />
            </button>
            <button type="button" onClick={onClose} className={actionBtn} aria-label="Close">
              <IconX className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function LibraryLightbox({
  items,
  startKey,
  onClose,
  onDeleted,
}: {
  items: LibraryItem[];
  startKey: string;
  onClose: () => void;
  onDeleted: (item: LibraryItem) => void;
}) {
  const [currentKey, setCurrentKey] = useState(startKey);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const index = Math.max(0, items.findIndex((entry) => entry.key === currentKey));
  const item = items.find((entry) => entry.key === currentKey) ?? items[0] ?? null;
  const paths = useMemo(() => (item ? libraryThumbPaths(item) : []), [item]);
  const url = useFirstObjectUrl(paths);

  useEffect(() => {
    setConfirmDelete(false);
  }, [item?.key]);

  if (!item) return null;

  function go(delta: number) {
    const next = items[index + delta];
    if (next) setCurrentKey(next.key);
  }

  function onDownload() {
    if (!url || !item) return;
    downloadFile(url, fileNameFor(item, url));
  }

  async function onDelete() {
    if (!item) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      const remaining = items.filter((entry) => entry.key !== item.key);
      await removeLibraryMaterial(item);
      onDeleted(item);
      if (remaining.length === 0) {
        onClose();
        return;
      }
      setCurrentKey(remaining[Math.min(index, remaining.length - 1)].key);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ViewerChrome
      title={item.title}
      canPrev={index > 0}
      canNext={index < items.length - 1}
      onPrev={() => go(-1)}
      onNext={() => go(1)}
      onDownload={url ? onDownload : undefined}
      onDelete={() => void onDelete()}
      onClose={onClose}
      deleting={deleting}
      confirmDelete={confirmDelete}
    >
      {url ? (
        <img src={url} alt={item.title} className="max-h-full max-w-full object-contain" />
      ) : (
        <p className="text-sm text-white/60">Could not load image.</p>
      )}
    </ViewerChrome>
  );
}

export function LibrarySlideViewer({
  item,
  onClose,
  onDeleted,
}: {
  item: LibraryItem;
  onClose: () => void;
  onDeleted: (item: LibraryItem) => void;
}) {
  const paths = useMemo(() => librarySlidePaths(item), [item]);
  const [slides, setSlides] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (paths.length === 0) {
      setSlides([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const objectUrls: string[] = [];
    setLoading(true);
    setIndex(0);

    (async () => {
      const loaded: string[] = [];
      for (const path of paths) {
        if (isMissingMaterialFile(path)) continue;
        try {
          const url = await storageDownloadUrl(path);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          objectUrls.push(url);
          loaded.push(url);
        } catch {
          // Skip missing slide objects; do not probe guessed names.
        }
      }
      if (!cancelled) {
        setSlides(loaded);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [item.images, paths]);

  const current = slides[index];

  function onDownload() {
    if (!current) return;
    downloadFile(current, `${item.title.replace(/\.[^.]+$/, "")}-slide-${index + 1}.png`);
  }

  async function onDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await removeLibraryMaterial(item);
      onDeleted(item);
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ViewerChrome
      title={item.title}
      canPrev={index > 0}
      canNext={index < slides.length - 1}
      onPrev={() => setIndex((currentIndex) => Math.max(0, currentIndex - 1))}
      onNext={() => setIndex((currentIndex) => Math.min(slides.length - 1, currentIndex + 1))}
      onDownload={current ? onDownload : undefined}
      onDelete={() => void onDelete()}
      onClose={onClose}
      deleting={deleting}
      confirmDelete={confirmDelete}
    >
      {loading ? (
        <p className="text-sm text-white/60">Loading slides…</p>
      ) : current ? (
        <img
          src={current}
          alt={`${item.title} · slide ${index + 1}`}
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-white/60">
          <IconDeck className="h-12 w-12" />
          <p className="text-sm">No stored slides for this deck.</p>
        </div>
      )}
    </ViewerChrome>
  );
}
