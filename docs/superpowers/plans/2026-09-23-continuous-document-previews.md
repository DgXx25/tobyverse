# Continuous Document Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-page/text fallbacks with continuous visual previews for PDFs and rendered document pages, and ensure PPTX previews use complete slide renders rather than extracted text.

**Architecture:** Keep the existing `MaterialViewer` chrome and file-access APIs. Add a reusable continuous page stream for PDF pages and stored rendered pages, with scroll-position tracking feeding the existing page indicator. Make PPTX ingestion produce complete slide renders through a render adapter; the viewer accepts only complete slide assets for the visual surface and shows an explicit unavailable state when they do not exist.

**Tech Stack:** Next.js 15, React 19, `react-pdf`, TypeScript, Node `node:test`, Firebase Storage/Firestore, existing JSZip-based material extraction.

**Spec:** `docs/superpowers/specs/2026-09-23-continuous-document-previews-design.md`

## Global Constraints

- Extracted text remains an AI/search input and must not be the normal user-facing PPTX preview.
- PDF and rendered document pages must use one vertically scrollable surface.
- Missing PPTX renders must show an unavailable/download state instead of reconstructed text.
- Preserve existing authentication, download, zoom, material status, and storage conventions.
- Do not alter AI retrieval, chat behavior, sidebar behavior, or panel behavior.

## Review Focus

- A 14-page PDF must render in one scroll surface while the page indicator follows the viewport.
- PDF zoom must resize every rendered page without reverting to one-page mode.
- A PPTX with no complete slide render must never show extracted text as a slide.
- A PPTX slide containing text, shapes, backgrounds, and embedded images must preserve its composition in the stored render.
- A missing or failed page/slide asset must not blank the whole viewer or silently change the document type.

### Task 1: Add failing tests for continuous preview contracts

**Files:**
- Modify: `tests/material-preview.test.cjs`
- Modify: `tests/workspace-panel.test.cjs` only if an existing viewer contract belongs there

**Interfaces:**
- Consumes: current source-string test style and `components/workspace/material-viewer.tsx`.
- Produces: regression assertions for the viewer behavior used by Tasks 2 and 3.

- [ ] **Step 1: Write the failing tests**

Add source-level tests that pin the intended contracts without requiring a browser:

```js
test("PDF viewer renders a continuous page stream", () => {
  const source = fs.readFileSync(path.join(root, "components/workspace/material-viewer.tsx"), "utf8");
  assert.match(source, /pages\.map\(\(page\)/);
  assert.match(source, /data-pdf-page/);
  assert.match(source, /overflow-auto/);
});

test("PPTX viewer never falls back to extracted slide text", () => {
  const source = fs.readFileSync(path.join(root, "components/workspace/material-viewer.tsx"), "utf8");
  assert.match(source, /No rendered slide preview available/);
  assert.doesNotMatch(source, /No text on this slide\./);
});

test("stored document pages use the continuous page stream", () => {
  const source = fs.readFileSync(path.join(root, "components/workspace/material-viewer.tsx"), "utf8");
  assert.match(source, /kind === "document"/);
  assert.match(source, /data-stored-page/);
  assert.match(source, /pages\.map\(\(slide\)/);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/material-preview.test.cjs`

Expected: the new tests fail because PDF is still rendered through a single `MaterialPdfPage`, stored documents still use `SlideStage`, and PPTX still renders text fallback.

- [ ] **Step 3: Commit the tests**

Run: `git add tests/material-preview.test.cjs && git commit -m "test: define continuous material preview contracts"`

### Task 2: Convert PDF and stored document previews to continuous scrolling

**Files:**
- Modify: `components/workspace/material-viewer.tsx`
- Modify: `components/workspace/material-pdf-page.tsx` only if the page component needs a stable page marker or error boundary adjustment
- Test: `tests/material-preview.test.cjs`

**Interfaces:**
- Consumes: `useMaterialFile`, `StageChrome`, `ViewerBoundary`, and the existing `react-pdf` worker setup.
- Produces: a PDF stage that renders all pages in one scroll surface and a stored-page stage that renders document pages continuously.

- [ ] **Step 1: Add the minimal PDF page-stream implementation**

In `PdfStage`, keep one `Document` instance for the loaded PDF, store `pageCount`, and render:

```tsx
<div ref={stageRef} className="h-full overflow-auto px-3 py-4" onScroll={updateCurrentPage}>
  <Document file={fileBlob} onLoadSuccess={({ numPages }) => setPageCount(numPages)}>
    {Array.from({ length: pageCount }, (_, index) => (
      <div key={index + 1} data-pdf-page={index + 1} ref={pageRefs[index]} className="mx-auto mb-4">
        <Page pageNumber={index + 1} width={pageWidth || 320} renderAnnotationLayer={false} renderTextLayer />
      </div>
    ))}
  </Document>
</div>
```

Use a stable page marker and nearest-page calculation from the scroll viewport. Keep `StageChrome.setPage` as a scroll-to-page action so existing toolbar controls continue working. Apply the zoom width to every page.

- [ ] **Step 2: Run focused tests and verify GREEN for the PDF contract**

Run: `node --test tests/material-preview.test.cjs`

Expected: the PDF continuous-stream assertion passes; stored document and PPTX assertions remain red.

- [ ] **Step 3: Replace single-page stored document rendering with a page stream**

