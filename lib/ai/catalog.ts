export const AI_PROVIDER_OPTIONS = [
  {
    id: "gemini",
    name: "Gemini",
    model: "gemini-2.5-flash",
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

export function parsePreferredModel(value: unknown): AiProviderId | null {
  return typeof value === "string" && isKnownProvider(value) ? value : null;
}

export function resolveAiProvider(id: string | null | undefined): AiProviderId {
  if (id && isEnabledProvider(id)) return id as AiProviderId;
  return DEFAULT_AI_PROVIDER;
}

export function providerDisplayName(id: AiProviderId): string {
  return AI_PROVIDER_OPTIONS.find((item) => item.id === id)?.name ?? "Gemini";
}
