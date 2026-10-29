# Conversation context cost reduction

> Execute inline. The user approved caching, bounded recent history, compact older context, exact retrieval, and prompt checks in chat.

**Goal:** Reduce repeated input without changing the existing core voice, block schemas, model choice, or answer output budget.

**Architecture:** Cache Claude tools and stable system prefixes, retaining the exact instruction text. Keep recent turns intact; retain the complete transcript in Firestore. Build a bounded thread summary occasionally after the response, and expose a read-only history search tool for exact older details. Summaries are conversation data, separate from personal memory and never authority over the current request.

**Constraints:** English internal guidance; multilingual content; owner and thread isolation; bounded work; cancellation and storage failures fall back to existing chat; cached usage must be billed accurately. No deployments or broad resets.

**Review focus:** Retry/continue must exclude future messages; summary must not survive a history edit; one-shot summary calls must not create unnecessary cache writes; old exact identifiers must be recoverable; tool round trips must count each usage event once.

## Tasks

- [x] Add failing tests for cached provider usage, cache payloads, and discounted billing. Implement five-minute caching with an environment opt-out and numeric diagnostics.
- [x] Add failing tests for recent history, summary refresh thresholds, Unicode history search, and source preservation. Implement pure context helpers and a scoped Firestore store with summary refresh locking.
- [x] Wire thread/boundary identifiers, conditional history search, server-owned summary data, and background maintenance into the existing route. Preserve the fallback history path.
- [x] Update documentation, run relevant regression checks and TypeScript, then use ordinary prompts through the in-app browser if available. Record cache hits and answer observations without exposing chat text in diagnostics.

## Decisions and evidence

- Work in the existing dirty checkout: it contains the user's running localhost work; an isolated checkout would omit that work.
- Use Claude's documented five-minute cache: 1.25x input for writes; Haiku 5.5 reads 0.1x, Sonnet 5.5 reads 0.05x. Preserve separate read/write counts.
- Summary refresh is bounded and metered, after the visible response, and not performed on every message. History search does not make an embedding/model API call.
- Complete original messages remain the source of truth. Summary content is a lossy index; exact values can be recovered through the history tool.

Sources: https://platform.claude.com/docs/en/build-with-claude/prompt-caching and https://platform.claude.com/docs/en/about-claude/pricing (reviewed 2026-10-29).

## Review and validation ledger

- Independent review found three important issues: long continuation truncation, a stalled summary batch at the input ceiling, and retry timestamps moving past future messages. Each received a failing regression test and a verified fix. Retried message IDs now preserve their original timestamps transactionally; actual edits also increment the history revision.
- Browser testing exposed an existing ordered-list renderer dropping Markdown's `start` attribute between math blocks. A failing rendered-output test reproduces it; forwarding `start` fixes the live photo-answer list from 1/1 to 1/2 without changing prompts.
- Search source testing exposed earlier raw results crowding actual citations out of the five-source list. Actual citations now have priority; a provider-stream regression test verifies it.
- The fresh-project exact-recall prompt initially failed. The model saw only the recent transcript tail and treated it as the beginning. Added conditional English guidance and a clearer history-search description only when older messages exist; same prompt then retrieved the first equation correctly. Regression test prevents a partial transcript from being mistaken for the conversation beginning.
- Weather browser testing showed English searches produced cards while Georgian searches often failed or used unrelated global/city sources. The request now searches in English but answers in the user's language; Georgian searches are domain-filtered to `meteo.gov.ge`, `amindige.com`, and `amindi.net`, preferring AmindiGE and falling back to the official meteo site/local provider. Removing the hard-coded timestamp also prevents the model from copying a sample date. A regular Georgian prompt now returns a Tbilisi-specific local-source card.
- Latest focused regression suite: 115 passed. TypeScript and scoped ESLint passed. Broader suite snapshot: 518 total, 472 passed, 46 failures; see the validation report. No clean pre-change baseline was established for this already-dirty checkout, so the broad suite is not reported as passing.
- Live cache read observed: 8,805 of 13,391 input tokens for a biology response; no prompt content is logged. Background summary creation and reuse were also observed on the existing long test thread.
