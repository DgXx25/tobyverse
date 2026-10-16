import type { ChatGenerationContext } from "@/types/chat";

/** Project-level path metadata is not an active learning thread. Explicit false wins. */
export function isActivePathThread(context: ChatGenerationContext): boolean {
  return Boolean(context.path && context.path.started !== false &&
    (context.inPathThread ?? context.path.inPathThread) === true);
}
