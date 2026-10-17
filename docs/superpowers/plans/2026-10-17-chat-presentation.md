# Chat presentation and optional scenes implementation plan

> Execute inline using the existing block registry and chat renderer.

**Goal:** Give TobyVerse readable, adaptable replies, open tables with horizontal rules, and optional interactive explanations.

**Spec:** The user's approved comparison and latest request in this conversation.

**Architecture:** Keep one default voice in the canonical core; relevant communication preferences can override presentation defaults. Extend native `toby` blocks with validated scene IDs and local React/SVG rendering. Topic candidates are descriptions, never forced output.

**Constraints:** Preserve request-first behavior, existing tools and stored replies, Georgian/English labels, light/dark themes, mobile layout, reduced motion, and no extra model request for animation or sliders.

- [x] Add focused regressions for style preferences, optional scene discovery/schema, numerical charts, and rendered scenes.
- [x] Update mindset/core/subject wording and personalization extraction; regenerate real prompt examples.
- [x] Remove table outlines/vertical rules and increase paragraph spacing.
- [x] Add `scene` schema/catalog, generic process/cycle/structure/line-graph views and photosynthesis/plant-cell/supply-demand/normal/t presets.
- [x] Run required prompt suites, scene checks, TypeScript and production build; inspect actual browser renders and controls.
- [x] Review the finished diff and address material findings.

Review corrections: accept either word order for durable communication preferences; follow streamed graph parameters until a slider is changed. Temporary browser preview removed from the app.

Validation: 43 focused checks passed before final review corrections; production build, lint and types completed after those corrections. Desktop/mobile rendering and local pause, step and slider controls were inspected. Existing unrelated lint warnings remain.

Defaults selected by the builder: semantic colors for inputs/outputs, inherited typeface and theme, calm scene chrome, explanatory SVG motion with pause controls, local-only numerical sliders. No fixed response template or required scene.
