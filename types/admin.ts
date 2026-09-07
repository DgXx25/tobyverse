export type PlaygroundVersionId = 1 | 2 | 3;

export type PlaygroundScores = {
  clarity: number;
  usefulness: number;
  correctness: number;
  compactness: number;
};

export type PlaygroundVersionAudit = {
  strengths: [string, string];
  weaknesses: [string, string];
  scores: PlaygroundScores;
};

export type PlaygroundAudit = {
  winner: PlaygroundVersionId;
  reason: string;
  versions: Record<PlaygroundVersionId, PlaygroundVersionAudit>;
  improvements: [string, string, string];
};

/** Compact Firestore snapshot — no raw model output. */
export type PlaygroundSnapshot = {
  id: string;
  userId: string;
  prompts: Record<PlaygroundVersionId, string>;
  scores: Record<PlaygroundVersionId, PlaygroundScores>;
  winner: PlaygroundVersionId;
  auditSummary: string;
  createdAt: string;
};

export type EvalCaseId = string;

export type EvalSuiteId = "core" | "practice" | "sheet";

export type EvalJudgeId =
  | "core-1"
  | "core-2"
  | "core-3"
  | "core-4"
  | "core-5"
  | "core-6"
  | "core-7"
  | "core-8"
  | "practice-create"
  | "sheet-create";

export type EvalCaseSpec = {
  id: EvalCaseId;
  prompt: string;
  expected: string;
  judge: EvalJudgeId;
  skipIfPracticeExists?: boolean;
  followupIfClarify?: boolean;
  useVariantAsPrompt?: boolean;
};

export type EvalCaseResult = {
  id: EvalCaseId;
  prompt: string;
  expected: string;
  actual: string;
  pass: boolean;
  note: string;
};

export type EvalTranscriptMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  artifact?: { kind: "practice" | "sheet" | "plan"; id: string; title: string; count?: number } | null;
};

export type EvalPracticePreviewItem = {
  id: string;
  type: string;
  stem: string;
};

export type EvalPracticePreview = {
  kind: "practice";
  id: string;
  title: string;
  count: number;
  items: EvalPracticePreviewItem[];
};

export type EvalSheetPreview = {
  kind: "sheet";
  id: string;
  title: string;
  content: string;
};

export type EvalArtifactPreview = EvalPracticePreview | EvalSheetPreview;

export type EvalRun = {
  id: string;
  suiteId: EvalSuiteId;
  variant: string;
  projectId: string | null;
  projectTitle: string;
  startedAt: string;
  finishedAt: string | null;
  cases: EvalCaseResult[];
  passed: number;
  failed: number;
};

/** Compact Firestore snapshot — tools/pass only, no raw answers or artifact dumps. */
export type EvalSnapshot = {
  id: string;
  userId: string;
  suiteId: EvalSuiteId;
  variant: string;
  passed: number;
  failed: number;
  cases: Array<{
    id: EvalCaseId;
    expected: string;
    actual: string;
    pass: boolean;
    note: string;
  }>;
  createdAt: string;
};
