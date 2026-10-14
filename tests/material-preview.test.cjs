/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
};

const { decodeHtmlEntities, paginateText, slidesFromImages } = require("../lib/materials/viewer-files.ts");
const { originalLibraryMaterials } = require("../lib/library/originals.ts");
const { chatDeletionScope } = require("../lib/workspace/chat-ownership.ts");

test("decodes numeric Georgian entities in titles and extracted text", () => {
  assert.equal(decodeHtmlEntities("&#4307;&#4304;&#4311;&#4304; &amp; DOCX"), "დათა & DOCX");
});

test("never treats extracted slide figures as full page previews", () => {
  const slides = slidesFromImages([
    { page: 1, path: "figure-1.png", mime: "image/png", kind: "figure" },
    { page: 2, path: "page-2.png", mime: "image/png", kind: "page" },
  ]);
  assert.deepEqual(slides.map((slide) => slide.page), [2]);
});

test("only complete slide renders are visual PPTX pages", () => {
  const slides = slidesFromImages([
    { page: 1, path: "slide-1-0.png", mime: "image/png", kind: "figure" },
    { page: 1, path: "slide-1.png", mime: "image/png", kind: "slide", complete: true },
    { page: 2, path: "slide-2.png", mime: "image/png", kind: "slide", complete: false },
  ]);
  assert.deepEqual(slides.map((slide) => slide.fileName), ["slide-1.png"]);
});

test("PPTX ingest has a server-side renderer boundary", () => {
  const source = fs.readFileSync(path.join(root, "lib/materials/pptx-render.ts"), "utf8");
  assert.match(source, /soffice|libreoffice/);
  assert.match(source, /renderer unavailable/i);
});

test("paginates extracted document text without losing content", () => {
  const text = `${"word ".repeat(700)}\fsecond section`;
  const pages = [...paginateText(text, 1000).values()];
  assert.ok(pages.length > 2);
  assert.match(pages.at(-1), /second section/);
});

test("PDF viewer renders a continuous page stream", () => {
  const source = fs.readFileSync(path.join(root, "components/workspace/material-viewer.tsx"), "utf8");
  const pageSource = fs.readFileSync(path.join(root, "components/workspace/material-pdf-page.tsx"), "utf8");
  assert.match(pageSource, /Array\.from\(\{ length: Math\.max\(1, pageCount \?\? 1\)/);
  assert.match(source, /data-pdf-page/);
  assert.match(source, /overflow-auto/);
});

test("PPTX viewer never falls back to extracted slide text", () => {
  const source = fs.readFileSync(path.join(root, "components/workspace/material-viewer.tsx"), "utf8");
  assert.match(source, /Preview unavailable — Download the original PowerPoint file/);
  assert.doesNotMatch(source, /No text on this slide\./);
});

test("stored document pages use the continuous page stream", () => {
  const source = fs.readFileSync(path.join(root, "components/workspace/material-viewer.tsx"), "utf8");
  assert.match(source, /kind === "document"/);
  assert.match(source, /data-stored-page/);
  assert.match(source, /pages\.map\(\(slide\)/);
});

test("library only returns user originals", () => {
  const base = { projectId: "p", userId: "u", title: "x", originalName: "x.pdf", textPath: "users/u/projects/p/materials/a/extracted.txt", extractedTextPreview: "", sizeBytes: 1, pageCount: 1, hasImages: false, textChars: 0, images: [], status: "ready", createdAt: null };
  const materials = [
    { ...base, id: "a", type: "pdf", storagePath: "users/u/projects/p/materials/a/x.pdf" },
    { ...base, id: "b", type: "txt", storagePath: "users/u/projects/p/materials/b/extracted.txt" },
    { ...base, id: "c", type: "paste", storagePath: "users/u/projects/p/materials/c/notes.txt" },
  ];
  assert.deepEqual(originalLibraryMaterials(materials).map((item) => item.id), ["a"]);
});

test("listed chats keep project files while standalone chats own their container", () => {
  assert.equal(chatDeletionScope({ listed: true }), "thread");
  assert.equal(chatDeletionScope({ listed: false }), "container");
});

test("pasted note text previews use the panel surface instead of paper white", () => {
  const source = fs.readFileSync(path.join(root, "components/workspace/material-viewer.tsx"), "utf8");
  assert.match(source, /paper=\{material\.type !== "paste"\}/);
  assert.match(source, /bg-surface text-foreground/);
});

test("light theme artifact note cards use the white surface", () => {
  const source = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
  assert.match(source, /\.artifact-panel-content \.note-card \{\s*background: var\(--surface-2\);/);
});

test("notes use the accent color for quote rails and arrows while TXT uses text color", () => {
  const source = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
  assert.match(source, /\.note-quote \{\s*border-left: 3px solid color-mix\(in srgb, var\(--accent\) 42%, transparent\);/);
  assert.match(source, /\.note-from-to-arrow \{[\s\S]*?color: var\(--accent\);/);
  assert.match(source, /\.artifact-panel-paste-icon \{\s*color: var\(--text\);/);
});

test("list markers follow the active accent and file kinds avoid fixed red or green colors", () => {
  const source = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
  assert.match(source, /\.chat-body li::marker \{\s*color: var\(--accent\);/);
  assert.match(source, /\.file-kind-pdf \{\s*color: var\(--text\);/);
  assert.match(source, /\.file-kind-csv,[\s\S]*?color: var\(--text\);/);
});
