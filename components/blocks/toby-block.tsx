"use client";

import { DialogueView } from "@/components/blocks/dialogue";
import { GridView } from "@/components/blocks/grid";
import { PaperView } from "@/components/blocks/paper";
import type { DialogueBlock } from "@/lib/blocks/kinds/dialogue";
import type { GridBlock } from "@/lib/blocks/kinds/grid";
import type { PaperPayload } from "@/types/exercise";
import type { ParsedChatBlock } from "@/lib/blocks/types";

export function TobyBlockView({
  block,
  streaming = false,
}: {
  block: ParsedChatBlock;
  streaming?: boolean;
}) {
  if (block.type === "dialogue") {
    const data = block.data as DialogueBlock;
    if (!data || !Array.isArray(data.lines)) return null;
    return <DialogueView block={{ ...data, speakers: data.speakers ?? [], lines: data.lines }} streaming={streaming} />;
  }
  if (block.type === "grid") {
    const data = block.data as GridBlock;
    if (!data || typeof data.cells !== "string") return null;
    return <GridView block={data} />;
  }
  if (block.type === "paper") {
    const data = block.data as PaperPayload;
    return (
      <PaperView
        block={data?.form === "ganckhadeba" ? data : { form: "ganckhadeba", brief: data?.brief ?? "" }}
        streaming={streaming}
      />
    );
  }
  return null;
}
