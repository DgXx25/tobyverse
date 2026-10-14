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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  module._compile(output, filename);
}
require.extensions[".ts"] = loadTypeScript;
require.extensions[".tsx"] = loadTypeScript;

const { collectThreadReferences } = require("../lib/sharing/thread-references.ts");
const { compactFeedbackReport } = require("../lib/feedback/report.ts");
const { safeInlineMime } = require("../lib/sharing/file-response.ts");
const { gateChatTool, wantsSheet } = require("../lib/composer/intent.ts");
const { formatWorked } = require("../components/workspace/status-wait.tsx");

test("public share references only message attachments, images, and note cards", () => {
  const refs = collectThreadReferences([
    {
      attachments: [{ materialId: "pdf-1" }, { materialId: "pdf-1" }],
      images: [{ materialId: "image-2" }],
      artifact: { kind: "sheet", id: "note-1" },
    },
    { attachments: [], images: [], artifact: { kind: "practice", id: "practice-1" } },
  ]);
  assert.deepEqual(refs.materialIds, ["pdf-1", "image-2"]);
  assert.deepEqual(refs.sheetIds, ["note-1"]);
});

test("feedback stores only the compact report contract and clips its optional note", () => {
  const report = compactFeedbackReport({
    projectId: "project-1",
    messageId: "message-1",
    reason: "  Too vague  ",
    note: "x".repeat(600),
    createdAt: "2026-09-22T10:00:00.000Z",
  });
  assert.deepEqual(Object.keys(report).sort(), ["createdAt", "messageId", "note", "projectId", "reason"]);
  assert.equal(report.reason, "Too vague");
  assert.equal(report.projectId, "project-1");
  assert.equal(report.note.length, 500);
});

test("Georgian note requests are sheets and never paths", () => {
  const prompt = "გააკეთე კონსპექტი ზღვრულ ხარჯზე";
  assert.equal(wantsSheet(prompt), true);
  const tool = gateChatTool({
    tool: { name: "create_path", args: { topic: "ზღვრული ხარჯი" } },
    prompt,
    mode: "teacher",
  });
  assert.equal(tool.name, "create_sheet");
});

test("make a note is a confirmed sheet creation", () => {
  const tool = gateChatTool({
    tool: { name: "answer", args: {} },
    prompt: "Make a note about marginal cost",
    mode: "teacher",
    keywordFallback: true,
  });
  assert.equal(tool.name, "create_sheet");
});

test("path creation requires Teacher mode and explicit path language", () => {
  const prompt = "დამიგეგმე სასწავლო გზა ეკონომიკაში";
  const fast = gateChatTool({
    tool: { name: "create_path", args: { topic: "ეკონომიკა" } },
    prompt,
    mode: "fast",
  });
  assert.equal(fast.name, "answer");

  const teacher = gateChatTool({
    tool: { name: "create_path", args: { topic: "ეკონომიკა" } },
    prompt,
    mode: "teacher",
  });
  assert.equal(teacher.name, "suggest_path");
});

test("settled model status is English", () => {
  assert.equal(formatWorked(1900, true), "Worked for 2s ›");
});

test("public file previews allow only inert inline MIME types", () => {
  assert.equal(safeInlineMime("application/pdf"), "application/pdf");
  assert.equal(safeInlineMime("image/png"), "image/png");
  assert.equal(safeInlineMime("text/plain; charset=utf-8"), "text/plain");
  assert.equal(safeInlineMime("text/html"), null);
  assert.equal(safeInlineMime("image/svg+xml"), null);
});

test("chat sharing keeps creation protected and scopes updates to owners", () => {
  const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
  assert.match(rules, /shareFieldsAbsent\(request\.resource\.data\)/);
  assert.match(rules, /resource\.data\.userId == request\.auth\.uid[\s\S]*?shareFieldsUnchangedOrValid\(\)/);
});
