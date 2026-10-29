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

test('visual-explanation blocks parse only bounded, real-gallery image references', () => {
  const { parseTobyFence } = require('../lib/blocks/registry.ts');
  const valid = { title: 'Fog scatters light', note: 'A short explanation.', galleryId: 'fog-search', imageIndex: 0 };
  assert.deepEqual(parseTobyFence('toby-visual-explanation', JSON.stringify(valid)), {
    type: 'visual-explanation',
    data: { ...valid, type: 'visual-explanation' },
  });
  assert.equal(parseTobyFence('toby-visual-explanation', JSON.stringify({ ...valid, imageIndex: -1 })), null);
  assert.equal(parseTobyFence('toby-visual-explanation', JSON.stringify({ ...valid, galleryId: '../invented' })), null);
});

test('visual-explanation becomes available for why/how concept prompts without forcing a photo', () => {
  const { matchChatBlocks } = require('../lib/blocks/match.ts');
  const base = { projectId: 'p', projectTitle: '', projectDescription: '', goal: '', mode: 'auto', materials: [], knowledgeItems: [] };
  const explanationBlocks = matchChatBlocks({ ...base, prompt: 'Why does fog make distant lights look blurry?' });
  assert.ok(explanationBlocks.some((item) => item.id === 'visual-explanation'));
  assert.ok(explanationBlocks.some((item) => item.id === 'sections'));
  assert.ok(matchChatBlocks({ ...base, prompt: 'Explain mirages' }).some((item) => item.id === 'visual-explanation'));
  assert.ok(matchChatBlocks({ ...base, prompt: 'რატომ ჩანს ცა ლურჯი?' }).some((item) => item.id === 'visual-explanation'));
  assert.ok(!matchChatBlocks({ ...base, prompt: 'What time is it in Tbilisi?' }).some((item) => item.id === 'visual-explanation'));
});

test('dynamic block guidance favors scannable headings and useful visuals without requiring either', () => {
  const { matchChatBlocks } = require('../lib/blocks/match.ts');
  const { formatTobyBlockCards } = require('../lib/blocks/registry.ts');
  const base = { projectId: 'p', projectTitle: '', projectDescription: '', goal: '', mode: 'auto', materials: [], knowledgeItems: [] };
  const cards = formatTobyBlockCards(matchChatBlocks({ ...base, prompt: 'Why does fog make distant lights look blurry?' }));
  assert.match(cards, /usually prefer the sections block/i);
  assert.match(cards, /usually include this card/i);
  assert.match(cards, /place the best matching returned photo in that block/i);
  assert.match(cards, /do not repeat the card note/i);
  assert.match(cards, /photo|photograph/i);
  assert.match(cards, /optional|when it helps/i);
});

test('visual-explanation renders its real thumbnail and safely omits missing gallery images', () => {
  const { VisualExplanationView } = require('../components/blocks/visual-explanation.tsx');
  const block = { title: 'Fog scatters light', note: 'The droplets scatter light in many directions.', galleryId: 'fog-search', imageIndex: 0 };
  const images = [{ galleryId: 'fog-search', url: 'https://example.org/fog', pageUrl: 'https://example.org/source', thumb: 'https://example.org/fog.jpg', title: 'Fog on a road', alt: 'Headlights in fog', source: 'Example', license: 'CC', credit: '' }];
  const html = renderToStaticMarkup(React.createElement(VisualExplanationView, { block, images }));
  assert.match(html, /Fog scatters light/);
  assert.match(html, /The droplets scatter light in many directions\./);
  assert.match(html, /src="https:\/\/example.org\/fog.jpg"/);
  assert.match(html, /alt="Headlights in fog"/);
  assert.match(html, /<button[^>]*class="toby-visual-explanation-link"/);
  assert.doesNotMatch(html, /<a href=/);
  const noImage = renderToStaticMarkup(React.createElement(VisualExplanationView, { block, images: [] }));
  assert.match(noImage, /Fog scatters light/);
  assert.doesNotMatch(noImage, /<img|example\.org/);
});

test('images placed in a visual-explanation are not repeated in the trailing gallery', () => {
  const { layoutImageGalleries } = require('../lib/images/galleries.ts');
  const image = { galleryId: 'fog-search', url: 'https://example.org/fog', thumb: 'https://example.org/fog.jpg', title: 'Fog', source: 'Example', license: 'CC', credit: '' };
  const extra = { ...image, url: 'https://example.org/fog-2', thumb: 'https://example.org/fog-2.jpg', title: 'Another fog result' };
  const block = { title: 'Fog scatters light', galleryId: 'fog-search', imageIndex: 0 };
  const text = 'A short explanation.\n\n```toby visual-explanation\n' + JSON.stringify(block) + '\n```';
  const result = layoutImageGalleries(text, [image, extra]);
  assert.deepEqual(result.remaining, []);
  assert.equal(result.segments.filter((segment) => segment.kind === 'fence').length, 1);
});
