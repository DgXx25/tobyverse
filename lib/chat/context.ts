import { assembleChatSystemPrompt } from "@/lib/chat/system-prompt";
import { isActivePathThread } from "@/lib/chat/path-context";
import { tobyCardsForTurn } from "@/lib/blocks/match";
import { compactArtifactLine } from "@/lib/composer/memory";
import { DEFAULT_PROJECT_GOAL, PROJECT_GOAL_LABELS } from "@/lib/core/constants";
import { isFormWriteTopic } from "@/lib/exercises/plan";
import { MATERIALS_BASIS, formatSourcesBlock } from "@/lib/rag/sources";
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

function showProjectGoal(context: ChatGenerationContext): boolean {
  const goal = context.goal.trim();
  if (!goal || goal === DEFAULT_PROJECT_GOAL) return false;
  return true;
}

export function buildChatSystemPrompt(context: ChatGenerationContext): string {
  const activePath = isActivePathThread(context) ? context.path : null;
  const project = [
    context.projectTitle.trim() ? `Project: ${context.projectTitle}.` : null,
    showProjectGoal(context) ? `Project goal (background): ${goalLabel(context.goal)}.` : null,
    context.projectDescription ? `Project notes: ${context.projectDescription}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const sections: string[] = [];
  const materials: string[] = [];
  const memory: string[] = [];
  const known = formatKnownUserBlock({
    memories: pickMemoriesForAsk(context.memories ?? [], context.prompt ?? ""),
  });
  if (known) memory.push(known);

  if (context.knowledgeItems.length > 0) {
    const facts = context.knowledgeItems
      .map((item) => `- ${item.prompt}${item.answer ? ` → ${item.answer}` : ""}`)
      .join("\n");
    sections.push(`Known facts to prefer over inventing new ones:\n${facts}`);
  }

  const sourcesBlock = formatSourcesBlock(context.sources ?? []);
  if (sourcesBlock) materials.push(sourcesBlock);

  const skillBlock = formatSkillBlock(
    detectSubjectSkill({
      prompt: context.prompt,
      projectTitle: context.projectTitle,
      materialNames: [...context.materials.map((item) => item.name), ...(context.sources ?? []).map((item) => item.title)],
      sourceText: sourcesBlock
        ? (context.sources ?? []).map((item) => item.text).join("\n")
        : context.materials.map((item) => item.excerpt).join("\n"),
    }),
  );
  if (!sourcesBlock && context.materials.length > 0) {
    const excerpts = context.materials
      .map((item) => `### ${item.name}\n${item.excerpt}`)
      .join("\n\n");
    materials.push(
      `${MATERIALS_BASIS}\n\n${excerpts}`,
    );
  }

  if (context.figures && context.figures.length > 0) {
    const names = context.figures.map((item) => `${item.name} (${item.path || `slide ${item.page}`})`).join("; ");
    if (materials.length === 0) materials.push(MATERIALS_BASIS);
    materials.push(`Attached figure(s): ${names}.`);
  }

  if (context.linkedPages?.length) {
    materials.push(`Linked pages supplied in this turn (reference data):\n\n${context.linkedPages.map((page) => `### ${page.title}\n${page.url}\n${page.text}`).join("\n\n")}`);
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
    if (active.noteKind === "note") {
      sections.push(`Active plain note (use edit_note with the requested instruction; the tool loads the complete saved note and preserves untouched wording):\n${JSON.stringify({ id: active.id, title: active.title })}`);
    }
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
      "The user already asked for photos. This message supplies the topic. Call search_images, then introduce the images briefly and answer their request. The gallery displays results separately.",
    );
  }

  if (isFormWriteTopic(context.prompt)) {
    sections.push(
      "Form-writing context for the current request. If you choose a paper block, use a filled sample for a requested example or an empty sheet when they ask to try. The paper's built-in check handles form practice; use its listed schema rather than a practice set. Choose prose instead when it better serves the request.",
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
  }

  const tobyCards = tobyCardsForTurn(context);
  if (tobyCards) sections.push(tobyCards);

  return assembleChatSystemPrompt({
    project,
    subject: skillBlock,
    path: activePath ? formatPathBriefing({
      ...activePath,
      teach: activePath.teach || activePath.outcome || "",
      started: true,
      inPathThread: true,
    }) : null,
    memory: memory.join("\n\n"),
    turn: sections.join("\n\n"),
    materials: materials.join("\n\n"),
  });
}
