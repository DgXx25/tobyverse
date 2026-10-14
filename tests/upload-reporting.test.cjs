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
function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  module._compile(output, filename);
}
require.extensions[".ts"] = loadTypeScript;

const { formatUploadFailure, uploadFailureMessage } = require("../lib/materials/folder-upload.ts");
const { MAX_UPLOAD_BYTES, uploadTooLargeMessage } = require("../lib/materials/limits.ts");
const { inferMaterialType, materialFileName } = require("../lib/materials/types.ts");
const { storageInsufficientMessage } = require("../lib/account/plan.ts");
const { patchComposerChip } = require("../lib/composer/chips.ts");
let normalizeImageUpload;
try {
  ({ normalizeImageUpload } = require("../lib/materials/image-normalization.ts"));
} catch {
  normalizeImageUpload = undefined;
}

test("upload failures keep one actionable line per file", () => {
  assert.equal(
    formatUploadFailure({ name: "book.pdf", reason: { status: 413, message: "Not enough storage. This needs 9 MB; 2 MB left of 1 GB." } }),
    "book.pdf: Not enough storage. This needs 9 MB; 2 MB left of 1 GB.",
  );
  assert.equal(
    formatUploadFailure({ name: "slides.pptx", reason: { status: 401 } }),
    "slides.pptx: Sign in required",
  );
  assert.equal(
    formatUploadFailure({ name: "scan.pdf", reason: { phase: "extract", storageSaved: true } }),
    "scan.pdf: Saved, but text could not be read",
  );
});

test("network failures stay actionable and the secondary transport ceiling is 100 MB", () => {
  assert.equal(uploadFailureMessage({ kind: "network" }), "Network error. Try again.");
  assert.equal(MAX_UPLOAD_BYTES, 100 * 1024 * 1024);
  assert.equal(uploadTooLargeMessage(), "File exceeds the 100 MB upload limit");
});

test("quota rejection explains the pool space left before any transport ceiling", () => {
  assert.equal(
    storageInsufficientMessage(2 * 1024 * 1024, 9 * 1024 * 1024),
    "Not enough storage. This needs 9.0 MB; 2.0 MB left of 1 GB.",
  );
  assert.equal(storageInsufficientMessage(0, 1), "Not enough storage. This needs 1 B; 0 B left of 1 GB.");
});

test("HEIC and HEIF are photo inputs and receive JPEG object names", () => {
  assert.equal(inferMaterialType("camera.HEIC", "image/heic"), "image");
  assert.equal(inferMaterialType("camera.heif", "image/heif"), "image");
  assert.equal(materialFileName("image", "camera.HEIC"), "camera.jpg");
  assert.equal(materialFileName("image", "camera.heif"), "camera.jpg");
});

test("server image normalization returns JPEG bytes and rejects an undecodable HEIC clearly", async () => {
  assert.equal(typeof normalizeImageUpload, "function");
  if (typeof normalizeImageUpload !== "function") return;
  const sharp = require("sharp");
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();
  const normalized = await normalizeImageUpload({ filename: "camera.heic", mime: "image/heic", buffer: png });
  assert.equal(normalized.filename, "camera.jpg");
  assert.equal(normalized.mime, "image/jpeg");
  assert.equal((await sharp(normalized.buffer).metadata()).format, "jpeg");
  await assert.rejects(
    normalizeImageUpload({ filename: "broken.heif", mime: "image/heif", buffer: Buffer.from("broken") }),
    /could not convert.*jpeg|unsupported.*heic/i,
  );
});

test("concurrent upload failures remain attached to their own chips", () => {
  const chips = [
    { id: "photo-a", status: "uploading", title: "a.heic" },
    { id: "photo-b", status: "uploading", title: "b.png" },
  ];
  const withFirstError = patchComposerChip(chips, "photo-a", { status: "error", error: "2 MB left" });
  const withBothErrors = patchComposerChip(withFirstError, "photo-b", { status: "error", error: "Network error" });
  assert.equal(withBothErrors[0].error, "2 MB left");
  assert.equal(withBothErrors[1].error, "Network error");
});

test("long filenames with spaces become safe upload object names", () => {
  const name = `A very long textbook filename with spaces ${"chapter-".repeat(20)}.pdf`;
  const stored = materialFileName("pdf", name);
  assert.equal(stored.includes(" "), false);
  assert.equal(stored.length <= 80, true);
  assert.equal(stored.endsWith(".pdf"), true);
});
