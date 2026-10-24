# Extending chat blocks

Native blocks are optional formatting capabilities. The model chooses whether they help; registering a block must not require a lesson, a fixed response structure or a duplicate prose explanation. When a block helps, place it beside the prose that explains it and interleave multiple blocks with the answer instead of collecting them at the end. Prefer concise surrounding prose while keeping useful reasoning and details; expand when the request calls for it. The model decides without asking permission to use an available block.

## Grouped sections

```toby sections
{"items":[{"symbol":"shuffle","title":"Generate candidates","text":"Start with a few distinct ideas."},{"symbol":"filter","title":"Narrow the choice","text":"Check the criteria before choosing."},{"symbol":"search","title":"Verify","text":"Confirm the details.\n\nUse **emphasis**, $x=2$, lists or code when useful."}]}
```

Each row has `symbol`, `title` and `text`; 1–8 rows are supported. Choose the symbol by the row's actual subject, not at random. Prefer a specific matching glyph; use a general one only when the subject is unclear, and repeat a glyph only when its meaning fits both rows. Rendering also checks the row title and text against the semantic catalog, so a specific topic can replace a mismatched generic model choice (for example, heating → thermometer, evaporation → droplet, boiling → flame). An optional group `title` and optional per-row `accent` are available. Omit `accent` for the neutral symbol treatment. Use numbering only when the content is a real sequence. Body Markdown uses the shared chat renderer; nested native blocks are displayed as code examples to keep rendering bounded.

## Add or change a symbol

Add an entry to `lib/blocks/section-symbols.ts` with its icon, short model-facing meaning, topic terms and match priority. Its keys generate the schema enum and model guide; the same terms make rendering correct an unrelated icon choice. Add a glyph to `components/workspace/ui-icon.tsx` only when the existing set does not cover it.

## Add another block design

1. Define its validated data, relevant lookup words and short optional capability card in `lib/blocks/kinds/<name>.ts`.
2. Register that definition in `lib/blocks/kinds/index.ts`.
3. Add its React view under `components/blocks/` and connect it in `components/blocks/toby-block.tsx`.
4. Exercise parsing, rich content, streaming and small-screen rendering. Add a preview temporarily; do not publish a fixture route.

The schema, model instructions and view remain separate from the core voice. Existing kinds demonstrate complete examples. `lib/blocks/match.ts` discovers relevant capabilities; it does not force the model to use them. Shared and saved chats use the same renderer, so known native fences keep working after reload.

## Colors

`ACCENT_OPTIONS` in `lib/workspace/theme.ts` is the shared light/dark palette. Theme application exposes its exact values as `--palette-blue`, `--palette-green`, `--palette-purple`, etc. Use these tokens for semantic colors and `--accent` for the selected UI accent. Do not copy alternate hex colors into a block. Backgrounds, text, borders and opacity remain theme-aware neutral treatments.

## Validation

The sections schema, rich rendering, bounded nesting, streaming row continuity, optional discovery and shared theme values have five focused regression checks in `tests/chat-sections.test.cjs`. Light/dark previews and a 390px mobile viewport were inspected; code, formulas and paragraphs remained within the block. An ordinary brand-naming question selected three valid section rows without requesting a block. Production build passed. The broader suite retained the same 25 pre-existing failures, with 252 passes out of 277 checks.
