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
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args);
};
const load = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
require.extensions['.ts'] = load;
require.extensions['.tsx'] = load;
require.extensions['.css'] = () => {};

const base = { projectId: 'p', projectTitle: '', projectDescription: '', goal: '', mode: 'auto', materials: [], knowledgeItems: [] };

test('scene capabilities are optional, relevant to the current topic, and available in all modes', () => {
  const { buildChatSystemPrompt } = require('../lib/chat/context.ts');
  for (const mode of ['auto', 'fast', 'teacher']) {
    const prompt = buildChatSystemPrompt({ ...base, mode, prompt: 'რა არის ფოტოსინთეზი?' });
    assert.match(prompt, /photosynthesis/);
    assert.match(prompt, /Optional native blocks/);
    assert.match(prompt, /locale/);
  }
  for (const prompt of ['Hello', '2+2', 'Translate this: photosynthesis', 'გადათარგმნე ფოტოსინთეზი']) {
    assert.doesNotMatch(buildChatSystemPrompt({ ...base, prompt }), /Optional native blocks/);
  }
  assert.doesNotMatch(buildChatSystemPrompt({ ...base, projectTitle: 'Photosynthesis', prompt: 'Who was John Maynard Keynes?' }), /Optional scene/);
});

test('native scene parsing accepts known presets and validates generic scene content', () => {
  const { parseTobyFence } = require('../lib/blocks/registry.ts');
  assert.equal(parseTobyFence('toby', '{"type":"scene","id":"photosynthesis","locale":"ka"}').data.id, 'photosynthesis');
  assert.equal(parseTobyFence('toby-scene', '{"id":"plant-cell","locale":"en"}').data.locale, 'en');
  for (const body of ['{"id":"unknown"}', '{"id":"process","steps":[]}', '{"id":"line-graph","slope":1e100}', '{"id":"process","steps":[{"label":"A"}]}']) {
    assert.equal(parseTobyFence('toby-scene', body), null);
  }
  const process = parseTobyFence('toby-scene', '{"id":"process","steps":[{"label":"A"},{"label":"B"}]}');
  assert.equal(process.data.steps.length, 2);
});

test('built-in scenes render readable Georgian and English labels with local controls', () => {
  const { SceneView } = require('../components/blocks/scenes/scene-view.tsx');
  for (const locale of ['ka', 'en']) {
    for (const id of ['photosynthesis', 'plant-cell', 'supply-demand', 'normal-distribution', 't-distribution']) {
      const html = renderToStaticMarkup(React.createElement(SceneView, { block: { id, locale } }));
      assert.match(html, /<svg/);
      assert.doesNotMatch(html, /NaN|undefined|<script/);
      assert.match(html, /<figcaption/);
      if (id.includes('distribution') || id === 'supply-demand') assert.match(html, /type="range"/);
      else assert.match(html, /<button/);
    }
  }
});

test('distribution and market calculations match reference values and remain finite at slider extremes', () => {
  const { normalPdf, studentTPdf, centralArea, marketEquilibrium } = require('../lib/blocks/scenes/math.ts');
  assert.ok(Math.abs(normalPdf(0) - 0.3989422804) < 1e-9);
  assert.ok(Math.abs(studentTPdf(0, 1) - 1 / Math.PI) < 1e-10);
  assert.ok(Math.abs(centralArea(1.96) - 0.9500042) < 1e-6);
  assert.ok(Math.abs(centralArea(1, 1) - 0.5) < 1e-7);
  for (const df of [1, 2, 30, 60]) {
    assert.ok(Number.isFinite(studentTPdf(3.5, df)));
    assert.ok(centralArea(3.5, df) > 0 && centralArea(3.5, df) < 1);
  }
  const eq = marketEquilibrium(0, 0);
  assert.ok(Math.abs((85 - 0.8 * eq.quantity) - eq.price) < 1e-10);
  assert.ok(Math.abs((15 + 0.8 * eq.quantity) - eq.price) < 1e-10);
});

test('distribution scenes represent the requested value and probability region', () => {
  const { parseTobyFence } = require('../lib/blocks/registry.ts');
  const { SceneView } = require('../components/blocks/scenes/scene-view.tsx');
  for (const [region, label] of [['point', 'Z = 2'], ['left', '97.72%'], ['right', '2.28%'], ['central', '95.45%']]) {
    const parsed = parseTobyFence('toby-scene', JSON.stringify({ id: 'normal-distribution', locale: 'en', cutoff: 2, region }));
    assert.equal(parsed.data.cutoff, 2);
    const html = renderToStaticMarkup(React.createElement(SceneView, { block: parsed.data }));
    assert.ok(html.includes(label), label);
    assert.ok(!html.includes('95.00%'));
  }
  assert.equal(parseTobyFence('toby-scene', '{"id":"normal-distribution","cutoff":200}'), null);
  assert.equal(parseTobyFence('toby-scene', '{"id":"t-distribution","df":0}'), null);
});

test('durable communication preferences are extracted and can override default presentation', () => {
  const { shouldExtractMemory } = require('../lib/memory/normalize.ts');
  const { formatKnownUserBlock, MEMORY_EXTRACT_SYSTEM } = require('../lib/memory/prompt.ts');
  for (const prompt of ['I prefer concise responses without emojis.', 'მირჩევნია მოკლე აბზაცებით მიპასუხო', 'From now on use a formal tone']) assert.equal(shouldExtractMemory(prompt), true, prompt);
  const memory = formatKnownUserBlock({ memories: [], personalization: 'Prefers detailed paragraphs without highlights.' });
  assert.match(memory, /override default presentation/i);
  assert.match(MEMORY_EXTRACT_SYSTEM, /communication preferences/i);
  assert.match(memory, /current request takes priority/);
});
