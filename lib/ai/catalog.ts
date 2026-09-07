export const AI_PROVIDER_OPTIONS = [
  {
    id: "gemini",
    name: "Gemini",
    model: "gemini-2.5-flash",
    enabled: true,
    note: null,
  },
  {
    id: "openai",
    name: "OpenAI",
    model: "gpt-4o",
    enabled: false,
    note: "add key later",
  },
  {
    id: "claude",
    name: "Claude",
    model: "claude-sonnet-4",
    enabled: false,
    note: "add key later",
  },
] as const;

export type AiProviderId = (typeof AI_PROVIDER_OPTIONS)[number]["id"];

export const DEFAULT_AI_PROVIDER: AiProviderId = "gemini";

export function isEnabledProvider(id: string): boolean {
  return AI_PROVIDER_OPTIONS.some((item) => item.id === id && item.enabled);
}
