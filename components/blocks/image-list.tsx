"use client";

import { RichContent } from "@/components/rich-content";
import { StorageThumb } from "@/components/workspace/sources-chip";
import { resolveImageListItems, publicImageUrl } from "@/lib/images/image-list";
import { snapWikiThumbUrl } from "@/lib/images/types";
import type { ImageListBlock } from "@/lib/blocks/kinds/image-list";
import type { ChatImageHit } from "@/types/chat";
import "./image-list.css";

export function ImageListView({ block, images }: { block: ImageListBlock; images: ChatImageHit[] }) {
  return <section className="toby-image-list" aria-label={block.title} data-shape={block.shape}>
    {block.title ? <h3 className="toby-image-list-title">{block.title}</h3> : null}
    <div role="list">
      {resolveImageListItems(block, images).map((item, index) => {
        const image = item.image;
        const thumb = publicImageUrl(image?.thumb || image?.thumbnail || image?.url);
        const target = publicImageUrl(image?.pageUrl || image?.url);
        const media = image?.storagePath
          ? <StorageThumb path={image.storagePath} alt={image.alt || item.title} className="toby-image-list-thumb" />
          : thumb ? <img src={snapWikiThumbUrl(thumb)} alt={image?.alt || item.title} className="toby-image-list-thumb" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : null;
        return <div role="listitem" className={`toby-image-list-row${media ? "" : " toby-image-list-no-image"}`} key={`${item.galleryId ?? "attached"}:${item.imageIndex}:${index}`}>
          {media ? target ? <a href={target} target="_blank" rel="noreferrer" className="toby-image-list-media" aria-label={image?.title || item.title}>{media}</a> : <div className="toby-image-list-media">{media}</div> : null}
          <div className="toby-image-list-copy">
            <h4>{item.title}</h4>
            {item.text ? <RichContent text={item.text} allowNativeBlocks={false} /> : null}
          </div>
        </div>;
      })}
    </div>
  </section>;
}