In `StoredPagesStage`, keep the existing `pages` list and use the same continuous stream for `kind === "document"` that the PPTX path already uses for complete stored images. Add `data-stored-page` markers, scroll tracking, lazy loading for nearby page images, and a per-page error placeholder. Do not use `paginateText` to create visual pages when the document is expected to have rendered pages; retain it only for an explicit text-only document type.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/material-preview.test.cjs`

Expected: all new continuous-preview tests pass, with no regressions in the existing material preview tests.

- [ ] **Step 5: Commit the continuous viewer**

Run: `git add components/workspace/material-viewer.tsx components/workspace/material-pdf-page.tsx tests/material-preview.test.cjs && git commit -m "feat: render material previews continuously"`

### Task 3: Add complete PPTX slide rendering and remove text visual fallback

**Files:**
- Modify: `lib/materials/pptx.ts`
- Modify: `lib/materials/extract.ts`
- Modify: `lib/materials/ingest-client.ts`
- Modify: `lib/materials/viewer-files.ts` if a complete-render asset marker is needed
- Modify: `components/workspace/material-viewer.tsx`
- Test: `tests/material-preview.test.cjs`
- Test: a new `tests/pptx-rendering.test.cjs` if the render adapter can be tested without a production runtime

**Interfaces:**
- Consumes: original PPTX bytes, current material extraction response, and the existing `slideImagesFromExtract` upload path.
- Produces: one complete rendered asset per slide with explicit metadata distinguishing a full slide render from an embedded figure.

- [ ] **Step 1: Write the failing renderer contract test**

Add a test around the renderer result shape:

```js
test("PPTX extraction distinguishes complete slide renders from embedded images", () => {
  const source = fs.readFileSync(path.join(root, "lib/materials/pptx.ts"), "utf8");
  assert.match(source, /renderedSlide|fullSlide|complete.*render/i);
});
```

Add a viewer assertion that `slidesFromImages` accepts only complete slide assets for the PPTX path and that missing complete assets produce the unavailable message.

- [ ] **Step 2: Run the renderer test and verify RED**

Run: `node --test tests/material-preview.test.cjs tests/pptx-rendering.test.cjs`

Expected: the renderer metadata test fails because current extraction only returns embedded media and text.

- [ ] **Step 3: Implement the render adapter with an explicit runtime boundary**

Add a `renderPptxSlides(buffer)` adapter in `lib/materials/pptx.ts` (or a focused sibling module) that returns `{ page, mime, bytes, complete: true }` for every slide. The adapter must preserve the full slide composition, not only `<a:t>` text or media relationships. Keep `extractPptx` text extraction separate so AI context remains cheap and deterministic.

Before wiring it into ingestion, verify the deployment runtime supports the selected renderer. If the renderer is a native converter, keep invocation isolated behind the adapter and return a typed “renderer unavailable” result rather than throwing an untyped process error. Do not silently label partial embedded images as complete slide renders.

- [ ] **Step 4: Upload complete slide renders with metadata**

Update `ExtractResponse.images` and `slideImagesFromExtract` so complete slide renders are uploaded as the primary `slide-N` asset for each page, while embedded figures remain separate or are ignored by the visual viewer. Persist `hasImages`/material status only after complete render output is known. Preserve the original PPTX storage path for download.

- [ ] **Step 5: Remove the PPTX text reconstruction fallback**

In `StoredPagesStage`/`ContinuousSlidePage`, when `kind === "slides"` and a page has no complete render, render `No rendered slide preview available. Download the original PowerPoint file.` instead of `text` or `No text on this slide.`. Extracted text may still be loaded for AI/search but must not be rendered in the slide surface.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `node --test tests/material-preview.test.cjs tests/pptx-rendering.test.cjs`

Expected: all viewer and renderer contract tests pass, including the missing-render fallback.

- [ ] **Step 7: Commit the PPTX pipeline**

Run: `git add lib/materials/pptx.ts lib/materials/extract.ts lib/materials/ingest-client.ts lib/materials/viewer-files.ts components/workspace/material-viewer.tsx tests/material-preview.test.cjs tests/pptx-rendering.test.cjs && git commit -m "feat: render faithful PPTX previews"`

### Task 4: Full verification and manual QA

**Files:**
- No planned production changes; fix only failures discovered by verification.

**Interfaces:**
- Consumes: Tasks 2 and 3 outputs.
- Produces: verified continuous PDF/document scrolling and faithful PPTX preview behavior.

- [ ] **Step 1: Run all focused tests**

Run: `node --test tests/material-preview.test.cjs tests/workspace-panel.test.cjs`

Expected: PASS.

- [ ] **Step 2: Run lint on changed TypeScript files**

Run: `npx eslint components/workspace/material-viewer.tsx components/workspace/material-pdf-page.tsx lib/materials/pptx.ts lib/materials/extract.ts lib/materials/ingest-client.ts lib/materials/viewer-files.ts`

Expected: no errors. Pre-existing warnings elsewhere are not part of this change.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: successful Next.js production build.

- [ ] **Step 4: Manually verify the user flows**

Open a multi-page PDF and confirm every page is visible in one vertical scroll, zoom resizes all pages, the indicator tracks the page in view, and toolbar navigation scrolls to the selected page. Open a multi-slide PPTX and confirm the slide layout, text, shapes, backgrounds, and images match the original; confirm no extracted text-only slide appears. Test a PPTX with missing render assets and confirm the explicit unavailable/download message.

- [ ] **Step 5: Review the final diff and status**

Run: `git diff --check` and `git status --short`

Expected: no whitespace errors; only intended files are staged or changed. Do not reset or overwrite unrelated user work in the dirty worktree.
