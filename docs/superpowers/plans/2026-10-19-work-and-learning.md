# Work and learning implementation plan

> Use native execution with focused parallel agents for the independent domains.

**Goal:** Make photographs, source organization, plain notes and practical private memory reliable for everyday work as well as learning.

**Architecture:** Reuse the material and study-sheet collections, with a distinct plain-note variant and project-scoped source folders. Keep image compression and retention conditional on material type. Keep privacy filtering at every memory boundary and current-operation fidelity in the canonical voice.

**Tech Stack:** Next.js/TypeScript, React, Firebase Firestore and Storage, existing Gemini tool routing.

**Spec:** ../specs/2026-10-19-work-and-learning-design.md

## Global constraints

- Follow docs/mindset.md; preserve prompt prefix/slot architecture and existing study workflows.
- No sensitive bug-report details in fixtures or docs. No production user-data edits.
- Existing theme, typography and project owner access controls apply to new UI/data.

## Review focus

- Photograph with no OCR text remains uploadable and visible; image/text quota is counted once on retry.
- Folder deletion retains files, bulk moves validate all targets, AI source selection stays independent.
- A save acknowledgment requires a persisted plain note; updates keep the same artifact id.
- Privacy opt-out skips both direct and observed memory updates, and old unsafe memories are not injected.
- A new prose request after code stays prose; small pasted prose remains directly editable.

## Tasks

- [x] Image compression, OCR and image retention lifecycle, including actual stored-byte accounting and viewer/vision/sharing integration; meaningful targeted regressions.
- [x] Plain Markdown note tool and reliable routing/persistence/update, distinct Studio indicator, remove manual add, unique artifact naming; targeted routing/persistence checks.
- [x] Memory privacy boundaries and practical communication/work preferences; simple unified settings wording; targeted privacy regressions.
- [x] Project Sources folder store/rules, folder UI and independent multi-select/bulk move/drop; folder ownership/move/delete checks.
- [x] Paste threshold and current request/narrow editing fidelity; update mindset/examples and required prompt regressions.
- [x] Integrate, compile, review diff and focused tests; report any browser or live-provider limits honestly.

## Validation and implementation decisions

- Final integrated focused run: 167 tests passed, zero failures. TypeScript and scoped ESLint passed. Production build passed using `NEXT_DIST_DIR=.superpowers/work-and-learning-build`; the sandbox needed a build-only escalation after two EPERM failures. Build-generated tsconfig edits were restored.
- Fresh review found unsafe create/edit routing, truncated note-edit context, and missing save-that reference context. All were repaired with regressions. Plain edits apply exact unique replacements to the complete saved note; notes above 120,000 characters are rejected before alteration.
- Source folders are one level and owner scoped through existing project rules. Removing a folder returns its members to root. Creating one marks a draft as touched. Project deletion also cleans folder/title metadata.
- Photographs are compressed before the first Storage write (browser Canvas with server fallback), bounded to 2560px and the existing image byte limit. Only the compressed image and its OCR sidecar remain. No text is a valid photo result. Unrelated questions do not reread selected source photos.
- Automatic pasted-text attachment now starts at 12,000 characters. Plain note preferences remain memory evidence; the actual contents of save-note tasks do not.
- Browser UI verification was blocked by Browser Use URL policy when binding the existing error-page tab. No workaround was attempted. No live LLM quality check or production user-data mutation was performed; the shared chat was read for context only.
- One earlier broad-suite run was not green: it reported unrelated UI/OAuth assertions and an upload-session Node harness issue. This change's focused suites are green; the full suite is not claimed clean.
