# Chat connection recovery

## Incident and evidence

- Production Chrome displayed Thinking for 260 seconds on a photosynthesis question.
- The available Cloud Run request logs contained no corresponding original `/api/chat` request. Three subsequent UI questions in the user's production test project completed in roughly 4–6 seconds; the browser console reported no errors for those tests.
- The supplied Chrome console screenshot separately shows a Firestore `RunAggregationQuery` count of `materials` rejected with `403 permission-denied`. That call comes from notebook source counts, not model generation. The screenshot does not establish why that project count was denied or prove that it caused the original hang.
- Code inspection found unbounded browser Firestore reads/writes before the chat HTTP request, and error recovery awaited another unbounded write. Firestore may leave these promises pending while reconnecting; a rejected-promise catch alone does not handle that condition. Adblock involvement is unconfirmed.

## Changes

- Shared abortable deadlines bound source lookup, message save, authentication, response connection and idle reads. Cancellation is installed before the first send await.
- Empty notebooks do not reread an empty materials collection on every send.
- Optional memory/preferences reads fall back to cached values after two seconds.
- Save status says Sending before model generation. Required save/auth steps fail with an actionable connection message and Retry rather than an indefinite Thinking state.
- Retry reuses the original user message ID; a late Firestore write does not introduce a duplicate user turn. Uploaded images remain owned by a pending write until its definitive outcome, avoiding deletion on timeout.
- Recency metadata writes no longer gate generation after the actual message is saved.
- The SSE reader honors `done`, bounds silent/error-body reads, and cancels without awaiting cancellation.
- Chat opening races the existing browser reads with an authenticated same-origin bootstrap fallback, retaining project/thread ownership checks and a 40-message limit. Loading failures expose Retry and retry on the browser online event.
- Opening prompts retain a retry closure if source preparation fails before send begins.

## Verification

- 49 focused regression tests passed, including the initial connection tests, bootstrap ownership checks, history performance and response block/prompt checks.
- After review fixes, all 13 connection/bootstrap tests passed again: stalled promises, cancellation before execution, successful values, SSE done on an open connection, idle timeout, stalled HTTP error body, send preflight integration, canonical/nested opening, authorization and path validation.
- TypeScript check passed during implementation. Production build/deployment and final live response check are recorded in the task outcome.

## Limits

Deadlines do not repair a user's network or cancel Firestore's already queued writes. They let the interface recover safely and retry. A browser showing permission-denied still requires the correct account and project access; access rules were not relaxed to conceal that error.
