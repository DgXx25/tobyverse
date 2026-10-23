# Tobyverse Parallel Stack and Durable Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first parallel Vite + Express slice and a Firestore-backed generation job system while keeping the current Next.js app runnable.

**Architecture:** Add npm workspaces under `frontend/` and `backend/`, with root scripts that run both without changing `npm run dev`. Express verifies Firebase tokens and exposes durable job APIs; a long-lived worker claims Firestore jobs with leases, processes generation independently of browser connections, and persists reconnectable events/results. The Vite slice provides a small job UI with clear reconnect/failure states; the existing Next app and handlers remain available until later route-parity phases.

**Tech Stack:** Vite, React, TypeScript, React Router, Express, Firebase Admin, Firestore, Firebase Storage, and Node's built-in test runner through `tsx` (no added test-runner dependency).

**Spec:** `docs/superpowers/specs/2026-10-23-tobyverse-vite-backend-migration-design.md`

## Global Constraints

- Keep the existing `npm run dev` serving Next.js on port 3000 throughout the parallel phase.
- Preserve existing routes, Firebase auth/data contracts, AI prompts, billing policy, and current Next API behavior.
- The serialized Firestore job document is capped at 256 KiB; event documents are capped at 16 KiB; larger inputs/results use private Firebase Storage objects.
- A user has at most 3 queued or running jobs, enforced transactionally.
- Terminal job-only data is retained for 30 days; canonical chat/artifact records keep existing retention.
- Check entitlement and weekly AI budget before each retry/provider attempt.
- A tab close or route navigation must not cancel work; explicit Stop remains best-effort cancellation.
- Do not put Firebase Admin credentials, prompts, private payloads, or access tokens in browser bundles or logs.
- Preserve TobyVerse's request-first chat voice; no prompt changes are part of this work.

## First-slice implementation status

- Completed: parallel workspace scripts, lazy Vite job route, Firestore job store with 256 KiB document/16 KiB event caps, explicit Firebase Storage bucket selection for private payload offload, 3-active-job transaction limit, lease-based worker with persisted running events, auth-protected status/list/SSE/cancel/retry APIs, per-attempt budget rechecks, authenticated chat compatibility handler, client reconnect/failure/retry UI, 30-day event/payload cleanup, and sanitized `npm run jobs:inspect` output.
- The backend runtime uses Node 22.16+ and loads the legacy chat route under the `react-server` condition. This is a transition bridge; extracting the chat route into a framework-neutral backend service remains necessary before deployment as a standalone backend artifact.
- Only chat generation is registered in the new worker. The API rejects other kinds until their handlers are migrated. Canonical project chat/artifact writes and full route parity remain later migration phases.
- Verified with focused store/worker/API/client tests, both workspace production builds, and the existing Next production build. A live HTTP request from the command sandbox could not reach localhost, so a real Firebase-backed close/reconnect/restart scenario remains an environment-level verification item.

### Implementation rulings

- Use Node's built-in `node:test` through `tsx --test` instead of Vitest, avoiding an extra dependency while keeping the checks fast.
- Keep `/api/chat` as a runtime compatibility bridge for this first vertical slice; do not alter the existing prompt, tools, RAG, or billing flow. Remove this bridge after the shared generation service is extracted.
- Keep job kinds in the schema for later migration, but reject any kind with no registered worker handler rather than accepting work that cannot run.

## Review Focus

- Two concurrent starts at the user's active-job limit must not exceed 3; Task 2 exercises concurrent creation.
- An oversized/private payload must be stored in Storage and never leak into the job document or logs; Task 2 verifies boundaries and owner-scoped paths.
- A worker restart or expired lease must recover the job without duplicate artifact writes; Task 3 verifies stale lease reclamation and idempotent terminal transitions.
- A retry after the account budget is exhausted must not call the provider; Task 3 verifies the handler is not invoked.
- SSE disconnect/refresh and explicit cancellation must remain distinct; Task 6 verifies reconnect cursor, visible connection-loss state, and explicit retry/cancel UI.

