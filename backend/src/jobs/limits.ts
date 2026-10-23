export const MAX_JOB_DOCUMENT_BYTES = 256 * 1024;
export const MAX_JOB_EVENT_BYTES = 16 * 1024;
export const MAX_ACTIVE_JOBS_PER_USER = 3;
export const JOB_RETENTION_SECONDS = 30 * 24 * 60 * 60;

export class ActiveJobLimitError extends Error {
  readonly code = "active_job_limit";
  readonly status = 429;

  constructor() {
    super(`You can have up to ${MAX_ACTIVE_JOBS_PER_USER} generation jobs running at once.`);
    this.name = "ActiveJobLimitError";
  }
}

export class JobDocumentTooLargeError extends Error {
  readonly code = "job_document_too_large";
  readonly status = 413;

  constructor() {
    super("The job metadata exceeds the Firestore document size limit.");
    this.name = "JobDocumentTooLargeError";
  }
}

export class JobEventTooLargeError extends Error {
  readonly code = "job_event_too_large";

  constructor() {
    super("A job event exceeds the Firestore event document size limit.");
    this.name = "JobEventTooLargeError";
  }
}

export function addActiveJob(activeJobIds: readonly string[], jobId: string): string[] {
  const uniqueIds = [...new Set(activeJobIds)];
  if (uniqueIds.includes(jobId)) return uniqueIds;
  if (uniqueIds.length >= MAX_ACTIVE_JOBS_PER_USER) throw new ActiveJobLimitError();
  return [...uniqueIds, jobId];
}

export function removeActiveJob(activeJobIds: readonly string[], jobId: string): string[] {
  return [...new Set(activeJobIds)].filter((activeId) => activeId !== jobId);
}

export function assertJobDocumentSize(document: unknown): number {
  const serialized = JSON.stringify(document);
  const bytes = Buffer.byteLength(serialized ?? "", "utf8");
  if (bytes > MAX_JOB_DOCUMENT_BYTES) throw new JobDocumentTooLargeError();
  return bytes;
}

export function assertJobEventSize(event: unknown): number {
  const serialized = JSON.stringify(event);
  const bytes = Buffer.byteLength(serialized ?? "", "utf8");
  if (bytes > MAX_JOB_EVENT_BYTES) throw new JobEventTooLargeError();
  return bytes;
}
