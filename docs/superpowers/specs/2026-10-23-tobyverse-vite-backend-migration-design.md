# Tobyverse Vite frontend and durable backend migration

## Intent

Move Tobyverse from the Next.js App Router to a Vite, React, TypeScript, and React Router single-page frontend backed by a separate Node.js API and worker. Keep the existing Next.js app runnable while the parallel system is built and verified. The migration should reduce the browser's initial JavaScript and make development/navigation quicker without changing the product's routes, data formats, auth behavior, or user-facing workflows.

The most important reliability change is to make user-facing AI generation independent of the browser request. A closed tab must not cancel accepted work, and a backend restart should leave enough durable state to retry/recover work.

## Goals

- Add a `frontend/` Vite SPA and a `backend/` Express service in parallel with the current Next.js app.
- Preserve every current page route, API route, auth flow, UI behavior, and Firebase data contract before switching the default app.
- Keep Firebase Auth, Firestore, and Storage as the source of truth.
- Use React Router lazy route modules and dynamically import heavy or rarely visited UI so the initial client bundle contains only the active route and shared shell.
- Keep public, legal, and pricing routes indexable with route-appropriate metadata after the SPA migration.
- Move API handling, Firebase Admin, AI providers, file processing, billing, and long-running work to the Node backend; keep server-only modules out of the browser build.
- Move user-triggered AI generation (chat plus study sheets, exercises, paths, and any other current user-facing generation flow found in the route inventory) onto a durable job protocol.
- Keep `npm run dev` serving the current Next app during transition. Add explicit scripts for the SPA/backend pair without changing that command.
- Run a route and behavior parity check before switching the production frontend. Remove the Next runtime only after the replacement is built and the core flows, especially restart recovery for generation, have been verified.

## Non-goals

- Redesigning Tobyverse UI or changing product copy, prompts, model behavior, billing policy, or Firestore document shapes outside the new job records.
- Replacing Firebase or changing the current auth provider.
- Deploying or changing production DNS/traffic as part of local implementation.
- Adding a separate broker/queue service as a prerequisite. Start with Firestore and the always-on backend worker; keep the job interface replaceable if traffic later needs Cloud Tasks or a dedicated queue.
- Treating a browser tab closing as a cancellation request.

## Current state and constraints

- The repository is a Next.js App Router application with roughly 70 files under `app/`, 151 component files, 254 library files, and 37 API route handlers.
- Firebase Auth, Firestore, Firebase Storage, Firebase Admin, and Firebase Hosting are already used. `firebase.json` currently configures Firebase Hosting's framework backend.
- Navigation is coupled to `next/link` and `next/navigation`; a few pages also use Next cookies/redirects and metadata. These need an explicit SPA equivalent.
- There are many client components, so a SPA cannot retain React Server Components. Its bundle strategy will use lazy route chunks and feature-level splitting; backend code stays in the server package.
- The checkout contains substantial pre-existing uncommitted work. Keep the current Next app and these edits intact while introducing the parallel structure; do not reset or broadly rewrite files as part of scaffolding.
- `AGENTS.md` requires preserving TobyVerse's request-first chat voice. This migration does not require prompt changes.

## Architecture

### Frontend

- `frontend/` contains Vite, React, TypeScript, and React Router entry points, route definitions, and compatibility helpers.
- Route modules load through `React.lazy`/React Router lazy routes and a shared Suspense fallback. Large editors, document/PDF viewers, charts, rich content, admin tools, and other non-initial features are split behind their owning route or interaction.
- Existing UI components and domain/client helpers are reused where they are framework-neutral. Small compatibility adapters replace `next/link`, `useRouter`, `usePathname`, and `useSearchParams`; server-only page behavior is moved into route guards or backend requests.
- The browser continues to use Firebase's client SDK for Firebase-native realtime data where that is already the behavior. Firebase Admin and provider/API secrets remain in the backend.
- Vite proxies `/api/*` to the backend during development. The production frontend is static and calls the backend through a same-origin route/rewrite or configured API origin.
- A bundle analyzer report is available from the frontend build so route chunk sizes and accidental shared imports can be checked after migration.

### Backend and API compatibility

- `backend/` contains a separate Express TypeScript process for APIs, auth verification, Firebase Admin, AI, billing, Storage operations, and workers.
- The backend preserves the existing `/api/*` paths, methods, authorization rules, request/response schemas, status codes, and streaming/file behavior. Existing Next handlers may be reused through framework-neutral service functions during transition, but the final backend must not depend on Next runtime modules.
- Firebase ID tokens are verified by Firebase Admin on protected requests. CORS and job reads are restricted to the configured Tobyverse origins and authenticated job owner.
- Vite and the backend get dedicated build/dev commands. A root Node launcher starts/stops both without an extra process-manager dependency; the existing Next `dev` script remains available until cutover.
- Public and legal/pricing pages are pre-rendered as static HTML with route-specific title/description metadata. Dynamic shared-chat URLs get metadata from the share snapshot before the SPA mounts; client navigation also updates document metadata.