---

### Task 1: Parallel Vite and Express Workspaces

**Files:**
- Create: `frontend/package.json`, `frontend/index.html`, `frontend/vite.config.ts`, `frontend/tsconfig.json`
- Create: `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/styles.css`
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/src/app.ts`, `backend/src/server.ts`
- Create: `scripts/dev-stack.mjs`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: Vite at `http://localhost:5173`, Express health endpoint at `http://localhost:4000/healthz`, and root scripts `dev:frontend`, `dev:backend`, `dev:stack`, `build:frontend`, `build:backend`, `build:stack`.
- Preserves: root `npm run dev` and `npm run build` for the existing Next app.

- [ ] **Step 1: Add the workspace manifests and focused test scripts**
  Declare `frontend` and `backend` npm workspaces. Add Vite/React/React Router and Express/tsx dependencies to their owning packages; use Node's built-in `node:test` runner through `tsx --test` for focused checks.
- [ ] **Step 2: Add failing health and legacy-script checks**
  Add a backend test asserting `/healthz` returns `200 { ok: true }`; add a package test asserting the root Next `dev` script still begins with `next dev`.
- [ ] **Step 3: Run the smoke checks and confirm they fail**
  Run: `npm run test --workspace @tobyverse/backend`
  Expected: FAIL because the backend app and health endpoint do not exist yet.
- [ ] **Step 4: Add the root scripts and process launcher**
  Add the root scripts without changing the existing `dev`, `build`, or `start` values. Implement `scripts/dev-stack.mjs` with child-process start, signal forwarding, and clean shutdown; do not add `concurrently`.
- [ ] **Step 5: Implement the Vite shell and Express health route**
  Make Vite proxy `/api` to port 4000. Keep the first route shell intentionally small and use React Router `lazy` for the job route entry.
- [x] **Step 6: Install workspace dependencies and run focused checks**
  Run: `npm install`
  Run: `npm run build:frontend`
  Run: `npm run build:backend`
  Expected: both builds pass; `npm run dev` remains a Next command. (Verified.)
- [ ] **Step 7: Start the parallel stack and check health/HMR**
  Run: `npm run dev:stack`; request `http://localhost:4000/healthz` and open `http://localhost:5173`.
  Expected: both services start; editing a frontend component triggers Vite HMR; stopping the launcher stops both children.

### Task 2: Firestore Job Records, Payload Storage, and Active Limits

**Files:**
- Create: `backend/src/jobs/types.ts`, `backend/src/jobs/limits.ts`, `backend/src/jobs/payload-storage.ts`, `backend/src/jobs/firestore-store.ts`
- Create: `backend/src/jobs/firestore-store.test.ts`
- Modify: `firestore.indexes.json`, `firestore.rules`

**Interfaces:**
- Produces: `createJob(input): Promise<GenerationJob>`, `getJob(uid, jobId)`, `listActiveJobs(uid)`, `claimNextJob(workerId)`, `appendJobEvent(jobId, event)`, `finishJob(jobId, result)`, `failJob(jobId, error)`, and `cancelJob(uid, jobId)`.
- Constants: `MAX_JOB_DOCUMENT_BYTES = 256 * 1024`, `MAX_JOB_EVENT_BYTES = 16 * 1024`, `MAX_ACTIVE_JOBS_PER_USER = 3`, and terminal retention `30 * 24 * 60 * 60` seconds.

- [ ] **Step 1: Write failing tests for serialization, payload offload, idempotency, and active-job limit**
  Assert a record at/below 256 KiB remains in Firestore; an input/result exceeding the cap is stored in a private Storage path and the job doc contains only the reference; an event over 16 KiB is rejected/split; the fourth active job returns `active_job_limit`; concurrent starts cannot exceed 3; repeating an idempotency key returns the same job.
- [ ] **Step 2: Run the focused tests and confirm they fail**
  Run: `npm run test:jobs --workspace @tobyverse/backend`
  Expected: FAIL on missing job storage/constants.
