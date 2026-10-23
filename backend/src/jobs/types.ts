export const JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
export type GenerationJobKind = "chat" | "path" | "study_sheet" | "exercise";
export type JobTarget = Record<string, string | number | boolean | null>;

export type JobFailure = {
  code: string;
  message: string;
  retryable: boolean;
};

export type GenerationJob = {
  id: string;
  uid: string;
  kind: GenerationJobKind;
  status: JobStatus;
  target?: JobTarget;
  anonymous?: boolean;
  idempotencyHash: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: Date | null;
  attempt: number;
  attemptId?: string;
  nextAttemptAt: number;
  leaseOwner?: string;
  leaseExpiresAt?: number;
  heartbeatAt?: number;
  eventSequence: number;
  cancelRequested: boolean;
  cancelRequestedAt?: number;
  retryOf?: string;
  input?: unknown;
  inputRef?: string;
  result?: unknown;
  resultRef?: string;
  error?: JobFailure;
  progress?: string;
};

export type CreateJobInput = {
  uid: string;
  kind: GenerationJobKind;
  idempotencyKey: string;
  payload: unknown;
  target?: JobTarget;
  anonymous?: boolean;
  retryOf?: string;
};

export type JobEvent = {
  sequence: number;
  at: number;
  type: string;
  data?: unknown;
};

export type JobSummary = Omit<
  GenerationJob,
  "input" | "inputRef" | "result" | "resultRef" | "idempotencyHash"
> & {
  result?: unknown;
};

export function toJobSummary(job: GenerationJob, result?: unknown): JobSummary {
  const {
    input: _input,
    inputRef: _inputRef,
    result: _result,
    resultRef: _resultRef,
    idempotencyHash: _idempotencyHash,
    ...summary
  } = job;
  return result === undefined ? summary : { ...summary, result };
}

export function isTerminalJobStatus(status: JobStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}
