# Text-only material retention

**Goal:** Keep the uploaded material's identity, but retain its extracted text instead of the original binary after successful extraction.

**Architecture:** A server-only retention helper verifies the owned material and its persisted text, deletes the distinct original object, then atomically updates the material reference and account usage. Non-PDF indexing invokes it before embeddings; PDF indexing persists resumable plain text and invokes it when all pages finish. Repeated calls must not deduct usage twice.

**Constraints:** Preserve original name/type/MIME/size as metadata. Never delete on failed/empty extraction. Preserve upload retries and PDF cursors. Keep text-only items visible in Library and open their text instead of requesting missing binaries. No new dependencies or bulk deletion of existing production files.

- [x] Add safe, idempotent server retention and metadata support.
- [x] Integrate non-PDF and resumable PDF ingestion, preserving saved text across failures.
- [x] Update viewer, library and shared material mapping for retained text.
- [x] Inspect the diff and compile the changed code. Do not add or run tests unless requested.
