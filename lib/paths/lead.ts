import type { PathKind } from "@/types/path";

export function leadPathPrompt(topic: string, teach?: string, kind: PathKind = "course"): string {
  const name = topic.replace(/\s+/g, " ").trim();
  const label = name ? `"${name}"` : "the current path topic";
  const brief = teach?.replace(/\s+/g, " ").trim();
  const cover = brief ? ` Cover: ${brief}` : "";
  if (kind === "review") {
    return `Tutor-lead (not a user request): explain and review ${label} now — this node only.${cover} Use relevant materials for a short useful explanation. Do not initiate a drill, quiz, fill-in, or knowledge check. At most offer suggest_practice if useful; create_practice only when the user asks or accepts that chip. Do not pass \`question\` without an explicit request for an exercise in chat. Wait for their request. Do not call create_path, advance_path, restart_path, or start_path. Do not generate notes unless asked. The UI already says the step name.`;
  }
  return `Tutor-lead (not a user request): explain ${label} now — this node only, like a capable assistant, not a quiz.${cover} The UI already says what this step is called. Write a short useful explanation in their language. Use a markdown table and/or a listed native block if it helps; a listed block needs a short lead-in ABOVE the fence. If this is a form/skill: columns Form / Use / Example (or ფორმატი / გამოყენება / მაგალითი) — the UI stacks the form on top. Table cells: a few words or one short clause — not a paragraph, never a long (parenthetical). Example cell: the example on line 1, then \`<br>\`, then a short gloss in their language. If the example is code, keep the fence in that cell with \`<br>\` between lines — never a raw newline. Then STOP. Do not pass \`question\`. Do not write a check, "Question:", or fill-in in the body. Do not write "ახლა განვიხილავთ" / "now looking at" — the UI does that. Do not mention other topics. They may ask a question before moving on. Do not dump the tutor brief as an outline. Do not call create_path, advance_path, restart_path, start_path, or create_practice. You MAY call suggest_sheet after the explanation — create_sheet only if they asked. Do not make an exercise set.`;
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
