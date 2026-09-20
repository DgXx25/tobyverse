import { CHAT_MODE_LABELS } from "@/lib/core/constants";
import { asChatMode } from "@/lib/core/chat-modes";
import type { ChatMode } from "@/types/chat";
import type { AcceptedChatTool } from "@/types/chat";
import type { ComposerIntent } from "@/lib/composer/intent";

export const COMPOSER_SKILLS = ["practice", "notes", "path", "photos"] as const;

export type ComposerSkill = (typeof COMPOSER_SKILLS)[number];

export type SlashKind = "mode" | "skill";

export type SlashItem = {
  kind: SlashKind;
  id: string;
  command: string;
  label: string;
  hint: string;
  icon: "spark" | "zap" | "book" | "practice" | "notes" | "plan" | "search";
};

export const SLASH_MODES: SlashItem[] = [
  { kind: "mode", id: "auto", command: "auto", label: CHAT_MODE_LABELS.auto, hint: "Match the request", icon: "spark" },
  { kind: "mode", id: "fast", command: "fast", label: CHAT_MODE_LABELS.fast, hint: "Short, direct replies", icon: "zap" },
  { kind: "mode", id: "teacher", command: "teacher", label: CHAT_MODE_LABELS.teacher, hint: "A demanding mentor", icon: "book" },
];

export const SLASH_SKILLS: SlashItem[] = [
  { kind: "skill", id: "practice", command: "practice", label: "Practice", hint: "Make a practice set", icon: "practice" },
  { kind: "skill", id: "notes", command: "notes", label: "Notes", hint: "Write study notes", icon: "notes" },
  { kind: "skill", id: "path", command: "path", label: "Path", hint: "Map a course", icon: "plan" },
  { kind: "skill", id: "photos", command: "photos", label: "Photos", hint: "Find photos", icon: "search" },
];

export const COMPOSER_SKILL_META: Record<
  ComposerSkill,
  { label: string; placeholder: string; intent: ComposerIntent; icon: "practice" | "notes" | "plan" | "search" }
> = {
  practice: { label: "Practice", placeholder: "What should I practice?", intent: "practice", icon: "practice" },
  notes: { label: "Notes", placeholder: "What should I take notes on?", intent: "study", icon: "notes" },
  path: { label: "Path", placeholder: "Which course should I map?", intent: "plan", icon: "plan" },
  photos: { label: "Photos", placeholder: "What should I search photos of?", intent: "ask", icon: "search" },
};

export function isComposerSkill(value: unknown): value is ComposerSkill {
  return typeof value === "string" && (COMPOSER_SKILLS as readonly string[]).includes(value);
}

export function acceptedToolFromSkill(skill?: ComposerSkill | null): AcceptedChatTool | undefined {
  if (skill === "practice") return "create_practice";
  if (skill === "notes") return "create_sheet";
  if (skill === "path") return "create_path";
  if (skill === "photos") return "search_images";
  return undefined;
}

export function skillFromIntent(intent?: ComposerIntent | null): ComposerSkill | null {
  if (intent === "practice") return "practice";
  if (intent === "study") return "notes";
  if (intent === "plan") return "path";
  return null;
}

export function parseSlashQuery(draft: string): string | null {
  if (!draft.startsWith("/")) return null;
  if (/\s/.test(draft) || draft.includes("\n")) return null;
  return draft.slice(1);
}

export function filterSlashItems(query: string, allowSkills: boolean): SlashItem[] {
  const needle = query.trim().toLowerCase();
  const items = allowSkills ? [...SLASH_MODES, ...SLASH_SKILLS] : [...SLASH_MODES];
  if (!needle) return items;
  return items.filter(
    (item) =>
      item.command.startsWith(needle) ||
      item.label.toLowerCase().startsWith(needle) ||
      item.hint.toLowerCase().includes(needle),
  );
}

export function consumeSlashCommand(draft: string): {
  mode?: ChatMode;
  skill?: ComposerSkill;
  prompt: string;
} {
  const text = draft.trim();
  const match = text.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
  if (!match) return { prompt: draft };
  const token = match[1].toLowerCase();
  const rest = (match[2] ?? "").trimStart();
  const modeItem = SLASH_MODES.find((item) => item.command === token || item.label.toLowerCase() === token);
  const skillItem = SLASH_SKILLS.find((item) => item.command === token || item.label.toLowerCase() === token);
  if (modeItem && isChatModeId(modeItem.id)) {
    return { mode: asChatMode(modeItem.id), prompt: rest };
  }
  if (skillItem && isComposerSkill(skillItem.id)) {
    return { skill: skillItem.id, prompt: rest };
  }
  return { prompt: draft };
}

function isChatModeId(value: string): value is ChatMode {
  return value === "auto" || value === "fast" || value === "teacher";
}
