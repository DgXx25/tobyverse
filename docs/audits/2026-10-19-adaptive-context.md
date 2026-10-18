# Adaptive context validation — 2026-10-19

The existing landing changes were committed and pushed to `origin/main` first as `b09d91c`. Adaptive context was implemented afterwards in the same local checkout used by the user's development server.

## Automated checks

- `npx tsc --noEmit`: passed.
- ESLint for the new adaptation modules, insights route, account components, memory normalization, prompt integration, provider types and adapter: passed. The existing `project-chat.tsx` has two pre-existing hook/unused-variable warnings; no new error was introduced.
- `node --test tests/adaptive-context.test.cjs tests/adaptive-storage.test.cjs`: 23 passed. Cases include normal conversational signals, tentative evidence, duplicate/invented evidence, contradiction revision, rate/day limits, malformed edges, scope/relevance, task tags, question-only evidence, preservation of applied examples, exact core preservation, quiet automatic memory, concurrent reservations, owner checks, pause/clear revision guards, storage failure and delayed-read resurrection.
- Broader run with those two suites plus `prompt-architecture`, `chat-refinements`, `tool-foundation`, `rag-core`, `runtime-skills`, `chat-resilience` and `chat-scenes`: 79 of 80 passed.
- The sole failure is the existing `settled work status discloses persisted steps and empty stop is not saved` test at `tests/chat-resilience.test.cjs:24`, which requires the source-text regex `if (partial)`. That exact text is absent at the pre-feature checkpoint too. Running that suite against `components/project-chat.tsx` read from `git show b09d91c:components/project-chat.tsx` independently reproduced the same failure (2 passed, 1 failed). No behavior was changed to satisfy this stale source assertion.
- Regenerated `docs/prompt-examples.md`; existing prompt examples stayed unchanged.

## Real browser exercise

Used the user's open local TESTT project at `/p/LYI0kolMsmHmdmmyZZQS`:

1. Asked ordinary Georgian questions and supplied reasoning about opportunity cost, discounting, risk, sensitivity analysis, scenario analysis and explaining their limits in a lecture. No request to remember a style or fill in a profile was required.
2. First background pass exposed an omitted link-wire-format specification; fixed the observer prompt to specify `from`, `to`, `label`, and added a regression test so invalid edges cannot discard valid observations. The next scheduled pass persisted a recurring conditional work pattern and three connected topics.
3. Inspected the saved pattern in Settings > Memory. It described the observed use of layered concrete examples and examination of model limits, rather than assigning a fixed learning type.
4. Inspected the three topic nodes and two connections inline in Settings, with applied/developing status and a counterfactual. Selected a second topic and followed its relationship. These local interactions made no model calls.
5. Toggled observation off and back on; the paused indicator and switch state matched server persistence. Clear/revision invalidation was tested at the storage boundary without deleting the user's saved data.
6. Confirmed the feature has no Studio tile, separate popup or automatic memory badge. The Settings-only surface follows the user's later correction. A stale development hot-reload binding after the component export was renamed required a full reload; the clean load and repeated inline opening worked.
7. After observations existed, asked for a one-sentence definition. The model returned exactly one Georgian sentence, preserving the current request over learned observations and existing table/step preferences.

Screenshot: `.superpowers/adaptive-settings.png` (local review artifact, not production source).

## Review

A separate code reviewer reproduced and identified three issues: irrelevant pattern selection, losing prior application evidence after a new question, and stale process caches after controls changed. All three were corrected and covered by regression tests. A follow-up found child-chat/account access to maps was missing; an owner-verified project selector fixed it. Final review found no further actionable issues.

This is bounded conversational inference, not a measurement of all knowledge or proof of long-term learning gains. Continued real use is needed to evaluate whether the inferred adjustments improve outcomes. Optional context reads have a 350 ms fallback deadline. No dependency, stable core voice or tool-routing rule was changed.

## Follow-up: unified, continuously active memory

The user subsequently removed the pause concept and requested one system that includes response instructions. Legacy `enabled: false` records are now ignored. Direct instructions and periodic conversational observations share one memory lifecycle and one conditional prompt block, with explicit preferences ahead of inference. Existing stored preferences remain readable. Settings presents one list, with knowledge connections inline; no observation switch, separate response-instruction section or automatic popup remains.

- Focused adaptive suites: 26 passed, including legacy paused records, shared preference input to the observer and unified prompt composition.
- Regression run covering adaptive context/storage, memory sessions, prompt architecture, chat refinements, tool foundation, RAG, runtime skills and chat scenes: 83 passed. The separately documented baseline source-regex failure remains outside this run.
- TypeScript and focused ESLint passed. Regenerated prompt examples remained unchanged.
- Reloaded the user's local project, inspected Settings > Memory, confirmed the shared preferences and expanded the existing topic connections. Screenshot: `.superpowers/unified-memory-settings.png`.
- The production build exposed a pre-existing impure CSS-module selector hiding the landing's development overlay. Scoped it to the landing root with `body:has(.experience)` so it remains valid in production compilation.
- Production build passed. Final review identified and fixed an indefinite wait on direct memory updates: observation proceeds after at most 1.5 seconds even if that storage path stalls. Tests cover this fallback, guest skipping, blocked browser storage and deletion invalidation across tabs without Settings mounted.
