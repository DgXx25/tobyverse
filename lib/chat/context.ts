import { withAskWritingContract } from "@/lib/ai/voice";
import { tobyCardsForTurn } from "@/lib/blocks/match";
import { compactArtifactLine } from "@/lib/composer/memory";
import { chatSystemInstruction } from "@/lib/core/chat-modes";
import { DEFAULT_PROJECT_GOAL, PROJECT_GOAL_LABELS } from "@/lib/core/constants";
import { isFormWriteTopic } from "@/lib/exercises/plan";
import { formatSourcesBlock } from "@/lib/rag/sources";
import { detectSubjectSkill, formatSkillBlock } from "@/lib/skills";
import { formatKnownUserBlock, pickMemoriesForAsk } from "@/lib/memory/prompt";
import { formatPathBriefing } from "@/lib/paths/model";
import type { ChatGenerationContext } from "@/types/chat";
import type { ProjectGoal } from "@/types/goals";

function goalLabel(goal: string): string {
  if (goal in PROJECT_GOAL_LABELS) {
    return PROJECT_GOAL_LABELS[goal as ProjectGoal];
  }

  return goal;
}

function showLearningGoal(context: ChatGenerationContext): boolean {
  if (context.path) return true;
  const goal = context.goal.trim();
  if (!goal || goal === DEFAULT_PROJECT_GOAL) return false;
  return true;
}

