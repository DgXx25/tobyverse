/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadDraftNotebook() {
  const filename = path.resolve(__dirname, '../lib/workspace/draft-notebook.ts');
  const loaded = new Module(filename, module);
  loaded.require = (name) => name === '@/lib/workspace/title'
    ? { UNTITLED_NOTEBOOK_TITLE: 'Untitled notebook' }
    : require(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}

test('only an untouched default notebook is eligible for automatic discard', () => {
  const { isUntouchedNotebook } = loadDraftNotebook();
  const blank = { title: 'Untitled notebook', description: '', projectMemory: [], activeArtifact: null };
  assert.equal(isUntouchedNotebook(blank), true);
  assert.equal(isUntouchedNotebook({ ...blank, title: 'My notes' }), false);
  assert.equal(isUntouchedNotebook({ ...blank, description: 'Keep this' }), false);
  assert.equal(isUntouchedNotebook({ ...blank, projectMemory: ['Remember this'] }), false);
  assert.equal(isUntouchedNotebook({ ...blank, activeArtifact: { id: 'a' } }), false);
});