- [ ] **Step 3: Implement the job record and private payload adapter**
  Use Firebase Admin Firestore and Storage. Keep owner UID, job kind, target, status, attempt, lease, progress, event sequence, idempotency key, `expiresAt`, and payload/result refs in the bounded job doc. Store large payloads at `users/{uid}/generation-jobs/{jobId}/{input|result}.json` with non-public metadata and checksum; delete an uploaded input if transactional job creation is rejected.
- [ ] **Step 4: Implement transactional creation and terminal count updates**
  Store the active count in `generationJobLimits/{uid}`. Create the idempotency mapping, increment the count, and create the job atomically; reject when current count is 3. Decrement only when transitioning from active to terminal, within the same transaction.
- [ ] **Step 5: Implement owner-scoped reads, event appends, cancellation, and expiration fields**
  Enforce ownership in service methods even though handlers also authenticate. Store events as bounded sequence documents. Keep client Firestore rules denied for job and limit collections; expose access only through the authenticated API.
- [ ] **Step 6: Run focused tests and inspect the Firestore diff**
  Run: `npm run test:jobs --workspace @tobyverse/backend`
  Expected: PASS, including the concurrent start and oversized-payload cases; Firestore rules/index changes do not alter existing collections.

### Task 3: Durable Worker, Retry, Cancellation, and Budget Re-check

**Files:**
- Create: `backend/src/jobs/worker.ts`, `backend/src/jobs/worker.test.ts`, `backend/src/jobs/registry.ts`, `backend/src/jobs/budget.ts`
- Modify: `backend/src/server.ts`, `backend/package.json`

**Interfaces:**
- Handler signature: `run(input: unknown, context: { job: GenerationJob; signal: AbortSignal; emit(event: JobEvent): Promise<void>; attemptId: string }): Promise<unknown>`.
- Worker defaults: concurrency `2`, poll interval `1000 ms`, heartbeat `30 s`, lease `120 s`, maximum attempts `3`; values are configurable by backend environment variables.

- [ ] **Step 1: Write failing tests for claim/heartbeat/recovery/retry/budget/cancel**
  Use an in-memory store and stub handlers. Assert a queued job is claimed once, an expired lease is reclaimable, retry increments attempt ID, budget denial prevents handler invocation, cancellation aborts active work at the next checkpoint, and a terminal transition decrements active count once.
- [ ] **Step 2: Run the focused worker tests and confirm failure**
  Run: `npm run test:jobs --workspace @tobyverse/backend`
  Expected: FAIL until the worker and retry policy are present.
- [ ] **Step 3: Implement the bounded worker loop and lease heartbeat**
  Claim through `claimNextJob`, run up to 2 handlers concurrently, heartbeat every 30 seconds with a 120-second lease, and stop accepting claims on SIGTERM before a bounded graceful shutdown.
- [ ] **Step 4: Re-check budget before every provider attempt**
  Re-read account access and call the existing AI usage preflight before each handler attempt. On budget/access denial, do not invoke the provider; mark a non-retryable failure with its safe code/message. Keep usage recording based on actual reported provider calls.
- [ ] **Step 5: Implement retry and explicit cancel semantics**
  Retry only transient failures up to 3 attempts using backoff and persisted `nextAttemptAt`; use a per-job `AbortController` for explicit Stop and provider cancellation where supported. Do not cancel on HTTP/SSE disconnect.
- [ ] **Step 6: Run worker tests and simulate restart recovery**
  Run: `npm run test:jobs --workspace @tobyverse/backend`
  Expected: PASS; a new worker instance reclaims a job after lease expiry and does not duplicate stable output writes.

### Task 4: Authenticated Job API, SSE Replay, and Operator Endpoints

