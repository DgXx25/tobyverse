# Adaptive conversations and project knowledge maps

TobyVerse notices how a person reasons, explores and works without requiring preference statements. This applies to ordinary work as well as studying. A separate observer produces small conditional suggestions, and one private graph per project links substantive topics encountered in conversation.

## Observation cycle

`components/project-chat.tsx` schedules `observeConversation` after a completed response. A browser-local counter contains only scheduling metadata. The first pass is eligible after four substantive turns; later passes follow six more. Samples contain up to fourteen bounded conversation turns. Tool/navigation markers are excluded. The observer is best effort and is not awaited by chat.

`POST /api/insights` authenticates an account and verifies project ownership before observing. A Firestore transaction reserves at most one pass per ninety seconds and twelve per UTC day per account. Replayed samples are deduplicated. One default-model JSON generation, capped at 3,072 output tokens, returns pattern/topic changes together; invalid output is discarded without a repair call. Usage is metered through existing billing. Existing explicit-memory extraction remains independent and can occasionally run on the same turn.

Each pattern cites user-message hashes supplied to that pass. Invented evidence and duplicate evidence do not count. A single observation stays tentative; at least two distinct messages are needed for runtime use. Patterns expire from runtime use after ninety days. The six-record cap prevents an ever-growing biography. Scope is either reusable across tasks or limited to its originating project. These are hypotheses, not psychological measurements.

Knowledge maps retain at most twenty nodes and thirty edges per project. Topics have four observational states: explored, developing, revisit, applied. Questions alone cannot establish applied knowledge or a weakness; applied examples do not establish mastery. Generated next questions and counterfactuals are optional user-selected chat requests. Local graph layout and topic selection make no model calls.

## Storage and use

Server-owned records:

- `users/{uid}/profile/adaptation`: enabled flag, revision, bounded patterns and reservation metadata.
- `users/{uid}/knowledgeMaps/{projectId}`: bounded nodes and links.

These are separate from `profile/learning` and personal fact memories. Raw transcripts are not duplicated into these records. All API reads/mutations authenticate the owner. A revision increment on pause, clear or removal invalidates in-flight observer output. Future observation may discover new patterns after a clear.

The chat route supplies `adaptiveContext` itself; client-provided adaptive context is ignored. Optional reads have a 350 ms fallback deadline; storage failure yields the original prompt. No process cache can restore a stale pre-pause or pre-clear profile. At most three relevant supported patterns and three matching topic records enter the existing conditional memory slot. Relevance uses observer-supplied task tags and lexical overlap; the model still must check the situation before applying a suggestion. Explicit requests and shared preferences override observed suggestions. The core prefix, tools and RAG contracts remain unchanged. Never auto-start a quiz, change an artifact, announce profiling, or prolong conversation to collect observations.

Account Settings > Memory exposes Adapts to you, the pause switch and removal/clear controls. An inline, initially collapsed Project knowledge connections section shows project nodes, relationships and possible follow-up questions. The owned-project selector also makes maps available from child-chat routes and Account. Observation produces no popup, Studio tile, badge or chat notification. Shared chat renderers do not load private observations or maps.

## Limits

Inference can be wrong, relevance is conservative, and cold/slow storage may omit context for a turn. The model is not retrained and cannot read thoughts. Only supported conversational signals are retained. The graph covers observed conversations; it is not a complete model of the person's knowledge. Existing sessions begin accumulating observation samples after this feature is enabled; this does not scan all past chats automatically.
