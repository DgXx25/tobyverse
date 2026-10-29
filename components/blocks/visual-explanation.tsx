"use client";

import { RichContent } from "@/components/rich-content";
import { StorageThumb } from "@/components/workspace/sources-chip";
import { ImagePreviewButton } from "@/components/workspace/image-gallery";
import { publicImageUrl, resolveImageListItems } from "@/lib/images/image-list";
import { snapWikiThumbUrl } from "@/lib/images/types";
import type { VisualExplanationBlock } from "@/lib/blocks/kinds/visual-explanation";
import type { ChatImageHit } from "@/types/chat";
import "./visual-explanation.css";

export function VisualExplanationView({ block, images }: { block: VisualExplanationBlock; images: ChatImageHit[] }) {
  const image = resolveImageListItems({ shape: "portrait", items: [{
    title: block.title,
    text: block.note ?? "",
    galleryId: block.galleryId,
    imageIndex: block.imageIndex,
  }] }, images)[0]?.image;
  const thumb = publicImageUrl(image?.thumb || image?.thumbnail || image?.url);

  return (
    <section className="toby-visual-explanation" aria-label={block.title}>
      <h3 className="toby-visual-explanation-title">{block.title}</h3>
      {block.note ? <blockquote className="toby-visual-explanation-note"><RichContent text={block.note} allowNativeBlocks={false} /></blockquote> : null}
      {image ? (
        <figure className="toby-visual-explanation-figure">
          {image.storagePath ? (
          <ImagePreviewButton image={image} label={`Open image preview: ${image.title || block.title}`} className="toby-visual-explanation-link">
            <StorageThumb path={image.storagePath} alt={image.alt || image.title || block.title} className="toby-visual-explanation-image" />
          </ImagePreviewButton>
          ) : thumb ? (
          <ImagePreviewButton image={image} label={`Open image preview: ${image.title || block.title}`} className="toby-visual-explanation-link">
            <img src={snapWikiThumbUrl(thumb)} alt={image.alt || image.title || block.title} className="toby-visual-explanation-image" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          </ImagePreviewButton>
          ) : null}
        </figure>
      ) : null}
    </section>
  );
}
