# Dynamic system instructions implementation plan

**Goal:** Implement the user's short-core and conditional-injection specification in the existing TypeScript prompt pipeline.

**Architecture:** Keep one provider-neutral, 150–400 word core as the exact prefix. Assemble named slots in deterministic order: project, subject, active path, memory, turn context, materials. Preserve tool declarations, source payloads, and renderer schemas.

**Constraints:** Follow `docs/mindset.md`; default to a capable peer; explicit learning intent enables pedagogy. Modes add no system prompt text, with existing tool eligibility preserved. Weak or tied subject evidence injects nothing. A parent chat's path metadata must not activate path behavior or block cards.

1. Add regression tests for the core prefix/size, slot order and omission, subject confidence and topic changes, path isolation, memory in all modes, RAG fallback, and native block compatibility. Run them red.
2. Implement `core-instruction.ts`, a small typed slot assembler, and thin voice aliases. Refactor `context.ts` into context producers; isolate path metadata before block matching.
3. Tighten subject matching and soften mode/path/notes/block formatting guidance. Keep tool and renderer protocols intact.
4. Update the mindset documentation and generate complete normal/path/subject prompt examples using the real builder.
5. Run regression tests, the full Node suite, TypeScript, targeted lint, and a final diff review. Report any failures and limits.

**Review focus:** Ambiguous vocabulary repeated across inputs; stale project topics overriding a new question; explicit false thread flags; RAG text retaining source locators; requested formats and native blocks remaining optional.

## Completion evidence

- Implemented all five steps in the current checkout. Core: 252 words; empty slots omitted; exact static prefix covered in all modes.
- Independent review found ambiguous prefix matches and form-writing guidance on unrelated turns. Both have failing-then-passing regression coverage; corrected the dialogue fixture to validate its actual schema.
- Focused prompt/tool/RAG/renderer tests: 35 passed. Targeted ESLint: passed. `git diff --check`: passed.
- Full suite: 163 passed / 185 total; the same 22 failures reproduce against HEAD versions of changed files (baseline: 152 passed / 174 total). These concern existing UI/layout/icon/status assertions.
- TypeScript: four errors, identical when compiling HEAD versions of changed files: `ActiveArtifact.mode` in `lib/chat/dispatch.ts` (two), and `check` icon unions in `lib/composer/slash.ts` (two). No new type errors.
- Complete prompt examples generated with `node scripts/generate-prompt-examples.cjs` into `docs/prompt-examples.md`. No live model evaluation or provider cache benchmark was run.
- Existing `.superpowers/` untracked files were left untouched. No commit or deployment performed.

## Follow-up: shorter slots, no mode injection

- Removed the mode slot and its assembly dependency; legacy mode instruction exports are empty. Normal chat emits only the unchanged core and optional project context.
- Active-path context now contains only node title, brief context, and explicit tool request/acceptance. Materials contain one relevance line plus existing passages/excerpts/figure metadata.
- Regenerated all three examples; updated mindset documentation. Core SHA256 unchanged: `62A5FC8D0D9D084A2BBB3024EDE888C3D030DDFF8CBEC4B0D32CF36ED2FAB987`.
- Focused tests: 38 passed. Targeted ESLint passed. TypeScript still reports only the same four pre-existing dispatch/slash errors. Tool eligibility, retrieval, and block rendering were not changed by this follow-up.
