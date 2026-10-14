# Shared chat link audit and fix

Date: 2026-09-26

## Findings

1. **The reported 404 was not a reliable “missing link” result.** `GET /api/share/[shareId]` called the Firebase Admin SDK, but this local environment had neither service-account JSON, Application Default Credentials, nor an emulator. The route caught every failure and returned 404, so credential/backend failures looked identical to revoked or invalid links.

2. **The public page added a second cold route and hid the chat while it loaded.** `/s/[shareId]` rendered an empty client view, which then fetched `/api/share/[shareId]`. In `next dev --turbopack`, the first request compiled the page and the follow-up compiled the API route; the supplied trace shows 1004 ms and 648 ms compile steps and a 5684 ms API request. Request-time compilation is a development-server behavior; a production Next build is precompiled.

3. **Sharing and reading used different trust paths.** The owner enabled sharing with browser Firestore, while the viewer depended on Admin Firestore. This made links depend on server credentials even when browser Firebase was configured. The file endpoint also uses Admin/GCS and remains separate from loading the chat transcript.

## Changes made

- Shared transcript bootstrap now queries Firestore from the browser first. It avoids `/api/share/[shareId]` on the normal path and falls back to it only if client reads fail (for example, while Firestore rules are rolling out).
- Firestore rules permit an unauthenticated reader to resolve a public share index, read only its mapped thread/messages, and read referenced material/study-sheet metadata. Other project data remains owner-only.
- Sharing records referenced material/sheet IDs on the index and mirrors the active share token onto referenced metadata documents. Unshare and re-share remove stale token grants before updating the index.
- The API now returns 500 for an actual server failure instead of falsely reporting “not found.” The public UI distinguishes retryable loading failure from an invalid/revoked share and offers retry.

## Verification

- `node tests/share.test.cjs`: 6 passed.
- `npx tsc --noEmit`: one unrelated pre-existing workspace error remains at `components/project-view.tsx:274`: a Gemini model-id union is assigned to a `"gemini" | "grok" | "gpt"` preference type. The share changes add no TypeScript errors; this mismatch is outside the share-link scope and overlaps existing uncommitted work.
- The broader standalone CJS suite still has failures in seven unrelated UI test files: `icon-settings`, `landing-visuals`, `material-preview`, `sidebar-hover-apple-palette`, `sidebar-menu-colors`, `start-screen-icons`, and `workspace-panel`. These concern existing icon/color/UI expectations, not shared-chat code.
- Firestore Emulator validation could not be completed here: the Firebase CLI emulator command produced no output and remained pending, so it was stopped. The rules still need deployment to take effect in Firebase.

## Remaining boundary

The normal chat transcript path no longer needs Admin credentials. The fallback and shared file-byte reads still use the existing Admin/GCS endpoints; those require Admin credentials. First-request compilation is eliminated for the extra API call on the normal path, but `next dev` may still compile `/s/[shareId]` on its first visit. Production builds do not compile routes on first visit.
