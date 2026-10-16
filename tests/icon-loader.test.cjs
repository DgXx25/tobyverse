/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadIconLoader() {
  const filename = path.resolve(__dirname, '../lib/workspace/icon-loader.ts');
  const loaded = new Module(filename, module);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports.createBatchedIconLoader;
}

test('icon requests in the same render batch share one request and cache the results', async () => {
  const createBatchedIconLoader = loadIconLoader();
  const batches = [];
  const loader = createBatchedIconLoader(async (names) => {
    batches.push(names);
    return Object.fromEntries(names.map((name) => [name, `glyph:${name}`]));
  });

  const first = loader.load('StockIcon');
  const second = loader.load('ShoppingBag01Icon');
  assert.deepEqual(await Promise.all([first, second]), ['glyph:StockIcon', 'glyph:ShoppingBag01Icon']);
  assert.deepEqual(batches, [['StockIcon', 'ShoppingBag01Icon']]);
  assert.equal(await loader.load('StockIcon'), 'glyph:StockIcon');
  assert.equal(batches.length, 1);
});