**Files:**
- Create: `backend/src/auth/require-user.ts`, `backend/src/jobs/routes.ts`, `backend/src/jobs/routes.test.ts`, `backend/src/admin/jobs-routes.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- `POST /api/jobs` returns `202 { jobId, status: "queued" }`.
- `GET /api/jobs?active=true`, `GET /api/jobs/:jobId`, and `GET /api/jobs/:jobId/events` are owner-protected; SSE honors `Last-Event-ID`.
- `POST /api/jobs/:jobId/cancel` and `POST /api/jobs/:jobId/retry` require owner auth; retry creates a linked job with a new idempotency key.
- `GET /api/admin/jobs?status=failed|stuck` and retry mutation require existing admin auth.

- [ ] **Step 1: Write failing route tests**
  Assert missing/invalid Firebase tokens are rejected; users cannot read another user's job; create returns promptly; active-limit errors return 429; SSE replays only events after the cursor; failed reconnect/status responses preserve clear error codes; admin endpoints reject non-admin users.
- [ ] **Step 2: Run route tests and confirm they fail**
  Run: `npm run test:jobs --workspace @tobyverse/backend`
  Expected: FAIL until auth and route handlers are registered.
- [ ] **Step 3: Implement Firebase token middleware and job routes**
  Verify bearer tokens with Firebase Admin. Register `/api/jobs?active=true` before `/api/jobs/:jobId`; return safe JSON error shapes and avoid logging request bodies.
- [ ] **Step 4: Implement resumable SSE**
  Stream persisted events with `id:` sequence IDs and heartbeat comments; stop the connection cleanly when the client disconnects without signaling job cancellation.
- [ ] **Step 5: Add admin list/retry, health, and readiness routes**
  Report stale leases, failed jobs, active-limit rejections, Firestore connectivity, and worker readiness without returning prompts, inputs, or secrets.
- [ ] **Step 6: Run route tests**
  Run: `npm run test:jobs --workspace @tobyverse/backend`
  Expected: PASS for auth, owner isolation, SSE cursor, and admin guards.

### Task 5: First Real Generation Handler and Next Compatibility

**Files:**
- Create: `lib/chat/generation.ts`, `backend/src/jobs/handlers/chat.ts`, `backend/src/jobs/handlers/path.ts`, `backend/src/jobs/handlers/index.ts`
- Modify: `app/api/chat/route.ts`, `app/api/paths/generate/route.ts`, `backend/src/server.ts`
- Test: `backend/src/jobs/handlers/chat.test.ts`, `backend/src/jobs/handlers/handlers.test.ts`

**Interfaces:**
- `runChatGeneration(input, context): AsyncGenerator<ChatGenerationEvent>` contains provider/tool logic but no HTTP authentication or `Response` construction.
- The existing Next `/api/chat` adapter keeps its current SSE schema and account checks while invoking the shared generator; the backend job handler invokes the same generator using the authenticated job owner.
- Initial job kinds: `chat` and `path`; existing Next routes remain available with their current synchronous behavior during transition.

- [ ] **Step 1: Add regression tests for shared chat event and terminal behavior**
  Assert event order/content and stopped/error handling using stub provider streams, and keep prompt assembly output unchanged.
- [ ] **Step 2: Run the regression tests and confirm they fail**
  Run: `npm run test:jobs --workspace @tobyverse/backend`
  Expected: FAIL because generation is currently embedded in the route handler.
- [ ] **Step 3: Extract provider/tool generation into the framework-neutral service**
  Move the route's local parsing and generation loop into `lib/chat/generation.ts`; keep authentication, usage session creation, and SSE framing in the Next route adapter. Do not edit prompt text or `lib/ai/voice.ts`.
- [ ] **Step 4: Register chat and path job handlers**
  Adapt `streamPathDocument` events and the shared chat generator into persisted job events/results. Commit canonical chat/artifact output with job-derived IDs so reconnect/retry does not duplicate writes.
- [ ] **Step 5: Run focused generation tests and old Next checks**
  Run: `npm run test:jobs --workspace @tobyverse/backend`
  Run: `npm run build`
  Expected: chat service tests and the existing Next production build pass with old endpoints still usable.

### Task 6: Vite Job UI with Reconnect and Error States

**Files:**
- Create: `frontend/src/auth/firebase.ts`, `frontend/src/jobs/job-client.ts`, `frontend/src/jobs/use-generation-job.ts`, `frontend/src/jobs/JobStatus.tsx`, `frontend/src/routes/JobsPage.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/styles.css`
- Test: `frontend/src/jobs/job-client.test.ts`

**Interfaces:**
- `startJob(kind, input, idempotencyKey): Promise<GenerationJobSummary>`.
- `getActiveJobs(): Promise<GenerationJobSummary[]>`.
- `subscribeToJob(jobId, lastEventId, handlers): () => void` reconnects with bounded exponential backoff and exposes connection state.
- Retry creates a new linked job; Stop calls the explicit cancel route; unmount/connection loss does not cancel.

- [ ] **Step 1: Write failing state/client tests**
  Assert refresh restores active job IDs, SSE cursor resumes after the last event, retry creates a new ID/key, terminal failure displays its safe reason, and repeated disconnect reaches a visible resume state rather than an infinite spinner.
- [ ] **Step 2: Run focused frontend tests and confirm they fail**
  Run: `npm run test --workspace @tobyverse/frontend -- --run`
  Expected: FAIL because the job client and states are absent.
- [ ] **Step 3: Implement authenticated job client and bounded reconnect**
  Use Firebase client auth to attach a fresh ID token to API requests. Persist only job IDs/cursors in local storage; fetch authoritative status/results from the API after refresh.
- [ ] **Step 4: Implement visible status and recovery actions**
  Render queued/running/reconnecting/succeeded/failed/cancelled states. Show retry only for retryable failures and resume for reconnect failures. Keep status copy concise and consistent with current UI voice.
- [ ] **Step 5: Run frontend tests and production build**
  Run: `npm run test --workspace @tobyverse/frontend -- --run`
  Run: `npm run build:frontend`
  Expected: tests pass and the job route is a lazy-loaded chunk.

### Task 7: Retention, Job Inspection, and First-Slice Verification

**Files:**
- Create: `backend/src/jobs/cleanup.ts`, `backend/src/jobs/inspect.ts`, `backend/src/jobs/cleanup.test.ts`
- Modify: `backend/src/server.ts`, `backend/package.json`, `README.md`

**Interfaces:**
- Cleanup deletes terminal job records, events, and private blobs after 30 days; active jobs never expire.
- `npm run jobs:inspect` lists recent queued/running/failed/stale jobs with safe metadata only.
- Worker logs include job ID, kind, attempt, state, queue wait, duration, and safe error code only.

- [ ] **Step 1: Write failing cleanup/inspection tests**
  Assert expired terminal jobs and event/blob children are deleted; active jobs are retained; inspector output omits prompts, payloads, and tokens.
- [ ] **Step 2: Implement cleanup and operator inspection**
  Run cleanup in bounded batches from the worker and expose the one-shot inspector command against the configured Firebase project.
- [ ] **Step 3: Run focused backend tests and builds**
  Run: `npm run test:jobs --workspace @tobyverse/backend`
  Run: `npm run build:backend`
  Expected: cleanup/inspection tests pass and backend build is clean.
- [ ] **Step 4: Verify the first vertical slice**
  Run: `npm run dev:stack`; start a real chat/path job; close the Vite tab while it runs; reopen and restore it from active jobs; verify completion; restart the backend during a queued/leased job and verify recovery; exercise explicit Stop, failed-job retry, budget denial, and the fourth-job limit.
  Run: `npm run build` for the current Next app.
  Expected: Vite/backend work independently, Next remains runnable, and each job state is visible/recoverable.

## Follow-on migration after this plan

After this parallel job slice passes, continue the approved design in separate route-group increments: migrate the remaining chat UI consumers, study sheets/exercises and other generation surfaces, then public/auth/project/library/material/share/account/billing/admin routes and API handlers. Keep Next as the default and rollback target until route/API parity and the full regression pass; only then switch and remove Next.
