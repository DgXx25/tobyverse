export type { AIProvider, GenerateOptions } from "@/lib/ai/types";
export {
  GeminiProvider,
  generateText,
  generateTextStream,
  generateToolStream,
  getAIProvider,
  setAIProvider,
} from "@/lib/ai/gemini";
export { generateJson, validateOrRepairJson } from "@/lib/ai/json";
export {
  ASK_WRITING_CONTRACT,
  WRITING_CONTRACT,
  withAskWritingContract,
  withWritingContract,
} from "@/lib/ai/voice";
export {
  CHAT_TOOL_DEFINITIONS,
  CHAT_TOOLS,
  INTERCEPT_ONLY_CHAT_TOOLS,
  toAnthropicTools,
  toOpenAITools,
  type ChatToolCall,
  type ChatToolName,
} from "@/lib/ai/tools";
export {
  AI_PROVIDER_OPTIONS,
  DEFAULT_AI_PROVIDER,
  availableAiProviders,
  isEnabledProvider,
  isKnownProvider,
  parsePreferredModel,
  providerDisplayName,
  resolveAiProvider,
  type AiProviderId,
  type AiProviderOption,
} from "@/lib/ai/catalog";
