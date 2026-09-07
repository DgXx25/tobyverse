import { z } from "zod";
import { CATALOG_KINDS } from "@/types/visual";
import type { ExercisePayloadMap, ExerciseType } from "@/types/exercise";

const id = z.string().min(1).max(32);
const line = z.string().min(1).max(500);
const para = z.string().min(1).max(4000);

const catalogRef = z
  .object({
    kind: z.enum(CATALOG_KINDS),
    id: z.string().min(1).max(240),
  })
  .optional();

const itemVisual = z
  .object({
    kind: z.enum(CATALOG_KINDS),
    id: z.string().min(1).max(240),
    placement: z.enum(["after_question", "in_option"]),
  })
  .optional();

export const mcqSchema = z.object({
  question: line,
  options: z.array(z.object({ id, text: line, visual: catalogRef })).min(2).max(6),
  correctOptionId: id,
  explanation: z.string().max(500).optional(),
  visual: itemVisual,
});

export const connectSchema = z.object({
  prompt: line,
  left: z.array(z.object({ id, text: line })).min(2).max(6),
  right: z.array(z.object({ id, text: line })).min(2).max(6),
  pairs: z.array(z.object({ leftId: id, rightId: id })).min(2).max(6),
  visual: itemVisual,
});

export const trueFalseSchema = z.object({
  statement: line,
  answer: z.boolean(),
  explanation: z.string().max(500).optional(),
  visual: itemVisual,
});

export const fillBlankSchema = z.object({
  text: z.string().min(1).max(1200),
  blanks: z
    .array(
      z.object({
        id,
        answers: z.array(z.string().min(1).max(80)).min(1).max(6),
        caseSensitive: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(6),
  visual: itemVisual,
});

export const openShortSchema = z.object({
  prompt: para,
  sampleAnswer: z.string().max(800).optional(),
  rubric: z.array(z.string().max(160)).max(6).optional(),
  maxLength: z.number().int().min(40).max(800).optional(),
  visual: itemVisual,
});

export const problemStepsSchema = z.object({
  problem: para,
  steps: z
    .array(
      z.object({
        id,
        prompt: line,
        expected: z.string().max(400).optional(),
        hint: z.string().max(400).optional(),
      }),
    )
    .min(2)
    .max(8),
  finalAnswer: z.string().max(400).optional(),
  visual: itemVisual,
});

export const caseTreeSchema = z.object({
  scenario: para,
  rootNodeId: id,
  nodes: z
    .array(
      z.object({
        id,
        prompt: line,
        choices: z
          .array(
            z.object({
              id,
              label: line,
              nextNodeId: z.string().max(32).nullable(),
              isCorrect: z.boolean().optional(),
              feedback: z.string().max(400).optional(),
            }),
          )
          .min(1)
          .max(5),
      }),
    )
    .min(1)
    .max(10),
});

export const essaySchema = z.object({
  prompt: para,
  minWords: z.number().int().min(40).max(400).optional(),
  maxWords: z.number().int().min(80).max(800).optional(),
  rubric: z.array(z.object({ criterion: line, weight: z.number().min(0).max(1) })).min(1).max(6),
});

const shortLine = z.string().min(1).max(160);

export const analysisSchema = z.object({
  source: z.string().min(1).max(5000),
  prompt: para,
  focusPoints: z.array(shortLine).min(1).max(6),
  sampleAnalysis: z.string().max(1200).optional(),
});

export const exercisePayloadSchemas = {
  mcq: mcqSchema,
  connect: connectSchema,
  true_false: trueFalseSchema,
  fill_blank: fillBlankSchema,
  open_short: openShortSchema,
  problem_steps: problemStepsSchema,
  case_tree: caseTreeSchema,
  essay: essaySchema,
  analysis: analysisSchema,
} as const;

export function payloadSchemaFor(type: ExerciseType) {
  return exercisePayloadSchemas[type];
}

export type ParsedPayload<T extends ExerciseType> = ExercisePayloadMap[T];
