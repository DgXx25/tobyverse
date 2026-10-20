# Chat interface reliability implementation plan

> **For agentic workers:** Use the existing native-block and provider interfaces; implement the independent tasks with bounded parallel ownership.

**Goal:** Preserve manually chosen names, add optional illustrated lists and compact forms, and make Pro streaming and chat scrolling responsive.

**Architecture:** Durable title ownership prevents asynchronous automatic renames. New validated native blocks reuse message media and local scoped interaction state. Provider output streams as it arrives; transport heartbeats cover slow preparation and thinking. Sending positions the latest prompt once, without following the growing response.

**Tech stack:** Next.js, React, TypeScript, Firestore, Zod, existing Gemini/SSE adapters.

**Spec:** User request of 2026-10-20 and `docs/mindset.md`.

## Constraints

- Add optional block cards; no mandatory surveys, lessons or prescribed answer formats.
- Preserve the canonical core instruction and existing simple-task behavior.
- Resolve images only from actual message media/search results; do not trust invented URLs.
- Respect cancellation, read-only sharing, manual scrolling and reduced motion.
- Use focused regression checks and one production build; avoid broad paid generation tests.

## Review focus

- Manual rename before/during the first auto-name response must win transactionally.
- Incomplete streamed block JSON must not erase completed rows or expose invalid controls.
- Form submission must preserve labels/values once and never execute external side effects.
- Slow Pro preparation/thinking must keep the connection alive without leaking tool narration.
- New responses may grow below the viewport without moving the reader away from their prompt.

## Tasks

- [x] Title ownership: `lib/projects.ts`, `lib/chats.ts`, `lib/workspace/auto-title.ts`, title mappings and focused race tests.
- [x] Illustrated lists: `lib/blocks/kinds/image-list.ts`, `lib/images/image-list.ts`, `components/blocks/image-list.tsx`, optional matching/registry wiring and image placement deduplication tests.
- [x] Compact forms: `lib/blocks/kinds/form.ts`, `components/blocks/form.tsx`, scoped state, optional callback/context wiring, schema/submission tests.
- [x] Streaming and scroll: Gemini/SSE route and client, `components/project-chat.tsx`, history anchoring and prompt entry animation; focused transport/scroll regressions.
- [x] Integrate block examples and document optional semantics in `docs/mindset.md`; run required prompt architecture checks if prompt contracts change.
- [x] Review combined diff, run TypeScript/production build and verify key UI flows.
- Release sequence: commit and push main, deploy Firebase Hosting, confirm the public site.

## Verification

- 99 focused regressions passed, including required prompt architecture checks; transport/history checks passed again after the last route changes.
- TypeScript passed. Production build passed after clearing the validated generated .next directory.
- Live browser: Gemini 3.1 Pro completed the requested native form in 59 seconds without the old 45-second connection timeout. Radio selection enabled submission; original model selection restored.
- Review caught a false form-success state; acceptance now follows successful user-message persistence. Follow-up review reported no findings.


## Added before release: chat media stays separate from Sources

- Composer photos use compressed private chat blobs, with no material document or vector index. Add source keeps the existing compressed-photo and OCR workflow.
- Plain prompt URLs no longer enter material ingestion on either chat entry point. URL chips remain chat attachments; bounded read-only page extraction supplies current-turn context without storing source text.
- Fourteen photo/link regressions passed. Required prompt architecture checks and TypeScript passed; release build includes this change.

- Shared chats retain standalone photo previews through exact attachment references; no source document or broad file access is created. Wrong-owner paths, unrelated files and revoked shares are rejected. Twenty-two relevant checks and the final TypeScript check passed; review reported no further findings.
