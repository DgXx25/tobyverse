export const AI_PROVIDER_OPTIONS = [
  {
    id: "gemini",
    name: "Gemini",
    model: "gemini-3.1-flash-lite",
    enabled: true,
    note: null,
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

export const DEFAULT_AI_PROVIDER: AiProviderId = "gemini";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite" as const;

export const GEMINI_MODEL_OPTIONS = [
  { id: DEFAULT_GEMINI_MODEL, name: "Gemini 3.1 Flash", adminOnly: false },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", adminOnly: true },
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash", adminOnly: true },
] as const;

export type AiModelId = (typeof GEMINI_MODEL_OPTIONS)[number]["id"];
export type AiModelOption = (typeof GEMINI_MODEL_OPTIONS)[number];

const KNOWN_MODEL_IDS = new Set<string>(GEMINI_MODEL_OPTIONS.map((item) => item.id));
const ADMIN_MODEL_IDS = new Set<string>(GEMINI_MODEL_OPTIONS.filter((item) => item.adminOnly).map((item) => item.id));

export function isKnownAiModel(id: string): id is AiModelId {
  return KNOWN_MODEL_IDS.has(id);
}

export function isAllowedAiModel(id: string, isAdmin: boolean): id is AiModelId {
  return isKnownAiModel(id) && (isAdmin || !ADMIN_MODEL_IDS.has(id));
}

export function isAdminOnlyAiModel(id: string): boolean {
  return ADMIN_MODEL_IDS.has(id);
}

export function availableAiModels(isAdmin: boolean): AiModelOption[] {
  return GEMINI_MODEL_OPTIONS.filter((item) => isAdmin || !item.adminOnly);
}

export function parsePreferredModel(value: unknown): AiModelId | null {
  return typeof value === "string" && isKnownAiModel(value) ? value : null;
}

export function resolveAiModel(id: string | null | undefined, isAdmin: boolean): AiModelId {
  if (id && isAllowedAiModel(id, isAdmin)) return id;
  return DEFAULT_GEMINI_MODEL;
}

export function aiModelDisplayName(id: AiModelId): string {
  return GEMINI_MODEL_OPTIONS.find((item) => item.id === id)?.name ?? "Gemini 3.1 Flash-Lite";
}

const KNOWN_IDS = new Set<string>(AI_PROVIDER_OPTIONS.map((item) => item.id));

export function isKnownProvider(id: string): id is AiProviderId {
  return KNOWN_IDS.has(id);
}

export function isEnabledProvider(id: string): boolean {
  return AI_PROVIDER_OPTIONS.some((item) => item.id === id && item.enabled);
}

/** Models the picker may show. Flip `enabled` to add Grok or GPT later. */
export function availableAiProviders(): AiProviderOption[] {
  return AI_PROVIDER_OPTIONS.filter((item) => item.enabled);
}

export function resolveAiProvider(id: string | null | undefined): AiProviderId {
  if (id && isEnabledProvider(id)) return id as AiProviderId;
  return DEFAULT_AI_PROVIDER;
}

export function providerDisplayName(id: AiProviderId): string {
  return AI_PROVIDER_OPTIONS.find((item) => item.id === id)?.name ?? "Gemini";
}
