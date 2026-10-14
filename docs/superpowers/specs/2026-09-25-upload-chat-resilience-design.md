# Upload and Chat Resilience Design

## Goal

Fix photo upload failures, reduce project chat opening work, allow project creation and initial bootstrap when browser Firestore requests are blocked, discard empty stopped replies, and expose persisted work steps after a reply settles.

## Constraints

- Preserve current unrelated and uncommitted repository work.
- Keep the beta storage pool at 1 GiB and check remaining pool before any optional transport ceiling. User-facing quota copy reports remaining bytes; do not present plan-based 15/25/50/100 MB limits as the upload cap.
- Convert HEIC and HEIF photos to JPEG on the server before storage, extraction, and material metadata finalization.
- Project creation and initial bootstrap use same-origin Bearer-authenticated routes backed by Firebase Admin.
- Project creation returns or fails in at most 12 seconds in the browser. Timeout clears the pending UI and shows: “Could not reach the server. Disable ad blocker if this persists.”
- Initial chat data is the newest 40 messages. The live listener is limited to those messages; older messages load only on upward scroll.
- An instantaneous stop stores no empty assistant message. A nonempty partial response remains stored and marked Stopped.
- Settled work status reads “Worked for Ns ›”; activating it reveals persisted step details where available.
- Do not change model tools, voice, note schema, PDF page extraction, the $2 meter, embeddings, SRS UI, or Stripe/team-seat behavior.

## Design

### Photo upload and quota

The composer accepts HEIC/HEIF extensions and MIME types. Upload continues through the existing same-origin material upload endpoint. The server identifies HEIC/HEIF from the uploaded MIME type or extension, converts the bytes to JPEG, stores the JPEG with its JPEG MIME/name, and performs image extraction on the converted bytes. Unsupported conversion errors are returned as a clear format/conversion message.

Quota is reserved atomically against the user's 1 GiB pool before upload. A quota rejection includes the remaining pool amount. Plan-specific limits are not used as the displayed cap; an optional transport ceiling may reject only after quota validation. Each composer chip owns its own error string, preventing concurrent uploads from replacing each other's error copy.

### Project create and bootstrap

Add `POST /api/projects/create` and `GET /api/projects/bootstrap`. Both authenticate the Firebase ID token from the Bearer header and use Firebase Admin. Create writes the project and required default thread state, returning the project identifier. Bootstrap verifies ownership and returns the project plus the newest 40 messages in chronological display order.

The create modal uses the create route with a 12-second client deadline and always clears its pending state on timeout or failure. Chat opening seeds its state from bootstrap before starting the Firestore live subscription. The API-provided project/messages remain visible if the listener errors.

### Bounded chat history

The live message listener queries only the newest 40 documents and sorts them for display. The chat viewport detects upward scroll near its history boundary and fetches the next older page, prepending it while preserving scroll position. It does not fetch older messages during initial render. Opening messages does not wait for materials, usage, or PDF extraction.

### Stop and settled steps

The abort path strips tool/artifact markup and persists only a nonempty partial assistant body. The settled status control uses the elapsed duration and toggles a compact expansion of saved step data attached to the chat artifact/message. If there are no saved steps, it remains a label without fabricated details.

## Error behavior

- Quota exhausted/insufficient space: clear remaining-space message from the server; no plan-specific MB cap copy.
- Unsupported HEIC conversion: clear user-facing format line; no silent chip failure.
- API unreachable or create deadline exceeded: unlock modal and show the specified ad-blocker/network message.
- Bootstrap API failure: expose a useful load error; a live listener may still populate the chat if it connects.
- Live listener failure after bootstrap: retain bootstrap data and continue rendering it.
- Photo failures are displayed on the corresponding chip; independent uploads do not share/overwrite chip error text.

## Verification

Add focused regression coverage for quota ordering/copy, HEIC conversion routing, bounded chat history and fallback, create timeout, stop persistence, and expandable settled steps. Run those focused tests and TypeScript typecheck after changes. Review the final diff against the constraints above and preserve all pre-existing working-tree edits.
