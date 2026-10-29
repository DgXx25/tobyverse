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
import { ImageListView } from "@/components/blocks/image-list";
import type { ImageListBlock } from "@/lib/blocks/kinds/image-list";
import { FormView } from "@/components/blocks/form";
import type { FormBlock } from "@/lib/blocks/kinds/form";
import type { ChatImageHit } from "@/types/chat";
import { WeatherView } from "@/components/blocks/weather";
import type { WeatherBlock } from "@/lib/blocks/kinds/weather";
import { VisualExplanationView } from "@/components/blocks/visual-explanation";
import type { VisualExplanationBlock } from "@/lib/blocks/kinds/visual-explanation";

export function TobyBlockView({
  block,
  streaming = false,
  images,
}: {
  block: ParsedChatBlock;
  streaming?: boolean;
  images?: ChatImageHit[];
}) {
  const { priorPapers, interactive, onReply, images: messageImages } = useChatExercise();
  if (block.type === "image-list") return <ImageListView block={block.data as ImageListBlock} images={images ?? messageImages ?? []} />;
  if (block.type === "form") return <FormView block={block.data as FormBlock} streaming={streaming} skipped={!interactive} onReply={onReply} />;
  if (block.type === "scene") return <SceneView block={block.data as SceneBlock} />;
  if (block.type === "sections") return <SectionsView block={block.data as SectionsBlock} />;
  if (block.type === "weather") return <WeatherView block={block.data as WeatherBlock} />;
  if (block.type === "visual-explanation") return <VisualExplanationView block={block.data as VisualExplanationBlock} images={images ?? messageImages ?? []} />;
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
