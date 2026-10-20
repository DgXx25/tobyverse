import { z } from "zod";
import type { ChatBlockDef } from "@/lib/blocks/types";

const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,47}$/);
const label = z.string().trim().min(1).max(160);
const help = z.string().trim().min(1).max(400).optional();
const fieldBase = { id, label, help, required: z.boolean().optional() };
const option = z.object({ id, label }).strict();
const options = z.array(option).min(2).max(12);

export const formFieldSchema = z.discriminatedUnion("type", [
  z.object({ ...fieldBase, type: z.literal("radio"), options }).strict(),
  z.object({ ...fieldBase, type: z.literal("checkbox"), options }).strict(),
  z.object({ ...fieldBase, type: z.literal("text"), placeholder: label.optional(), maxLength: z.number().int().min(1).max(300).optional() }).strict(),
  z.object({ ...fieldBase, type: z.literal("textarea"), placeholder: label.optional(), maxLength: z.number().int().min(1).max(2000).optional() }).strict(),
]);

// This interface has no credential controls or external form actions.
const credentialPrompt = /\b(?:password|passcode|api[ _-]?key|access[ _-]?token|auth(?:entication)?[ _-]?token|private[ _-]?key|secret[ _-]?key|seed[ _-]?phrase|recovery[ _-]?phrase|credit[ _-]?card|card[ _-]?number|cvv|verification[ _-]?code|one[ -]?time[ _-]?(?:code|password))\b|პაროლ|секретн.{0,5}ключ|парол/iu;

export const formSchema = z.object({
  type: z.literal("form").optional(),
  title: label,
  help,
  submitLabel: z.string().trim().min(1).max(60).optional(),
  fields: z.array(formFieldSchema).min(1).max(8),
}).strict().superRefine((value, ctx) => {
  const ids = new Set<string>();
  value.fields.forEach((field, index) => {
    if (ids.has(field.id)) ctx.addIssue({ code: "custom", message: "Field ids must be unique.", path: ["fields", index, "id"] });
    ids.add(field.id);
    if ("options" in field) {
      const optionIds = new Set<string>();
      field.options.forEach((item, optionIndex) => {
        if (optionIds.has(item.id)) ctx.addIssue({ code: "custom", message: "Option ids must be unique within a field.", path: ["fields", index, "options", optionIndex, "id"] });
        optionIds.add(item.id);
      });
    }
  });
  if (credentialPrompt.test(JSON.stringify(value))) ctx.addIssue({ code: "custom", message: "Forms cannot request credentials or payment card details." });
});

export type FormBlock = z.infer<typeof formSchema>;
export type FormField = FormBlock["fields"][number];
export type FormAnswers = Record<string, string | string[]>;
export type FormReply = { success: true; text: string } | { success: false; errors: Record<string, string> };

export function formTextLimit(field: FormField): number {
  return "maxLength" in field && field.maxLength ? field.maxLength : field.type === "textarea" ? 2000 : 300;
}

function safeReplyText(text: string): string {
  // Answers remain readable text and cannot instantiate new native blocks.
  return text.replace(/`{3,}|~{3,}/g, (fence) => fence.split("").join("\u200b"));
}

/** Validate untrusted stored/input values and serialize labels, never internal option ids. */
export function prepareFormReply(block: FormBlock, answers: FormAnswers): FormReply {
  const errors: Record<string, string> = Object.create(null);
  const rows: string[] = [];
  for (const field of block.fields) {
    const raw = Object.hasOwn(answers, field.id) ? answers[field.id] : undefined;
    let answer = "";
    if (field.type === "checkbox") {
      const selected = raw ?? [];
      if (!Array.isArray(selected) || selected.some((item) => typeof item !== "string" || !field.options.some((choice) => choice.id === item)) || new Set(selected).size !== selected.length) {
        errors[field.id] = "Choose from the listed options.";
        continue;
      }
      answer = field.options.filter((item) => selected.includes(item.id)).map((item) => item.label).join("; ");
    } else if (field.type === "radio") {
      if (raw != null && raw !== "" && (typeof raw !== "string" || !field.options.some((item) => item.id === raw))) {
        errors[field.id] = "Choose one of the listed options.";
        continue;
      }
      answer = field.options.find((item) => item.id === raw)?.label ?? "";
    } else {
      if (raw != null && (typeof raw !== "string" || raw.length > formTextLimit(field))) {
        errors[field.id] = `Use up to ${formTextLimit(field)} characters.`;
        continue;
      }
      answer = typeof raw === "string" ? raw.trim() : "";
    }
    if (field.required && !answer) errors[field.id] = "Please fill in this field.";
    if (answer) rows.push(`${field.label}: ${answer}`);
  }
  if (!rows.length && !Object.keys(errors).length) errors._form = "Add a response before sending.";
  if (Object.keys(errors).length) return { success: false, errors };
  return { success: true, text: safeReplyText(`${block.title}\n\n${rows.join("\n")}`) };
}

export const formBlock: ChatBlockDef<FormBlock> = {
  id: "form",
  keys: ["form", "preferences", "options", "choose", "select", "checkbox", "radio", "questionnaire", "requirements", "details", "ფორმა", "არჩევა", "აირჩიე", "მონიშნე", "მონიშვნა", "სურვილ", "მოთხოვნ"],
  when: "An optional compact form can make a few relevant choices or details easier to provide in the current request.",
  schema: formSchema,
  card: () => `Optional form — collect a few choices or short details when this helps the current request, as freely chosen as a table. The UI sends the user's completed answers as their next chat message. Use ordinary prose whenever it suffices. Do not turn conversation into a survey, interview, quiz, or teaching routine; do not request credentials or payment card details.
Fence: \`\`\`toby form
JSON: {"title":"Plan the visit","fields":[{"id":"days","type":"checkbox","label":"Available days","options":[{"id":"sat","label":"Saturday"},{"id":"sun","label":"Sunday"}]},{"id":"pace","type":"radio","label":"Pace","options":[{"id":"slow","label":"Relaxed"},{"id":"fast","label":"Busy"}]},{"id":"notes","type":"textarea","label":"Anything else?"}],"submitLabel":"Send answers"}
1–8 fields. Stable unique ids start with a letter and contain only letters, digits, underscores or hyphens (up to 48 characters). Field types: checkbox (multiple choices), radio (one choice), text, textarea. Choices have 2–12 options with unique ids and visible labels. Every field needs id, type and label; optional help and required:true. Text fields accept optional placeholder and maxLength (text up to 300; textarea up to 2000). Title and labels up to 160 characters; optional form help up to 400 and submitLabel up to 60. Use the user's language. Include only fields that advance their request. No actions, external URLs, HTML or nested native blocks.`,
};
