import { randomUUID } from "node:crypto";
import type { GenerationJob, JobEvent, JobFailure, GenerationJobKind } from "./types.js";

type JobHandlerContext = {
  job: GenerationJob;
  attemptId: string;
  signal: AbortSignal;
  emit(event: { type: string; data?: unknown }): Promise<void>;
};

export type JobHandler = (input: unknown, context: JobHandlerContext) => Promise<unknown>;

type WorkerStore = {
  claimNextJob(workerId: string): Promise<GenerationJob | null>;
  readInput(job: GenerationJob): Promise<unknown>;
  appendJobEvent(jobId: string, event: Omit<JobEvent, "sequence" | "at">): Promise<JobEvent>;
  heartbeat(jobId: string, attemptId: string, progress?: string): Promise<boolean>;
  isCancellationRequested(jobId: string, attemptId: string): Promise<boolean>;
  scheduleRetry(jobId: string, attemptId: string, failure: JobFailure, nextAttemptAt: number): Promise<boolean>;
  failJob(jobId: string, attemptId: string, failure: JobFailure): Promise<boolean>;
  finishJob(jobId: string, attemptId: string, result: unknown): Promise<boolean>;
  markCancelled(jobId: string, attemptId: string): Promise<boolean>;
};

export class JobExecutionError extends Error {
  constructor(readonly code: string, message: string, readonly retryable: boolean) {
    super(message);
    this.name = "JobExecutionError";
  }
}

type WorkerOptions = {
  store: WorkerStore;
  handlers: Partial<Record<GenerationJobKind, JobHandler>>;
  preflight: (uid: string, job: GenerationJob) => Promise<void>;
  workerId?: string;
  concurrency?: number;
  pollMs?: number;
  heartbeatMs?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
  maxRetryMs?: number;
  now?: () => number;
};

