import type { AiCallUsage, AiUsageDelta, AiUsageWeek } from "@/types/billing";

type ModelPrice = {
  inputMicrosPerMillion: number;
  outputMicrosPerMillion: number;
  version: string;
  cacheReadMultiplier?: number;
  largePromptThreshold?: number;
  inputMicrosPerMillionAboveThreshold?: number;
  outputMicrosPerMillionAboveThreshold?: number;
  nextRate?: { startsAt: string; inputMicrosPerMillion: number; outputMicrosPerMillion: number; version: string };
};

// Anthropic charges $10 / 1,000 web searches, in addition to model tokens.
const ANTHROPIC_WEB_SEARCH_MICROS_PER_REQUEST = 10_000;

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
    cacheReadMultiplier: 0.05,
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
    cacheReadMultiplier: 0.1,
    inputMicrosPerMillion: 100_000,
    outputMicrosPerMillion: 500_000,
    largePromptThreshold: 100_000,
    inputMicrosPerMillionAboveThreshold: 500_000,
    outputMicrosPerMillionAboveThreshold: 2_500_000,
    version: "anthropic-2026-10-claude-5.5",
  },
  "claude-sonnet-5-5": {
    cacheReadMultiplier: 0.05,
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
    cacheReadInputTokens: 0,
    cacheWriteInputTokens: 0,
    cacheWrite1hInputTokens: 0,
    webSearchRequests: 0,
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
  const cache = cacheCounts(call);
  // inputTokens is the total context. Cached subsets replace the base input
  // charge; they must never be billed as both regular input and cached input.
  const regularInput = call.inputTokens - cache.cacheReadInputTokens - cache.cacheWriteInputTokens;
  const numerator = (call.provider === "anthropic"
    ? regularInput + cache.cacheReadInputTokens * (rate.cacheReadMultiplier ?? 0.1)
      + (cache.cacheWriteInputTokens - cache.cacheWrite1hInputTokens) * 1.25
      + cache.cacheWrite1hInputTokens * 2
    : regularInput + cache.cacheReadInputTokens * (rate.cacheReadMultiplier ?? 0.1) + cache.cacheWriteInputTokens) * inputRate
    + (call.outputTokens + call.thinkingTokens) * outputRate;
  const webSearchRequests = Math.max(0, Math.floor(call.webSearchRequests ?? 0));
  const costMicros = Math.ceil(numerator / 1_000_000)
    + webSearchRequests * ANTHROPIC_WEB_SEARCH_MICROS_PER_REQUEST;
  return {
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    thinkingTokens: call.thinkingTokens,
    totalTokens: call.totalTokens,
    ...cache,
    webSearchRequests,
    requestCount: 1,
    costMicros,
    byModel: { [call.model]: { requestCount: 1, costMicros, webSearchRequests } },
    pricingVersion: [rate.version,
      ...(cache.cacheReadInputTokens || cache.cacheWriteInputTokens ? ["cache-2026-10"] : []),
      ...(webSearchRequests ? ["web-search-2026-10"] : []),
    ].join("+"),
  };
}

export function unpricedAiCall(call: AiCallUsage): AiUsageDelta {
  return {
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    thinkingTokens: call.thinkingTokens,
    totalTokens: call.totalTokens,
    ...cacheCounts(call),
    webSearchRequests: Math.max(0, Math.floor(call.webSearchRequests ?? 0)),
    requestCount: 1,
    costMicros: 0,
    byModel: { [call.model]: { requestCount: 1, costMicros: 0, webSearchRequests: Math.max(0, Math.floor(call.webSearchRequests ?? 0)) } },
    pricingVersion: "unpriced",
  };
}

export function mergeAiUsageDelta(base: AiUsageDelta, delta: AiUsageDelta): AiUsageDelta {
  const byModel = { ...base.byModel };
  for (const [model, usage] of Object.entries(delta.byModel)) {
    const previous = byModel[model] ?? { requestCount: 0, costMicros: 0, webSearchRequests: 0 };
    byModel[model] = {
      requestCount: previous.requestCount + usage.requestCount,
      costMicros: previous.costMicros + usage.costMicros,
      webSearchRequests: (previous.webSearchRequests ?? 0) + (usage.webSearchRequests ?? 0),
    };
  }
  return {
    inputTokens: base.inputTokens + delta.inputTokens,
    outputTokens: base.outputTokens + delta.outputTokens,
    thinkingTokens: base.thinkingTokens + delta.thinkingTokens,
    totalTokens: base.totalTokens + delta.totalTokens,
    cacheReadInputTokens: (base.cacheReadInputTokens ?? 0) + (delta.cacheReadInputTokens ?? 0),
    cacheWriteInputTokens: (base.cacheWriteInputTokens ?? 0) + (delta.cacheWriteInputTokens ?? 0),
    cacheWrite1hInputTokens: (base.cacheWrite1hInputTokens ?? 0) + (delta.cacheWrite1hInputTokens ?? 0),
    webSearchRequests: base.webSearchRequests + delta.webSearchRequests,
    requestCount: base.requestCount + delta.requestCount,
    costMicros: base.costMicros + delta.costMicros,
    byModel,
    pricingVersion: base.pricingVersion === delta.pricingVersion ? base.pricingVersion : "mixed",
  };
}

function cacheCounts(call: AiCallUsage) {
  const count = (n?: number) => Number.isFinite(n) ? Math.max(0, Math.floor(n!)) : 0;
  const cacheReadInputTokens = Math.min(call.inputTokens, count(call.cacheReadInputTokens));
  const cacheWriteInputTokens = Math.min(call.inputTokens - cacheReadInputTokens, count(call.cacheWriteInputTokens));
  return { cacheReadInputTokens, cacheWriteInputTokens,
    cacheWrite1hInputTokens: Math.min(cacheWriteInputTokens, count(call.cacheWrite1hInputTokens)) };
}

export function mergeAiUsage(base: AiUsageWeek, delta: AiUsageDelta): AiUsageWeek {
  return { ...mergeAiUsageDelta(base, delta), weekStart: base.weekStart, updatedAt: base.updatedAt };
}
