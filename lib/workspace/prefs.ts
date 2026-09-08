import type { ChatMode } from "@/types/chat";
import type { ProjectTabId } from "@/lib/core/constants";
import { DEFAULT_AI_PROVIDER, isEnabledProvider, type AiProviderId } from "@/lib/ai/catalog";
import {
  DEFAULT_COMPOSER_INTENT,
  isComposerIntent,
  type ComposerIntent,
} from "@/lib/composer/intent";

export type WorkspacePrefs = {
  tab: ProjectTabId;
  mode: ChatMode;
  intent: ComposerIntent;
  model: AiProviderId;
  useMaterials: boolean;
  selectedMaterialIds: string[];
  contextOpen: boolean;
  artifactWidth: number;
};

const TABS: ProjectTabId[] = ["chat", "materials", "sheets", "exercises", "settings"];

function key(projectId: string) {
  return `tv.workspace.${projectId}`;
}

export function defaultWorkspacePrefs(mode: ChatMode = "normal"): WorkspacePrefs {
  return {
    tab: "chat",
    mode,
    intent: DEFAULT_COMPOSER_INTENT,
    model: DEFAULT_AI_PROVIDER,
    useMaterials: true,
    selectedMaterialIds: [],
    contextOpen: false,
    artifactWidth: 420,
  };
}

export function loadWorkspacePrefs(projectId: string, mode: ChatMode): WorkspacePrefs {
  const fallback = defaultWorkspacePrefs(mode);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key(projectId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<WorkspacePrefs>;
    const width = typeof parsed.artifactWidth === "number" ? parsed.artifactWidth : 420;
    return {
      tab: TABS.includes(parsed.tab as ProjectTabId) ? (parsed.tab as ProjectTabId) : "chat",
      mode: parsed.mode === "socratic" ? "socratic" : parsed.mode === "normal" ? "normal" : mode,
      intent: isComposerIntent(parsed.intent) ? parsed.intent : DEFAULT_COMPOSER_INTENT,
      model: isEnabledProvider(String(parsed.model)) ? (parsed.model as AiProviderId) : DEFAULT_AI_PROVIDER,
      useMaterials: parsed.useMaterials !== false,
      selectedMaterialIds: Array.isArray(parsed.selectedMaterialIds)
        ? parsed.selectedMaterialIds.filter((item): item is string => typeof item === "string")
        : [],
      contextOpen: false,
      artifactWidth: Math.min(900, Math.max(400, width)),
    };
  } catch {
    return fallback;
  }
}

export function saveWorkspacePrefs(projectId: string, prefs: WorkspacePrefs): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(projectId), JSON.stringify(prefs));
}
