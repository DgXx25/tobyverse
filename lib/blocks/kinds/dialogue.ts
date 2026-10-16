import { z } from "zod";
import type { ChatBlockDef } from "@/lib/blocks/types";

const speakerId = z.string().min(1).max(24);

export const dialogueSchema = z
  .object({
    type: z.literal("dialogue").optional(),
    title: z.string().max(80).optional(),
    note: z.string().max(120).optional(),
    speakers: z
      .array(
        z.object({
          id: speakerId,
          emoji: z.string().min(1).max(16).optional(),
          name: z.string().min(1).max(40).optional(),
        }),
      )
      .min(2)
      .max(3),
    lines: z
      .array(
        z.object({
          speaker: speakerId,
          text: z.string().min(1).max(280),
          gloss: z.string().max(160).optional(),
        }),
      )
      .min(2)
      .max(4),
    mark: z.string().max(80).optional(),
  })
  .superRefine((value, ctx) => {
    const ids = new Set(value.speakers.map((item) => item.id));
    for (const [index, speaker] of value.speakers.entries()) {
      if (!speaker.emoji?.trim() && !speaker.name?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Speaker needs an emoji or name.",
          path: ["speakers", index],
        });
      }
    }
    for (const [index, line] of value.lines.entries()) {
      if (!ids.has(line.speaker)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Unknown speaker.",
          path: ["lines", index, "speaker"],
        });
      }
    }
  });

export type DialogueBlock = z.infer<typeof dialogueSchema>;

export const dialogueBlock: ChatBlockDef<DialogueBlock> = {
  id: "dialogue",
  keys: [
    "grammar",
    "tense",
    "tenses",
    "dialogue",
    "dialog",
    "conversation",
    "speaking",
    "spoken",
    "modal",
    "conditional",
    "gerund",
    "infinitive",
    "phrasal",
    "reported speech",
    "present perfect",
    "past perfect",
    "future perfect",
    "continuous",
    "გრამატიკ",
    "დიალოგ",
    "საუბარ",
    "ინგლისურ",
    "ზმნ",
    "ფრანგულ",
    "გერმანულ",
    "ესპანურ",
  ],
  when: "Two characters using the form in a short exchange — not a tense quiz. Prose above the block.",
  schema: dialogueSchema,
  card: () =>
    `Optional dialogue — two characters using a form in a short exchange. A brief lead-in can introduce it when useful.
Fence: \`\`\`toby dialogue
JSON: {"speakers":[{"id":"a","emoji":"🐶"},{"id":"b","emoji":"🐱"}],"lines":[{"speaker":"a","text":"I have never been to Paris.","gloss":"პარიზში არასდროს ვყოფილვარ."},{"speaker":"b","text":"Really? You should go."}],"mark":"have never been"}
2 speakers, 2–4 lines. emoji identifies the character; use distinct characters. text beside it. gloss optional under the line. optional note = one short line under the path.`,
};