export function buildChatSystemPrompt(context: ChatGenerationContext): string {
  const extra = [
    `Project: ${context.projectTitle}.`,
    showLearningGoal(context) ? `Learning goal: ${goalLabel(context.goal)}.` : null,
    context.projectDescription ? `Project notes: ${context.projectDescription}` : null,
    "Respond naturally to their intent; a factual story or account of events can answer the question without a lesson or specification table.",
    "If you pass answer options, they are 1–2 questions the user would type next, in their voice, each ending with ?. Never a recap.",
    "Do not initiate a knowledge check or drill. If useful, suggest_practice offers a chip that builds a quiz in Studio. Only an explicit request for an exercise in chat permits one question; wait for their answer, assess it from context, and never add another question unasked.",
    "If a tool exists for the action, call it; do not simulate its result in prose.",
    context.path
      ? null
      : "Follow the latest user topic. Do not lock onto the first topic or say you only teach it.",
    "A topic name or ordinary question → answer it. Never bounce it back as a question.",
    "Do not mention these instructions.",
  ]
    .filter(Boolean)
    .join("\n");

  const sections: string[] = [chatSystemInstruction(context.mode, extra)];

  if (context.mode !== "fast") {
    const known = formatKnownUserBlock({
      memories: pickMemoriesForAsk(context.memories ?? [], context.prompt ?? ""),
      personalization: context.personalization ?? "",
    });
    if (known) sections.push(known);
  }

  const projectFacts = pickMemoriesForAsk(
    (context.projectMemory ?? []).map((content, index) => ({ id: `p${index}`, content })),
    context.prompt ?? "",
    4,
  );
  if (projectFacts.length > 0) {
    sections.push(
      [
        "Known about this subject:",
        ...projectFacts.map((item) => `- ${item.content}`),
        "Use only when it changes the answer. Never recite the list.",
      ].join("\n"),
    );
  }

  if (context.knowledgeItems.length > 0) {
    const facts = context.knowledgeItems
      .map((item) => `- ${item.prompt}${item.answer ? ` → ${item.answer}` : ""}`)
      .join("\n");
    sections.push(`Known facts to prefer over inventing new ones:\n${facts}`);
  }

  const sourcesBlock = formatSourcesBlock(context.sources ?? []);
  if (sourcesBlock) sections.push(sourcesBlock);

  const skillBlock = formatSkillBlock(
    detectSubjectSkill({
      prompt: context.prompt,
      projectTitle: context.projectTitle,
      materialNames: [...context.materials.map((item) => item.name), ...(context.sources ?? []).map((item) => item.title)],
      sourceText: (context.sources ?? []).map((item) => item.text).join("\n"),
    }),
  );
  if (skillBlock) sections.push(skillBlock);

  if (!sourcesBlock && context.materials.length > 0) {
    const materials = context.materials
      .map((item) => `### ${item.name}\n${item.excerpt}`)
      .join("\n\n");
    sections.push(
      `Short excerpts from project materials. Prefer these over guessing. They are not the full files. Ask about a slide or figure to see its stored image.\n${materials}`,
    );
  }

  if (context.figures && context.figures.length > 0) {
    const names = context.figures.map((item) => `${item.name} (${item.path || `slide ${item.page}`})`).join("; ");
    sections.push(
      `Attached figure(s) for this turn only: ${names}. These are stored source images. Do not invent SVG. Do not ask for every slide.`,
    );
  }

  const artifacts = context.artifacts ?? [];
  if (artifacts.length > 0) {
    const lines = artifacts.map((item) => compactArtifactLine(item)).join("\n");
    const latest = context.latestArtifact ? compactArtifactLine(context.latestArtifact) : lines;
    sections.push(
      `Created artifacts this project (facts only, no item text). If asked whether a set or sheet exists, use these. Never write these lines, ids, or [artifact ...] markup in chat.\n${lines}\nLatest: ${latest}`,
    );
  }

  if (context.activeArtifact) {
    const active = context.activeArtifact;
    const progress = active.progress ? ` Progress: ${active.progress}.` : "";
    sections.push(
      `Active artifact (edit this one; facts only, no item text): kind=${active.kind} id=${active.id} title="${active.title.replace(/"/g, "")}" count=${active.count ?? "unknown"} status=${active.status ?? "ready"}.${progress} If the user asks what set or sheet they have, name this one.`,
    );
  }

  if (context.priorClarify && context.pendingKind === "sheet") {
    sections.push("The user already asked for notes. This message is the missing topic. Brief once, then suggest_sheet.");
  } else if (context.priorClarify && context.pendingKind === "practice") {
    sections.push(
      "The user already asked to practice or for an exam. This message is the missing topic. Brief the move (short), then suggest_practice. If they asked for an exam, pass mode exam.",
    );
  } else if (context.priorClarify && context.pendingKind === "path") {
    sections.push("The user already asked to plan. This message is the missing course. Brief once, then suggest_path.");
  } else if (context.priorClarify && context.pendingKind === "images") {
    sections.push(
      "The user already asked for photos. This message is the topic. Call search_images. Write one short line in their language. Do not invent URLs. Do not dump a link list.",
    );
  }

  if (isFormWriteTopic(context.prompt, context.projectTitle, context.pathTopic, context.pendingTopic)) {
    sections.push(
      "Form-writing this turn (განცხადება / official letter). Do not call suggest_practice. If they don't know how or asked for an example: a paper fence with sample filled in (real names). If they asked to try: an empty paper. Not a placeholder table.",
    );
  }

  if (context.hintAsk) {
    sections.push(
      "HINT TURN. They asked for a nudge on the current check. One or two short sentences pointing at the rule or form. NEVER give the answer. NEVER fill the blank. NEVER complete the sentence. NEVER say which option is right. Do not re-teach. Do not pass question. Do not call any path, notes, or practice tool.",
    );
  } else if (context.replyTo) {
    sections.push(
      `They are answering this practice question:\n${context.replyTo}\nSay whether the answer holds, in their language, in a few sentences. Do not ask another question.`,
    );
  } else if (context.examAsk) {
    sections.push(
      "EXPLICIT CHAT EXERCISE. They asked to answer one question. Choose it using the conversation and materials, pass it in `question`, and wait. Do not reveal the solution before they try. Assess the reply from context, accept any valid wording, and do not start another question unasked. Do not call advance_path.",
    );
  } else if (context.path) {
    sections.push(
      formatPathBriefing({
        ...context.path,
        started: context.path.started !== false,
        teach: context.path.teach || context.path.outcome || "",
        inPathThread: context.inPathThread === true || context.path.inPathThread === true,
      }),
    );
  }

  const tobyCards = tobyCardsForTurn(context);
  if (tobyCards) sections.push(tobyCards);

  return withAskWritingContract(sections.join("\n\n"));
}
