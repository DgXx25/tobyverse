# Upload and Chat Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make uploads, project opening, create, stop, and settled work details resilient to the specified failures.

**Architecture:** Use Admin-backed same-origin create/bootstrap APIs, bound Firestore chat subscriptions to the newest 40 messages, and fetch older messages only on upward scroll. Validate/reserve the 1 GiB storage pool first, normalize HEIC/HEIF to JPEG in the upload route, and keep per-chip errors local. Keep stop persistence conditional on nonempty output and expose saved artifact steps through a small settled-status disclosure.

**Tech Stack:** Next.js App Router, Firebase Admin/Firestore client, React, TypeScript, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-25-upload-chat-resilience-design.md`

## Global Constraints

- Preserve all pre-existing working-tree edits.
- Pool check is first; the beta pool is 1 GiB and quota copy shows remaining capacity.
- HEIC/HEIF is converted server-side and stored as JPEG.
- Create/bootstrap use same-origin Firebase Admin routes with Bearer authentication; create UI deadline is 12 seconds.
- Initial/bootstrap/listener message limit is 40; older messages load only on scroll up.
- Do not wait for materials, usage, or PDF extraction before showing bootstrap messages.
- Do not change tools, voice, note schema, PDF page extraction, the $2 meter, embeddings, SRS, or Stripe/seats.

## Review Focus

- Simultaneous uploads: each chip retains its own error copy.
- Near-full pool: quota response reports bytes left before any secondary upload ceiling.
- Blocked Firestore client: API bootstrap stays visible after listener failure.
- Scroll pagination: prepend older rows without jumping the user's viewport.
- Immediate abort: no empty assistant document; nonempty partial is retained.

---

### Task 1: Server photo normalization and pool-first quota

**Files:**
- Modify: `components/workspace/chat-composer.tsx`, `components/project-chat.tsx`
- Modify: `lib/materials/types.ts`, `lib/materials/ingest-client.ts`, `lib/materials/storage.ts`
- Modify: `app/api/materials/upload/route.ts`, `lib/account/store.ts` or a focused Admin quota helper under `lib/server/`
- Modify: `components/workspace/material-chip.tsx`
- Test: `tests/upload-reporting.test.cjs` plus focused upload conversion/quota test coverage

**Interfaces:**
- Consumes current upload route, `reserveStorageBytes`, `StorageQuotaError`, and chip state.
- Produces JPEG bytes/name/MIME for HEIC/HEIF inputs and per-chip visible error text; quota failure precedes optional transport rejection and includes remaining bytes.

- [ ] Add focused failing coverage for HEIC/HEIF acceptance, server conversion/storage MIME, remaining-space quota copy/order, and independent chip errors.
- [ ] Run each focused test with `node --test <test-file>` and confirm the expected failures.
- [ ] Implement conversion using the available server image decoder; if HEIC decode is unsupported in the installed runtime, return a clear format error rather than silently accepting raw bytes.
- [ ] Perform pool reservation atomically on the server before upload and clean up reservations on failure; remove client-side plan-MB copy as the user-facing cap.
- [ ] Run focused tests and inspect conversion/error UI behavior.

### Task 2: Admin project create/bootstrap and fast bounded chat opening

**Files:**
- Create: `app/api/projects/create/route.ts`, `app/api/projects/bootstrap/route.ts`
- Modify: `lib/workspace/start-project.ts`, `components/create-project-modal.tsx`, `components/project-view.tsx`, `components/project-chat.tsx`
- Modify: `lib/chats.ts`, add a focused Admin project/chat bootstrap helper under `lib/server/`
- Test: `tests/chat-opening-performance.test.cjs`, `tests/project-api.test.cjs`

**Interfaces:**
- `POST /api/projects/create`: Bearer auth; creates the owned project/default thread; returns `{ projectId }`.
- `GET /api/projects/bootstrap?projectId=…&threadId=…`: Bearer auth; returns `{ project, messages }` with newest 40 messages in chronological order.
- `subscribeChatMessages(...)`: live subscription limited to newest 40.
- Older-page loading uses a stable timestamp/id cursor and prepends without changing viewport position.

- [ ] Add failing tests for Admin route auth/ownership, newest-40 response ordering, create's 12-second deadline/error copy, listener limit, and retained bootstrap rows after listener error.
- [ ] Run focused tests and confirm they fail for missing behavior.
- [ ] Implement Admin routes, then route modal/start-project creation and chat bootstrap through them.
- [ ] Seed chat state from bootstrap before listener setup; make listener errors preserve existing rows.
- [ ] Add on-scroll older-page fetch and preserve scroll position while prepending.
- [ ] Run focused tests and inspect first-paint dependencies for materials/usage/PDF waits.

### Task 3: Stop persistence and settled work details

**Files:**
- Modify: `components/project-chat.tsx`, `components/workspace/status-wait.tsx`
- Test: `tests/pass-a.test.cjs`, `tests/workspace-panel.test.cjs`

**Interfaces:**
- Settled status accepts an optional persisted step list and exposes a disclosure toggle.
- Abort persistence receives assistant ID and stripped partial body; an empty body does not create a message.

- [ ] Add failing tests for empty versus nonempty stopped output, “Worked for Ns ›”, and disclosure rendering of persisted steps.
- [ ] Run focused tests and confirm the regressions are represented.
- [ ] Implement the minimal conditional persistence and disclosure; preserve existing Stopped label for nonempty partials.
- [ ] Run focused tests.

### Task 4: Final verification

**Files:**
- Review all files touched in Tasks 1–3.

- [ ] Run the focused regression tests from Tasks 1–3 using `node --test`.
- [ ] Run `npx tsc --noEmit` as the requested final typecheck.
- [ ] Inspect `git diff` and `git status --short`; confirm no pre-existing edits were reverted or staged and excluded systems are untouched.
- [ ] Report any test/typecheck failures by command and name; do not claim passing without exit-code evidence.
