# Universal AI Capabilities

## Goal

Let TobyVerse answer in any language while the model autonomously chooses optional domain guidance and native visuals. Send detailed guidance only when the model requests it; avoid hard-coded topic-word routing and generated HTML.

## Design

- Keep a concise English system policy. It explicitly recognizes the user's language from the current turn, handles code-switching, and replies in that language unless the user requests another.
- Offer concise, English skill names/descriptions through `load_skill`; let the model select a guide only when a nontrivial task benefits. Keep full guides bundled and lazy-loaded, with the existing per-turn limit.
- Make interactive scene diagrams available through the existing optional illustration tool, so the model chooses on semantic usefulness. Validate scene payloads and render with the existing React/SVG scenes.
- Remove per-turn keyword matching as the gate for native blocks. Preserve existing fence parsing for old messages and specialized form/document layouts.
- Generalize the official-paper sheet to reusable document forms, including enrollment certificates, using explicit user-supplied facts and visible placeholders for unknown facts.
- Preserve request-first voice, no automatic tutoring, and the current renderer. Do not generate HTML or send full component/library code to the model.

## Acceptance

- English core says the interface can be used in any language and output follows the current user language/explicit target.
- Subject guidance is offered as optional model-selected guides; `context.ts` no longer picks one by keyword matching.
- The model can select an existing interactive scene through `illustrate` without any prompt keyword match or extra classifier call.
- Block matching does not suppress models' visual choice based on hard-coded language cues.
- Paper supports an enrollment certificate and retains the existing editable/checkable paper experience.
- Existing parser compatibility and schema validation remain in place.
