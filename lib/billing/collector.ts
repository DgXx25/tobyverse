import type { AiUsageDelta, AiUsageReporter } from "@/types/billing";
import { emptyAiUsageDelta, mergeAiUsageDelta, priceAiCall, unpricedAiCall } from "@/lib/billing/pricing";

export function createAiUsageCollector(options: { allowUnpriced: boolean }): {
  report: AiUsageReporter;
  snapshot: () => AiUsageDelta;
} {
  let delta = emptyAiUsageDelta();
  const report: AiUsageReporter = (call) => {
    try {
      delta = mergeAiUsageDelta(delta, priceAiCall(call));
    } catch (error) {
      if (!options.allowUnpriced) throw error;
      console.error("[ai-usage] unpriced model", { model: call.model });
      delta = mergeAiUsageDelta(delta, unpricedAiCall(call));
    }
  };
  return { report, snapshot: () => structuredClone(delta) };
}
