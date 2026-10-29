import { paperBlockSchema } from "@/lib/exercises/schemas";
import type { ChatBlockDef } from "@/lib/blocks/types";
import type { z } from "zod";

export type PaperBlock = z.infer<typeof paperBlockSchema>;

export const paperBlock: ChatBlockDef<PaperBlock> = {
  id: "paper",
  keys: [
    "განცხადებ", "საჩივარ", "მიმართვა", "ფურცელ", "ცნობას", "ცნობა", "დამადასტურებელ ცნობ",
    "application letter", "official letter", "petition", "certificate", "certify", "proof of enrollment", "enrollment letter", "formal document",
  ],
  when: "An optional editable official-document sheet with fillable fields or a labeled draft sample.",
  schema: paperBlockSchema,
  card: () => `Optional editable formal-document sheet; use only when it helps. JSON only. Layout ids: ganckhadeba (application/request), certificate (certificate draft). Do not create a quiz.
Example:
\`\`\`toby paper
{"form":"certificate","brief":"Enrollment certificate draft","sample":{"to":"[Institution]","body":"This is to confirm that [Student name] is enrolled in [Program] during [Academic year].\\n\\nDraft for completion and verification by the institution.","sign":"[Authorized signatory]","date":"[Date]"}}
\`\`\`
Use only supplied facts; never imply institutional issuance, signature, or verification. Use visible placeholders for missing facts. For a request to fill the sheet, omit sample. You may show a completed sample and then an empty sheet if requested. If a sheet already exists and they want to resume it, emit only {"reuse":true}.` ,
};
