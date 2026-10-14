# Pass A Workspace Sharing Implementation Plan

1. Add pure share/reference and feedback helpers with regression tests.
2. Add owner share/unshare API, public snapshot API, and token-validated file API using existing chat/project documents.
3. Add `/s/{shareId}` read-only workspace with thread and scoped artifact pane.
4. Restore top-right pane/share chrome and remove per-message Share.
5. Add assistant Like/Dislike controls and compact feedback persistence.
6. Correct sidebar resting/hover/selected states and audit English workspace copy.
7. Tighten note/path intent and structured note prompt behavior with tests.
8. Run regression tests and TypeScript typecheck.