### Durable generation jobs

1. **Create:** the authenticated client submits a typed request plus an idempotency key to `POST /api/jobs`. The API verifies the Firebase ID token, validates the payload, performs existing entitlement/budget preflight checks, records the target chat/artifact reference, and creates the job in Firestore. It returns `202 { jobId, status: "queued" }` without waiting for a provider call. Repeating the same owner/key returns the existing job instead of starting duplicate work.
2. **Store:** `generationJobs/{jobId}` records owner, kind, target reference, idempotency key, status (`queued`, `running`, `succeeded`, `failed`, or `cancelled`), attempt count, timestamps, lease/heartbeat, progress, and terminal result/error metadata. The serialized job document has a conservative hard 256 KiB cap (256 × 1024 bytes including serialized payload and metadata). Move large input snapshots and results to private Firebase Storage before the job document reaches that cap; Firestore stores only the private object path. The backend resolves the bucket explicitly from `FIREBASE_STORAGE_BUCKET`, falling back to the existing `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` setting; it does not rely on a default bucket being configured in the Admin app. Each event document is capped at 16 KiB and lives at `generationJobs/{jobId}/events/{sequence}`.
3. **Limit:** allow at most 3 queued or running jobs per user. Enforce this atomically with a private per-user active-job counter document in the same transaction that creates a job. Decrement exactly once when a job becomes terminal, so concurrent requests cannot exceed the limit.
4. **Process:** the long-lived Node worker polls on startup and at a short interval, claims queued or lease-expired jobs in a Firestore transaction, and processes them outside the HTTP request lifecycle. A claim records an attempt ID and lease and appends a persisted `running` event so connected clients update immediately; the worker heartbeats while processing and stores progress/results. Before each retry/provider attempt, the worker rechecks current account entitlement and weekly AI budget; if access is no longer allowed, it stops before calling the provider and records a clear terminal error. Generated chat/artifact writes and usage records use stable job/attempt IDs to avoid duplicate side effects on retries.
5. **Recover:** if a worker stops, the next process finds queued work and jobs whose heartbeat/lease expired, reclaims them, increments the attempt, and replays from the saved input. This is at-least-once processing: a provider call interrupted by a crash may run again, so exact mid-token resume and exactly-once provider billing are not promised. The API responds to SIGTERM by stopping new claims and allowing active work a bounded graceful-shutdown window; Firestore lease recovery handles work that exceeds it.
6. **Reconnect:** `GET /api/jobs/:jobId` returns the owner-protected status/result. `GET /api/jobs/:jobId/events` streams persisted events as SSE, accepts `Last-Event-ID`, and replays events after the cursor. `GET /api/jobs?active=true` lists the signed-in user's active jobs so the SPA can restore them on any tab/device. Chat jobs are linked to a persisted pending assistant message; other jobs store their target route/artifact reference. The client restores the job ID, renders current progress, then resumes the event stream after refresh or tab close. Closing a tab only closes its stream; it does not cancel work.
7. **Show failures and reconnect state:** the UI renders queued/running/reconnecting/succeeded/failed/cancelled states. SSE reconnect uses bounded exponential backoff; a failed reconnect leaves an explicit “connection lost” state with a resume action rather than an indefinite spinner. Terminal failures show a safe reason and retry action only when retryable. Retrying creates a new idempotency key/job linked to the failed job and rechecks budget before any new provider call.
8. **Cancel:** the existing explicit Stop control calls `POST /api/jobs/:jobId/cancel`. Queued jobs stop before work begins. Running provider calls are aborted where supported; otherwise the worker stops at the next safe checkpoint and preserves the existing partial/stopped response behavior. No automatic cancel is sent for navigation or tab closure.
9. **Protect and retain:** every start/status/list/event/result/cancel/retry operation verifies owner identity; Firestore rules do not allow clients to read or mutate another user's job records. Terminal job input copies, output/event records, and job-only results are kept for 30 days and then cleaned up. Canonical chat messages and saved artifacts keep their existing retention. Usage is committed from reported model calls, including work incurred before cancellation; no new reservation or refund policy is introduced.

The worker and API run as a long-lived Node service. The code remains platform-neutral; Firebase Hosting can serve the static frontend, and the backend can run on Cloud Run configured with instance-based CPU and a minimum instance, or on a comparable persistent Node host. Cloud Run's minimum-instance setting is a best-effort warm capacity setting, not a queue guarantee; Firestore leases/recovery provide durability when instances restart. A separate queue service is deferred unless operational needs require it.

### Local development

