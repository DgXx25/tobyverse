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

const { uploadLimitForPlan, uploadLimitLabel, isUploadWithinPlan } = require("../lib/materials/upload-cap.ts");

test("per-plan file caps use exact MiB byte limits", () => {
  const mib = 1024 * 1024;
  assert.deepEqual(
    ["free_beta", "lite", "pro", "max", "admin"].map(uploadLimitForPlan),
    [15, 25, 50, 100, 600].map((size) => size * mib),
  );
  assert.equal(uploadLimitLabel("free_beta"), "15 MB");
  assert.equal(uploadLimitLabel("admin"), "600 MB");
  assert.equal(isUploadWithinPlan(40 * mib, "free_beta"), false);
  assert.equal(isUploadWithinPlan(40 * mib, "admin"), true);
  assert.equal(isUploadWithinPlan(99 * mib, "max"), true);
  assert.equal(isUploadWithinPlan(101 * mib, "max"), false);
  assert.equal(isUploadWithinPlan(500 * mib, "admin"), true);
});
