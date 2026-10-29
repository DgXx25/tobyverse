import type { PlaygroundVersionId } from "@/types/admin";

export const PLAYGROUND_VERSIONS: PlaygroundVersionId[] = [1, 2, 3];

export type PlaygroundPreset = {
  id: string;
  label: string;
  prompts: [string, string, string];
};

/** Three unrelated, ordinary asks per preset let model behavior show naturally. */
export const PLAYGROUND_PRESETS: PlaygroundPreset[] = [
  {
    id: "technical",
    label: "Technical mix",
    prompts: [
      "Find x: 3x + 6 = 21.",
      "A 12 V battery is connected to a 4 Ω resistor. What current flows?",
      "For the values 4, 7, 7, 9, 23, give the mean and median.",
    ],
  },
  {
    id: "science",
    label: "Science",
    prompts: [
      "A metal spoon and a wooden spoon have been in the same 20°C room overnight. Which one feels colder to the touch?",
      "A plant is kept in darkness for three days before its leaves are tested with iodine. What result should appear?",
      "A 2 kg object accelerates at 3 m/s². What net force acts on it?",
    ],
  },
  {
    id: "everyday",
    label: "Everyday calculations",
    prompts: [
      "A train leaves at 14:35 and the journey takes 1 hour 48 minutes. When does it arrive?",
      "A recipe for 4 people uses 300 g of flour. How much flour is needed for 7 people?",
      "The bill is 86 GEL and service is 10%. What is the total?",
    ],
  },
  {
    id: "coding",
    label: "Coding",
    prompts: [
      "In Python, what does list(range(2, 8, 2)) produce?",
      "Given values = [3, 1, 4, 1], write a one-line Python expression that returns a sorted list without changing values.",
      "A function works for non-empty lists but fails on an empty list. What condition should be checked first?",
    ],
  },
];

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
