import assert from "node:assert/strict";
import test from "node:test";
import { GenerationWorker, JobExecutionError } from "./worker.js";
import type { GenerationJob } from "./types.js";

function job(attempt = 1, attemptId = `attempt-${attempt}`): GenerationJob {
  return {
    id: "job-1",
    uid: "user-1",
    kind: "chat",
    status: "running",
    idempotencyHash: "key-hash",
    createdAt: 1,
    updatedAt: 1,
    expiresAt: null,
    attempt,
    attemptId,
    nextAttemptAt: 1,
    eventSequence: 0,
    cancelRequested: false,
  };
}

function setup(options: { preflight?: () => Promise<void>; handler?: (input: unknown, context: any) => Promise<unknown> } = {}) {
  const calls = { handler: 0, preflight: 0, failures: [] as unknown[], retries: [] as unknown[], finishes: [] as unknown[], cancellations: 0 };
  let cancelled = false;
  const store = {
    async readInput() { return { prompt: "hello" }; },
    async appendJobEvent() {},
    async heartbeat() { cancelled = true; return true; },
    async isCancellationRequested() { return cancelled; },
    async finishJob(...args: unknown[]) { calls.finishes.push(args); return true; },
    async failJob(...args: unknown[]) { calls.failures.push(args); return true; },
    async scheduleRetry(...args: unknown[]) { calls.retries.push(args); return true; },
    async markCancelled() { calls.cancellations += 1; return true; },
  };
  const worker = new GenerationWorker({
    store: store as never,
    handlers: {
      chat: async (input, context) => {
        calls.handler += 1;
        return options.handler ? options.handler(input, context) : { text: "done" };
      },
    },
    preflight: async () => {
      calls.preflight += 1;
      if (options.preflight) await options.preflight();
    },
    heartbeatMs: 5,
    maxAttempts: 3,
    retryBaseMs: 1,
  });
  return { worker, calls };
}

test("budget denial fails before the generation handler is invoked", async () => {
  const { worker, calls } = setup({
    preflight: async () => { throw new JobExecutionError("weekly_ai_budget_exhausted", "Budget used up.", false); },
  });

  await worker.runClaimedJob(job());
  assert.equal(calls.preflight, 1);
  assert.equal(calls.handler, 0);
  assert.equal(calls.failures.length, 1);
  assert.equal((calls.failures[0] as unknown[])[2] && ((calls.failures[0] as unknown[])[2] as { code: string }).code, "weekly_ai_budget_exhausted");
});

test("every retry rechecks budget before it can call the generation handler", async () => {
  let checks = 0;
  const { worker, calls } = setup({
    preflight: async () => {
      checks += 1;
      if (checks === 2) throw new JobExecutionError("weekly_ai_budget_exhausted", "Budget used up.", false);
    },
    handler: async () => {
      throw new JobExecutionError("provider_unavailable", "Temporary provider failure.", true);
    },
  });

  await worker.runClaimedJob(job(1, "attempt-1"));
  await worker.runClaimedJob(job(2, "attempt-2"));
  assert.equal(calls.preflight, 2);
  assert.equal(calls.handler, 1);
  assert.equal(calls.retries.length, 1);
  assert.equal(calls.failures.length, 1);
});

test("a persisted cancel request aborts active work and reaches a terminal cancellation", async () => {
  const { worker, calls } = setup({
    handler: async (_input, context) => new Promise((_resolve, reject) => {
      context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true });
    }),
  });

  await worker.runClaimedJob(job());
  assert.equal(calls.cancellations, 1);
  assert.equal(calls.finishes.length, 0);
});
