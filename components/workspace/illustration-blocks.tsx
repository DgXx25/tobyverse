"use client";

import { VisualBlockView } from "@/components/visuals/visual-block";
import { parseVisualBlock } from "@/lib/visuals/validate";
import type { VisualBlock } from "@/types/visual";

export function IllustrationBlocks({ blocks }: { blocks?: VisualBlock[] }) {
  const valid = (blocks ?? []).flatMap((block) => {
    const parsed = parseVisualBlock(block);
    return parsed ? [parsed] : [];
  });
  if (valid.length === 0) return null;
  return (
    <div className="space-y-3">
      {valid.map((block, index) => (
        <VisualBlockView key={`${block.type}-${index}`} block={block} />
      ))}
    </div>
  );
}
