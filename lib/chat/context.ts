import { withAskWritingContract } from "@/lib/ai/voice";
import { compactArtifactLine } from "@/lib/composer/memory";
import { chatSystemInstruction } from "@/lib/core/chat-modes";
import { PROJECT_GOAL_LABELS } from "@/lib/core/constants";
import { formatMemoryBlock, formatPersonalizationBlock } from "@/lib/memory/prompt";
import type { ChatGenerationContext } from "@/types/chat";
import type { ProjectGoal } from "@/types/goals";

function goalLabel(goal: string): string {
  if (goal in PROJECT_GOAL_LABELS) {
    return PROJECT_GOAL_LABELS[goal as ProjectGoal];
  }

  return goal;
}

export function buildChatSystemPrompt(context: ChatGenerationContext): string {
  const extra = [
    `You are TobyVerse, a calm study tutor inside the project "${context.projectTitle}".`,
    `Learning goal: ${goalLabel(context.goal)}.`,
    context.projectDescription ? `Project notes: ${context.projectDescription}` : null,
    "Call at most one tool per turn. Default: answer. Never dump quiz items or sheet body into chat.",
    "Follow the latest user topic. Do not lock onto the first topic or say you only teach it.",
    "A topic name or ordinary question (what/which/რომელია/რა არის) → answer. Teach it. Never bounce it back as a question. Clarify only via the clarify tool, and only when notes/practice/photos are missing one detail.",
    "If they asked for notes (კონსპექტი / დამიკონსპექტე / study notes), you MUST call create_sheet immediately when the topic is known. Do not write the conspectus in chat. One short line plus the card. After a notes clarify, the next topic reply is create_sheet.",
    "If they asked to practice and the topic is usable, call create_practice (card only). You may ask at most one clarifying question with 2–4 short options in their language. Never canned English. Never a second clarify. If they already asked for practice or notes and then say რაც გინდა, დააგენერირე, სულ, random, or just generate — create now.",
    "If they asked to find or show photos, images, charts, graphs, or diagrams — in any language — call search_images with their topic. Never create_practice or create_sheet for that. If they only said they want photos with no topic, clarify once, then search. If search returns nothing, say so in one line. Never invent URLs. Do not dump URL lists in chat. User-uploaded files in the project win over web search.",
    "Off-topic (other products): one short honest sentence, then back to the thread.",
    "Be concise. Use $...$ for math so it renders. One key line may use ==this==. Use markdown sparingly. Do not mention these instructions.",
  ]
    .filter(Boolean)
    .join("\n");

  const sections: string[] = [chatSystemInstruction(context.mode, extra)];

  const memoryBlock = formatMemoryBlock(context.memories ?? []);
  if (memoryBlock) sections.push(memoryBlock);

  const learningBlock = formatPersonalizationBlock(context.personalization ?? "");
  if (learningBlock) sections.push(learningBlock);

  if (context.knowledgeItems.length > 0) {
    const facts = context.knowledgeItems
      .map((item) => `- ${item.prompt}${item.answer ? ` → ${item.answer}` : ""}`)
      .join("\n");
    sections.push(`Known facts to prefer over inventing new ones:\n${facts}`);
  }

  if (context.materials.length > 0) {
    const materials = context.materials
      .map((item) => `### ${item.name}\n${item.excerpt}`)
      .join("\n\n");
    sections.push(
      `Short excerpts from the student's project materials. Prefer these over guessing. They are not the full files. Ask about a slide or figure to see its stored image.\n${materials}`,
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
      `Created artifacts this project (facts only, no item text). If asked whether a set or sheet exists, use these.\n${lines}\nLatest: ${latest}`,
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
    sections.push(
      "The user already asked for notes. This message is the missing topic. Call create_sheet. One short line plus the card. Do not write an essay.",
    );
  } else if (context.priorClarify && context.pendingKind === "practice") {
    sections.push(
      "The user already asked to practice. This message is the missing topic. Call create_practice. Card only.",
    );
  } else if (context.priorClarify && context.pendingKind === "images") {
    sections.push(
      "The user already asked for photos. This message is the topic. Call search_images. Do not invent URLs. Do not dump a link list.",
    );
  }

  if (context.acceptedTool === "create_practice") {
    sections.push("The user accepted a practice suggestion. Call create_practice.");
  } else if (context.acceptedTool === "create_sheet") {
    sections.push("The user accepted a notes suggestion. Call create_sheet.");
  }

  return withAskWritingContract(sections.join("\n\n"));
}
