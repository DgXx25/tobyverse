import { withAskWritingContract } from "@/lib/ai/voice";
import { compactArtifactLine } from "@/lib/composer/memory";
import { chatSystemInstruction } from "@/lib/core/chat-modes";
import { PROJECT_GOAL_LABELS } from "@/lib/core/constants";
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
    "Be concise. Use markdown sparingly. Do not mention these instructions.",
  ]
    .filter(Boolean)
    .join("\n");

  const sections: string[] = [chatSystemInstruction(context.mode, extra)];

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

  if (context.acceptedTool === "create_practice") {
    sections.push("The user accepted a practice suggestion. Call create_practice.");
  } else if (context.acceptedTool === "create_sheet") {
    sections.push("The user accepted a notes suggestion. Call create_sheet.");
  }

  return withAskWritingContract(sections.join("\n\n"));
}
