/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadRouteHelper() {
  const filename = path.resolve(__dirname, '../lib/workspace/active-notebook-tab.ts');
  const loaded = new Module(filename, module);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}

test('home and non-project routes have no active notebook tab', () => {
  const { activeNotebookId } = loadRouteHelper();
  assert.equal(activeNotebookId('/'), null);
  assert.equal(activeNotebookId('/new'), null);
  assert.equal(activeNotebookId('/dashboard'), null);
  assert.equal(activeNotebookId('/library'), null);
});

test('notebook and chat routes select only their own tab', () => {
  const { activeNotebookId } = loadRouteHelper();
  assert.equal(activeNotebookId('/p/project-a'), 'project-a');
  assert.equal(activeNotebookId('/c/chat-a'), 'chat-a');
  assert.equal(activeNotebookId('/p/project-a/settings'), 'project-a');
});
