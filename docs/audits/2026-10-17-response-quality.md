# Response quality audit — 2026-10-17

## Method

Live localhost UI, signed-in account, selected Gemini 3.5 Flash. Ordinary questions only: no requests for brevity, formatting, tables, diagrams, emojis or a specific block. Eight UI answers completed; an interrupted request is excluded. User memory was not modified. Supplemental isolated controls used the real prompt builder and Gemini provider/tool loop with empty history and memory. This is a small qualitative sample, not a universal quality or latency guarantee.

Initial project: `79qNrx4axSlJleLjGihV`. A fresh control project was created through the UI after the changes to reduce imitation of earlier verbose replies: `vJnP6DvSnLp24MdTHmUM`.

## Initial observations

| Natural question | Observed behavior | Assessment |
| --- | --- | --- |
| რა არის ფოტოსინთეზი? | Two explanatory paragraphs, animated scene, a table of the same inputs/outputs, external image gallery. | Useful scene; redundant representations and ornate analogy. “ფესვებითქაჩავს” has a missing word boundary. Image search was triggered accidentally by the stem ფოტო. |
| რა განსხვავებაა მიტოზსა და მეიოზს შორის? | Intro, two detailed bullet explanations, six-row comparison table. | Table is useful; much of the preceding text repeats it. Biological qualifications are too broad: mitosis does not universally imply diploidy, and four meiotic products do not always become four functional gametes. |
| 17 × 24 რამდენია? | Correct 408, then three arithmetic steps. | Correct but more working than the question needs. |
| მოთხოვნა რომ იზრდება, ფასს რა ემართება? | Correct supply-held-constant qualification, long coat analogy, interactive market, table repeating the relationship. | Answer is on topic but unnecessarily repeats itself. |
| რას ნიშნავს ნორმალურ განაწილებაში Z = 2? | Correct two-standard-deviation interpretation, multiple explanations, distribution scene, table. | Scene initially showed the unrelated default ±1.96 central interval. Point, cumulative probability and central interval were blurred in the explanation. |
| What is the difference between HTTP and HTTPS? | First request remained pending and was interrupted during hot reload. Retry completed with prose, bullets and a table; one lock emoji. | Retry retained redundant prose/table structure in the existing conversation. Exclude the interrupted request from response-quality counts and any latency conclusion. |

The first five completed answers used four tables and three native scenes. No unsolicited exercise appeared. Selective bold was common; explicit highlights were absent. Emojis were rare. More decoration is not itself a quality target: clarity, relevance and useful visual choice matter more.

## Root causes and changes

1. `Topbar` dispatched a storage event inside a React state updater, synchronously updating `ProjectTabKeepAlive` during render. State updaters are now pure; persistence/notification runs in an effect after state initialization. Reload and a new-project creation no longer showed that React warning.
2. Image fallback matched arbitrary stems, including ფოტო inside ფოტოსინთეზი and the generic request მომიძებნე. Use bounded media words and explicit diagram requests; translations and ordinary meaning questions do not force image search. Positive image requests remain supported.
3. The core named multiple formatting capabilities but did not define answer sufficiency clearly enough. It now favors the clearest main representation and adds another only for new information. Quick results can end directly; requests for depth still receive it. Warmth, selective emphasis and occasional fitting emojis remain optional.
4. Distribution presets lacked question-specific values and regions. Validated `cutoff`, `region` (point/left/right/central), and Student t `df` now reach the renderer. Streamed parameters update until the user changes a local slider. Scene descriptions distinguish a Z point from a one-sided probability and a central interval.

## Follow-up observations

### Live project check (same account/profile)

Five ordinary questions were added in the already-open biology project: opportunity cost, why sunset skies turn red, 15% of 80, how water changes when heated, and how an increase in demand changes equilibrium. No formatting or length instructions were included. Opportunity cost received a useful two-option table. Water received the new native sections card without being asked for one. None of the five chose an interactive scene; the demand answer could have benefited from the existing market visualization.

The answers were accurate in their core conclusions, but four of five repeated the same idea in multiple forms (prose plus table, repeated calculation methods, or list plus table). The simple percentage question got three methods. The water answer included the foreign-script fragment `გადაходят`. No answer offered an unrelated follow-up or unsolicited artifact in this sample (0/5); that restraint was appropriate. The account's saved learning preferences remain a confound, so this run evaluates this personalized project rather than the anonymous shared default.

