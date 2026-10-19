import type { ChatArtifact } from "@/types/chat";
import type { StudioRequest, StudioResult } from "@/lib/workspace/studio";

/** A Studio job succeeds only after a real artifact is generated and durably indexed. */
export async function executeStudioGeneration(input: {
  request: StudioRequest;
  generate: () => Promise<{ artifact?: ChatArtifact | null; content: string }>;
  save: (artifact: ChatArtifact) => Promise<void>;
  signal?: AbortSignal;
}): Promise<StudioResult> {
  let artifact = input.request.retryArtifact;
  try {
    input.signal?.throwIfAborted();
    if (!artifact) {
      const result = await input.generate();
      if (!result.artifact?.id) throw new Error(result.content.trim() || "Nothing was created. Please try again.");
      artifact = result.artifact;
    }
    input.signal?.throwIfAborted();
    await input.save(artifact);
    return { artifact };
  } catch (error) {
    return { artifact, error: error instanceof Error && error.message.trim() ? error.message : "Could not generate this item. Please try again." };
  }
}
