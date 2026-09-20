import { paperBlockSchema } from "@/lib/exercises/schemas";
import type { ChatBlockDef } from "@/lib/blocks/types";
import type { PaperPayload } from "@/types/exercise";

export type PaperBlock = PaperPayload;

export const paperBlock: ChatBlockDef<PaperBlock> = {
  id: "paper",
  keys: [
    "განცხადებ",
    "საჩივარ",
    "მიმართვა",
    "application letter",
    "official letter",
    "petition",
    "clerical",
  ],
  when: "Official writing sheet in chat. Filled example or they fill it. Built-in check on empty sheets. Not a practice set.",
  schema: paperBlockSchema,
  card: () =>
    `paper — official sheet in this chat (not suggest_practice, not a 10-item MCQ). JSON only. form is a layout id.
If they don't know how / asked for an example: FILLED sample (real invented names, not [placeholders]). The UI locks it. Do not dump a structure table of blanks.
\`\`\`toby paper
{"form":"ganckhadeba","brief":"მაგალითი — ოჯახური მიზეზით 3 დღის გაცდენა","sample":{"to":"სსიპ მე-12 საჯარო სკოლის დირექტორს","body":"მე, ნინო კაპანაძე, ამ სკოლის IX კლასის მოსწავლე, გთხოვთ, ოჯახური მიზეზის გამო გამომიცადოთ 3 დღე — 2023 წლის 24, 25 და 26 ოქტომბერი.\\n\\nგაცდენილ მასალას შევასრულებ და ჩავბარდები დროულად.","sign":"ნინო კაპანაძე","date":"23 ოქტომბერი, 2023"}}
\`\`\`
If they asked to try / write one themselves: empty sheet (brief + optional given.to). The UI has Check. You may emit the filled example first, then an empty sheet. Do not follow with a quiz.
Never wrap several <br> lines in one ==. Never $ around Georgian or leftover == / $ in table cells. A short parts table only if each cell is a few words.`,
};
