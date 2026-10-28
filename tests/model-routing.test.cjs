const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  const parent = args[0];
  if (name.startsWith('@/')) return resolve.call(this, path.join(root, name.slice(2)), ...args);
  if (parent?.filename && name.startsWith('.') && name.endsWith('.js')) {
    const tsSibling = path.resolve(path.dirname(parent.filename), `${name.slice(0, -3)}.ts`);
    if (fs.existsSync(tsSibling)) return tsSibling;
  }
  return resolve.call(this, name, ...args);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

test('simple factual questions use Haiku in English and Georgian', () => {
  const { scorePrompt, selectModel } = require('../lib/ai/model-routing.ts');
  for (const prompt of ['What is photosynthesis?', 'Define recursion.', 'Translate hello into Georgian.', 'Who wrote Hamlet?', 'რა არის ფოტოსინთეზი?', 'თარგმნე hello ქართულად.', '2 + 2', '']) {
    const result = scorePrompt(prompt);
    assert.equal(result.tier, 'SIMPLE', prompt);
    assert.equal(selectModel(prompt, 'auto').model, 'claude-haiku-5-5', prompt);
  }
});

test('complex prompts use Sonnet on Premium and stay on Haiku for free plans', () => {
  const { scorePrompt, selectModel } = require('../lib/ai/model-routing.ts');
  for (const prompt of [
    'Solve 2x + 3 = 7 and verify the result step by step.',
    'Compare transaction isolation algorithms, analyze race conditions, prove correctness, and explain why the fix works.',
    'Implement this TypeScript parser and debug the recursive descent logic:\n```ts\nfunction parse(input) { return parseExpression(input); }\n```',
    'ჯერ ამოხსენი ეს განტოლება, შემდეგ გადაამოწმე პასუხი და ახსენი რატომ არის სწორი.',
  ]) {
    const result = scorePrompt(prompt);
    assert.equal(result.tier, 'COMPLEX', prompt);
    assert.equal(selectModel(prompt, 'auto', 'pro').model, 'claude-sonnet-5-5', prompt);
    assert.equal(selectModel(prompt, 'auto', 'free_beta').model, 'claude-haiku-5-5', prompt);
  }
});

test('Auto selects only enabled Claude models; Gemini is disabled and explicit Claude choices bypass scoring', () => {
  const { selectModel } = require('../lib/ai/model-routing.ts');
  const veryComplex = 'analyze prove code compare solve '.repeat(1000);
  assert.equal(selectModel(veryComplex, 'auto', 'pro').model, 'claude-sonnet-5-5');
  assert.equal(selectModel(veryComplex, 'auto', 'free_beta').model, 'claude-haiku-5-5');
  assert.equal(selectModel('What is 2+2?', 'claude-haiku-5-5').model, 'claude-haiku-5-5');
  assert.equal(selectModel('What is 2+2?', 'claude-sonnet-5-5').model, 'claude-sonnet-5-5');
  assert.equal(selectModel('What is 2+2?', 'auto').method, 'heuristic');
  assert.throws(() => selectModel('Question', 'gemini-3.5-flash'), /Unknown model/);
  assert.throws(() => selectModel('hello', 'unknown'), /Unknown model/);
});

test('plan gating exposes Haiku on all plans and Sonnet only on Premium; Gemini is unavailable', () => {
  const { availableAiModels, isAllowedAiModel } = require('../lib/ai/catalog.ts');
  for (const plan of ['free_beta', 'lite']) {
    assert.equal(isAllowedAiModel('claude-haiku-5-5', plan), true);
    assert.equal(isAllowedAiModel('claude-sonnet-5-5', plan), false);
    assert.equal(isAllowedAiModel('gemini-3.5-flash', plan), false);
    assert.ok(availableAiModels(plan).some((model) => model.id === 'auto'));
    assert.ok(!availableAiModels(plan).some((model) => model.id.startsWith('gemini-')));
  }
  for (const plan of ['pro', 'max', 'team', 'admin']) {
    assert.equal(isAllowedAiModel('claude-sonnet-5-5', plan), true);
    assert.ok(availableAiModels(plan).some((model) => model.id === 'claude-sonnet-5-5'));
    assert.ok(!availableAiModels(plan).some((model) => model.id.startsWith('gemini-')));
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
