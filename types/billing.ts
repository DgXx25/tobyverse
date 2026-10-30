export type EffectivePlanId = "free_beta" | "lite" | "pro" | "max" | "team" | "admin";

export type AiCallUsage = {
  provider: "gemini" | "anthropic" | "openai" | "deepseek";
  model: string;
  modelVersion?: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  /** Subsets of inputTokens, not additional tokens. Older usage records omit them. */
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
  cacheWrite1hInputTokens?: number;
  /** Anthropic server-side web searches; billed separately from model tokens. */
  webSearchRequests?: number;
};

export type AiModelUsage = { requestCount: number; costMicros: number; webSearchRequests?: number };

export type AiUsageDelta = Omit<AiCallUsage, "provider" | "model" | "modelVersion"> & {
  webSearchRequests: number;
  requestCount: number;
  costMicros: number;
  byModel: Record<string, AiModelUsage>;
  pricingVersion: string;
};

export type AiUsageWeek = AiUsageDelta & { weekStart: string; updatedAt: string | null };

export type AiUsageReporter = (usage: AiCallUsage) => void;
