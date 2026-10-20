/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args);
};
const load = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
require.extensions['.ts'] = load;
require.extensions['.tsx'] = load;
require.extensions['.css'] = () => {};

const images = [
  { galleryId: 'nature', url: 'https://example.org/lake', thumb: 'https://example.org/lake.jpg', title: 'Lake' },
  { galleryId: 'city', url: 'https://example.org/city', thumb: 'https://example.org/city.jpg', title: 'City' },
  { galleryId: 'nature', url: 'https://example.org/forest', thumb: 'https://example.org/forest.jpg', title: 'Forest' },
];
const block = { items: [{ title: 'A quiet forest', text: 'Walk among **trees**.', galleryId: 'nature', imageIndex: 1 }] };
const fence = (value) => '```toby image-list\n' + JSON.stringify(value) + '\n```';

test('image-list validates bounded references and supports streaming completed rows', () => {
  const { parseTobyFence } = require('../lib/blocks/registry.ts');
  assert.equal(parseTobyFence('toby-image-list', JSON.stringify(block)).type, 'image-list');
  for (const item of [{ ...block.items[0], imageIndex: -1 }, { ...block.items[0], imageIndex: 64 }, { ...block.items[0], galleryId: '../bad' }]) {
    assert.equal(parseTobyFence('toby-image-list', JSON.stringify({ items: [item] })), null);
  }
  const partial = '{"items":[{"title":"Ready","text":"First row","imageIndex":0},{"title":"Next"';
  assert.equal(parseTobyFence('toby-image-list', partial).data.items.length, 1);
});

test('references select a zero-based image within the actual gallery only', () => {
  const { resolveImageListItems } = require('../lib/images/image-list.ts');
  assert.equal(resolveImageListItems(block, images)[0].image, images[2]);
  assert.equal(resolveImageListItems({ items: [{ ...block.items[0], galleryId: 'invented' }] }, images)[0].image, undefined);
  assert.equal(resolveImageListItems({ items: [{ title: 'Attached', imageIndex: 1 }] }, images)[0].image, images[1]);
});

test('placed list images are not repeated in the fallback and unused results stay available', () => {
  const { layoutImageGalleries } = require('../lib/images/galleries.ts');
  const result = layoutImageGalleries('Before\n\n' + fence(block) + '\n\nAfter', images);
  assert.deepEqual(result.remaining, [images[0], images[1]]);
  assert.equal(result.segments[1].kind, 'fence');
  const withGallery = layoutImageGalleries(fence(block) + '\n```image-gallery\n{"galleryId":"nature"}\n```', images);
  assert.deepEqual(withGallery.segments[1].images, [images[0]]);
  assert.deepEqual(withGallery.remaining, [images[1]]);
});

test('illustrated lists render in prose order with rich descriptions and actual thumbnails', () => {
  const { RichContent } = require('../components/rich-content.tsx');
  const html = renderToStaticMarkup(React.createElement(RichContent, { text: 'Before\n\n' + fence(block) + '\n\nAfter', images }));
  assert.ok(html.indexOf('Before') < html.indexOf('A quiet forest'));
  assert.ok(html.lastIndexOf('After') > html.indexOf('A quiet forest'));
  assert.match(html, /src="https:\/\/example.org\/forest.jpg"/);
  assert.match(html, /<strong><span>trees<\/span><\/strong>/);
  assert.equal((html.match(/src="https:\/\/example.org\/forest.jpg"/g) || []).length, 1);
});

test('unresolved or unsafe images degrade to readable text without invented URLs or nested blocks', () => {
  const { ImageListView } = require('../components/blocks/image-list.tsx');
  const { publicImageUrl } = require('../lib/images/image-list.ts');
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,bad', 'https://name:password@example.org/a']) assert.equal(publicImageUrl(url), undefined);
  const html = renderToStaticMarkup(React.createElement(ImageListView, { block: { items: [{ title: 'Still readable', text: 'A description.', galleryId: 'missing', imageIndex: 0, url: 'https://invented.example/a' }] }, images }));
  assert.match(html, /Still readable/);
  assert.doesNotMatch(html, /<img|invented.example/);
});

test('new optional capabilities are selected only for relevant turns', () => {
  const { matchChatBlocks } = require('../lib/blocks/match.ts');
  const base = { projectId: 'p', projectTitle: '', projectDescription: '', goal: '', mode: 'auto', materials: [], knowledgeItems: [] };
  assert.ok(matchChatBlocks({ ...base, prompt: 'Recommend music with photos' }).some(x => x.id === 'image-list'));
  assert.ok(matchChatBlocks({ ...base, prompt: 'Help me choose my preferences' }).some(x => x.id === 'form'));
  for (const prompt of ['2+2', 'Hello', 'Translate this: photos and options']) {
    assert.ok(!matchChatBlocks({ ...base, prompt }).some(x => ['form', 'image-list'].includes(x.id)), prompt);
  }
});

