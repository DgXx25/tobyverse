import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { DEFAULT_GEMINI_MODEL } from "../../../lib/ai/catalog.js";
import { selectModel } from "../../../lib/ai/model-routing.js";
import { ActiveJobLimitError, JobEventTooLargeError } from "./limits.js";
import { JobNotFoundError } from "./firestore-store.js";
import type { FirestoreJobStore } from "./firestore-store.js";
import type { GenerationWorker } from "./worker.js";
import { AuthRequiredError, requireUser, type AuthenticatedRequest, type TokenVerifier } from "../auth/require-user.js";
import { isTerminalJobStatus, toJobSummary, type GenerationJob, type GenerationJobKind } from "./types.js";

const JOB_KINDS = new Set<GenerationJobKind>(["chat", "path", "study_sheet", "exercise"]);
const STREAM_POLL_MS = 1_000;

type JobStorePort = Pick<FirestoreJobStore,
  "createJob" | "getJob" | "listActiveJobs" | "getEvents" | "readInput" | "readResult" | "requestCancellation"
>;
type WorkerPort = Pick<GenerationWorker, "abort" | "supports">;

export type JobRouteDependencies = {
  store: JobStorePort;
  worker: WorkerPort;
  budgetCheck(uid: string, model: string): Promise<void>;
  pollMs?: number;
};

function userOf(request: Request): { uid: string; anonymous: boolean } {
  const user = (request as AuthenticatedRequest).authUser;
  if (!user) throw new AuthRequiredError();
  return { uid: user.uid, anonymous: user.anonymous };
}

function modelFor(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const row = payload as Record<string, unknown>;
    const selection = typeof row.model === "string" ? row.model : "auto";
    if (selection === "auto") return selectModel(typeof row.prompt === "string" ? row.prompt : "", "auto").model;
    if (["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-4-argon"].includes(selection)) return selection;
  }
  return DEFAULT_GEMINI_MODEL;
}

function pathParam(request: Request, name: string): string {
  const value = request.params[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function safeTarget(value: unknown): Record<string, string | number | boolean | null> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const safe = Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item === null || ["string", "number", "boolean"].includes(typeof item))
    .slice(0, 24)) as Record<string, string | number | boolean | null>;
  return Object.keys(safe).length ? safe : undefined;
}

function routeError(error: unknown, response: Response) {
  if (error instanceof AuthRequiredError) {
    response.status(error.status).json({ error: error.message, code: "auth_required" });
    return;
  }
  if (error instanceof ActiveJobLimitError) {
    response.status(429).json({ error: error.message, code: error.code });
    return;
  }
  if (error instanceof JobNotFoundError) {
    response.status(404).json({ error: "Generation job not found.", code: error.code });
    return;
  }
  if (error instanceof JobEventTooLargeError) {
    response.status(413).json({ error: error.message, code: error.code });
    return;
  }
  if (error instanceof TypeError) {
    response.status(400).json({ error: error.message, code: "invalid_job_request" });
    return;
  }
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "job_request_failed";
  if (code === "weekly_ai_budget_exhausted") {
    response.status(429).json({ error: "Your weekly AI allowance is used up.", code });
    return;
  }
  if (code === "premium_model_required" || code === "paid_model_required" || code === "model_not_available") {
    response.status(403).json({ error: "That model is not available on your current plan.", code });
    return;
  }
  console.error(`[jobs] request failed error=${error instanceof Error ? error.name : "Error"}`);
  response.status(503).json({ error: "Generation service is temporarily unavailable.", code });
}

