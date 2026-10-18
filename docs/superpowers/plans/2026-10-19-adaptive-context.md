# Adaptive context and living knowledge map

**Goal:** Learn useful patterns from ordinary conversation and apply them to the user's current goal, across learning and work. Keep the request-first voice intact.

**Architecture:** Add an optional, bounded observation pass after successful replies. One inexpensive JSON generation updates evidence-backed working patterns and a project knowledge graph together. Server-owned private records stay separate from explicit memories and the stable core prompt. No new dependency.

**User decisions:** Observe ordinary prompts without requiring corrections or a questionnaire; use observations for the user's benefit; include Grok's living knowledge graph; checkpoint existing work on GitHub first; exercise the real UI in the supplied project.

**Implementation calls:** First observation after four substantive user turns, subsequent observations after six. At most one pass per 90 seconds and twelve passes per UTC day per account. Store compact patterns and topic records, not duplicate transcripts. A tentative pattern needs two distinct user-message evidence references before it can affect future answers. Keep at most six patterns, twenty project topics, and thirty connections. Expire stale behavioral patterns after ninety days. Questions must advance the current task; no automatic exams or forced teaching. Topic exposure never means mastery. Allow viewing, disabling, clearing and removing observations; clear/disable invalidates in-flight work. Current explicit instructions always win.

## Tasks

- [x] Implement and test pure validation, evidence merging, sampling and bounded prompt context. Check duplicate evidence, unrelated contexts, stale patterns, short questions and empty profiles.
- [x] Add authenticated owner-scoped storage, rate-limited observation endpoint and prompt integration with timeout/failure fallback. Keep existing chat and explicit memory routes working.
- [x] Add account observation controls and an inline, initially collapsed knowledge-map viewer only in Settings. No Studio tile, popup, chat badge or notification. Verify loading/empty states, pause and storage-error fallback; reuse the existing responsive Settings shell.
- [x] Run regression checks for prompt/tool/RAG behavior, typecheck and lint; exercise real conversation, map and controls in the user's browser project. Results and the independently reproduced baseline failure: `docs/audits/2026-10-19-adaptive-context.md`.

## Review focus

Overlapping observation requests; clearing or pausing during generation; a quoted instruction mistaken for a behavioral signal; asking a question mistaken for weak knowledge; cross-project leakage; optional storage failures delaying or breaking chat; repeated evidence inflating confidence; assistant-generated wording mistaken for user preference; generated follow-ups never auto-execute.
