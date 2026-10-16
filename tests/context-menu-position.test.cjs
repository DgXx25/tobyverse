/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadPosition() {
  const filename = path.resolve(__dirname, '../lib/workspace/context-menu-position.ts');
  const loaded = new Module(filename, module);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports.positionContextMenu;
}

test('context menus open down and right from the pointer when there is room', () => {
  const positionContextMenu = loadPosition();
  assert.deepEqual(positionContextMenu(100, 100, 200, 100, 1000, 800), { left: 108, top: 108 });
});

test('context menus flip left or up near viewport edges', () => {
  const positionContextMenu = loadPosition();
  assert.deepEqual(positionContextMenu(900, 750, 200, 100, 1000, 800), { left: 692, top: 642 });
});

test('context menus stay inside the viewport when the pointer is at an edge', () => {
  const positionContextMenu = loadPosition();
  assert.deepEqual(positionContextMenu(0, 0, 200, 100, 1000, 800), { left: 8, top: 8 });
});