function responseJob(job: GenerationJob) {
  return toJobSummary(job);
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function createJobHandlers(dependencies: JobRouteDependencies) {
  const { store, worker, budgetCheck } = dependencies;
  const pollMs = Math.max(100, dependencies.pollMs ?? STREAM_POLL_MS);

  return {
    async create(request: Request, response: Response) {
      try {
        const user = userOf(request);
        if (user.anonymous) {
          response.status(403).json({ error: "Sign in to run generation in the background.", code: "account_required_for_background_jobs" });
          return;
        }
        const body = request.body as Record<string, unknown> | undefined;
        const kind = body?.kind;
        const key = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
        if (typeof kind !== "string" || !JOB_KINDS.has(kind as GenerationJobKind)) {
          response.status(400).json({ error: "Unknown generation job type.", code: "invalid_job_kind" });
          return;
        }
        if (!worker.supports(kind as GenerationJobKind)) {
          response.status(501).json({ error: "This generation type has not moved to background jobs yet.", code: "job_kind_not_migrated" });
          return;
        }
        if (!body?.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
          response.status(400).json({ error: "A generation payload is required.", code: "invalid_job_payload" });
          return;
        }
        if (key.length < 8 || key.length > 200) {
          response.status(400).json({ error: "An idempotency key is required.", code: "invalid_idempotency_key" });
          return;
        }
        const payload = body.payload;
        if (!user.anonymous) await budgetCheck(user.uid, modelFor(payload));
        const job = await store.createJob({
          uid: user.uid,
          kind: kind as GenerationJobKind,
          idempotencyKey: key,
          payload,
          target: safeTarget(body.target),
          anonymous: user.anonymous,
        });
        response.status(202).json({ jobId: job.id, status: job.status });
      } catch (error) {
        routeError(error, response);
      }
    },

    async list(request: Request, response: Response) {
      try {
        const { uid } = userOf(request);
        if (request.query.active !== "true") {
          response.status(400).json({ error: "Use active=true to list active generation jobs.", code: "invalid_job_query" });
          return;
        }
        const jobs = await store.listActiveJobs(uid);
        response.status(200).json({ jobs: jobs.map(responseJob) });
      } catch (error) {
        routeError(error, response);
      }
    },

    async status(request: Request, response: Response) {
      try {
        const { uid } = userOf(request);
        const job = await store.getJob(uid, pathParam(request, "jobId"));
        const result = job.status === "succeeded" ? await store.readResult(uid, job.id) : undefined;
        response.status(200).json({ job: toJobSummary(job, result) });
      } catch (error) {
        routeError(error, response);
      }
    },

    async events(request: Request, response: Response) {
      let uid: string;
      let job: GenerationJob;
      try {
        uid = userOf(request).uid;
        job = await store.getJob(uid, pathParam(request, "jobId"));
      } catch (error) {
        routeError(error, response);
        return;
      }

      const header = request.get("last-event-id") ?? "";
      let cursor = /^\d+$/.test(header) ? Number(header) : 0;
      cursor = Number.isSafeInteger(cursor) ? Math.max(0, cursor) : 0;
      response.status(200);
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Cache-Control", "no-cache, no-transform");
      response.setHeader("Connection", "keep-alive");
      response.flushHeaders?.();

      let connected = true;
      response.on("close", () => { connected = false; });
      while (connected) {
        try {
          const [events, current] = await Promise.all([
            store.getEvents(uid, job.id, cursor),
            store.getJob(uid, job.id),
          ]);
          for (const event of events) {
            response.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data ?? null)}\n\n`);
            cursor = Math.max(cursor, event.sequence);
          }
          if (isTerminalJobStatus(current.status) && cursor >= current.eventSequence) {
            response.end();
            return;
          }
          if (events.length === 0) response.write(": keep-alive\n\n");
          await wait(pollMs);
        } catch (error) {
          if (!response.headersSent) routeError(error, response);
          else response.end();
          return;
        }
      }
    },

    async cancel(request: Request, response: Response) {
      try {
        const { uid } = userOf(request);
        const job = await store.requestCancellation(uid, pathParam(request, "jobId"));
        worker.abort(job.id);
        response.status(200).json({ jobId: job.id, status: job.status, cancelRequested: job.cancelRequested });
      } catch (error) {
        routeError(error, response);
      }
    },

    async retry(request: Request, response: Response) {
      try {
        const { uid, anonymous } = userOf(request);
        const failed = await store.getJob(uid, pathParam(request, "jobId"));
        if (failed.status !== "failed" || failed.error?.retryable !== true) {
          response.status(409).json({ error: "This generation cannot be retried.", code: "job_not_retryable" });
          return;
        }
        const payload = await store.readInput(failed);
        if (!anonymous) await budgetCheck(uid, modelFor(payload));
        const job = await store.createJob({
          uid,
          kind: failed.kind,
          idempotencyKey: `retry-${failed.id}-${randomUUID()}`,
          payload,
          target: failed.target,
          retryOf: failed.id,
          anonymous: failed.anonymous,
        });
        response.status(202).json({ jobId: job.id, status: job.status, retryOf: failed.id });
      } catch (error) {
        routeError(error, response);
      }
    },
  };
}

export function createJobRouter(dependencies: JobRouteDependencies, verifyToken?: TokenVerifier) {
  const router = Router();
  const handlers = createJobHandlers(dependencies);
  router.use(requireUser(verifyToken));
  router.post("/", handlers.create);
  router.get("/", handlers.list);
  router.get("/:jobId/events", handlers.events);
  router.get("/:jobId", handlers.status);
  router.post("/:jobId/cancel", handlers.cancel);
  router.post("/:jobId/retry", handlers.retry);
  return router;
}

