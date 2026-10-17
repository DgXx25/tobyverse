"use client";

import { RichContent } from "@/components/rich-content";
import { UiIcon } from "@/components/workspace/ui-icon";
import { resolveSectionSymbol, SECTION_SYMBOLS } from "@/lib/blocks/section-symbols";
import type { SectionsBlock } from "@/lib/blocks/kinds/sections";
import "./sections.css";

export function SectionsView({ block }: { block: SectionsBlock }) {
  return <section className="toby-sections" aria-label={block.title}>
    {block.title ? <h3 className="toby-sections-title">{block.title}</h3> : null}
    <div role="list">
      {block.items.map((item, index) => {
        const symbol = resolveSectionSymbol(item.title, item.text, item.symbol);
        return <div key={index} role="listitem" className="toby-sections-row">
        <span className="toby-sections-symbol" data-symbol={symbol} style={item.accent ? { color: `var(--palette-${item.accent})` } : undefined}>
          <UiIcon name={SECTION_SYMBOLS[symbol].icon} size={21} />
        </span>
        <div className="toby-sections-content">
          <h4>{item.title}</h4>
          <div className="toby-sections-body"><RichContent text={item.text} allowNativeBlocks={false} /></div>
        </div>
      </div>;
      })}
    </div>
  </section>;
}
