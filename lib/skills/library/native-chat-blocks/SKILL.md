---
name: native-chat-blocks
description: Optional schemas for specialized, interactive TobyVerse chat blocks.
---

# Specialized chat blocks

Choose a block only when its native behavior or layout adds value. Keep explanations and labels in the user's language. Emit the exact type-specific JSON in a `toby` fence; prose may appear before or after it. Never generate HTML, invent image references, duplicate the same explanation, or turn a response into a form/quiz without a real need.

## Sections

Use for distinct titled explanations, criteria, or observations that benefit from separated rows. `items` has 1–8 rows, each with `symbol`, `title`, and `text` (Markdown is allowed; encode newlines as `\n`). Optional group `title`.

```toby sections
{"items":[{"symbol":"idea","title":"...","text":"..."},{"symbol":"check","title":"...","text":"..."}]}
```

For explanations with two or more distinct ideas, usually prefer 2–4 short, meaningful rows over an ungrouped paragraph or generic bullet list when this improves scanning. Keep each row focused; simple answers can remain prose.

## Visual explanation

For explanations of concrete real-world phenomena, usually include a visual-explanation block when a specific, accurate photograph makes its appearance, mechanism, or effects easier to grasp. Consider it proactively, even without an explicit image request. Keep the card's note to one brief line, don't repeat it in surrounding prose, and use only a real image returned by search or attached by the user. Skip routine facts and cases where a photo adds no understanding or no suitable image is available.

```toby visual-explanation
{"title":"Short idea","note":"Optional concise caption","galleryId":"actual-search-gallery","imageIndex":0}
```

## Dialogue

Use for a short, natural exchange when dialogue itself helps (for example, language usage). Requires 2–3 speakers with unique `id` and an `emoji` or `name`, plus 2–4 lines with valid `speaker` and `text`. Optional `gloss`, `title`, `note`, and `mark`.

```toby dialogue
{"speakers":[{"id":"a","name":"A"},{"id":"b","name":"B"}],"lines":[{"speaker":"a","text":"..."},{"speaker":"b","text":"..."}]}
```

## Form

Use only when a small set of actual user choices/details is needed for their requested task. Never use it as an interview or to collect passwords, keys, secrets, payment card details, or authentication codes. Requires `title` and 1–8 fields (`id`, `type`, `label`); `type` is `radio`, `checkbox`, `text`, or `textarea`. Radio/checkbox require 2–12 options with unique ids and labels. Text fields may include `placeholder` and `maxLength`; fields may include `help` or `required`. Optional `help` and `submitLabel`.

```toby form
{"title":"...","fields":[{"id":"choice","type":"radio","label":"...","options":[{"id":"a","label":"..."},{"id":"b","label":"..."}]}]}
```

## Image list

Use when real images beside entries improve identification or comparison. Each item requires `title` and zero-based `imageIndex`; use `galleryId` only when it came from completed search results. Never invent a gallery id or URL. Requires 1–12 items; optional block `title` and `shape` (`portrait` or `square`). Search for images only when useful images are not already available.

```toby image-list
{"items":[{"title":"...","text":"...","galleryId":"returned-id","imageIndex":0}]}
```

## Arithmetic grid

Use for very small concrete counts, not abstract algebra. `cells` uses `f` filled, `e` outline, `d` dim, `h` accent; insert `+`, `−`, `×`, or `=` between groups. Optional `cols` (1–10), `result`, and `note`; 1–40 marks.

```toby grid
{"cells":"fff+ee","result":"$3+2=5$"}
```

## Editable formal document

Use `paper` for a document-like editable sheet, not a general letter that reads better as prose. Layout ids: `ganckhadeba` (application/request) and `certificate` (certificate draft). For a sample, include `sample` with optional `to`, `body`, `sign`, and `date`; for a fillable sheet omit `sample` and optionally pass `given.to`. `brief` is required. Use only user-supplied facts and visible placeholders. Never imply institutional issuance, signature, or verification. A previously existing sheet may be reopened with only `{"reuse":true}`.

```toby paper
{"form":"certificate","brief":"Enrollment certificate draft","sample":{"to":"[Institution]","body":"This is to confirm that [Student name] is enrolled in [Program] during [Academic year].\\n\\nDraft for completion and verification by the institution.","sign":"[Authorized signatory]","date":"[Date]"}}
```
