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

const { geminiCallUsage } = require("../lib/ai/gemini.ts");
const { createAiUsageCollector } = require("../lib/billing/collector.ts");

test("Gemini metadata maps prompt, candidate, thought, and total counts", () => {
  assert.deepEqual(
    geminiCallUsage("gemini-2.5-flash", "gemini-2.5-flash-001", {
      promptTokenCount: 100,
      candidatesTokenCount: 40,
      thoughtsTokenCount: 10,
      totalTokenCount: 150,
    }),
    {
      provider: "gemini",
      model: "gemini-2.5-flash",
      modelVersion: "gemini-2.5-flash-001",
      inputTokens: 100,
      outputTokens: 40,
      thinkingTokens: 10,
      totalTokens: 150,
    },
  );
});

test("two provider reports become two requests in one collector", () => {
  const collector = createAiUsageCollector({ allowUnpriced: false });
  collector.report(geminiCallUsage("gemini-2.5-flash", "v1", { promptTokenCount: 2, candidatesTokenCount: 1, totalTokenCount: 3 }));
  collector.report(geminiCallUsage("gemini-2.5-flash", "v1", { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 }));
  assert.equal(collector.snapshot().requestCount, 2);
});
