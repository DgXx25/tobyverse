# Material Count Request Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-project startup count requests with a deduplicated batch and reduce avoidable authenticated API latency.

**Architecture:** Keep project counts behind the authenticated API, accept a bounded list of project IDs, batch ownership reads, and run aggregate queries concurrently. Share in-flight and briefly cached count results on the client. Preserve the existing Identity Toolkit token lookup semantics; request batching reduces this lookup from once per project to once per batch.

**Tech Stack:** Next.js App Router, React, Firebase Admin Auth/Firestore, Firebase client SDK.

**Spec:** User request in the current TobyVerse performance task.

## Global Constraints

- Keep account-only endpoints unavailable to anonymous users.
- Preserve project ownership checks and the existing single-project count response contract.
- Bound the number of project IDs accepted in one request.
- Keep count metadata fresh after client material writes and deletes.

## Review Focus

- Empty, malformed, duplicate, and over-limit project ID lists must not disclose counts.
- A project owned by another user must return the same not-found behavior as a missing project.
- Repeated effects for the same project set must share one in-flight request.
- Material additions and deletions must invalidate the short-lived count cache.
- Client count failures must retain the existing card fallback behavior.

---

### Task 1: Batch and deduplicate project material counts

**Files:**
- Modify: `components/notebooks-home.tsx`
- Modify: `lib/workspace/use-notebooks.ts`
- Modify: `lib/materials/store.ts`
- Modify: `app/api/materials/count/route.ts`
- Modify: `next.config.mjs`

**Interfaces:**
- Add `countMaterialsForProjects(projectIds: string[]): Promise<Record<string, number>>`.
- Continue supporting the existing `{ projectId } -> { count }` API request shape.

- [x] Replace per-project UI calls with one bounded batch helper after the notebook subscription and saved folder preference are ready.
- [x] Share the project-list Firestore listener between the top bar and notebook grid.
- [x] Share identical in-flight batches, cache returned counts briefly per user/project, and invalidate those counts after material document writes or deletes.
- [x] Validate the batch, fetch project ownership documents together, then run each authorized aggregate count concurrently.
- [x] Preserve the existing token lookup semantics; batching reduces count-page token lookups to one per batch without changing shared authentication behavior.
- [x] Ensure the dev server and production build use distinct output directories; confirmed the dev server writes to `.next-dev`.
- [ ] Complete a production build and capture an authenticated post-change request log. `npx tsc --noEmit` and `git diff --check` pass, and the dev server starts. `next build` currently fails on Windows with `EPERM` while creating generated `.next` directories; the available dev log is pre-change, and no authenticated browser session was available for a post-change count trace.
