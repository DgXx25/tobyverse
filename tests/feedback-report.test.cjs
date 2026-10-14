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

const { compactFeedbackReport } = require("../lib/feedback/report.ts");

test("feedback report persists only project/message/reason/note/time and clips note to 500", () => {
  const report = compactFeedbackReport({
    projectId: "project-1",
    messageId: "message-9",
    reason: "Report a bug",
    note: " x ".repeat(220),
    createdAt: "2026-09-26T00:00:00.000Z",
  });
  assert.deepEqual(Object.keys(report).sort(), ["createdAt", "messageId", "note", "projectId", "reason"]);
  assert.equal(report.projectId, "project-1");
  assert.equal(report.note.length, 500);
  assert.equal(report.createdAt, "2026-09-26T00:00:00.000Z");
});

test("feedback quote preview is not part of persisted report", () => {
  const report = compactFeedbackReport({
    projectId: "project-1",
    messageId: "message-9",
    reason: "Other inappropriate content",
    note: "Please fix this sentence.",
    content: "private transcript must not be stored",
  });
  assert.equal("content" in report, false);
  assert.equal("snippet" in report, false);
});

test("feedback report cannot be built without a selected reason", () => {
  assert.throws(() => compactFeedbackReport({
    projectId: "project-1",
    messageId: "message-9",
    reason: "  ",
  }), /choose a reason/i);
});
