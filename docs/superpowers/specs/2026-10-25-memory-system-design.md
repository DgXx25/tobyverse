# TobyVerse Memory System — Design

## Intent

Make TobyVerse remember only information that is likely to improve a future answer, apply it only in the right scope, and make every durable memory understandable and controllable by the user. Keep ordinary conversation natural: questions, explanations, one-off formats, artifacts and project activity do not automatically become lasting instructions.

## What exists and why it misfires

The current implementation has useful building blocks: explicit user facts, one personalization paragraph, project facts, inferred response patterns and per-project topic maps. It also separates core instructions from retrieval-indexed user materials.

Three current behaviors undermine that design:

1. The memory extractor is triggered by broad signals such as “examples”, “tables”, confusion, or preference words. A single task-specific request can therefore be mistaken for a durable habit.
2. The observer may classify evidence from one project as a general pattern. It only sees project chats, while general patterns are eligible in other projects.
3. `pickMemoriesForAsk` fills its remaining slots with recent items even when they have no lexical overlap. This can inject a stale topic into an unrelated request. The topic map also uses lexical overlap only.

## Product model

Memory is a set of scoped, typed records, not one growing summary:

- **Direct instructions and preferences (account scope):** explicit “remember/from now on/always” statements and clearly durable general preferences. These are the only user-specific items treated as standing guidance. The current request always wins.
- **Inferred response preferences (account scope):** tentative, conditional hypotheses. Promote only after repeated evidence across at least two distinct projects and two separate chats. One correction may improve the current reply, but is not by itself a saved global rule.
- **Project facts and preferences (project scope):** directly useful, durable context for that project. A topic-specific correction stays attached to that topic/project and does not become an account rule.
- **Project topic knowledge (project scope):** what was discussed or applied on separate topics. It is optional background, never a mastery score or instruction. A project can have multiple unrelated topics.
- **Thread context (temporary):** recent chat history and active task state. Do not copy it into durable memory just because it is salient.

“Explain this” is a request to explain. “Make notes / summarize this into a study sheet” is a request to create a sheet. Neither intent is inferred from learning preferences or prior artifacts.

## Capture and promotion

- Keep explicit save/change/forget requests immediate and scoped according to their wording: account-wide by default only when the request is clearly general; project-only when the user names the project or says “for this project”.
- Treat a clear general durable preference (for example, “I generally prefer short paragraphs”) as account-scoped. A local correction (“this answer is too long”) affects the current answer only until repeated.
- Extract facts only when likely to help a later response. Questions, user-provided source text, quoted instructions, assistant output, one-time formatting requests, and artifact actions are not evidence of durable preference.
- Infer account-wide habits only from independent evidence spanning two or more projects and chats. Until then keep a pattern project-scoped or do not save it. Record evidence hashes and scope so it can be audited and deduplicated.
- On contradiction, update the same record or lower its confidence; never append an opposite standing rule. Explicit user directions outrank inferred patterns.
- Sensitive-data filtering remains in place before both extraction and storage. Never index memory text into the user-material RAG collection.

## Retrieval and prompt assembly

- Always send the compact core instructions and direct account-wide instructions as ordinary system-context text. Never vectorize/retrieve them: they must not disappear due to a similarity miss.
- Treat account facts/preferences as distinct types: include direct global instructions, and select only relevant durable facts and inferred patterns. Do not backfill irrelevant items by recency.
- Retrieve project facts and topic notes by current message, recent thread context, and current source/material context. Use deterministic lexical matching as a cheap first stage and semantic ranking only where it materially improves multilingual/topic matching. Do not send all topics from the active project.
- Mark retrieved records as optional, scoped, fallible context. The current request and explicit new information win.
- If nothing is relevant, inject nothing. Do not add latency or an embedding call for a one-off fact when a cheap exact match suffices.
- Keep provider-neutral rules in TobyVerse's system prompt and adapt only the provider transport layer. Do not adopt Cursor-only coding-agent mechanics as a universal agent interface.

## User controls and plans

The existing Account Settings > Memory surface remains the central control. It should group account-wide instructions/preferences, inferred patterns, and per-project notes; show scope and a short source/why-saved detail; support edit, remove, clear-by-scope, and a visible memory capacity. Project settings can edit project-scoped memory without mixing it into global instructions.

Enforce tier limits on the server, never from a client-provided plan value. Keep current free-beta capacity at least as generous as the existing 40 saved facts. Increase saved-fact and inferred-pattern capacity with Lite, Pro, and Max; Admin remains unlimited. Keep project-local topic caps independently bounded and plan-aware. When a tier is downgraded or full, retain existing records, stop new inferred saves, and allow deletion/editing; never silently evict a user's memories. Explain a full quota in the settings UI.

## Quality criteria

1. A plain explanation request or one-time correction never creates a durable instruction.
2. An explicit “always/from now on/remember” request is saved promptly with the intended scope.
3. A general inferred preference cannot be promoted from one project; repeated cross-project evidence can be promoted with a conditional wording.
4. A question in a project on topic B does not receive unrelated topic A merely because A is recent.
5. Topic-specific knowledge from one project is never injected into another project.
6. Deletion removes the stored record and prevents retrieval; an in-flight observer cannot restore a cleared record.
7. Free/Lite/Pro/Max quotas are checked on trusted server state, Admin has no cap, and a full/downgraded quota never deletes existing data.
8. English internal instructions work with any supported model while visible memory text retains the user's language.

## Calls made for this design

- Reuse the existing project maps and user memory stores; do not migrate chat transcripts or material embeddings.
- Do not add a separate “memory on/off” switch in this change. Existing deletion and “do not remember” controls remain authoritative; a future opt-out can be added as a separate product decision.
- Do not require confirmation for every useful automatic observation. Strong direct instructions save immediately; inferred global preferences require independent cross-project evidence and remain clearly labeled as inferred/editable.
- Keep RAG for Sources separate from personalization memory. A project topic map is not a substitute for the user's uploaded material library.

## User-directed revision: personal summary only (2026-10-25)

The user rejected the multi-store/project-selector interface and clarified that project history and materials already provide continuity. This revision supersedes the earlier project's UI and inference design:

- One personal Markdown summary, with Edit/Delete and one compact plan count.
- Durable facts clearly shared by the user; no inferred behavioral profiles or automatic project maps.
- Existing legacy preferences can be reviewed in the summary; until manually saved they do not steer chat.
- Preserve existing fact storage, dates and privacy filters. Add transaction revision checks so stale extraction cannot restore removed facts.
- Project settings manages the name; no notebook/project memory editor or project selector appears in account Memory.
- No design approval round is required: the user explicitly delegated these design decisions earlier and supplied the desired direction.

## Prompt-based editing revision (2026-10-25)

- In the same Settings > Memory popup, Edit opens a short natural-language change prompt beneath the current summary. It does not ask the user to rewrite Markdown.
- The server supplies only the account's current personal facts (including legacy preferences displayed for review) to the edit model. Minimal add/update/delete operations are applied atomically against a revision; unrelated facts and dates remain unchanged, and changed facts receive a fresh server date.
- A model-suggested delete is ignored unless the user's instruction clearly asks to remove a saved memory. Ambiguous edits leave memory unchanged.
- While the update runs, the current summary fades away and a loading state appears; on success the updated summary fades in in place. This is a visual refresh, not a deletion. The separate Delete memory action keeps its existing confirmation.
