import { withWritingContract } from "@/lib/ai/voice";
import type { PlaygroundAudit, PlaygroundVersionId } from "@/types/admin";

function asScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function asPair(value: unknown, fallback: [string, string]): [string, string] {
  if (!Array.isArray(value) || value.length < 2) return fallback;
  return [String(value[0]), String(value[1])];
}

function asTriple(value: unknown): [string, string, string] {
  if (!Array.isArray(value) || value.length < 3) {
    return ["Tighten the system prompt.", "Cut redundant examples.", "Add a hard length cap."];
  }
  return [String(value[0]), String(value[1]), String(value[2])];
}

function parseJson(text: string): unknown {
  const fenced = text.match(/\{[\s\S]*\}/);
  if (!fenced) {
    throw new Error("Audit did not return JSON.");
  }
  return JSON.parse(fenced[0]);
}

export function parsePlaygroundAudit(text: string): PlaygroundAudit {
  const raw = parseJson(text) as Record<string, unknown>;
  const winner = Number(raw.winner);
  if (winner !== 1 && winner !== 2 && winner !== 3) {
    throw new Error("Audit winner must be 1, 2, or 3.");
  }

  const versionsRaw = (raw.versions ?? {}) as Record<string, Record<string, unknown>>;

  const versions = {
    1: mapVersion(versionsRaw["1"]),
    2: mapVersion(versionsRaw["2"]),
    3: mapVersion(versionsRaw["3"]),
  } as PlaygroundAudit["versions"];

  return {
    winner: winner as PlaygroundVersionId,
    reason: String(raw.reason ?? "Best overall tradeoff of clarity and usefulness."),
    versions,
    improvements: asTriple(raw.improvements),
  };
}

function mapVersion(row: Record<string, unknown> | undefined): PlaygroundAudit["versions"][1] {
  const scores = (row?.scores ?? {}) as Record<string, unknown>;
  return {
    strengths: asPair(row?.strengths, ["Clear", "Direct"]),
    weaknesses: asPair(row?.weaknesses, ["Thin", "Generic"]),
    scores: {
      clarity: asScore(scores.clarity),
      usefulness: asScore(scores.usefulness),
      correctness: asScore(scores.correctness),
      compactness: asScore(scores.compactness),
    },
  };
}

export function auditSystemPrompt(): string {
  return withWritingContract(`You audit 3 tutor outputs. Return ONLY compact JSON, no markdown.
Schema:
{
  "winner": 1 | 2 | 3,
  "reason": "one sentence",
  "versions": {
    "1": { "strengths": ["", ""], "weaknesses": ["", ""], "scores": { "clarity": 1, "usefulness": 1, "correctness": 1, "compactness": 1 } },
    "2": { ... },
    "3": { ... }
  },
  "improvements": ["", "", ""]
}
Scores are integers 1-10. Strengths/weaknesses: 2 short phrases each. Improvements: 3 concrete actions. Be blunt.`);
}
