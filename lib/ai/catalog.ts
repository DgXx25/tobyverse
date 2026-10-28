import type { EffectivePlanId } from "@/types/billing";

export const AI_PROVIDER_OPTIONS = [
  {
    id: "anthropic",
    name: "Anthropic Claude",
    model: "claude-haiku-5-5",
    enabled: true,
    note: null,
  },
  {
    id: "gemini",
    name: "Gemini",
    model: "gemini-3.5-flash",
    enabled: false,
    note: "temporarily disabled",
  },
  {
    id: "grok",
    name: "Grok",
    model: "grok-4",
    enabled: false,
    note: "add key later",
  },
  {
    id: "gpt",
    name: "GPT",
    model: "gpt-5",
    enabled: false,
    note: "add key later",
  },
] as const;

export type AiProviderId = (typeof AI_PROVIDER_OPTIONS)[number]["id"];
export type AiProviderOption = (typeof AI_PROVIDER_OPTIONS)[number];

export const DEFAULT_AI_PROVIDER: AiProviderId = "anthropic";

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash" as const;
export const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5" as const;
export const DEFAULT_MODEL_SELECTION = "auto" as const;

/** Only chat models currently enabled in the user-facing picker. */
export const AI_MODEL_OPTIONS = [
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", paidOnly: false },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", paidOnly: true },
] as const;

export type AiModelId = (typeof AI_MODEL_OPTIONS)[number]["id"];
export type AiModelOption = (typeof AI_MODEL_OPTIONS)[number];
export type AiModelSelection = AiModelId | typeof DEFAULT_MODEL_SELECTION;
export type AiModelSelectionOption = AiModelOption | { id: "auto"; name: "Auto"; paidOnly: false };
const AUTO_MODEL_OPTION: AiModelSelectionOption = { id: "auto", name: "Auto", paidOnly: false };

const KNOWN_MODEL_IDS = new Set<string>(AI_MODEL_OPTIONS.map((item) => item.id));
const PREMIUM_MODEL_IDS = new Set<string>(AI_MODEL_OPTIONS.filter((item) => item.paidOnly).map((item) => item.id));

function hasPaidModelAccess(planOrAdmin: EffectivePlanId | boolean): boolean {
  if (typeof planOrAdmin === "boolean") return planOrAdmin;
  return planOrAdmin === "pro" || planOrAdmin === "max" || planOrAdmin === "team" || planOrAdmin === "admin";
}

export function isKnownAiModel(id: string): id is AiModelId {
  return KNOWN_MODEL_IDS.has(id);
}

export function isAllowedAiModel(id: string, planOrAdmin: EffectivePlanId | boolean): id is AiModelId {
  return isKnownAiModel(id) && (hasPaidModelAccess(planOrAdmin) || !PREMIUM_MODEL_IDS.has(id));
}

export function isPaidOnlyAiModel(id: string): boolean {
  return PREMIUM_MODEL_IDS.has(id);
}

export const isAdminOnlyAiModel = isPaidOnlyAiModel;

export function availableAiModels(planOrAdmin: EffectivePlanId | boolean): AiModelSelectionOption[] {
  return [AUTO_MODEL_OPTION, ...AI_MODEL_OPTIONS]
    .filter((item) => !item.paidOnly || hasPaidModelAccess(planOrAdmin));
}

export function availableModelSelections(planOrAdmin: EffectivePlanId | boolean): AiModelSelectionOption[] {
  return availableAiModels(planOrAdmin);
}

export function isKnownModelSelection(id: string): id is AiModelSelection {
  return id === "auto" || isKnownAiModel(id);
}

export function isAllowedModelSelection(id: string, planOrAdmin: EffectivePlanId | boolean): id is AiModelSelection {
  return id === "auto" || isAllowedAiModel(id, planOrAdmin);
}

export function parsePreferredModel(value: unknown): AiModelSelection | null {
  if (typeof value !== "string") return null;
  if (value.startsWith("gemini-")) return "auto";
  return isKnownModelSelection(value) ? value : null;
}

export function resolveAiModel(id: string | null | undefined, planOrAdmin: EffectivePlanId | boolean): AiModelSelection {
  if (id && isAllowedModelSelection(id, planOrAdmin)) return id;
  return DEFAULT_MODEL_SELECTION;
}

export function aiModelDisplayName(id: AiModelSelection): string {
  if (id === "auto") return "Auto";
  return AI_MODEL_OPTIONS.find((item) => item.id === id)?.name ?? "Auto";
}

const KNOWN_IDS = new Set<string>(AI_PROVIDER_OPTIONS.map((item) => item.id));

export function isKnownProvider(id: string): id is AiProviderId {
  return KNOWN_IDS.has(id);
}

export function isEnabledProvider(id: string): boolean {
  return AI_PROVIDER_OPTIONS.some((item) => item.id === id && item.enabled);
}

/** Models the picker may show. Model IDs also identify their provider at runtime. */
export function availableAiProviders(): AiProviderOption[] {
  return AI_PROVIDER_OPTIONS.filter((item) => item.enabled);
}

export function resolveAiProvider(id: string | null | undefined): AiProviderId {
  if (id && isEnabledProvider(id)) return id as AiProviderId;
  return DEFAULT_AI_PROVIDER;
}

export function providerDisplayName(id: AiProviderId): string {
  return AI_PROVIDER_OPTIONS.find((item) => item.id === id)?.name ?? "Anthropic Claude";
}

