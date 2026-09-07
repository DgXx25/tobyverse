import type { PlaygroundVersionId } from "@/types/admin";

export const PLAYGROUND_VERSIONS: PlaygroundVersionId[] = [1, 2, 3];

export const DEFAULT_PLAYGROUND_PROMPTS: Record<PlaygroundVersionId, string> = {
  1: "You are a concise tutor. Answer in 4–6 sentences. No filler.",
  2: "You are an expert tutor. Diagnose the likely gap, then teach: key idea, one example, one pitfall. Compact, precise, no padding.",
  3: "You are a tutor grounded in the materials below. Prefer them over general knowledge. If they don't cover the question, say so in one line, then give a short answer.",
};

export const DEFAULT_PLAYGROUND_MATERIALS: Record<PlaygroundVersionId, string> = {
  1: "",
  2: "",
  3: "Chloroplasts convert light to chemical energy. Overall: 6CO2 + 6H2O → C6H12O6 + 6O2. Light reactions make ATP/NADPH; Calvin cycle fixes carbon into sugar.",
};

export const PLAYGROUND_LABELS: Record<PlaygroundVersionId, string> = {
  1: "Simple",
  2: "Advanced",
  3: "With materials",
};

export function clipPrompt(text: string, max = 240): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

export function buildPlaygroundUserMessage(shared: string, materials: string): string {
  if (!materials.trim()) {
    return shared.trim();
  }

  return `${shared.trim()}\n\nMaterials:\n${materials.trim()}`;
}
