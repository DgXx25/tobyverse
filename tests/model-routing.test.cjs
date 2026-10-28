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
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

test('simple factual questions stay on Flash in English and Georgian', () => {
  const { scorePrompt, selectModel } = require('../lib/ai/model-routing.ts');
  for (const prompt of ['What is photosynthesis?', 'Define recursion.', 'Translate hello into Georgian.', 'Who wrote Hamlet?', 'რა არის ფოტოსინთეზი?', 'თარგმნე hello ქართულად.', '2 + 2', '']) {
    const result = scorePrompt(prompt);
    assert.equal(result.tier, 'SIMPLE', prompt);
    assert.equal(selectModel(prompt, 'auto').model, 'gemini-3.5-flash', prompt);
  }
});

test('multi-step solutions, code and deep analysis route to Pro', () => {
  const { scorePrompt, selectModel } = require('../lib/ai/model-routing.ts');
  for (const prompt of [
    'Solve 2x + 3 = 7 and verify the result step by step.',
    'Compare transaction isolation algorithms, analyze race conditions, prove correctness, and explain why the fix works.',
    'Implement this TypeScript parser and debug the recursive descent logic:\n```ts\nfunction parse(input) { return parseExpression(input); }\n```',
    'ჯერ ამოხსენი ეს განტოლება, შემდეგ გადაამოწმე პასუხი და ახსენი რატომ არის სწორი.',
  ]) {
    const result = scorePrompt(prompt);
    assert.equal(result.tier, 'COMPLEX', prompt);
    assert.equal(selectModel(prompt, 'auto').model, 'gemini-3.1-pro-preview', prompt);
  }
});

test('Auto never chooses Argon and explicit model selections bypass scoring', () => {
  const { selectModel } = require('../lib/ai/model-routing.ts');
  const veryComplex = 'analyze prove code compare solve '.repeat(1000);
  assert.equal(selectModel(veryComplex, 'auto').model, 'gemini-3.1-pro-preview');
  assert.equal(selectModel(veryComplex, 'gemini-3.5-flash').model, 'gemini-3.5-flash');
  assert.equal(selectModel('What is 2+2?', 'gemini-4-argon').model, 'gemini-4-argon');
  assert.equal(selectModel('What is 2+2?', 'auto').method, 'heuristic');
  assert.throws(() => selectModel('hello', 'unknown'), /Unknown model/);
});

test('plan gating keeps Argon Premium-only while Tobyverse includes Flash, Pro and Auto', () => {
  const { availableAiModels, isAllowedAiModel } = require('../lib/ai/catalog.ts');
  for (const plan of ['free_beta', 'lite']) {
    assert.equal(isAllowedAiModel('gemini-3.5-flash', plan), true);
    assert.equal(isAllowedAiModel('gemini-3.1-pro-preview', plan), true);
    assert.equal(isAllowedAiModel('gemini-4-argon', plan), false);
    assert.ok(availableAiModels(plan).some((model) => model.id === 'auto'));
    assert.ok(!availableAiModels(plan).some((model) => model.id === 'gemini-4-argon'));
  }
  for (const plan of ['pro', 'max', 'team', 'admin']) {
    assert.equal(isAllowedAiModel('gemini-4-argon', plan), true);
    assert.ok(availableAiModels(plan).some((model) => model.id === 'gemini-4-argon'));
  }
});

test('thresholds and keyword lists can be configured without slowing large prompts', () => {
  const { scorePrompt, createComplexityScorer } = require('../lib/ai/model-routing.ts');
  const custom = createComplexityScorer({ complexThreshold: 1, technicalTerms: ['fluxcapacitor'] });
  assert.equal(custom('fluxcapacitor').tier, 'COMPLEX');
  assert.deepEqual(scorePrompt('What is entropy?'), scorePrompt('What is entropy?'));
  const started = performance.now();
  const result = scorePrompt('ordinary text '.repeat(100_000) + ' prove the theorem');
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 50, `1.4MB prompt scored in ${elapsed.toFixed(1)}ms`);
  assert.ok(result.signals.includes('input-sampled'));
  assert.ok(Number.isFinite(result.score));
});
