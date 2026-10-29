# Context cost validation — 2026-10-30

The user requested testing in a fresh project, with ordinary prompts and no block-format instructions. Current model: Claude Haiku 5.5. Photo input continues through the existing Gemini 3.1 Flash-Lite image path.

## Browser observations

Fresh project: `IesNAXhB7pXtIypVIxTp`.

| Request | Observed result |
| --- | --- |
| Georgian quadratic equation x² − 5x + 6 = 0 | Correct roots 2 and 3, separate math cards. |
| Georgian known-sigma 95% confidence interval, n=25, mean=72, sigma=10 | Correct interval 68.08–75.92, numbered math cards and captions. |
| Three sunset photos with brief descriptions | Three actual sunset thumbnails in an image-list block. Descriptions were cautious and based on image titles; detailed visual understanding of web image search results is not established by this test. |
| Current weather in Tbilisi, Georgian | Global search initially failed or returned unrelated city pages. After putting AmindiGE first, limiting Claude's native search to Georgian weather domains, and removing a fixed example timestamp, an ordinary prompt returned a concise rain card; expanded citations showed Tbilisi and nearby-city results from `amindi.net`. |
| Search official Python documentation for median with an even count | Correct arithmetic-mean explanation and compact sources. Found and fixed cited primary sources being crowded out by earlier raw results. |
| Current weather in London, English | One concise English sentence, weather card, temperature and daily forecast, compact source chip. Numeric weather truth was not independently audited against a second live feed. |
| How photosynthesis works and why plants need it, Georgian | The model chose the interactive photosynthesis scene itself. Selecting Water changed the scene explanation. Equation and normal explanation also rendered. |
| Student-status certificate in English, asked in Georgian | Editable paper block with English certificate text and placeholders, without requiring the word “application”. |
| Synthetic uploaded image containing only 3x + 4 = 19, prompt “ეს ამოხსენი.” | Correct x=5, math cards, confirmed Gemini image route. The uploaded thumbnail opened in its image viewer. Found and fixed ordered-list restart across math blocks. |
| Spanish mean vs median | Correct Spanish explanation and example (mean 22, median 3 for 1,2,3,4,100). |
| English Python median function | Correct odd/even handling, sorting a copy, and an empty-input error. |
| Exact recall of the first equation in the chat | Initial attempt incorrectly treated the visible tail as the beginning. Added conditional tail/history guidance, then repeated the same ordinary question; it retrieved the original x² − 5x + 6 = 0 and roots 2, 3. |

## Automated checks

- 115 focused tests passed across conversation store/context, provider usage/caching, billing, prompt architecture, math layout, tools, RAG, source UI, and weather blocks.
- `npx tsc --noEmit --incremental false`: passed.
- Scoped ESLint: passed.
- Earlier broader-suite snapshot (`node --test tests/*.test.cjs`): 518 tests, 472 passed, 46 failures. It predates the final ordered-list/source fixes and added regression tests, so it is not a current baseline. Many failures asserted older source/UI text, and route harnesses imported `server-only` outside a server environment. The working tree already had extensive changes; a pre-change clean baseline was not established. The broad suite is not reported as clean.

## Cost and continuity evidence

- Live provider diagnostics confirmed cache reads, including 8,805 of 13,391 input tokens on the biology answer. This is a measured cache hit, not a guaranteed overall savings percentage.
- Georgian weather requests now pass an Anthropic native `allowed_domains` filter for `meteo.gov.ge`, `amindige.com`, and `amindi.net`; AmindiGE is preferred, with the national meteo source as fallback. The live test showed Tbilisi-specific `amindi.net` citations. The instruction contains no fixed sample timestamp or forecast values.
- The existing long test thread created a bounded 1,147-character summary after its response and reused it on the next turn.
- Summary calls are separately metered and run only for eligible older-message batches after a successful response. Five-minute cache writes cost more than ordinary input; savings depend on reuse.
- Owner isolation, historical prefix boundaries, edit invalidation, failed-summary lease release, original-message preservation, oversized rows, continuation text, and retry creation order have regression tests.
- Exact history search is bounded to 400 older messages and two lookups per turn. It currently scopes to this conversation, not all account chats.

## Broad-suite failing test names

- shared instructions and observed behavior form one memory context
- standalone OAuth returns without a server redirect or a short result timeout
- browser Firestore keeps a persistent local cache for warm chat openings
- settled work status discloses persisted steps and empty stop is not saved
- durable communication preferences are extracted and can override default presentation
- sections render in answer order with rich text, math, lists and bounded nesting
- assistant answers render their retrieved sources below the answer
- expanded pane uses the full available content width
- workspace symbols use the free Hugeicons set
- chat route executes image search once, publishes gallery, and streams the full answer; search failures stay nonfatal
- chat route establishes SSE before retrieval and forwards ordinary text before generation completes
- distinct image queries get their own results and share a combined gallery
- fallback image routing discards pre-search text and uses only streamed caption fallback
- distinct searches return independent server IDs even if the providers return the same image
- provider text fallback receives actual gallery IDs with no fixed one-line response contract
- a successful gallery survives a later search failure and answer-tool fallback before streaming text
- landing keeps the app palette and the new animated headline
- landing brand mark is explicitly white
- light theme artifact note cards use the white surface
- list markers follow the active accent and file kinds avoid fixed red or green colors
- notebook symbols are stable and never fall back to nothing
- native chat routing suppresses a provider saved claim before note persistence
- plan surface shows plan cards, shared pooled usage, and billing controls
- the model sees only compact guide metadata before activation
- a selected guide loads its full plain-text body and matches its SKILL.md metadata
- chat route streams guide activity, keeps the core, and never searches photos after a guided photo solution
- new page suggestion icons use the theme accent
- high-contrast mode uses the stronger dark palette
- large extracted text returns the actual sidecar path for persistence and indexing
- the shared voice requires current-turn format and targeted-edit fidelity within its budget
- chat reactions render the new inactive and filled icons
- project chat keeps stopped output quiet and renders bounded follow-up prompts
- pane clips fixed-width content and keeps its toggle in the chat header
- pane reserves composer space and supports a full overlay mode
- expanded pane keeps the collapse toggle on the far right with an opaque surface
- pane controls use the smaller icon scale
- full pane expands from the right without changing chat layout
- full pane keeps the chat column reserved and isolates the animated surface
- pane animation clips the content surface while expanded mode fills the workspace
- chat reserves the pane slot with the same synchronized width transition
- full pane fills its content while keeping the overlay full width
- page-specific chrome replaces the global pane controls
- panel-owned chrome keeps a global pane toggle available
- panel blocks are lifted slightly above the panel surface and paste icons use text color
- pane fills the desktop height without rounded outer edges
- chat stays pinned to the bottom while the panel width changes
