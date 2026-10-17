"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { snapWikiThumbUrl } from "@/lib/images/types";
import type { ChatImageHit } from "@/types/chat";
import { StorageThumb } from "@/components/workspace/sources-chip";
import { UiIcon } from "@/components/workspace/ui-icon";

const PREVIEW_COUNT = 3;

function originLabel(images: ChatImageHit[], _ka: boolean): string | null {
  const web = images.filter((image) => image.kind !== "upload" && !image.storagePath);
  if (web.length === 0) return null;
  const counts = new Map<string, number>();
  for (const image of web) {
    const key = (image.source || "").trim().toLowerCase() || "wikimedia";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let top = "wikimedia";
  let best = 0;
  for (const [key, count] of counts) {
    if (count > best) {
      top = key;
      best = count;
    }
  }
  if (top === "wikimedia" || top === "wikipedia") return "Wikipedia";
  if (top === "openverse") return "Openverse";
  if (top === "pexels") return "Pexels";
  if (top === "pixabay") return "Pixabay";
  if (top === "google") return "Google";
  return "Wikipedia";
}

export function ImageGallery({
  images,
  moreLabel = "More",
  ka = false,
  onOpenUpload,
}: {
  images: ChatImageHit[];
  moreLabel?: string;
  ka?: boolean;
  onOpenUpload?: (image: ChatImageHit) => void;
}) {
  const visible = images.filter((image) => image.thumb || image.thumbnail || image.url || image.storagePath);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  if (visible.length === 0) return null;

  const preview = visible.slice(0, PREVIEW_COUNT);
  const hasMore = visible.length > PREVIEW_COUNT;
  const origin = originLabel(visible, ka);

  function openImage(image: ChatImageHit, index: number) {
    const upload = image.kind === "upload" || Boolean(image.storagePath);
    if (upload) {
      onOpenUpload?.(image);
      return;
    }
    setPreviewIndex(index);
  }

  return (
    <>
      <div className={`relative w-full${hasMore ? " pt-8" : ""}`}>
        {hasMore ? (
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="absolute right-0 top-0 rounded-full bg-surface px-2.5 py-0.5 text-[12px] text-muted hover:text-foreground"
          >
            {moreLabel}
          </button>
        ) : null}
        <div className="grid w-full gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 12rem), 1fr))" }}>
          {preview.map((image, index) => (
            <ImageThumb
              key={`${image.storagePath || image.url || image.title}-${index}`}
              image={image}
              onClick={() => openImage(image, index)}
            />
          ))}
        </div>
        {origin ? <p className="mt-2 text-[12px] text-muted">{origin}</p> : null}
      </div>
      {galleryOpen ? (
        <ImageGalleryModal
          images={visible}
          ignoreEscape={previewIndex != null}
          onClose={() => setGalleryOpen(false)}
          onOpenImage={(index) => openImage(visible[index], index)}
        />
      ) : null}
      {previewIndex != null ? (
        <ImageLightbox
          images={visible}
          index={previewIndex}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      ) : null}
    </>
  );
}

function RemoteImg({
  src,
  fallback,
  alt,
  className,
}: {
  src: string;
  fallback?: string;
  alt: string;
  className?: string;
}) {
  const display = snapWikiThumbUrl(src);
  const displayFallback = fallback ? snapWikiThumbUrl(fallback) : "";
  const [current, setCurrent] = useState(display);
  const [dead, setDead] = useState(false);
  useEffect(() => {
    setCurrent(display);
    setDead(false);
  }, [display]);
  if (dead) return null;
  return (
    <img
      src={current}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => {
        if (displayFallback && displayFallback !== current) setCurrent(displayFallback);
        else setDead(true);
      }}
    />
  );
}

function ImageThumb({ image, onClick }: { image: ChatImageHit; onClick: () => void }) {
  const upload = image.kind === "upload" || Boolean(image.storagePath);
  const src = image.thumb || image.thumbnail || image.url;
  return (
    <button
      type="button"
      onClick={onClick}
      className="img-alpha-bg img-zoom aspect-[3/2] w-full overflow-hidden rounded-xl"
      title={image.title}
    >
      {upload ? (
        <StorageThumb path={image.storagePath || image.thumb} className="h-full w-full" />
      ) : src ? (
        <RemoteImg src={src} fallback={image.url} alt="" className="h-full w-full object-cover" />
      ) : null}
    </button>
  );
}

function ImageGalleryModal({
  images,
  ignoreEscape,
  onClose,
  onOpenImage,
}: {
  images: ChatImageHit[];
  ignoreEscape: boolean;
  onClose: () => void;
  onOpenImage: (index: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (ignoreEscape) return;
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [ignoreEscape, onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/80 p-4" onClick={onClose}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:text-white"
      >
        <UiIcon name="close" size={18} />
      </button>
      <div
        className="mx-auto grid max-w-3xl grid-cols-2 gap-3 py-12 sm:grid-cols-3"
        onClick={(event) => event.stopPropagation()}
      >
        {images.map((image, index) => (
          <button
            key={`${image.storagePath || image.url || image.title}-gallery-${index}`}
            type="button"
            onClick={() => onOpenImage(index)}
            className="img-alpha-bg img-zoom aspect-square overflow-hidden rounded-xl border border-white/10"
            title={image.title}
          >
            {image.kind === "upload" || image.storagePath ? (
              <StorageThumb path={image.storagePath || image.thumb} className="h-full w-full" />
            ) : (
              <RemoteImg
                src={image.thumb || image.thumbnail || image.url}
                fallback={image.url}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: ChatImageHit[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const image = images[index];
  const canPrev = index > 0;
  const canNext = index < images.length - 1;
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && canPrev) onIndexChange(index - 1);
      if (event.key === "ArrowRight" && canNext) onIndexChange(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canNext, canPrev, index, onClose, onIndexChange]);
  if (!mounted || !image) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-16 py-14" onClick={onClose}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:text-white"
      >
        <UiIcon name="close" size={18} />
      </button>
      {canPrev ? (
        <button
          type="button"
          aria-label="Previous"
          onClick={(event) => {
            event.stopPropagation();
            onIndexChange(index - 1);
          }}
          className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <UiIcon name="prev" size={22} />
        </button>
      ) : null}
      {canNext ? (
        <button
          type="button"
          aria-label="Next"
          onClick={(event) => {
            event.stopPropagation();
            onIndexChange(index + 1);
          }}
          className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <UiIcon name="forward" size={22} />
        </button>
      ) : null}
      <RemoteImg
        src={image.url || image.thumb || image.thumbnail || ""}
        fallback={image.thumb || image.thumbnail}
        alt={image.alt || image.title}
        className="img-alpha-bg h-auto w-auto max-h-[min(72vh,640px)] max-w-[min(calc(100vw-9rem),720px)] object-contain"
      />
    </div>,
    document.body,
  );
}
