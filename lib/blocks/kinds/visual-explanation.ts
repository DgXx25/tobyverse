import { z } from "zod";
import type { ChatBlockDef } from "@/lib/blocks/types";

export const visualExplanationSchema = z.object({
  type: z.literal("visual-explanation").optional(),
  title: z.string().trim().min(1).max(160),
  note: z.string().trim().max(500).optional(),
  galleryId: z.string().regex(/^[A-Za-z0-9_-]{1,96}$/).optional(),
  imageIndex: z.number().int().min(0).max(63),
});

export type VisualExplanationBlock = z.infer<typeof visualExplanationSchema>;

export const visualExplanationBlock: ChatBlockDef<VisualExplanationBlock> = {
  id: "visual-explanation",
  keys: [
    "why does", "why do", "why is", "how does", "how do", "how is", "what causes", "what happens when",
    "explain", "what is", "illustrate", "visualize", "show me how", "real-world example",
    "რატომ", "როგორ მუშაობს", "როგორ ხდება", "როგორ წარმოიქმნება", "როგორ მოქმედებს",
    "ამიხსენი", "რა იწვევს", "რა არის", "მაჩვენე როგორ", "რეალური მაგალითი",
  ],
  when: "A specific real-world photo makes an explanatory concept easier to grasp than words or an existing diagram alone.",
  schema: visualExplanationSchema,
  card: () => `Optional visual-explanation: one compact TobyVerse card with a short title, optional one-line explanation or quote, and one wide, relevant photograph. For an explanation of a concrete real-world phenomenon, usually include this card when a specific image can make its appearance, mechanism, or effect easier to grasp—even if the user didn't request an image. Keep surrounding prose concise and don't repeat the card's note. Prefer an accurate, illustrative photo over generic decoration. Skip routine facts, equations, abstract processes better served by a diagram, or cases where a photo adds no understanding. Search only when a suitable image is not already available; use search_images with a specific subject and context, then reference the actual result. Never invent image URLs, gallery IDs or image indexes. If no suitable image exists, omit this card and answer normally.
Fence: \`\`\`toby visual-explanation
JSON: {"title":"...","note":"Optional short line in the user's language","galleryId":"actual returned gallery ID","imageIndex":0}
Use only completed search results or attached message images. galleryId is required for search results and omitted only for attached images; imageIndex is zero-based within that actual gallery or attachment list. The image fills the card width; alt text comes from its real search result. No nested native blocks.`
};
