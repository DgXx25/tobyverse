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

const { partsForReplay } = require("../lib/ai/gemini.ts");

test("a function call keeps the thought signature Gemini sent with it", () => {
  const replay = partsForReplay([
    {
      functionCall: { name: "create_practice", args: { topic: "cells" } },
      thoughtSignature: "sig-a",
    },
  ]);
  assert.equal(replay[0].thoughtSignature, "sig-a");
  assert.equal(replay[0].functionCall.name, "create_practice");
});

test("a signature that arrived on another part is copied onto the first function call", () => {
  const replay = partsForReplay([
    { text: "", thought_signature: "sig-b" },
    { functionCall: { name: "create_practice", args: {} } },
  ]);
  assert.equal(replay[1].thoughtSignature, "sig-b");
  assert.equal(replay[0].thoughtSignature, "sig-b");
  assert.equal(replay[0].thought_signature, undefined);
});

test("parallel calls keep the signature only on the first function call", () => {
  const replay = partsForReplay([
    { functionCall: { name: "create_practice", args: {} }, thoughtSignature: "sig-a" },
    { functionCall: { name: "create_quiz", args: {} } },
  ]);
  assert.equal(replay[0].thoughtSignature, "sig-a");
  assert.equal(replay[1].thoughtSignature, undefined);
});
