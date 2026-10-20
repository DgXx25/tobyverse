import { z } from "zod";
import type { ChatBlockDef } from "@/lib/blocks/types";

export const imageListItemSchema = z.object({
  title: z.string().trim().min(1).max(180),
  text: z.string().trim().max(4000).default(""),
  galleryId: z.string().regex(/^[A-Za-z0-9_-]{1,96}$/).optional(),
  imageIndex: z.number().int().min(0).max(63),
});

export const imageListSchema = z.object({
  type: z.literal("image-list").optional(),
  title: z.string().trim().min(1).max(180).optional(),
  shape: z.enum(["portrait", "square"]).default("portrait"),
  items: z.array(imageListItemSchema).min(1).max(12),
});

export type ImageListBlock = z.infer<typeof imageListSchema>;

export const imageListBlock: ChatBlockDef<ImageListBlock> = {
  id: "image-list",
  keys: ["photo", "photos", "images", "illustrated", "recommend", "recommendations", "music", "songs", "artists", "places", "destinations", "products", "ფოტო", "სურათ", "ჩამონათვალ", "რეკომენდ", "მუსიკ", "სიმღერ", "ადგილები", "ვარიანტ"],
  when: "Images alongside individually titled list entries materially help explain, identify or compare the requested things.",
  schema: imageListSchema,
  card: () => `Optional image-list: a vertical list with a small thumbnail beside each heading and rich description. Use only when pictures add meaning, never for every list. Place anywhere among prose and other blocks.
Fence: \`\`\`toby image-list
JSON: {"items":[{"title":"...","text":"...","galleryId":"actual returned gallery ID","imageIndex":0}]}
Use images from completed search results or attached message media only. imageIndex is zero-based within that gallery; omit galleryId only to index the message's attached image list. Never invent image URLs or IDs. Request search_images only if useful pictures are missing. Optional title and shape (portrait or square); 1–12 concise rows. Text supports Markdown and math, with no nested native blocks. If no matching image is available, use an ordinary text list.`,
};