- Use Node.js 22.16 or newer for the backend scripts (`--env-file-if-exists` and the TypeScript runtime loader are used by the long-lived worker).
- Preserve `npm run dev` on port 3000 for the current Next app.
- Add `npm run dev:frontend` (Vite on port 5173), `npm run dev:backend` (Express API plus worker on port 4000), and `npm run dev:stack` to start both new processes in one terminal and stop both together. Vite proxies `/api/*` to port 4000; the worker runs in the backend process, so the new SPA does not require Next to be running.
- Keep Firebase's existing public `NEXT_PUBLIC_FIREBASE_*` values in the repository-root `.env.local`; Vite reads that root env directory and the backend loads the same file. Firebase Storage payload offload requires `FIREBASE_STORAGE_BUCKET` or the existing `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` value. Firebase Admin still uses the existing local ADC/Firebase CLI credential resolution. Do not put service-account credentials in `NEXT_PUBLIC_*` variables.
- Keep separate frontend/backend build and start scripts. A small Node launcher handles child processes and shutdown so a separate process-manager package is not required.
- Use the repository's existing Firebase local credentials/environment for Firebase Admin. Keep secrets in ignored local env files; document required variable names without committing credentials. Emulator use can be enabled with standard Firebase emulator environment variables when configured.

Commands for the parallel slice:

```sh
npm run dev:stack
npm run build:stack
npm run jobs:inspect
```

The normal `npm run dev` and `npm run build` continue to use Next.js.

## Incremental migration and compatibility

1. **Parallel scaffold:** leave the Next app, root `npm run dev`, current routes, and current API handlers in place. Add the frontend/backend packages and `dev:stack` so both systems can be run side by side.
2. **Generation first:** add the Firestore job store, worker, auth-protected job APIs, observability, and adapters around the current chat/sheet/exercise/path generation logic. Keep the existing Next generation endpoints as-is initially. Verify a real job completes after closing its SSE client and recovers after a controlled backend restart.
3. **SPA shell and core flows:** add Vite/React Router, route lazy loading, navigation compatibility, auth, public shell, and project/chat routes. Connect migrated generation UI to the new job APIs. Next remains the default runnable app and remains available as a fallback.
4. **Feature parity:** migrate library/materials, sharing, account/billing, admin, legal/pricing, and remaining route families in batches. Move APIs to Express while retaining compatible Next handlers until their SPA consumers pass parity checks. Keep frontend feature chunks split by route/interaction.
5. **Verify and switch:** compare all page paths and the 37 current API handlers, run production builds and smoke/regression checks, and verify job close/reconnect, cancel, retry, and restart recovery. Deploy the SPA/backend to a preview first, then switch hosting rewrites only after acceptance. Remove Next-specific runtime dependencies/configuration after the replacement is verified; until then, the current Next app stays runnable.

## Rollback

- Do not mutate the current production Hosting release during implementation. Deploy the new Vite build to a Firebase Hosting preview channel and the backend as a separate service/revision first.
- Keep the last known-good Next Hosting release and service/revision available through the cutover verification period. Cut over through Hosting route rewrites/target configuration rather than destructive project replacement.
- If the SPA has a user-facing regression, restore the prior Next Hosting release/rewrites and keep the backend deployed but dark. If the backend has an issue, route traffic back to the existing Next API handlers; Firestore job documents are additive and ignored by the legacy app.
- Avoid destructive schema migrations. If the new backend is stopped, queued/running jobs remain durable; when a compatible worker is restored it can reclaim queued/expired jobs. Do not delete the job collection during rollback.
- Locally, rollback remains immediate: stop `dev:stack` and run the unchanged `npm run dev` command.

## Basic job monitoring

- Emit structured logs for job ID, kind, status transition, attempt, queue wait, processing duration, worker instance, and a sanitized error code. Never log prompts, material contents, access tokens, or private job payloads. The worker periodically deletes expired terminal jobs, their event subcollections, idempotency mappings, and Storage payloads after the 30-day retention window.
- Add `/healthz` for process health and `/readyz` for Firestore/worker readiness. Log worker startup, heartbeat, claim, retry, completion, cancellation, stale-lease recovery, and terminal failure.
- Add an admin-only `GET /api/admin/jobs` view for failed jobs, jobs whose heartbeat/lease is stale, and per-user active-job-limit rejections, with age, attempt count, safe error summary, and links to the owning context. Provide a retry action only for retryable failures and protect it with the existing admin authorization.
- `npm run jobs:inspect` lists up to 100 recent queued, running, and failed jobs with age, attempt, safe error code, and a stuck flag (expired running lease or queued more than five minutes past its scheduled time). It never prints prompts or payloads. This is the low-dependency local fallback when no admin UI is available.
- First release uses logs, health endpoints, and the admin/CLI view; external metrics/alerts are optional later rather than a prerequisite.

