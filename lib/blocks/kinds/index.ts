import { dialogueBlock } from "@/lib/blocks/kinds/dialogue";
import { gridBlock } from "@/lib/blocks/kinds/grid";
import { paperBlock } from "@/lib/blocks/kinds/paper";
import { sceneBlock } from "@/lib/blocks/kinds/scene";
import { sectionsBlock } from "@/lib/blocks/kinds/sections";
import { imageListBlock } from "@/lib/blocks/kinds/image-list";
import { formBlock } from "@/lib/blocks/kinds/form";
import { weatherBlock } from "@/lib/blocks/kinds/weather";
import { visualExplanationBlock } from "@/lib/blocks/kinds/visual-explanation";
import type { ChatBlockDef } from "@/lib/blocks/types";

/** Add a kind file, then one line here. Catalog is never dumped into the prompt. */
export const CHAT_BLOCK_KINDS: ChatBlockDef[] = [dialogueBlock, gridBlock, paperBlock, sceneBlock, sectionsBlock, imageListBlock, visualExplanationBlock, formBlock, weatherBlock];
