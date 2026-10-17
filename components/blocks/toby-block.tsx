"use client";

import { DialogueView } from "@/components/blocks/dialogue";
import { GridView } from "@/components/blocks/grid";
import { PaperView } from "@/components/blocks/paper";
import { useChatExercise } from "@/components/workspace/chat-exercise-context";
import { resolvePaperPayload } from "@/lib/blocks/paper-thread";
import type { DialogueBlock } from "@/lib/blocks/kinds/dialogue";
import type { GridBlock } from "@/lib/blocks/kinds/grid";
import type { ParsedChatBlock } from "@/lib/blocks/types";
import type { SceneBlock } from "@/lib/blocks/kinds/scene";
import { SceneView } from "@/components/blocks/scenes/scene-view";
import { SectionsView } from "@/components/blocks/sections";
import type { SectionsBlock } from "@/lib/blocks/kinds/sections";

export function TobyBlockView({
  block,
  streaming = false,
}: {
  block: ParsedChatBlock;
  streaming?: boolean;
}) {
  const { priorPapers, interactive } = useChatExercise();
  if (block.type === "scene") return <SceneView block={block.data as SceneBlock} />;
  if (block.type === "sections") return <SectionsView block={block.data as SectionsBlock} />;
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
    const data = resolvePaperPayload(block.data, priorPapers);
    if (!data) return null;
    return <PaperView block={data} streaming={streaming} skipped={!interactive} />;
  }
  return null;
}