function failureFrom(error: unknown): JobFailure {
  if (error instanceof JobExecutionError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "generation_failed";
  const retryable = error && typeof error === "object" && "status" in error && typeof error.status === "number"
    ? error.status >= 500
    : false;
  const message = code === "weekly_ai_budget_exhausted"
    ? "Your weekly AI allowance is used up."
    : code === "paid_model_required"
      ? "This model is not included in your current plan."
      : "Generation could not be completed. Please retry if the problem continues.";
  return { code, message, retryable };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class GenerationWorker {
  private readonly store: WorkerStore;
  private readonly handlers: Partial<Record<GenerationJobKind, JobHandler>>;
  private readonly preflight: WorkerOptions["preflight"];
  private readonly workerId: string;
  private readonly concurrency: number;
  private readonly pollMs: number;
  private readonly heartbeatMs: number;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly maxRetryMs: number;
  private readonly now: () => number;
  private readonly active = new Map<string, AbortController>();
  private loops: Promise<void>[] = [];
  private stopping = false;

  constructor(options: WorkerOptions) {
    this.store = options.store;
    this.handlers = options.handlers;
    this.preflight = options.preflight;
    this.workerId = options.workerId ?? `worker-${randomUUID()}`;
    this.concurrency = Math.max(1, Math.min(8, options.concurrency ?? 2));
    this.pollMs = Math.max(100, options.pollMs ?? 1_000);
    this.heartbeatMs = Math.max(1, options.heartbeatMs ?? 30_000);
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    this.retryBaseMs = Math.max(100, options.retryBaseMs ?? 1_000);
    this.maxRetryMs = Math.max(this.retryBaseMs, options.maxRetryMs ?? 60_000);
    this.now = options.now ?? Date.now;
  }

  start() {
    if (this.loops.length > 0) return;
    this.stopping = false;
    this.loops = Array.from({ length: this.concurrency }, (_, index) => this.poll(index));
    console.info(`[jobs] worker started id=${this.workerId} concurrency=${this.concurrency}`);
  }

  async stop(graceMs = 25_000) {
    this.stopping = true;
    const loops = Promise.allSettled(this.loops);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const drained = await Promise.race([
      loops.then(() => true),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), Math.max(0, graceMs)); }),
    ]);
    if (timer) clearTimeout(timer);
    if (!drained) {
      for (const controller of this.active.values()) {
        controller.abort(new JobExecutionError("worker_shutdown", "Worker is shutting down.", true));
      }
    }
  }

  abort(jobId: string) {
    this.active.get(jobId)?.abort(new JobExecutionError("job_cancelled", "Generation stopped.", false));
  }

  supports(kind: GenerationJobKind): boolean {
    return typeof this.handlers[kind] === "function";
  }

  private async poll(slot: number) {
    while (!this.stopping) {
      try {
        const job = await this.store.claimNextJob(`${this.workerId}-${slot}`);
        if (!job) {
          await delay(this.pollMs);
          continue;
        }
        await this.runClaimedJob(job);
      } catch (error) {
        const name = error instanceof Error ? error.name : "Error";
        console.error(`[jobs] poll failed worker=${this.workerId} error=${name}`);
        await delay(this.pollMs);
      }
    }
  }

  async runClaimedJob(job: GenerationJob): Promise<void> {
    const attemptId = job.attemptId;
    if (!attemptId) return;
    const startedAt = this.now();
    const log = (event: string, fields: Record<string, unknown> = {}) => {
      console.info(JSON.stringify({
        scope: "generation_job",
        event,
        jobId: job.id,
        kind: job.kind,
        attempt: job.attempt,
        workerId: this.workerId,
        ...fields,
      }));
    };
    log("attempt_started", { queueWaitMs: Math.max(0, startedAt - job.createdAt) });
    const controller = new AbortController();
    this.active.set(job.id, controller);
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let heartbeatRunning = false;

    try {
      await this.preflight(job.uid, job);
      if (controller.signal.aborted) throw controller.signal.reason;
      const handler = this.handlers[job.kind];
      if (!handler) throw new JobExecutionError("job_handler_unavailable", "This generation type is not available yet.", false);
      const input = await this.store.readInput(job);

      heartbeatTimer = setInterval(async () => {
        if (heartbeatRunning || controller.signal.aborted) return;
        heartbeatRunning = true;
        try {
          if (await this.store.isCancellationRequested(job.id, attemptId)) {
            controller.abort(new JobExecutionError("job_cancelled", "Generation stopped.", false));
            return;
          }
          const alive = await this.store.heartbeat(job.id, attemptId);
          if (!alive) controller.abort(new JobExecutionError("job_lease_lost", "Worker lease was lost.", true));
        } catch {
          controller.abort(new JobExecutionError("job_lease_lost", "Worker lease could not be renewed.", true));
        } finally {
          heartbeatRunning = false;
        }
      }, this.heartbeatMs);
      heartbeatTimer.unref?.();

      const result = await handler(input, {
        job,
        attemptId,
        signal: controller.signal,
        emit: async (event) => {
          if (controller.signal.aborted) throw controller.signal.reason;
          await this.store.appendJobEvent(job.id, event);
        },
      });

      if (await this.store.isCancellationRequested(job.id, attemptId)) {
        const cancelled = await this.store.markCancelled(job.id, attemptId);
        if (cancelled) log("cancelled", { durationMs: Math.max(0, this.now() - startedAt) });
        return;
      }
      const finished = await this.store.finishJob(job.id, attemptId, result);
      if (finished) log("succeeded", { durationMs: Math.max(0, this.now() - startedAt) });
    } catch (error) {
      const failure = failureFrom(error);
      if (failure.code === "worker_shutdown") return;
      if (failure.code === "job_cancelled" || await this.store.isCancellationRequested(job.id, attemptId).catch(() => false)) {
        const cancelled = await this.store.markCancelled(job.id, attemptId).catch(() => false);
        if (cancelled) log("cancelled", { durationMs: Math.max(0, this.now() - startedAt) });
        return;
      }
      if (failure.retryable && job.attempt < this.maxAttempts) {
        const backoff = Math.min(this.retryBaseMs * (2 ** Math.max(0, job.attempt - 1)), this.maxRetryMs);
        const scheduled = await this.store.scheduleRetry(job.id, attemptId, failure, this.now() + backoff);
        if (scheduled) log("retry_scheduled", {
          errorCode: failure.code,
          nextAttempt: job.attempt + 1,
          durationMs: Math.max(0, this.now() - startedAt),
        });
        return;
      }
      const failed = await this.store.failJob(job.id, attemptId, failure);
      if (failed) log("failed", {
        errorCode: failure.code,
        retryable: failure.retryable,
        durationMs: Math.max(0, this.now() - startedAt),
      });
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      this.active.delete(job.id);
    }
  }
}
