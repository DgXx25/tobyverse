export type EffectivePlanId = "free_beta" | "lite" | "pro" | "max" | "team" | "admin";

export type AiCallUsage = {
  provider: "gemini" | "anthropic";
  model: string;
  modelVersion?: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
};

export type AiModelUsage = { requestCount: number; costMicros: number };

export type AiUsageDelta = Omit<AiCallUsage, "provider" | "model" | "modelVersion"> & {
  requestCount: number;
  costMicros: number;
  byModel: Record<string, AiModelUsage>;
  pricingVersion: string;
};

export type AiUsageWeek = AiUsageDelta & { weekStart: string; updatedAt: string | null };

export type AiUsageReporter = (usage: AiCallUsage) => void;
