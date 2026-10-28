import type { AiCallUsage, AiUsageDelta, AiUsageWeek } from "@/types/billing";

type ModelPrice = {
  inputMicrosPerMillion: number;
  outputMicrosPerMillion: number;
  version: string;
  largePromptThreshold?: number;
  inputMicrosPerMillionAboveThreshold?: number;
  outputMicrosPerMillionAboveThreshold?: number;
  nextRate?: { startsAt: string; inputMicrosPerMillion: number; outputMicrosPerMillion: number; version: string };
};

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // Retained so legacy usage entries can still be interpreted; this model is no longer selectable or used.
  "gemini-2.5-flash": {
    inputMicrosPerMillion: 300_000,
    outputMicrosPerMillion: 2_500_000,
    version: "gemini-2026-09-23",
  },
  "gemini-3.1-flash-lite": {
    inputMicrosPerMillion: 250_000,
    outputMicrosPerMillion: 1_500_000,
    version: "gemini-2026-09-26",
  },
  "gemini-3.5-flash-lite": {
    inputMicrosPerMillion: 300_000,
    outputMicrosPerMillion: 2_500_000,
    version: "gemini-2026-09-26",
  },
  "gemini-3.1-pro-preview": {
    inputMicrosPerMillion: 2_000_000,
    outputMicrosPerMillion: 12_000_000,
    largePromptThreshold: 200_000,
    inputMicrosPerMillionAboveThreshold: 4_000_000,
    outputMicrosPerMillionAboveThreshold: 18_000_000,
    version: "gemini-2026-09-26",
  },
  "gemini-3.5-flash": {
    inputMicrosPerMillion: 1_500_000,
    outputMicrosPerMillion: 9_000_000,
    version: "gemini-2026-10-28",
  },
  "gemini-4-argon": {
    inputMicrosPerMillion: 2_000_000,
    outputMicrosPerMillion: 10_000_000,
    version: "gemini-argon-intro-2026-10-28",
    nextRate: {
      startsAt: "2026-12-01T00:00:00.000Z",
      inputMicrosPerMillion: 4_000_000,
      outputMicrosPerMillion: 20_000_000,
      version: "gemini-argon-2026-12-01",
    },
  },
  // Anthropic API list rates effective at the current Claude 5.5 model launch.
  "claude-haiku-5-5": {
    inputMicrosPerMillion: 100_000,
    outputMicrosPerMillion: 500_000,
    largePromptThreshold: 100_000,
    inputMicrosPerMillionAboveThreshold: 500_000,
    outputMicrosPerMillionAboveThreshold: 2_500_000,
    version: "anthropic-2026-10-claude-5.5",
  },
  "claude-sonnet-5-5": {
    inputMicrosPerMillion: 2_000_000,
    outputMicrosPerMillion: 10_000_000,
    version: "anthropic-2026-10-claude-5.5",
  },
};

export class UnknownModelPriceError extends Error {
  readonly model: string;

  constructor(model: string) {
    super(`No AI price configured for model ${model}`);
    this.name = "UnknownModelPriceError";
    this.model = model;
  }
}

export function emptyAiUsageDelta(): AiUsageDelta {
  return {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    totalTokens: 0,
    requestCount: 0,
    costMicros: 0,
    byModel: {},
    pricingVersion: "gemini-2026-09-26",
  };
}

export function emptyAiUsageWeek(weekStart: string): AiUsageWeek {
  return { ...emptyAiUsageDelta(), weekStart, updatedAt: null };
}

export function priceAiCall(call: AiCallUsage, now = new Date()): AiUsageDelta {
  const configuredRate = MODEL_PRICES[call.model];
  if (!configuredRate) throw new UnknownModelPriceError(call.model);
  const nextRate = configuredRate.nextRate;
  const rate: ModelPrice = nextRate && now >= new Date(nextRate.startsAt)
    ? { ...configuredRate, ...nextRate }
    : configuredRate;
  const largePrompt = rate.largePromptThreshold !== undefined && call.inputTokens > rate.largePromptThreshold;
  const inputRate = largePrompt ? rate.inputMicrosPerMillionAboveThreshold ?? rate.inputMicrosPerMillion : rate.inputMicrosPerMillion;
  const outputRate = largePrompt ? rate.outputMicrosPerMillionAboveThreshold ?? rate.outputMicrosPerMillion : rate.outputMicrosPerMillion;
  const numerator = call.inputTokens * inputRate
    + (call.outputTokens + call.thinkingTokens) * outputRate;
  const costMicros = Math.ceil(numerator / 1_000_000);
  return {
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    thinkingTokens: call.thinkingTokens,
    totalTokens: call.totalTokens,
    requestCount: 1,
    costMicros,
    byModel: { [call.model]: { requestCount: 1, costMicros } },
    pricingVersion: rate.version,
  };
}

export function unpricedAiCall(call: AiCallUsage): AiUsageDelta {
  return {
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    thinkingTokens: call.thinkingTokens,
    totalTokens: call.totalTokens,
    requestCount: 1,
    costMicros: 0,
    byModel: { [call.model]: { requestCount: 1, costMicros: 0 } },
    pricingVersion: "unpriced",
  };
}

export function mergeAiUsageDelta(base: AiUsageDelta, delta: AiUsageDelta): AiUsageDelta {
  const byModel = { ...base.byModel };
  for (const [model, usage] of Object.entries(delta.byModel)) {
    const previous = byModel[model] ?? { requestCount: 0, costMicros: 0 };
    byModel[model] = {
      requestCount: previous.requestCount + usage.requestCount,
      costMicros: previous.costMicros + usage.costMicros,
    };
  }
  return {
    inputTokens: base.inputTokens + delta.inputTokens,
    outputTokens: base.outputTokens + delta.outputTokens,
    thinkingTokens: base.thinkingTokens + delta.thinkingTokens,
    totalTokens: base.totalTokens + delta.totalTokens,
    requestCount: base.requestCount + delta.requestCount,
    costMicros: base.costMicros + delta.costMicros,
    byModel,
    pricingVersion: base.pricingVersion === delta.pricingVersion ? base.pricingVersion : "mixed",
  };
}

export function mergeAiUsage(base: AiUsageWeek, delta: AiUsageDelta): AiUsageWeek {
  return { ...mergeAiUsageDelta(base, delta), weekStart: base.weekStart, updatedAt: base.updatedAt };
}
