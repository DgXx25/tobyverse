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
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
function isolated(relativePath, mocks) {
  const filename = path.join(root, relativePath);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
  return loaded.exports;
}

test('current URLs are bounded, unique and never use credentials or old history', () => {
  const { currentChatUrls } = isolated('lib/chat/linked-pages.ts', { '@/lib/materials/url': {} });
  assert.deepEqual(currentChatUrls('Read https://example.org/a. and https://example.org/a', ['https://example.org/b', 'https://example.org/c']), ['https://example.org/a', 'https://example.org/b']);
  assert.deepEqual(currentChatUrls('https://name:secret@example.org/a javascript:alert(1)', ['file:///private', 123]), []);
});

test('linked pages use read-only extraction without material ingestion or Storage writes', async () => {
  const calls = [];
  const { readChatLinkedPages } = isolated('lib/chat/linked-pages.ts', {
    '@/lib/materials/url': { extractUrlText: async (url) => { calls.push(url); return { title: 'Linked page', text: 'x'.repeat(20000) }; } },
  });
  const pages = await readChatLinkedPages('Read https://example.org/a', []);
  assert.deepEqual(calls, ['https://example.org/a']);
  assert.equal(pages[0].text.length, 10000);
  assert.equal(pages[0].url, calls[0]);
  assert.equal(pages[0].materialId, undefined);
});

test('unavailable links remain honest reference data and never block a text response', async () => {
  const { readChatLinkedPages } = isolated('lib/chat/linked-pages.ts', {
    '@/lib/materials/url': { extractUrlText: async () => { throw new Error('Unavailable'); } },
  });
  const pages = await readChatLinkedPages('https://example.org/a', []);
  assert.match(pages[0].text, /contents are unavailable/);
});

test('current linked pages coexist with retrieved Sources without changing the core', () => {
  const { buildChatSystemPrompt } = require('../lib/chat/context.ts');
  const { CORE_SYSTEM_INSTRUCTION } = require('../lib/ai/core-instruction.ts');
  const prompt = buildChatSystemPrompt({ projectId: 'p', projectTitle: '', projectDescription: '', goal: '', mode: 'auto', materials: [], knowledgeItems: [],
    sources: [{ n: 1, materialId: 'saved', title: 'Saved document', page: 1, pageEnd: 1, section: '', text: 'Saved passage.' }],
    linkedPages: [{ url: 'https://example.org/a', title: 'Current page', text: 'Transient page text.' }],
  });
  assert.ok(prompt.startsWith(CORE_SYSTEM_INSTRUCTION));
  assert.match(prompt, /Saved passage/);
  assert.match(prompt, /Transient page text/);
  assert.match(prompt, /https:\/\/example.org\/a/);
});

test('chat entry points do not auto-ingest pasted links while Add source retains ingestion', () => {
  const chat = fs.readFileSync(path.join(root, 'components/project-chat.tsx'), 'utf8');
  const start = fs.readFileSync(path.join(root, 'components/start-screen.tsx'), 'utf8');
  assert.doesNotMatch(chat, /ingestMaterialUrl|urlsInText/);
  assert.doesNotMatch(start, /urlsInText/);
  const sourcePanel = fs.readFileSync(path.join(root, 'components/workspace/sources-pane.tsx'), 'utf8');
  assert.match(sourcePanel, /ingestMaterialUrl/);
});
