# Pass A Workspace Sharing Design

## Scope

Pass A keeps the existing Grok-like chat workspace and existing `/c` and `/p` ownership model. It adds quiet workspace chrome, scoped public chat sharing, per-turn feedback, English product chrome, and stricter notes/tool routing. Admin UI is out of scope.

## Public sharing

The owner remains on `/c/{chatId}`. Sharing updates the existing root `chats/{chatId}` index with `public: true` and an unguessable `shareId`, then copies `/s/{shareId}`. Unsharing sets `public: false` and removes the active token; sharing again creates a new token, so old links return 404.

Public reads are server-gated. Firestore remains owner-only. The server resolves a share token to one chat index, loads only that nested thread, derives referenced material and study-sheet IDs from its messages, and returns a read-only DTO containing only those records. File bytes use a share-token endpoint that repeats the same reference check before reading Storage. Storage rules do not change.

The shared page reuses the chat and right-pane visual language, but exposes no composer, upload, mutation, feedback, or chat POST controls.

## Feedback

Assistant turns show Like and Dislike actions. Dislike opens a compact reason popover. Reports use the existing `trainingSignals` collection with exactly `chatId`, `messageId`, `reason`, `createdAt`, and a reply `snippet` capped at 240 characters. No prompt, source text, or material content is stored.

## Workspace chrome

Sidebar rows have no resting fill. Hover and focus-visible use the hover wash; the current row uses one separate selected token. Recents continue excluding chats already shown under listed projects.

The `/c` header has an icon-only pane toggle and Share action at the far right. Share is removed from assistant bubbles. Product chrome and model statuses are English while user and assistant content remain in their own language.

## Notes and paths

Note, study-sheet, and Georgian `კონსპექტი` requests route to sheet tools. Direct creation language routes to `create_sheet`. Path tools require Teacher mode and explicit plan/path/course language. Structured notes use the existing visual block vocabulary for formulas, comparisons, steps, cycles/flows, and definition/example material without needing a separate request for blocks.

## Verification

Regression tests cover share scoping, reference extraction, note/path intent, feedback clipping, sidebar state, and English status formatting. TypeScript typechecking must pass.
