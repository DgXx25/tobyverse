"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatImageHit } from "@/types/chat";
import { StorageThumb } from "@/components/workspace/sources-chip";
import { UiIcon } from "@/components/workspace/ui-icon";

export function ImageGallery({
  images,
  onOpenUpload,
}: {
  images: ChatImageHit[];
  onOpenUpload?: (image: ChatImageHit) => void;
}) {
  const visible = images.filter((image) => image.thumb || image.url || image.storagePath);
  const [preview, setPreview] = useState<ChatImageHit | null>(null);

  if (visible.length === 0) return null;
  return (
    <>
      <div className="mt-2 grid max-w-[22rem] grid-cols-3 gap-1.5 sm:grid-cols-4">
        {visible.map((image, index) => {
          const upload = image.kind === "upload" || Boolean(image.storagePath);
          return (
            <button
              key={`${image.storagePath || image.url || image.title}-${index}`}
              type="button"
              onClick={() => (upload ? onOpenUpload?.(image) : setPreview(image))}
              className="aspect-square overflow-hidden rounded-lg border border-border bg-surface-2"
              title={image.title}
            >
              {upload ? (
                <StorageThumb path={image.storagePath || image.thumb} className="h-full w-full" />
              ) : (
                <img
                  src={image.thumb || image.url}
                  alt={image.title}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              )}
            </button>
          );
        })}
      </div>
      {preview ? <ImageLightbox image={preview} onClose={() => setPreview(null)} /> : null}
    </>
  );
}

function ImageLightbox({ image, onClose }: { image: ChatImageHit; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:text-white"
      >
        <UiIcon name="close" size={18} />
      </button>
      <img
        src={image.url || image.thumb}
        alt={image.title}
        referrerPolicy="no-referrer"
        className="max-h-[86vh] max-w-[min(92vw,960px)] object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  );
}