The core now states the no-duplicate rule as a MUST while still allowing needed steps in a detailed answer. One fresh 18% calculation after that change still returned three methods, so the live sample did not confirm an output improvement. Keep the change as a clear invariant, but do not report the verbosity issue fixed; this account's memory and provider adherence need a separate controlled follow-up.

The account's existing learning profile explicitly favors story-like explanations, practical examples and tables. This persisted across projects and is a material confound when judging the shared default. Its econometrics-specific step-by-step preference should not be interpreted as permission for every answer to become a lesson. The profile was inspected, preserved, and excluded from the isolated controls.

The fresh project's photosynthesis answer no longer triggered an external image gallery, but still included a table and staged explanation under that profile. The next Z=2 answer used `cutoff:2, region:point`; the actual SVG marked 2, not 1.96. A keyboard change updated the local marker and caption to 2.01 without a model call. Reload resets local exploratory controls to the model's supplied values.

Eight independent questions were run on each of `gemini-3.5-flash-lite` and the app default `gemini-3.1-flash-lite`: photosynthesis, Z=2, multiplication, HTTP/HTTPS, a natural translation request, a JavaScript deduplication function, heavier t tails, and an increase in demand with unchanged supply. The tool loop's text-only continuation was included when necessary. No extra user-facing formatting instruction or per-case length instruction was supplied.

| Observation in these 16 controls | Gemini 3.5 Flash | Gemini 3.1 Flash |
| --- | --- | --- |
| Native scenes chosen spontaneously | 4 / 8 | 2 / 8 |
| `illustrate` chosen | 0 / 8 | 1 / 8 |
| Markdown tables | 1 / 8 | 0 / 8 |
| Explicit `==highlights==` | 2 / 8 | 0 / 8 |
| Multiplication | Correct; added three steps | Correct direct result |
| Translation | Several alternatives, despite a simple request | Several alternatives, despite a simple request |

Both models used code fences and selective bold. Neither needed an instruction to insert a scene. Emojis remained rare in the UI and were not a consistent feature of the controls. The comparison questions demonstrate that a table is available without making every answer a table. The latest three focused controls on the default model again gave the direct arithmetic result, but a definition and translation could still expand. These are individual observations, not statistically significant model rankings.

The neutral controls removed the repeated prose-plus-table combination in the photosynthesis and Z answers, but did not reliably make every answer minimal. Extra analogy, background, repeated explanation and translation variants still occur. Do not claim verbosity is solved globally or impose a hard word limit to hide this limitation.

One Gemini 3.5 control produced a Hebrew/Georgian mixed word in its raw provider output. This originates before SSE, storage and rendering. The core already requests fluent Georgian and correct word boundaries; that preference reduces neither all spelling errors nor all model hallucinations with certainty. A silent second-model rewrite or destructive character replacement was not added. Some explanations also used loose biological/statistical terminology; correct formatting alone does not establish factual accuracy.

## Checks and limits

45 prompt, routing, block and RAG checks passed after the final changes; TypeScript passed. Five existing tab/draft checks also passed. Numeric regressions check Z=2 as a point, 97.72% left area, 2.28% right area and 95.45% central area, and reject invalid numeric inputs. New image-intent regressions failed before the fix and passed after it.

The broader suite produced 247 passes and 25 failures out of 272. Every one of those 25 failure names also failed against the unmodified HEAD snapshot; no new failing test name was introduced. Many are source-pattern assertions for existing workspace, icon and layout behavior. Their existence is not a green full suite, and unrelated UI was not rewritten to satisfy stale source patterns. Temporary baseline extraction was removed after comparison.

Some UI requests stayed in a working state much longer than the isolated provider controls, including after text appeared. The direct controls completed in roughly 1–6 seconds, but they exclude account reads, persistence, browser scheduling and networking. Therefore this audit makes no claim that end-to-end latency or Stop behavior is repaired; those require separate phase timing before a storage/cancellation change.

Model spelling and factual consistency remain probabilistic. No dictionary replacement, automatic rewrite call, fixed word limit, required table or required scene was added. Memory override is covered by existing checks but was not manipulated in this live audit.
