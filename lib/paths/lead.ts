import type { PathKind } from "@/types/path";

export function leadPathPrompt(topic: string, teach?: string, kind: PathKind = "course"): string {
  const name = topic.replace(/\s+/g, " ").trim();
  const label = name ? `"${name}"` : "the current path topic";
  const brief = teach?.replace(/\s+/g, " ").trim();
  const cover = brief ? ` Cover: ${brief}` : "";
  if (kind === "review") {
    return `Tutor-lead (not a user request): exam-review ${label} now — this node only.${cover} Retrieval, not a lecture. One hint or a 3-line recap in their language, then drill (a problem of the same shape as the materials, new numbers if it was already problem-heavy). Do not reteach the course intro. Do not dump the path. Do not pass \`question\` unless the drill is a single completion. Do not call create_path, advance_path, restart_path, start_path, or create_practice unless this unit is memory-heavy theory (terms, lists, flags, formulas) AND they asked. Do not generate long notes. Do not write "ახლა განვიხილავთ". The UI already says the step name.`;
  }
  return `Tutor-lead (not a user request): explain ${label} now — this node only, like a capable assistant, not a quiz.${cover} The UI already says what this step is called. Write a short useful explanation in their language. Use a markdown table and/or a listed native block if it helps; a listed block needs a short lead-in ABOVE the fence. If this is a form/skill: columns Form / Use / Example (or ფორმატი / გამოყენება / მაგალითი) — the UI stacks the form on top. Table cells: a few words or one short clause — not a paragraph, never a long (parenthetical). Example cell: the example on line 1, then \`<br>\`, then a short gloss in their language. If the example is code, keep the fence in that cell with \`<br>\` between lines — never a raw newline. Then STOP. Do not pass \`question\`. Do not write a check, "Question:", or fill-in in the body. Do not write "ახლა განვიხილავთ" / "now looking at" — the UI does that. Do not mention other topics. They may ask a question before moving on. Do not dump the tutor brief as an outline. Do not call create_path, advance_path, restart_path, start_path, or create_practice. You MAY call suggest_sheet after the explanation — create_sheet only if they asked. Do not make an exercise set.`;
}

export function examAskPrompt(topic: string): string {
  const name = topic.replace(/\s+/g, " ").trim();
  const label = name ? `"${name}"` : "the current path topic";
  return `Exam-only (not a user request): they asked for a check after ${label}. Do NOT teach again. Do NOT recap the table. Do NOT call advance_path, create_path, start_path, restart_path, create_sheet, or create_practice. Pass ONE completion in \`question\` only: a new sentence in the SAME shape as the last table example, with one blank or missing form they can type (or tap). Teaching body empty. NEVER "which tense/form would you use to describe…". NEVER ask them to name the topic. Optional 2-3 \`options\` that are candidate FORMS (will finish / will have finished), not tense labels.`;
}

export function moveOnPrompt(nextTitle?: string): string {
  const next = nextTitle?.replace(/\s+/g, " ").trim();
  const hint = next ? ` Hint only: "შემდეგი: ${next} — მზად ხარ?" (or the English equivalent).` : "";
  return `Move-on (not a user request): they tapped Continue after this bite. Do not teach another topic. Do not dump the path. Do not call advance_path — they have not said გაიარე yet.${hint} Offer exactly one: suggest_practice only if this unit is memory-heavy theory, or one \`question\` (a completion with one blank), or the next-hint line. Then wait. Never advance on a greeting.`;
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
