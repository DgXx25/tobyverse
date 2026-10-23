import assert from "node:assert/strict";
import test from "node:test";
import { requireUser } from "../auth/require-user.js";
import { createJobHandlers } from "./routes.js";
import type { GenerationJob } from "./types.js";

function responseStub() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    writes: [] as string[],
    ended: false,
    listeners: new Map<string, (error?: unknown) => void>(),
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
    flushHeaders() {},
    write(value: string) { this.writes.push(value); return true; },
    end() { this.ended = true; this.listeners.get("finish")?.(); },
    on(name: string, listener: (error?: unknown) => void) { this.listeners.set(name, listener); return this; },
  };
  return response;
}

function request(input: Record<string, unknown> = {}) {
  return {
    authUser: { uid: "user-1", email: null, anonymous: false },
    body: {},
    params: {},
    query: {},
    headers: {},
    get(name: string) { return (this.headers as Record<string, string>)[name.toLowerCase()]; },
    ...input,
  };
}

function sampleJob(status: GenerationJob["status"] = "queued"): GenerationJob {
  return {
    id: "job-1", uid: "user-1", kind: "chat", status,
    idempotencyHash: "hash", createdAt: 1, updatedAt: 1, expiresAt: null,
    attempt: 0, nextAttemptAt: 1, eventSequence: 0, cancelRequested: false,
  };
}

test("Firebase middleware rejects missing bearer tokens and attaches verified owner identity", async () => {
  const middleware = requireUser(async (token) => ({ uid: token === "valid" ? "user-1" : "" } as never));
  const missing = responseStub();
  await middleware(request() as never, missing as never, () => assert.fail("missing token must not continue"));
  assert.equal(missing.statusCode, 401);

  const accepted = request({ headers: { authorization: "Bearer valid" } });
  const response = responseStub();
  let continued = false;
  await middleware(accepted as never, response as never, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal((accepted as typeof accepted & { authUser: { uid: string } }).authUser.uid, "user-1");
});

test("job creation checks budget first and returns the queued job ID immediately", async () => {
  let budgetCalls = 0;
  const store = {
    async createJob() { return sampleJob(); },
  };
  const handlers = createJobHandlers({
    store: store as never,
    worker: { abort() {}, supports: () => true } as never,
    budgetCheck: async () => { budgetCalls += 1; },
    pollMs: 1,
  });
  const res = responseStub();
  await handlers.create(request({ body: {
    kind: "chat",
    idempotencyKey: "request-key-123",
    payload: { prompt: "Hi" },
  } }) as never, res as never);

  assert.equal(budgetCalls, 1);
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { jobId: "job-1", status: "queued" });
});

test("SSE resumes after Last-Event-ID and disconnect does not cancel the job", async () => {
  const seenCursors: number[] = [];
  let cancellationCalls = 0;
  const job = sampleJob("succeeded");
  const store = {
    async getJob() { return job; },
    async getEvents(_uid: string, _id: string, cursor: number) {
      seenCursors.push(cursor);
      return [{ sequence: 2, at: 2, type: "delta", data: { text: "resumed" } }];
    },
    async requestCancellation() { cancellationCalls += 1; return job; },
  };
  const handlers = createJobHandlers({
    store: store as never,
    worker: { abort() {}, supports: () => true } as never,
    budgetCheck: async () => {},
    pollMs: 1,
  });
  const req = request({ params: { jobId: "job-1" }, headers: { "last-event-id": "1" } });
  const res = responseStub();
  await handlers.events(req as never, res as never);

  assert.deepEqual(seenCursors, [1]);
  assert.ok(res.writes.some((frame) => frame.includes("id: 2") && frame.includes("resumed")));
  assert.equal(res.ended, true);
  assert.equal(cancellationCalls, 0);
});

test("unsupported generation kinds and anonymous jobs are rejected before storage", async () => {
  let createCalls = 0;
  const handlers = createJobHandlers({
    store: { async createJob() { createCalls += 1; return sampleJob(); } } as never,
    worker: { abort() {}, supports: (kind: string) => kind === "chat" } as never,
    budgetCheck: async () => {},
  });
  const unsupported = responseStub();
  await handlers.create(request({ body: {
    kind: "path",
    idempotencyKey: "request-key-123",
    payload: { prompt: "Make a path" },
  } }) as never, unsupported as never);
  assert.equal(unsupported.statusCode, 501);
  assert.equal((unsupported.body as { code: string }).code, "job_kind_not_migrated");

  const anonymous = responseStub();
  await handlers.create(request({
    authUser: { uid: "guest-1", email: null, anonymous: true },
    body: { kind: "chat", idempotencyKey: "request-key-456", payload: { prompt: "Hello" } },
  }) as never, anonymous as never);
  assert.equal(anonymous.statusCode, 403);
  assert.equal((anonymous.body as { code: string }).code, "account_required_for_background_jobs");
  assert.equal(createCalls, 0);
});

test("retries create a linked job only for retryable failures", async () => {
  let created: Record<string, unknown> | undefined;
  const original = { ...sampleJob("failed"), input: { prompt: "Try again" }, error: { code: "provider_unavailable", message: "Try again", retryable: true } };
  const store = {
    async getJob() { return original; },
    async readInput() { return original.input; },
    async createJob(input: Record<string, unknown>) { created = input; return sampleJob(); },
  };
  let budgetCalls = 0;
  const handlers = createJobHandlers({
    store: store as never,
    worker: { abort() {}, supports: () => true } as never,
    budgetCheck: async () => { budgetCalls += 1; },
    pollMs: 1,
  });
  const res = responseStub();
  await handlers.retry(request({ params: { jobId: "job-1" } }) as never, res as never);

  assert.equal(res.statusCode, 202);
  assert.equal(budgetCalls, 1);
  assert.equal(created?.retryOf, "job-1");
  assert.notEqual(created?.idempotencyKey, original.idempotencyHash);
});
