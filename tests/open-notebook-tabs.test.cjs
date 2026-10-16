/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTabs() {
  const filename = path.resolve(__dirname, '../lib/workspace/open-tabs.ts');
  const loaded = new Module(filename, module);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}

test('opening a fourth notebook keeps only the three most recently opened tabs', () => {
  const { addOpenNotebook } = loadTabs();
  assert.deepEqual(addOpenNotebook(['a', 'b', 'c'], 'd'), ['b', 'c', 'd']);
});

test('opening a notebook that is already open does not duplicate it', () => {
  const { addOpenNotebook } = loadTabs();
  assert.deepEqual(addOpenNotebook(['a', 'b'], 'a'), ['a', 'b']);
});