## First parallel slice status

- Implemented: Vite/React Router shell, route-lazy job screen, Firebase Auth sign-in, Express job APIs, Firestore job records/events, explicit Storage bucket resolution for payload offload, worker leases/retries/cancellation, budget rechecks, persisted running/terminal events, SSE replay, reconnect/error UI, cleanup, and the local inspector.
- Basic local monitoring is implemented through sanitized worker transition logs, `/healthz`, `/readyz`, and `npm run jobs:inspect`. The admin-only job dashboard endpoint described above remains follow-up work.
- The only registered background generation handler is chat. Path, study-sheet, and exercise submissions are rejected with `job_kind_not_migrated` until their handlers are ported.
- Chat generation currently uses a runtime compatibility bridge to the existing Next `/api/chat` handler so its prompt/tool/RAG/usage rules stay unchanged. The worker itself does not require a Next server to be running, but this bridge still loads Next route source and dependencies from the same repository. Extracting a framework-neutral generation service is required before deploying the backend as a standalone artifact.
- The Vite shell currently provides a focused background-generation preview, not route parity. Job results are retained in the job record; wiring them into canonical project chat/artifact writes and migrating the remaining Tobyverse screens is subsequent work. The current Next app remains the runnable default and rollback target.

## Acceptance criteria

- Existing Next development command continues to start the current app throughout the parallel phase.
- New dev scripts start Vite and Express/worker together; the frontend is usable without Next running.
- Every existing page path resolves to equivalent UI and navigation behavior in the SPA; every API path remains compatible.
- Vite's initial-entry chunk excludes backend-only code and large, off-route features; the analyzer identifies route/feature chunks and their sizes.
- Chat and other user-facing generation return a job ID promptly, continue after the client disconnects, expose owner-protected status/progress/result, and recover queued or lease-expired work after a worker restart without duplicate artifact writes. Explicit Stop retains the existing stopped-response behavior.
- Job Firestore documents never exceed 256 KiB; larger inputs/results use private Storage references, and event documents never exceed 16 KiB.
- A user's fourth simultaneous queued/running job is rejected with a clear retryable limit response; concurrent starts cannot race past the limit.
- Every worker retry rechecks entitlement and budget before calling a provider; an exhausted budget prevents the retry and returns a clear UI state.
- Failed jobs and failed reconnects are visible, explain the current state, and offer retry/resume only when valid; no user remains on an unbounded spinner.
- Public/legal/pricing pages have crawlable static output and route-appropriate metadata; shared-chat URLs serve crawlable metadata based on the shared snapshot.
- Closing or refreshing a tab does not lose the association to an active chat job; reload restores it and resumes SSE from the last event cursor. Another signed-in tab/device can find it via the active-jobs endpoint.
- Operators can identify failed and stale jobs from sanitized logs and the admin-only job view or local inspection script.
- A hosting/API cutover can be rolled back to the still-available Next release without deleting Firestore job state.
- Existing auth, Firebase data, materials, chats, account/billing, sharing, and admin flows pass the migration's smoke and regression checks.
- The final production build no longer requires Next.js.

## Decisions made for the implementation

- Parallel folders are preferred over a new branch so the current working tree remains visible and the existing app stays runnable.
- Firestore plus a long-lived worker is the simple first queue; the queue API will be isolated enough to replace its polling mechanism later.
- Route chunks and explicit heavy-feature boundaries are the SPA's main client-JavaScript optimization.
- Terminal job reconnect data is kept for 30 days. Existing canonical chat/artifact records are unaffected.
- Serialized Firestore job documents are capped at 256 KiB; event documents are capped at 16 KiB; larger inputs/results live in private Firebase Storage.
- Each user may have at most 3 queued/running jobs, enforced transactionally; a fourth simultaneous job is rejected with `429 active_job_limit`.
- The worker rechecks account access and weekly budget before each retry/provider attempt.
- The frontend displays terminal failures and reconnect loss explicitly and offers retry/resume when appropriate.
- Preserve public-page indexability using static prerendering plus dynamic metadata for shared-chat pages.
- Explicit cancellation is best-effort for active provider calls and stops at a safe processing boundary; account usage records actual reported usage, consistent with current accounting.
- No production traffic switch or external deployment is included in the code migration. Deployment configuration and required environment variables will be documented.

## References

- React Router route-level code splitting: https://reactrouter.com/explanation/code-splitting
- Firestore transactions and atomic claim/update operations: https://firebase.google.com/docs/firestore/manage-data/transactions
- Cloud Run background processing and CPU billing behavior: https://docs.cloud.google.com/run/docs/configuring/billing-settings
- Cloud Run minimum-instance behavior and limitations: https://docs.cloud.google.com/run/docs/configuring/min-instances
