# Continuous document previews and rendered slide previews

## Goal

Make file previews behave like a browser document viewer: PDF and paginated document previews are shown as one vertically scrollable surface, while PowerPoint previews show the original slide composition rather than extracted text.

## User-visible behavior

- PDF pages render continuously in one scroll container. The current-page indicator may follow the page nearest the viewport, but page navigation is not required to move the viewer into a single-page mode.
- Rendered document pages, when available, use the same continuous vertical layout. Text extraction remains an AI/search input only and is not the primary visual preview.
- PPTX previews display one fully rendered visual image per slide in original slide order and aspect ratio. Extracted slide text is never used as the normal visual fallback.
- If a PPTX has no rendered slide assets, the viewer shows a clear unavailable-preview/download message instead of presenting a misleading text reconstruction.
- Zoom continues to affect the rendered preview without changing the scroll model.

## Architecture

### PDF viewer

Replace the single-page PDF stage with a document renderer that loads the original PDF once, discovers its page count, and renders all pages inside the existing scroll viewport. Each page gets a stable page marker for scroll tracking. The existing zoom state and page indicator remain available; page changes from the toolbar scroll the matching page into view.

### Rendered-page viewer

Use one continuous page-stream component for stored page images. PDF page images and any future DOCX page renders use the same component. It lazy-loads nearby pages, keeps the page order stable, and reports the page nearest the viewport to the existing chrome.

### PPTX rendering pipeline

The ingest pipeline must produce a complete render for each PPTX slide, not only extract text or copy embedded media. The renderer should preserve slide layout, text, shapes, backgrounds, and embedded media. The stored output is a slide image (or equivalent page render) referenced by the material record. `material-viewer.tsx` consumes only those complete slide renders for the PPTX visual surface.

The extraction output remains unchanged in purpose: its text supports AI context, search, and retrieval. It must not be used to create the user-facing slide preview when a rendered slide is missing.

### Compatibility and existing files

New uploads use the complete rendering path. Existing PPTX records that only contain extracted text or partial image assets are treated as preview-incomplete; they get a download/reprocess state rather than a text-based visual preview. The implementation should reuse the existing material status and storage conventions where possible.

## Error handling

- A failed PDF page render should show an inline page-level error without breaking the rest of the document.
- A missing stored slide render should be represented as unavailable preview, not silently replaced by extracted text.
- Authentication and file-not-found behavior should continue using the existing viewer messages.
- Rendering failures during ingestion should preserve the original upload and mark the material as needing processing or reprocessing according to the existing material lifecycle.

## Testing and verification

- Add/extend viewer source tests to assert that PDF uses a continuous page stream and PPTX does not render extracted text as its normal slide fallback.
- Add ingest tests for complete PPTX slide-render output and for the no-render fallback state.
- Run the focused material preview tests, then the repository’s available lint/build checks.
- Manually verify a multi-page PDF and a multi-slide PPTX: continuous scroll, scroll-position page indicator, zoom, download, and failure states.

## Scope boundaries

This change does not alter AI extraction, chat retrieval, or the panel/sidebar behavior. It changes only material preview rendering and the supporting ingest output needed for faithful PPTX previews.
