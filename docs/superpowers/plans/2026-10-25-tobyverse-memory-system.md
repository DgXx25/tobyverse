# TobyVerse Memory System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make memory scoped, useful, user-controllable, relevant to the current request, and safely limited by the account's server-resolved plan.

**Architecture:** Retain the existing Firestore stores, but tighten capture/promotion and retrieval contracts. Explicit user direction is durable; inferred general patterns require independent cross-project evidence. Server endpoints enforce plan quotas and own auto-writes. Account Settings exposes scope, capacity, and deletion controls.

**Tech Stack:** Next.js route handlers, TypeScript, Firebase Admin/Firestore, existing client Firestore subscriptions, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-25-memory-system-design.md`

## Global Constraints

- Core system instructions remain always-on, provider-neutral, and are never vector-retrieved.
- Materials RAG stays separate from user memory.
- Current user request outranks remembered content; inferred records remain optional and conditional.
- Keep all existing sensitive-data filters and ownership checks; do not index memory contents as material chunks.
- Resolve plan from trusted server-side billing/account state; never accept a client plan as authorization.
- Quota-full or plan-downgrade behavior retains existing records and allows delete/edit.
- Preserve the existing English/Georgian interface conventions and user's chosen display language for stored text.

## Review Focus

1. A one-off preference correction or ordinary explanation is not persisted; test negative examples in Georgian and English.
2. General inference cannot promote evidence from one project; test same-project repetition versus distinct-project evidence.
3. Irrelevant recent memories are omitted and topic A cannot leak into project/topic B; test selectors with multiple topics and languages.
4. Concurrent or malicious memory adds cannot exceed the server-side tier limit; test full quota, upgrades/downgrades, and Admin.
5. Deletion/clear is durable against in-flight observers and inaccessible from another account; test revision conflict and owner checks.

---

### Task 1: Capture classification and cross-project promotion

**Files:**
- Modify: `lib/memory/normalize.ts`
- Modify: `lib/memory/prompt.ts`
- Modify: `lib/adaptation/model.ts`
- Modify: `lib/adaptation/prompt.ts`
- Modify: `lib/adaptation/server.ts`
- Modify: `app/api/insights/route.ts`
- Test: `tests/memory-core.test.cjs`
- Test: `tests/chat-refinements.test.cjs`
- Test: `tests/tool-foundation.test.cjs`

**Interfaces:** Add memory-capture classification as a pure function. Add bounded `supportProjects` metadata to adaptive patterns with legacy-safe parsing. A general pattern needs support from at least two distinct project IDs before it can be stored; explicit user's own global directive continues to save immediately.

- [ ] Add tests proving that a single “I like examples”/“this is too long” correction is not permanent, explicit “always/from now on/remember” is saved with scope, and the same inferred pattern from one project cannot become global.
- [ ] Run the focused tests and confirm the expected failures.
- [ ] Implement the narrow capture classifier: direct durable instructions/preferences vs one-turn feedback vs project-only context vs no-memory task.
- [ ] Add evidence project IDs to observer output/merge, enforce two distinct project scopes for general inferred records, and preserve old records as legacy project-scoped until corroborated.
- [ ] Run focused tests and the complete memory/adaptation tests.

### Task 2: Relevance-first memory retrieval

**Files:**
- Modify: `lib/memory/prompt.ts`
- Modify: `lib/adaptation/model.ts`
- Modify: `lib/chat/context.ts`
- Test: `tests/memory-core.test.cjs`
- Test: `tests/prompt-architecture.test.cjs`

**Interfaces:** `pickMemoriesForAsk` selects only relevant facts by default; no recency fill. A separate explicitly named selector can include all short direct global instructions. Project facts and topic notes are selected only for the active project and current topic; return no context on a weak match.

- [ ] Add failing tests for no-overlap omission, unrelated recent topic omission, project isolation, multilingual matching and explicit global-instruction inclusion.
- [ ] Run the focused tests and confirm the expected failures.
- [ ] Implement deterministic relevance scoring with lexical/normalized topic evidence; only add semantic retrieval if existing indexed data can be reused without a new per-turn embedding call. Keep every retrieved item tagged by scope/type and optionality.
- [ ] Regenerate `docs/prompt-examples.md` and update prompt architecture tests if assembled prompt text changes.
- [ ] Run prompt, memory and RAG tests.

### Task 3: Plan-aware server-owned memory writes

**Files:**
- Create: `lib/memory/limits.ts`
- Create: `lib/memory/server.ts`
- Modify: `app/api/memory/route.ts`
- Modify: `app/api/insights/route.ts`
- Modify: `lib/memory/client.ts`
- Modify: `lib/adaptation/server.ts`
- Modify: `firestore.rules`
- Test: `tests/memory-limits.test.cjs`
- Test: `tests/memory-routes.test.cjs`

**Interfaces:** Define plan capacity from trusted effective plan: `free_beta` 40 saved facts/3 inferred patterns; `lite` 80/6; `pro` 160/12; `max` and `team` 320/24; `admin` unlimited. Project fact/topic limits scale separately: free 12/20, Lite 20/30, Pro 40/50, Max/Team 80/100. Existing data is never silently evicted. Auto-created profile memories, preferences, project facts, patterns and topic maps are written by authenticated server routes after resolving `readAccountAccess(uid)`.

- [ ] Add tests for each tier, Admin, a full quota, plan downgrade with existing over-cap data, and attempts to submit a fake client plan.
- [ ] Add route contract tests proving only authenticated owners can write/delete their memory and project facts.
- [ ] Run focused tests and confirm failures.
- [ ] Implement a shared server quota resolver and transactional/bounded server writes. Keep client Firestore access read-only for auto-created records by changing rules; preserve user-authorized deletions and project ownership.
- [ ] Refactor automatic extraction so the server applies validated changes and returns actual saved/updated counts; report “memory updated” only when persistence succeeds.
- [ ] Enforce pattern/topic caps in insight write transactions without evicting stored entries; reject or ignore additions while over quota but preserve deletes/updates.
- [ ] Run memory route, billing access, and Firestore rules validation tests.

### Task 4: Memory controls and plan capacity UI

**Files:**
- Modify: `components/account/memories-panel.tsx`
- Modify: `components/account/observations-panel.tsx`
- Modify: `components/account/account-workspace.tsx`
- Modify: `components/workspace/settings-modal.tsx`
- Modify: `components/workspace/project-settings-pane.tsx`
- Modify: `lib/adaptation/client.ts`
- Test: `tests/memory-ui.test.cjs`

**Interfaces:** `/api/memory` exposes authenticated plan capacity and saved-fact usage from server account state. Insights already expose account patterns and project IDs; project selection fetches that project's topic map. UI controls distinguish direct/global from inferred/project context, show usage, allow one-item and scope-level clearing, and never offer new writes above quota.

- [ ] Add tests for correct scope labels, plan usage, empty states, per-item deletion, clear-by-scope, and project switching without data bleed.
- [ ] Run the focused tests and confirm failures.
- [ ] Implement compact account Memory groups, visible capacity and a project selector with per-project topics; add clear controls with an explicit in-product confirmation.
- [ ] Add project memory capacity to project settings and handle a quota-full response without losing the user's draft.
- [ ] Run TypeScript, relevant unit tests, and build; manually inspect Account Settings and a project with multiple topics.

### Task 5: Documentation and end-to-end verification

**Files:**
- Modify: `docs/adaptive-context.md`
- Modify: `docs/mindset.md`
- Modify: `docs/privacy.md` or current privacy page copy, as applicable
- Modify: `docs/prompt-examples.md`

- [ ] Update docs to match implementation, scopes, tier quotas, retention and user controls.
- [ ] Run all memory, prompt architecture, RAG, billing entitlement and route tests.
- [ ] Run `npx tsc --noEmit` and the production build.
- [ ] In the open localhost app, verify Memory controls, global vs project labels, capacity display, delete behavior, and distinct topic switching; do not send a prompt that creates or edits an artifact.
- [ ] Review the full diff for privacy regressions, cross-account reads, client-trusted plan values, and silent data eviction.

## Personal-summary revision completed (2026-10-25)

The user rejected the global project selector and clarified that project history/materials are sufficient. This supersedes the earlier plan's project-memory and behavioral-observer tasks.

- [x] Replace the multi-store Memory interface with one personal Markdown summary, compact capacity, Edit and Delete.
- [x] Apply the supplied durable-personal-fact policy in English, including current-request precedence, privacy and no forced learning format.
- [x] Disable automatic project maps/observations and remove legacy project/adaptive context from chat assembly.
- [x] Retire project-memory writes; project settings now manages its name and uses project terminology.
- [x] Add atomic summary editing, quota checks, revision conflicts and protection against stale extraction restoring cleared memory.
- [x] Keep earlier generated preference text reviewable but inactive until a deliberate summary edit; never resurrect a deleted legacy cache.
- [x] Verify 24 memory tests, 2 focused prompt tests, TypeScript, targeted ESLint and the open localhost UI.
- [ ] Production deployment: not performed in this memory revision.

The broader prompt/tool/RAG run has two separate outstanding failures: the existing core prompt is 432 words against its 400-word bound, and the tool-rendering test expects Q_d while the formula renderer returns a loading placeholder. This revision does not claim that broader run is green.

## Prompt-based editing follow-up (2026-10-25)

- [x] Replace raw-summary editing with a natural-language prompt in the same popup.
- [x] Add an authenticated, metered edit endpoint that applies minimal safe operations against the memory revision and preserves untouched facts/dates.
- [x] Fade the existing summary into a loading state and fade the refreshed version in after success; leave Delete memory separate.
- [x] Verify route behavior, summary date preservation, stale-revision rejection, ambiguous edits and delete safeguards with focused tests; verify the popup visually in the open local app.
