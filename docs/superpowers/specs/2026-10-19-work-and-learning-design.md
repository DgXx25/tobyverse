# Work and learning improvements

## Intent and requirements

TobyVerse must support everyday work alongside learning. The user supplied concrete failures and requested implementation: photographs disappear, Sources cannot group files, short pasted prose becomes a source attachment, ordinary notes become lengthy study notes, the chat can claim to save without saving, recent code formatting leaks into unrelated writing, narrow edits rewrite unrelated text, and memory needs practical preferences with privacy filtering.

- Upload photographs as one compressed image plus extracted text; preserve original filename/type metadata. Images without OCR text remain usable images. Other documents retain the text-only behavior. Count actual stored bytes and keep thumbnails, viewing, chat vision and sharing functional.
- Add project Sources folders with rename/delete (deleting a folder keeps its materials), multi-selection distinct from the AI source checkboxes, bulk move and drag/drop into folders. A single folder level initially is an implementation choice; no nested folders are requested.
- Remove the manual Add note button. Chat can create and update a plain Markdown note with a checked/saved indicator in Studio. Distinguish this from the existing Study notes generator, which keeps its detailed educational behavior. Never claim a note was saved before persistence succeeds.
- Generated Studio titles are contextual and unique within the project, including repeated generations. Plain notes remain brief and preserve requested information without adding lesson structure.
- Keep ordinary pasted prose in the composer; automatic attachment is for genuinely large text or explicit user choice.
- Current request controls output format. For a narrow rewrite, preserve untouched wording and structure; do not invent role, employer, amounts or personal details. A request to remove a code fence must not rewrite the content.
- One ordinary Memory view includes explicitly shared preferences and bounded observations about communication/work. Keep existing learning adaptation useful without turning normal work into a lesson. Sensitive identifiers and confidential material must be filtered before memory model calls, persistence and prompt injection. A request not to remember excludes that turn from learning/profile updates.

## Constraints

Reuse Next.js, Firebase, existing tools and design tokens. Follow docs/mindset.md and canonical prompt architecture. Do not persist personal data from the user's bug report in code, docs or tests. Do not edit existing remote user materials as part of development. Validate targeted behavior and run the required prompt checks after prompt changes. Release is a separate user action.

## Ownership

Independent implementation tracks: compressed image lifecycle; plain notes and Studio artifact naming; memory privacy and ordinary Memory UI; Sources folders, paste behavior and request fidelity. Integrate and review interfaces together before completion.
