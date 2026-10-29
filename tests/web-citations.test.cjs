/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const { extractWebSearchSources, webSourceInsertionIndex } = require('../lib/rag/web-citations.ts');

test('search citations are extracted from the trailing source list without its heading', () => {
  const text = [
    'დღეს თბილისში ღრუბლიანი ამინდია.',
    '',
    'Sources:',
    '- [Met Office forecast](https://weather.metoffice.gov.uk/forecast/gcpvj0v07)',
    '- [Tbilisi weather](https://amindi.net/weather/tbilisi)',
  ].join('\n');
  const result = extractWebSearchSources(text);
  assert.equal(result.content, 'დღეს თბილისში ღრუბლიანი ამინდია.');
  assert.deepEqual(result.sources.map((source) => [source.title, source.hostname]), [
    ['Met Office forecast', 'weather.metoffice.gov.uk'],
    ['Tbilisi weather', 'amindi.net'],
  ]);
  assert.equal(extractWebSearchSources(result.content).sources.length, 0);
});

test('ordinary text with a mention of sources remains unchanged', () => {
  const text = 'The sources are reliable for this topic.';
  assert.deepEqual(extractWebSearchSources(text), { content: text, sources: [] });
});

test('source chip is placed after the answer text and before a weather card', () => {
  assert.equal(webSourceInsertionIndex([
    { kind: 'md' },
    { kind: 'toby', blockType: 'weather' },
  ]), 0);
  assert.equal(webSourceInsertionIndex([
    { kind: 'toby', blockType: 'weather' },
  ]), -1);
});
