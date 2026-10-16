/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadActivity() {
  const filename = path.resolve(__dirname, '../lib/workspace/project-activity.ts');
  const loaded = new Module(filename, module);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}

test('a completed project only gets a badge while another project is active', () => {
  const { nextProjectActivityNotifications } = loadActivity();
  assert.deepEqual(nextProjectActivityNotifications(['older'], 'done', 'other'), ['older', 'done']);
  assert.deepEqual(nextProjectActivityNotifications(['older'], 'done', 'done'), ['older']);
});

test('opening a project clears only its completion badge', () => {
  const { clearProjectActivityNotification } = loadActivity();
  assert.deepEqual(clearProjectActivityNotification(['one', 'two'], 'one'), ['two']);
});
