import { DEFAULT_CLAUDE_MODEL, isAllowedAiModel, type AiModelId, type AiModelSelection } from "./catalog";

const DEFAULT_HAIKU_MODEL: AiModelId = DEFAULT_CLAUDE_MODEL;

export type ComplexityTier = "SIMPLE" | "COMPLEX";
export type RoutingMethod = "heuristic";
export type RoutingResult = {
  model: AiModelId;
  tier: ComplexityTier;
  score: number;
  method: RoutingMethod;
  signals: string[];
};

export type ComplexityScorerConfig = {
  complexThreshold: number;
  maxScoredCharacters: number;
  length: { medium: number; long: number; veryLong: number };
  reasoningMarkers: string[];
  multiStepMarkers: string[];
  codeMarkers: string[];
  technicalTerms: string[];
  simpleMarkers: string[];
  weights: { reasoning: number; multiStep: number; code: number; technical: number; long: number; veryLong: number; simple: number };
};

/** Edit these lists/weights to adjust automatic routing without touching request handling. */
export const DEFAULT_COMPLEXITY_CONFIG: ComplexityScorerConfig = {
  complexThreshold: 4,
  maxScoredCharacters: 16_000,
  length: { medium: 500, long: 1_400, veryLong: 3_000 },
  reasoningMarkers: ["step by step", "think through", "analyze", "analyse", "solve", "prove", "explain why", "compare", "evaluate", "derive", "reasoning", "critique", "მიზეზი", "რატომ", "შეადარე", "დაამტკიცე", "ამოხსენი", "გააანალიზე", "იმსჯელე"],
  multiStepMarkers: ["first", "then", "after that", "and then", "finally", "step 1", "1.", "ჯერ", "შემდეგ", "ამის შემდეგ", "ბოლოს"],
  codeMarkers: ["```", "function ", "class ", "typescript", "javascript", "python", "debug", "implement", "refactor", "compile", "stack trace", "regex", "api", "კოდი", "პროგრამა", "ალგორითმი", "გამართე"],
  technicalTerms: ["algorithm", "complexity", "derivative", "integral", "matrix", "proof", "theorem", "transaction", "concurrency", "architecture", "optimization", "მატრიცა", "წარმოებული", "ინტეგრალი", "ალგორითმი", "თეორემა", "განტოლება"],
  simpleMarkers: ["what is", "define", "translate", "who wrote", "when was", "capital of", "რას ნიშნავს", "რა არის", "თარგმნე", "ვინ დაწერა", "რომელია დედაქალაქი"],
  weights: { reasoning: 2, multiStep: 2, code: 3, technical: 2, long: 1, veryLong: 2, simple: 2 },
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function countMarkers(text: string, markers: string[]): string[] {
  return markers.filter((marker) => {
    if (!marker) return false;
    return marker.includes(" ") || marker.includes(".") || marker.includes("`")
      ? text.includes(marker)
      : new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escapeRegex(marker)}(?:$|[^\\p{L}\\p{N}_])`, "u").test(text);
  });
}

export function createComplexityScorer(overrides: Partial<ComplexityScorerConfig> = {}) {
  const config: ComplexityScorerConfig = {
    ...DEFAULT_COMPLEXITY_CONFIG,
    ...overrides,
    length: { ...DEFAULT_COMPLEXITY_CONFIG.length, ...overrides.length },
    weights: { ...DEFAULT_COMPLEXITY_CONFIG.weights, ...overrides.weights },
    reasoningMarkers: overrides.reasoningMarkers ?? DEFAULT_COMPLEXITY_CONFIG.reasoningMarkers,
    multiStepMarkers: overrides.multiStepMarkers ?? DEFAULT_COMPLEXITY_CONFIG.multiStepMarkers,
    codeMarkers: overrides.codeMarkers ?? DEFAULT_COMPLEXITY_CONFIG.codeMarkers,
    technicalTerms: overrides.technicalTerms ?? DEFAULT_COMPLEXITY_CONFIG.technicalTerms,
    simpleMarkers: overrides.simpleMarkers ?? DEFAULT_COMPLEXITY_CONFIG.simpleMarkers,
  };

  return (prompt: string): Omit<RoutingResult, "model" | "method"> => {
    const originalLength = prompt.length;
    const text = prompt.slice(0, config.maxScoredCharacters).toLowerCase();
    let score = 0;
    const signals: string[] = [];
    const reasoning = countMarkers(text, config.reasoningMarkers);
    const steps = countMarkers(text, config.multiStepMarkers);
    const code = countMarkers(text, config.codeMarkers);
    const technical = countMarkers(text, config.technicalTerms);
    const simple = countMarkers(text, config.simpleMarkers);
    if (reasoning.length) { score += config.weights.reasoning * Math.min(reasoning.length, 3); signals.push(...reasoning.map((x) => `reasoning:${x}`)); }
    if (steps.length) { score += config.weights.multiStep * Math.min(steps.length, 3); signals.push(...steps.map((x) => `steps:${x}`)); }
    if (code.length) { score += config.weights.code * Math.min(code.length, 3); signals.push(...code.map((x) => `code:${x}`)); }
    if (technical.length) { score += config.weights.technical * Math.min(technical.length, 3); signals.push(...technical.map((x) => `technical:${x}`)); }
    if (originalLength >= config.length.medium) { score += config.weights.long; signals.push("length:medium"); }
    if (originalLength >= config.length.long) { score += config.weights.long; signals.push("length:long"); }
    if (originalLength >= config.length.veryLong) { score += config.weights.veryLong; signals.push("length:very-long"); }
    if (simple.length) { score -= config.weights.simple * Math.min(simple.length, 2); signals.push(...simple.map((x) => `simple:${x}`)); }
    if (originalLength > config.maxScoredCharacters) signals.push("input-sampled");
    score = Math.max(0, score);
    return { tier: score >= config.complexThreshold ? "COMPLEX" : "SIMPLE", score, signals };
  };
}

export const scorePrompt = createComplexityScorer();

/** Deterministic, local-only routing. Auto stays on enabled Claude models and respects plan access. */
export function selectModel(prompt: string, mode: AiModelSelection | string = "auto", planOrAdmin: import("@/types/billing").EffectivePlanId | boolean = "free_beta"): RoutingResult {
  if (mode !== "auto") {
    if (mode !== "claude-haiku-5-5" && mode !== "claude-sonnet-5-5" && mode !== "gpt-6-luna" && mode !== "deepseek-flash") {
      throw new Error(`Unknown model selection: ${mode}`);
    }
    const tier: ComplexityTier = mode === "claude-haiku-5-5" || mode === "gpt-6-luna" || mode === "deepseek-flash" ? "SIMPLE" : "COMPLEX";
    return { model: mode, tier, score: 0, method: "heuristic", signals: ["explicit-model"] };
  }
  const result = scorePrompt(prompt);
  return {
    ...result,
    model: result.tier === "COMPLEX" && isAllowedAiModel("claude-sonnet-5-5", planOrAdmin) ? "claude-sonnet-5-5" : DEFAULT_HAIKU_MODEL,
    method: "heuristic",
  };
}
