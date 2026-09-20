import type { EntityId, IsoDateString } from "@/types/common";
import type { CatalogRef, ExerciseVisual } from "@/types/visual";

export const EXERCISE_CATEGORIES = ["theory", "problems"] as const;

export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const THEORY_EXERCISE_TYPES = [
  "mcq",
  "connect",
  "true_false",
  "fill_blank",
  "open_short",
] as const;

export const PROBLEM_EXERCISE_TYPES = [
  "problem_steps",
  "case_tree",
  "essay",
  "analysis",
  "paper",
] as const;

export type TheoryExerciseType = (typeof THEORY_EXERCISE_TYPES)[number];
export type ProblemExerciseType = (typeof PROBLEM_EXERCISE_TYPES)[number];
export type ExerciseType = TheoryExerciseType | ProblemExerciseType;

/** Add a type + renderer. Do not delete old fields. Bump schemaVersion. */
export const EXERCISE_SCHEMA_VERSION = 2 as const;

export type McqOption = {
  id: string;
  text: string;
  visual?: CatalogRef;
};

export type McqPayload = {
  question: string;
  options: McqOption[];
  correctOptionId: string;
  explanation?: string;
  visual?: ExerciseVisual;
};

export type ConnectItem = {
  id: string;
  text: string;
};

export type ConnectPayload = {
  prompt: string;
  left: ConnectItem[];
  right: ConnectItem[];
  pairs: { leftId: string; rightId: string }[];
  visual?: ExerciseVisual;
};

export type TrueFalsePayload = {
  statement: string;
  answer: boolean;
  explanation?: string;
  visual?: ExerciseVisual;
};

export type FillBlankItem = {
  id: string;
  answers: string[];
  caseSensitive?: boolean;
};

export type FillBlankPayload = {
  /** Use `{{blankId}}` placeholders in the text. */
  text: string;
  blanks: FillBlankItem[];
  visual?: ExerciseVisual;
};

export type OpenShortPayload = {
  prompt: string;
  sampleAnswer?: string;
  rubric?: string[];
  maxLength?: number;
  visual?: ExerciseVisual;
};

export type ProblemStep = {
  id: string;
  prompt: string;
  expected?: string;
  hint?: string;
};

export type ProblemStepsPayload = {
  problem: string;
  steps: ProblemStep[];
  finalAnswer?: string;
  visual?: ExerciseVisual;
};

export type CaseTreeChoice = {
  id: string;
  label: string;
  nextNodeId: string | null;
  isCorrect?: boolean;
  feedback?: string;
};

export type CaseTreeNode = {
  id: string;
  prompt: string;
  choices: CaseTreeChoice[];
};

export type CaseTreePayload = {
  scenario: string;
  rootNodeId: string;
  nodes: CaseTreeNode[];
};

export type EssayRubricItem = {
  criterion: string;
  weight: number;
};

export type EssayPayload = {
  prompt: string;
  minWords?: number;
  maxWords?: number;
  rubric: EssayRubricItem[];
};

export type AnalysisPayload = {
  source: string;
  prompt: string;
  focusPoints: string[];
  sampleAnalysis?: string;
};

export const PAPER_FORMS = ["ganckhadeba"] as const;
export type PaperFormId = (typeof PAPER_FORMS)[number];

export type PaperPayload = {
  /** Layout id. Renderer + defaults live in code; the model only fills the brief. */
  form: PaperFormId;
  brief: string;
  given?: { to?: string };
  /** Filled example on the sheet. Chat-only; practice items strip this. */
  sample?: { to?: string; body?: string; sign?: string; date?: string };
  rubric?: EssayRubricItem[];
};

export type ExercisePayloadMap = {
  mcq: McqPayload;
  connect: ConnectPayload;
  true_false: TrueFalsePayload;
  fill_blank: FillBlankPayload;
  open_short: OpenShortPayload;
  problem_steps: ProblemStepsPayload;
  case_tree: CaseTreePayload;
  essay: EssayPayload;
  analysis: AnalysisPayload;
  paper: PaperPayload;
};

/**
 * JSON template for an exercise type. New types are added by extending
 * ExercisePayloadMap and registering a template — no generation rewrite needed.
 */
export type ExerciseTemplate<T extends ExerciseType = ExerciseType> = {
  type: T;
  category: T extends TheoryExerciseType ? "theory" : "problems";
  version: number;
  label: string;
  description: string;
  example: ExercisePayloadMap[T];
};

export type ExerciseBase = {
  id: EntityId;
  projectId: EntityId;
  lessonId: EntityId | null;
  userId: EntityId;
  /** Links an exercise to a fact so the same item is not regenerated. */
  knowledgeItemId: EntityId | null;
  templateVersion: number;
  createdAt: IsoDateString | null;
  updatedAt: IsoDateString | null;
};

export type TheoryExercise =
  | (ExerciseBase & { category: "theory"; type: "mcq"; payload: McqPayload })
  | (ExerciseBase & { category: "theory"; type: "connect"; payload: ConnectPayload })
  | (ExerciseBase & { category: "theory"; type: "true_false"; payload: TrueFalsePayload })
  | (ExerciseBase & { category: "theory"; type: "fill_blank"; payload: FillBlankPayload })
  | (ExerciseBase & { category: "theory"; type: "open_short"; payload: OpenShortPayload });

export type ProblemExercise =
  | (ExerciseBase & { category: "problems"; type: "problem_steps"; payload: ProblemStepsPayload })
  | (ExerciseBase & { category: "problems"; type: "case_tree"; payload: CaseTreePayload })
  | (ExerciseBase & { category: "problems"; type: "essay"; payload: EssayPayload })
  | (ExerciseBase & { category: "problems"; type: "analysis"; payload: AnalysisPayload })
  | (ExerciseBase & { category: "problems"; type: "paper"; payload: PaperPayload });

export type Exercise = TheoryExercise | ProblemExercise;
