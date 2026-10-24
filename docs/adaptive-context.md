# Personal memory

TobyVerse keeps one account-level personal memory. It contains durable facts or preferences the user explicitly or clearly shared as lasting information and that can improve a future response. Its simple Settings view is a dated Markdown summary with prompt-based Edit, Delete memory and a compact capacity count. Individual facts remain separate database records so corrections update the relevant item rather than regenerate an increasingly long biography. Edit accepts a natural-language change in the same popup; after a successful save, the old summary fades out and the updated summary fades in. This visual refresh does not clear memory.

## Capture and use

`lib/memory/normalize.ts` is a conservative candidate gate. A bounded extraction call applies the English policy in `lib/memory/prompt.ts` to every user language. Ordinary topic requests, one-off formatting, temporary moods, task/debugging state, third-party details and pasted document contents are not personal memory. Clear goals, courses, forthcoming exams, communication preferences and useful constraints may qualify. A course or exam must be about the user, not simply mentioned in a task. Stored facts are short independent phrases, dated by the server, with duplicates avoided and corrections applied to existing IDs. Explicit forget requests delete the relevant fact; a clear forget-all request uses the same atomic clear operation as Settings.

The chat prompt selects relevant personal facts and standing communication preferences. Current requests, factual accuracy and safety always take precedence. The assistant must not force a teaching format, over-personalize, list the user's personal details unnecessarily, or announce reading memory. Privacy filtering rejects recognizable credentials, contact details, private addresses, identifiers, financial amounts and confidential text before extraction and persistence. Model instructions additionally exclude unnecessary sensitive facts and unsupported assumptions.

Core instructions and memory are ordinary prompt text. Neither is embedded in the materials vector index.

## Project context

Project continuity comes from existing chat history, sources and artifact state. Automatic project memory, knowledge-map capture and behavioral observation no longer run after an answer. The old insights POST endpoint returns `updated: false` for older clients, and legacy project/adaptive records are not injected into chat. Existing records are preserved rather than silently deleted. Project settings manages the project's name; it does not manage response memory.

## Persistence and controls

- Facts: `users/{uid}/memories/{id}`.
- Revision/timestamp: `users/{uid}/profile/memory-state`.
- Legacy preferences: `users/{uid}/profile/learning`, displayed for review but excluded from current chat prompts. A deliberate summary edit turns retained lines into ordinary facts and removes the legacy paragraph.
- `GET /api/memory`: authenticated summary, trusted plan capacity, usage, revision and last update time.
- `PUT /api/memory`: validate the complete Markdown edit and atomically replace saved facts, checking the supplied revision and the account's server-resolved plan. Empty text clears personal memory.
- `POST /api/memory/edit`: take an explicit natural-language edit request, load the current account facts server-side, ask the model for minimal add/update/delete operations, and atomically apply them at the submitted revision. It preserves unrelated fact text and dates, dates corrected/new facts at save time, rejects stale revisions before model usage, and ignores model-suggested deletes unless the user explicitly asked to remove a memory.
- `POST /api/memory`: bounded extraction from the current user's safe message and recent safe chat; the server reads existing facts and applies valid operations. It never accepts a client fact list, project memory or client plan as write authority.
- `PATCH /api/memory`: compatibility for individual fact edits and legacy preference editors, using the same server-controlled storage.

Manual changes and clears increment the revision. An extractor started before that change is discarded, and a stale manual editor gets 409 while retaining its draft. An absent remote legacy preference clears the local cache; cached text is never written back after a deletion. Automatic updates are reported as saved only after persistence succeeds. Firestore rules deny client creates/updates to memory and profile records; deployment of those rules is required for production enforcement.

## Capacity

Saved personal facts: Free Beta 40, Lite 80, Pro 160, Max/Team 320. Admin bypasses commercial quotas within the current 320-fact storage guard. UI shows a compact count, not separate internal-store quotas. Existing over-quota memory survives a downgrade; users can reduce or edit it, while growth is blocked. No automatic eviction or extra embedding call is used. Summary display itself makes no model call.

## Research references

The summary view follows the useful simplicity of the user-provided Grok screenshots without treating the chatbot's description of its internal tools as authoritative. xAI documents global/workspace Markdown scopes for Grok Build (a separate coding product): https://x.ai/news/grok-build-memory . That does not establish the exact storage or shared-project behavior of Grok's consumer chat. TobyVerse uses its existing Firestore data layer rather than filesystem files per user.
