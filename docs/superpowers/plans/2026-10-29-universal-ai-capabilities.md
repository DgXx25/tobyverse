# Universal AI Capabilities Implementation Plan

## Changes

1. Clarify multilingual behavior in the English core instruction and mindset docs.
2. Expose subject-writing conventions as bundled, model-selectable `load_skill` guides; remove deterministic subject detection from chat prompt assembly.
3. Add scene payloads to the existing typed illustration tool and renderer, preserving validated scene presets and existing block validation.
4. Stop using lexical block matching to decide which optional block the model may use; retain only turn-state guards for hints/exams and existing-paper reuse.
5. Expand the paper sheet from one hard-coded application form to reusable document types, including a factual enrollment certificate, while retaining compatibility with saved application blocks.
6. Update repository documentation and generated prompt examples if relevant; inspect diffs and run typecheck/build (no new test suite per the user/developer constraint).

## Risks and checks

- Do not imply an institution has verified facts in a certificate; use supplied facts or placeholders.
- Preserve the request-first voice and do not add teaching rituals.
- Keep scene values schema-validated; generic visual schema remains unchanged for existing blocks.
- Check for prompt/provider token impact: full guides remain lazy-loaded; scene uses the existing single tool-call round.
