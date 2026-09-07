"use client";

import type { ChatImageHit } from "@/types/chat";

export function ImageGallery({ images }: { images: ChatImageHit[] }) {
  if (images.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {images.map((image) => (
        <a
          key={`${image.url}-${image.title}`}
          href={image.pageUrl || image.url}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-xl border border-border bg-surface-2"
          title={`${image.title} · ${image.source}`}
        >
          <img
            src={image.thumb || image.url}
            alt={image.title}
            referrerPolicy="no-referrer"
            className="h-16 w-16 object-cover"
          />
        </a>
      ))}
    </div>
  );
}
