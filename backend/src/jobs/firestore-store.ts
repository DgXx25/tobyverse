import { createHash, randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "../firebase/admin.js";
import {
  ActiveJobLimitError,
  addActiveJob,
  assertJobDocumentSize,
  assertJobEventSize,
  JOB_RETENTION_SECONDS,
  removeActiveJob,
} from "./limits.js";
import {
  FirebaseJobPayloadStorage,
  jobPayloadPath,
  withPayloadReference,
  type JobPayloadStorage,
} from "./payload-storage.js";
import {
  isTerminalJobStatus,
  type CreateJobInput,
  type GenerationJob,
  type JobEvent,
  type JobFailure,
} from "./types.js";

const JOBS = "generationJobs";
const JOB_LIMITS = "generationJobLimits";
const REQUESTS = "generationJobRequests";

function asJob(snapshot: { id: string; data(): Record<string, unknown> | undefined }): GenerationJob {
  const data = snapshot.data();
  if (!data) throw new JobNotFoundError();
  return { ...data, id: snapshot.id } as GenerationJob;
}

function eventReference(jobRef: FirebaseFirestore.DocumentReference, sequence: number) {
  return jobRef.collection("events").doc(String(sequence).padStart(12, "0"));
}

function requestId(uid: string, key: string) {
  return createHash("sha256").update(`${uid}\0${key}`).digest("hex");
}

export class JobNotFoundError extends Error {
  readonly code = "job_not_found";
  readonly status = 404;

  constructor() {
    super("Generation job not found.");
    this.name = "JobNotFoundError";
  }
}

export class FirestoreJobStore {
  private readonly db: Firestore;
  private readonly storage: JobPayloadStorage;
  private readonly now: () => number;
  private readonly leaseMs: number;

  constructor(options: { db?: Firestore; storage?: JobPayloadStorage; now?: () => number; leaseMs?: number } = {}) {
    this.db = options.db ?? getAdminFirestore();
    this.storage = options.storage ?? new FirebaseJobPayloadStorage();
    this.now = options.now ?? Date.now;
    this.leaseMs = options.leaseMs ?? 120_000;
  }

  async checkReady(): Promise<void> {
    await this.db.collection(JOBS).doc("__healthcheck__").get();
  }

  async cleanupExpiredJobs(maxJobs = 25): Promise<number> {
    const expired = await this.db.collection(JOBS)
      .where("expiresAt", "<=", new Date(this.now()))
      .orderBy("expiresAt", "asc")
      .limit(Math.min(100, Math.max(1, maxJobs)))
      .get();

    let removed = 0;
    for (const snapshot of expired.docs) {
      const job = asJob(snapshot);
      if (!isTerminalJobStatus(job.status)) continue;
      const jobRef = this.db.collection(JOBS).doc(job.id);
      while (true) {
        const events = await jobRef.collection("events").limit(400).get();
        if (events.empty) break;
        const batch = this.db.batch();
        for (const event of events.docs) batch.delete(event.ref);
        await batch.commit();
      }

      const payloadRefs = [job.inputRef, job.resultRef].filter((path): path is string => typeof path === "string");
      await Promise.all(payloadRefs.map((path) => this.storage.delete(path)));
      await jobRef.delete();

      if (typeof job.idempotencyHash === "string") {
        const requestRef = this.db.collection(REQUESTS).doc(job.idempotencyHash);
        const request = await requestRef.get();
        if (request.exists && request.get("jobId") === job.id) await requestRef.delete();
      }
      removed += 1;
    }
    return removed;
  }

  async createJob(input: CreateJobInput): Promise<GenerationJob> {
    const key = input.idempotencyKey.trim();
    if (key.length < 8 || key.length > 200) {
      throw new TypeError("An idempotency key between 8 and 200 characters is required.");
    }

    const jobRef = this.db.collection(JOBS).doc();
    const requestRef = this.db.collection(REQUESTS).doc(requestId(input.uid, key));
    const limitRef = this.db.collection(JOB_LIMITS).doc(input.uid);
    const now = this.now();
    const base = {
      id: jobRef.id,
      uid: input.uid,
      kind: input.kind,
      status: "queued" as const,
      ...(input.target ? { target: input.target } : {}),
      ...(input.anonymous ? { anonymous: true } : {}),
      idempotencyHash: requestId(input.uid, key),
      createdAt: now,
      updatedAt: now,
      expiresAt: null,
      attempt: 0,
      nextAttemptAt: now,
      eventSequence: 0,
      cancelRequested: false,
      ...(input.retryOf ? { retryOf: input.retryOf } : {}),
    };
    const prepared = await withPayloadReference({
      document: base,
      field: "input",
      payload: input.payload,
      path: jobPayloadPath(input.uid, jobRef.id, "input"),
      storage: this.storage,
    });
    const proposedJob = prepared.document as GenerationJob;
    let reused = false;

    try {
      const job = await this.db.runTransaction(async (transaction) => {
        const [request, limit] = await Promise.all([
          transaction.get(requestRef),
          transaction.get(limitRef),
        ]);

        if (request.exists) {
          const existingId = request.get("jobId");
          if (typeof existingId !== "string") throw new Error("Invalid generation job idempotency record.");
          const existing = await transaction.get(this.db.collection(JOBS).doc(existingId));
          if (!existing.exists || existing.get("uid") !== input.uid) throw new JobNotFoundError();
          reused = true;
          return { ...existing.data(), id: existing.id } as GenerationJob;
        }

        const existingIds = Array.isArray(limit.get("activeJobIds"))
          ? (limit.get("activeJobIds") as unknown[]).filter((id): id is string => typeof id === "string")
          : [];
        const activeJobIds = addActiveJob(existingIds, jobRef.id);
        transaction.set(jobRef, proposedJob);
        transaction.set(limitRef, {
          uid: input.uid,
          activeJobIds,
          activeJobCount: activeJobIds.length,
          updatedAt: now,
        });
        transaction.set(requestRef, {
          uid: input.uid,
          jobId: jobRef.id,
          expiresAt: new Date(now + JOB_RETENTION_SECONDS * 1_000),
        });
        return proposedJob;
      });

      if (reused && proposedJob.inputRef) await this.storage.delete(proposedJob.inputRef);
      return job;
    } catch (error) {
      if (proposedJob.inputRef) await this.storage.delete(proposedJob.inputRef).catch(() => undefined);
      if (error instanceof ActiveJobLimitError) throw error;
      throw error;
    }
  }

  async getJob(uid: string, jobId: string): Promise<GenerationJob> {
    const snapshot = await this.db.collection(JOBS).doc(jobId).get();
    if (!snapshot.exists || snapshot.get("uid") !== uid) throw new JobNotFoundError();
    return asJob(snapshot);
  }

  async getJobById(jobId: string): Promise<GenerationJob | null> {
    const snapshot = await this.db.collection(JOBS).doc(jobId).get();
    return snapshot.exists ? asJob(snapshot) : null;
  }

  async readInput(job: GenerationJob): Promise<unknown> {
    return job.inputRef ? this.storage.readJson(job.inputRef) : job.input;
  }

  async readResult(uid: string, jobId: string): Promise<unknown> {
    const job = await this.getJob(uid, jobId);
    return job.resultRef ? this.storage.readJson(job.resultRef) : job.result;
  }

  async listActiveJobs(uid: string): Promise<GenerationJob[]> {
    const limitSnapshot = await this.db.collection(JOB_LIMITS).doc(uid).get();
    const activeJobIds = Array.isArray(limitSnapshot.get("activeJobIds"))
      ? (limitSnapshot.get("activeJobIds") as unknown[]).filter((id): id is string => typeof id === "string")
      : [];
    if (!activeJobIds.length) return [];
    const snapshots = await this.db.getAll(...activeJobIds.map((id) => this.db.collection(JOBS).doc(id)));
    return snapshots
      .filter((snapshot) => snapshot.exists && snapshot.get("uid") === uid)
      .map((snapshot) => asJob(snapshot))
      .filter((job) => !isTerminalJobStatus(job.status))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async getEvents(uid: string, jobId: string, afterSequence = 0, limit = 100): Promise<JobEvent[]> {
    await this.getJob(uid, jobId);
    const snapshot = await this.db.collection(JOBS).doc(jobId)
      .collection("events")
      .where("sequence", ">", Math.max(0, afterSequence))
      .orderBy("sequence", "asc")
      .limit(Math.min(250, Math.max(1, limit)))
      .get();
    return snapshot.docs.map((document) => document.data() as JobEvent);
  }

  async appendJobEvent(jobId: string, item: Omit<JobEvent, "sequence" | "at">): Promise<JobEvent> {
    const jobRef = this.db.collection(JOBS).doc(jobId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(jobRef);
      if (!snapshot.exists) throw new JobNotFoundError();
      const job = asJob(snapshot);
      const event: JobEvent = { sequence: job.eventSequence + 1, at: this.now(), ...item };
      assertJobEventSize(event);
      assertJobDocumentSize({ ...job, eventSequence: event.sequence, updatedAt: event.at });
      transaction.set(eventReference(jobRef, event.sequence), event);
      transaction.update(jobRef, { eventSequence: event.sequence, updatedAt: event.at });
      return event;
    });
  }

  async requestCancellation(uid: string, jobId: string): Promise<GenerationJob> {
    const jobRef = this.db.collection(JOBS).doc(jobId);
    const limitRef = this.db.collection(JOB_LIMITS).doc(uid);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(jobRef);
      if (!snapshot.exists || snapshot.get("uid") !== uid) throw new JobNotFoundError();
      const job = asJob(snapshot);
      if (isTerminalJobStatus(job.status)) return job;
      const now = this.now();
      const sequence = job.eventSequence + 1;
      const terminal = job.status === "queued";
      const event: JobEvent = {
        sequence,
        at: now,
        type: terminal ? "cancelled" : "cancel_requested",
      };
      assertJobEventSize(event);

      if (terminal) {
        const limit = await transaction.get(limitRef);
        const ids = Array.isArray(limit.get("activeJobIds"))
          ? (limit.get("activeJobIds") as unknown[]).filter((id): id is string => typeof id === "string")
          : [];
        const activeJobIds = removeActiveJob(ids, jobId);
        const cancelled: GenerationJob = {
          ...job,
          status: "cancelled",
          cancelRequested: true,
          cancelRequestedAt: now,
          eventSequence: sequence,
          updatedAt: now,
          expiresAt: new Date(now + JOB_RETENTION_SECONDS * 1_000),
        };
        assertJobDocumentSize(cancelled);
        transaction.update(jobRef, {
          status: cancelled.status,
          cancelRequested: true,
          cancelRequestedAt: now,
          eventSequence: sequence,
          updatedAt: now,
          expiresAt: cancelled.expiresAt,
        });
        transaction.set(limitRef, {
          uid,
          activeJobIds,
          activeJobCount: activeJobIds.length,
          updatedAt: now,
        });
        transaction.set(eventReference(jobRef, sequence), event);
        return cancelled;
      }

      const updated = {
        ...job,
        cancelRequested: true,
        cancelRequestedAt: now,
        eventSequence: sequence,
        updatedAt: now,
      };
      assertJobDocumentSize(updated);
      transaction.update(jobRef, {
        cancelRequested: true,
        cancelRequestedAt: now,
        eventSequence: sequence,
        updatedAt: now,
      });
      transaction.set(eventReference(jobRef, sequence), event);
      return updated;
    });
  }

  async claimNextJob(workerId: string): Promise<GenerationJob | null> {
    const now = this.now();
    const queued = await this.db.collection(JOBS)
      .where("status", "==", "queued")
      .where("nextAttemptAt", "<=", now)
      .orderBy("nextAttemptAt", "asc")
      .limit(1)
      .get();
    if (!queued.empty) {
      const claim = await this.claimCandidate(queued.docs[0].ref, "queued", workerId, now);
      if (claim) return claim;
    }

    const expired = await this.db.collection(JOBS)
      .where("status", "==", "running")
      .where("leaseExpiresAt", "<=", now)
      .orderBy("leaseExpiresAt", "asc")
      .limit(1)
      .get();
    if (expired.empty) return null;
    return this.claimCandidate(expired.docs[0].ref, "running", workerId, now);
  }

  private async claimCandidate(
    ref: FirebaseFirestore.DocumentReference,
    expectedStatus: "queued" | "running",
    workerId: string,
    now: number,
  ): Promise<GenerationJob | null> {
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const job = asJob(snapshot);
      if (job.status !== expectedStatus) return null;
      if (expectedStatus === "queued" && job.nextAttemptAt > now) return null;
      if (expectedStatus === "running" && (job.leaseExpiresAt ?? Number.POSITIVE_INFINITY) > now) return null;

      if (job.cancelRequested) {
        if (expectedStatus === "running") {
          const limitRef = this.db.collection(JOB_LIMITS).doc(job.uid);
          const limit = await transaction.get(limitRef);
          const ids = Array.isArray(limit.get("activeJobIds"))
            ? (limit.get("activeJobIds") as unknown[]).filter((id): id is string => typeof id === "string")
            : [];
          const activeJobIds = removeActiveJob(ids, job.id);
          const sequence = job.eventSequence + 1;
          const event: JobEvent = { sequence, at: now, type: "cancelled" };
          assertJobEventSize(event);
          const cancelled = {
            ...job,
            status: "cancelled" as const,
            eventSequence: sequence,
            updatedAt: now,
            expiresAt: new Date(now + JOB_RETENTION_SECONDS * 1_000),
          };
          assertJobDocumentSize(cancelled);
          transaction.update(ref, {
            status: "cancelled",
            eventSequence: sequence,
            updatedAt: now,
            expiresAt: cancelled.expiresAt,
            attemptId: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
          });
          transaction.set(limitRef, { uid: job.uid, activeJobIds, activeJobCount: activeJobIds.length, updatedAt: now });
          transaction.set(eventReference(ref, sequence), event);
        }
        return null;
      }

      const claimed: GenerationJob = {
        ...job,
        status: "running",
        attempt: job.attempt + 1,
        eventSequence: job.eventSequence + 1,
        attemptId: randomUUID(),
        leaseOwner: workerId,
        leaseExpiresAt: now + this.leaseMs,
        heartbeatAt: now,
        updatedAt: now,
      };
      const event: JobEvent = {
        sequence: claimed.eventSequence,
        at: now,
        type: "running",
        data: { attempt: claimed.attempt },
      };
      assertJobDocumentSize(claimed);
      assertJobEventSize(event);
      transaction.update(ref, {
        status: claimed.status,
        attempt: claimed.attempt,
        eventSequence: claimed.eventSequence,
        attemptId: claimed.attemptId,
        leaseOwner: claimed.leaseOwner,
        leaseExpiresAt: claimed.leaseExpiresAt,
        heartbeatAt: claimed.heartbeatAt,
        updatedAt: claimed.updatedAt,
      });
      transaction.set(eventReference(ref, event.sequence), event);
      return claimed;
    });
  }

  async heartbeat(jobId: string, attemptId: string, progress?: string): Promise<boolean> {
    const ref = this.db.collection(JOBS).doc(jobId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return false;
      const job = asJob(snapshot);
      if (job.status !== "running" || job.attemptId !== attemptId || job.cancelRequested) return false;
      const now = this.now();
      const update = {
        heartbeatAt: now,
        leaseExpiresAt: now + this.leaseMs,
        updatedAt: now,
        ...(progress ? { progress: progress.slice(0, 500) } : {}),
      };
      assertJobDocumentSize({ ...job, ...update });
      transaction.update(ref, update);
      return true;
    });
  }

  async isCancellationRequested(jobId: string, attemptId: string): Promise<boolean> {
    const job = await this.getJobById(jobId);
    return !job || job.status !== "running" || job.attemptId !== attemptId || job.cancelRequested;
  }

  async markCancelled(jobId: string, attemptId: string): Promise<boolean> {
    const ref = this.db.collection(JOBS).doc(jobId);
    const before = await ref.get();
    if (!before.exists) return false;
    const uid = before.get("uid");
    if (typeof uid !== "string") return false;
    const limitRef = this.db.collection(JOB_LIMITS).doc(uid);
    const now = this.now();
    return this.db.runTransaction(async (transaction) => {
      const [snapshot, limit] = await Promise.all([transaction.get(ref), transaction.get(limitRef)]);
      if (!snapshot.exists) return false;
      const job = asJob(snapshot);
      if (job.status !== "running" || job.attemptId !== attemptId || !job.cancelRequested) return false;
      const sequence = job.eventSequence + 1;
      const event: JobEvent = { sequence, at: now, type: "cancelled" };
      assertJobEventSize(event);
      const ids = Array.isArray(limit.get("activeJobIds"))
        ? (limit.get("activeJobIds") as unknown[]).filter((id): id is string => typeof id === "string")
        : [];
      const activeJobIds = removeActiveJob(ids, jobId);
      const cancelled: GenerationJob = {
        ...job,
        status: "cancelled",
        eventSequence: sequence,
        updatedAt: now,
        expiresAt: new Date(now + JOB_RETENTION_SECONDS * 1_000),
      };
      delete cancelled.attemptId;
      delete cancelled.leaseOwner;
      delete cancelled.leaseExpiresAt;
      delete cancelled.heartbeatAt;
      assertJobDocumentSize(cancelled);
      transaction.set(ref, cancelled);
      transaction.set(limitRef, { uid, activeJobIds, activeJobCount: activeJobIds.length, updatedAt: now });
      transaction.set(eventReference(ref, sequence), event);
      return true;
    });
  }

  async scheduleRetry(jobId: string, attemptId: string, failure: JobFailure, nextAttemptAt: number): Promise<boolean> {
    const ref = this.db.collection(JOBS).doc(jobId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return false;
      const job = asJob(snapshot);
      if (job.status !== "running" || job.attemptId !== attemptId || job.cancelRequested) return false;
      const now = this.now();
      const safeError = { code: failure.code.slice(0, 100), message: failure.message.slice(0, 1_000), retryable: failure.retryable };
      const sequence = job.eventSequence + 1;
      const event: JobEvent = {
        sequence,
        at: now,
        type: "retry_scheduled",
        data: { code: safeError.code, retryAt: nextAttemptAt },
      };
      assertJobEventSize(event);
      const retry: GenerationJob = {
        ...job,
        status: "queued",
        error: safeError,
        attemptId: undefined,
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        heartbeatAt: undefined,
        nextAttemptAt,
        eventSequence: sequence,
        updatedAt: now,
      };
      assertJobDocumentSize(retry);
      transaction.update(ref, {
        status: "queued",
        error: safeError,
        attemptId: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        nextAttemptAt,
        eventSequence: sequence,
        updatedAt: now,
      });
      transaction.set(eventReference(ref, sequence), event);
      return true;
    });
  }

  async finishJob(jobId: string, attemptId: string, result: unknown): Promise<boolean> {
    const ref = this.db.collection(JOBS).doc(jobId);
    const initialSnapshot = await ref.get();
    if (!initialSnapshot.exists) return false;
    const initial = asJob(initialSnapshot);
    if (initial.status !== "running" || initial.attemptId !== attemptId) return false;
    const now = this.now();
    const sequence = initial.eventSequence + 1;
    const base: Record<string, unknown> = {
      ...initial,
      status: "succeeded",
      updatedAt: now,
      expiresAt: new Date(now + JOB_RETENTION_SECONDS * 1_000),
      eventSequence: sequence,
      attemptId: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    };
    delete base.result;
    delete base.resultRef;
    const prepared = await withPayloadReference({
      document: base,
      field: "result",
      payload: result,
      path: jobPayloadPath(initial.uid, jobId, "result"),
      storage: this.storage,
    });
    const completed: GenerationJob = prepared.document as GenerationJob;
    const event: JobEvent = { sequence, at: now, type: "succeeded" };
    assertJobEventSize(event);
    const limitRef = this.db.collection(JOB_LIMITS).doc(initial.uid);
    let committed = false;
    try {
      committed = await this.db.runTransaction(async (transaction) => {
        const [snapshot, limit] = await Promise.all([transaction.get(ref), transaction.get(limitRef)]);
        if (!snapshot.exists) return false;
        const current = asJob(snapshot);
        if (current.status !== "running" || current.attemptId !== attemptId) return false;
        const ids = Array.isArray(limit.get("activeJobIds"))
          ? (limit.get("activeJobIds") as unknown[]).filter((id): id is string => typeof id === "string")
          : [];
        const activeJobIds = removeActiveJob(ids, jobId);
        transaction.set(ref, completed);
        transaction.set(limitRef, {
          uid: initial.uid,
          activeJobIds,
          activeJobCount: activeJobIds.length,
          updatedAt: now,
        });
        transaction.set(eventReference(ref, sequence), event);
        return true;
      });
    } finally {
      const resultRef = prepared.document.resultRef;
      if (!committed && typeof resultRef === "string") {
        await this.storage.delete(resultRef).catch(() => undefined);
      }
    }
    return committed;
  }

  async failJob(jobId: string, attemptId: string, failure: JobFailure): Promise<boolean> {
    const ref = this.db.collection(JOBS).doc(jobId);
    const before = await ref.get();
    if (!before.exists) return false;
    const uid = before.get("uid");
    if (typeof uid !== "string") return false;
    const limitRef = this.db.collection(JOB_LIMITS).doc(uid);
    const now = this.now();
    const safeError = { code: failure.code.slice(0, 100), message: failure.message.slice(0, 1_000), retryable: failure.retryable };
    return this.db.runTransaction(async (transaction) => {
      const [snapshot, limit] = await Promise.all([transaction.get(ref), transaction.get(limitRef)]);
      if (!snapshot.exists) return false;
      const job = asJob(snapshot);
      if (job.status !== "running" || job.attemptId !== attemptId) return false;
      const sequence = job.eventSequence + 1;
      const event: JobEvent = {
        sequence,
        at: now,
        type: "failed",
        data: { code: safeError.code, retryable: safeError.retryable },
      };
      assertJobEventSize(event);
      const failed: GenerationJob = {
        ...job,
        status: "failed",
        error: safeError,
        eventSequence: sequence,
        updatedAt: now,
        expiresAt: new Date(now + JOB_RETENTION_SECONDS * 1_000),
      };
      delete failed.attemptId;
      delete failed.leaseOwner;
      delete failed.leaseExpiresAt;
      delete failed.heartbeatAt;
      assertJobDocumentSize(failed);
      const ids = Array.isArray(limit.get("activeJobIds"))
        ? (limit.get("activeJobIds") as unknown[]).filter((id): id is string => typeof id === "string")
        : [];
      const activeJobIds = removeActiveJob(ids, jobId);
      transaction.set(ref, failed);
      transaction.set(limitRef, { uid, activeJobIds, activeJobCount: activeJobIds.length, updatedAt: now });
      transaction.set(eventReference(ref, sequence), event);
      return true;
    });
  }
}
