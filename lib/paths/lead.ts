import type { PathKind } from "@/types/path";

export function leadPathPrompt(topic: string, teach?: string, kind: PathKind = "course"): string {
  const name = topic.replace(/\s+/g, " ").trim();
  const label = name ? `"${name}"` : "the current path topic";
  const brief = teach?.replace(/\s+/g, " ").trim();
  const cover = brief ? ` Cover: ${brief}` : "";
  if (kind === "review") {
    return `Tutor-lead (not a user request): in the selected learning workflow, review ${label}, this node only.${cover} Use relevant materials and choose a useful level of detail and format. Tables and native blocks are optional. You may offer suggest_practice when useful; create artifacts only when requested or accepted. An exercise in chat requires an explicit request. Keep the current path and node; this lead does not authorize creating, restarting, or advancing a path. Leave room for their next request.`;
  }
  return `Tutor-lead (not a user request): in the selected learning workflow, explain ${label}, this node only.${cover} Match the user's language and choose a useful level of detail and format. A pattern or example can help with a practical skill; tables and native blocks are optional. An exercise in chat requires an explicit request. Keep the current path and node; this lead does not authorize creating, restarting, or advancing a path. Artifacts require a request or accepted chip. Leave room for their questions.`;
}

export function examAskPrompt(topic: string): string {
  const name = topic.replace(/\s+/g, " ").trim();
  const label = name ? `"${name}"` : "the current path topic";
  return `Explicit chat exercise: they asked to answer one question about ${label}. Use the conversation and materials to choose one suitable question. Pass it in \`question\` and wait. Keep the expected reasoning in context; do not reveal the answer before they try. Assess their reply flexibly and accept any valid wording. Do not teach the topic again or add another question unasked. Do not call advance_path or any creation tool for this chat exercise.`;
}

export function moveOnPrompt(nextTitle?: string): string {
  const next = nextTitle?.replace(/\s+/g, " ").trim();
  const hint = next ? ` Hint only: "შემდეგი: ${next} — მზად ხარ?" (or the English equivalent).` : "";
  return `Move-on (not a user request): they tapped Continue after this explanation. Do not teach another topic or test their knowledge. Do not call advance_path unless they explicitly ask for the next topic.${hint} You may offer suggest_practice if useful. Never create_practice without their request or accepted chip. Do not pass \`question\` or write a drill or fill-in. Then wait. Never advance on a greeting.`;
}

export function hintAskPrompt(question: string): string {
  const ask = question.replace(/\s+/g, " ").trim();
  return `Hint-only (not a user request): they want a nudge on this completion: ${JSON.stringify(ask)}. One or two short sentences. Point at the time cue or which table row to use. NEVER give the filled form. NEVER complete the blank. NEVER name the correct option. Do not re-teach the lesson. Do not pass \`question\`. Do not call advance_path, create_path, start_path, restart_path, create_sheet, or create_practice.`;
}

/** Hidden follow-up after a study card / exercise set. Avoid "continue" — that forces start_path. */
export function resumeAfterWorkPrompt(input: {
  kind: "sheet" | "practice";
  nodeTitle?: string;
  teach?: string;
}): string {
  const topic = input.nodeTitle?.replace(/\s+/g, " ").trim();
  const brief = input.teach?.replace(/\s+/g, " ").trim();
  const artifact = input.kind === "practice" ? "the exercise set" : "the study card";
  const topicBit = topic ? ` Current path node: ${JSON.stringify(topic)}.` : "";
  const teachBit = brief ? ` Tutor brief: ${brief}` : "";
  return `The student just looked at ${artifact} and wants the next step.${topicBit}${teachBit} Do NOT recap ${artifact}. Do NOT pass \`question\`. Do NOT write a check in chat. If this is the exercise set, one short line — they can start it in the panel. If this is notes, you MAY suggest_practice or wait. Do not call advance_path unless they said გაიარე or the set was an exam they passed (the app already marked that). Stay on the path if there is one. create_sheet only if they asked. You MAY suggest_sheet.`;
}
