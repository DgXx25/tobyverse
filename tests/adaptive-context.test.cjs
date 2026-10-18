/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const load = () => require('../lib/adaptation/model.ts');
const now = Date.parse('2026-10-19T12:00:00Z');
const sample = [
  { id: 'u1', content: 'Show the mechanism through a concrete example first.' },
  { id: 'u2', content: 'When I double the input, the output doubles too.' },
];
const patch = (evidence = ['u1']) => ({ patterns: [{ key: 'concrete-first', scope: 'project', when: 'Explaining mechanisms', observation: 'Works through concrete cases', approach: 'Start with a concrete case before the general rule', evidence }], topics: [], links: [] });

test('ordinary conversation supplies observations without preference keywords', () => {
  const { observationSample } = load();
  const sample = observationSample([
    { role: 'user', content: 'Why does reducing the interest rate increase investment?' },
    { role: 'assistant', content: 'Because borrowing becomes cheaper.' },
    { role: 'user', content: 'Would the same logic apply to a company using its own money?' },
  ], 'How would that change if demand was falling at the same time?');
  assert.equal(sample.filter(t => t.role === 'user').length, 3);
  assert.equal(observationSample([], 'ok').length, 0);
});

test('one-off evidence stays tentative, repeated distinct evidence becomes usable', () => {
  const { mergeObservations, formatAdaptiveContext } = load();
  const first = mergeObservations([], { nodes: [], links: [] }, patch(), sample, 'p', now);
  assert.equal(first.patterns[0].support.length, 1);
  assert.equal(formatAdaptiveContext(first.patterns, first.graph, 'Explain the mechanism', 'p', now), null);
  const second = mergeObservations(first.patterns, first.graph, patch(['u2']), sample, 'p', now);
  assert.equal(second.patterns[0].support.length, 2);
  assert.match(formatAdaptiveContext(second.patterns, second.graph, 'Explain the mechanism', 'p', now), /concrete case/);
});

test('duplicate or invented evidence cannot inflate support', () => {
  const { mergeObservations } = load();
  const first = mergeObservations([], { nodes: [], links: [] }, patch(['u1', 'fake']), sample, 'p', now);
  const repeated = mergeObservations(first.patterns, first.graph, patch(['u1']), sample, 'p', now);
  assert.equal(repeated.patterns[0].support.length, 1);
});

test('contradicting evidence can revise a pattern without inheriting old confidence', () => {
  const { mergeObservations } = load();
  const first = mergeObservations([], { nodes: [], links: [] }, patch(['u1', 'u2']), sample, 'p', now);
  const change = patch(['u3']);
  change.patterns[0].revise = true;
  change.patterns[0].approach = 'Use the general rule first in this situation';
  const revised = mergeObservations(first.patterns, first.graph, change, [{ id: 'u3', content: 'The general rule lets me derive the example directly.' }], 'p', now + 1);
  assert.deepEqual(revised.patterns[0].support, ['u3']);
});

test('a plain content question is not evidence of weakness', () => {
  const { mergeObservations } = load();
  const result = mergeObservations([], { nodes: [], links: [] }, { patterns: [], topics: [
    { key: 'inflation', label: 'Inflation', summary: 'Asked about causes', status: 'revisit', evidence: ['q'] },
  ], links: [] }, [{ id: 'q', role: 'user', content: 'Why do prices rise when demand grows?' }], 'p', now);
  assert.equal(result.graph.nodes[0].status, 'explored');
});

test('observation is always active while cooldown and daily budget bound spending', () => {
  const { canObserve, emptyAdaptiveState, asAdaptiveState } = load();
  const state = emptyAdaptiveState();
  assert.equal(canObserve(state, 'batch', now), true);
  assert.equal(canObserve(asAdaptiveState({ ...state, enabled: false }), 'batch', now), true);
  assert.equal(canObserve({ ...state, lastBatch: 'batch' }, 'batch', now), false);
  assert.equal(canObserve({ ...state, lastRunAt: now - 1000 }, 'batch', now), false);
  assert.equal(canObserve({ ...state, day: '2026-10-19', dailyRuns: 12 }, 'batch', now), false);
  assert.equal(canObserve({ ...state, day: '2026-10-18', dailyRuns: 12 }, 'batch', now), true);
});

test('shared instructions and observed behavior form one memory context', () => {
  const { formatKnownUserBlock } = require('../lib/memory/prompt.ts');
  const prompt = formatKnownUserBlock({ memories: [{ id: 'm', content: 'Reply in Georgian.' }], personalization: 'Prefers plain paragraphs.', adaptiveContext: 'OBSERVED_WORKING_PATTERN' });
  assert.match(prompt, /Reply in Georgian/);
  assert.match(prompt, /plain paragraphs/);
  assert.match(prompt, /OBSERVED_WORKING_PATTERN/);
  assert.match(prompt, /shared preferences take priority over inferred observations/i);
  assert.equal(prompt.match(/Known about this user:/g).length, 1);
});

test('the observer sees existing response instructions as part of the same user model', () => {
  const { observationPrompt } = require('../lib/adaptation/prompt.ts');
  const payload = JSON.parse(observationPrompt([], [], { nodes: [], links: [] }, { memories: [{ id: 'm', content: 'Reply in Georgian.' }], personalization: 'Prefers paragraphs.' }));
  assert.deepEqual(payload.sharedContext.memories, [{ id: 'm', content: 'Reply in Georgian.' }]);
  assert.equal(payload.sharedContext.personalization, 'Prefers paragraphs.');
});

test('a malformed connection does not discard valid user observations', () => {
  const { observationSchema } = load();
  const value = { ...patch(['u1', 'u2']), links: [{ source: 'input', target: 'output' }] };
  const parsed = observationSchema.safeParse(value);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.patterns.length, 1);
  assert.deepEqual(parsed.data.links, []);
});

test('project patterns cannot leak to another project and stale patterns expire', () => {
  const { mergeObservations, formatAdaptiveContext } = load();
  const { patterns, graph } = mergeObservations([], { nodes: [], links: [] }, patch(['u1', 'u2']), sample, 'p', now);
  assert.equal(formatAdaptiveContext(patterns, graph, 'Explain mechanisms', 'other', now), null);
  assert.equal(formatAdaptiveContext(patterns, graph, 'Explain mechanisms', 'p', now + 91 * 86400000), null);
});

test('unrelated tasks do not receive a project-specific explanation pattern', () => {
  const { mergeObservations, formatAdaptiveContext } = load();
  const { patterns, graph } = mergeObservations([], { nodes: [], links: [] }, patch(['u1', 'u2']), sample, 'p', now);
  assert.equal(formatAdaptiveContext(patterns, graph, 'Translate this invitation into French', 'p', now), null);
  assert.equal(formatAdaptiveContext(patterns, graph, '2+2', 'p', now), null);
});

test('task applicability carries an observation across different wording', () => {
  const { mergeObservations, formatAdaptiveContext } = load();
  const p = patch(['u1', 'u2']);
  p.patterns[0].tasks = ['explain'];
  const { patterns, graph } = mergeObservations([], { nodes: [], links: [] }, p, sample, 'p', now);
  assert.match(formatAdaptiveContext(patterns, graph, 'რატომ იზრდება ფასი?', 'p', now), /concrete case/);
});

test('a new question does not erase an earlier applied example', () => {
  const { mergeObservations } = load();
  const graph = { nodes: [{ key: 'cost', label: 'Cost', summary: 'Applied an opportunity-cost comparison', status: 'applied', support: ['old'], updatedAt: now }], links: [] };
  const result = mergeObservations([], graph, { patterns: [], topics: [{ key: 'cost', label: 'Cost', summary: 'Asked what cost means', status: 'explored', evidence: ['new'] }], links: [] }, [{ id: 'new', content: 'What does opportunity cost mean here?' }], 'p', now + 1);
  assert.equal(result.graph.nodes[0].status, 'applied');
  assert.equal(result.graph.nodes[0].summary, graph.nodes[0].summary);
});

test('asking about a topic does not become demonstrated knowledge', () => {
  const { mergeObservations } = load();
  const result = mergeObservations([], { nodes: [], links: [] }, { patterns: [], topics: [
    { key: 'investment', label: 'Investment', summary: 'Cost of capital', status: 'applied', evidence: ['u1'], nextQuestion: 'How does cost of capital matter?' },
  ], links: [] }, [{ id: 'u1', content: 'Why does a lower interest rate affect investment?', role: 'user' }], 'p', now);
  assert.equal(result.graph.nodes[0].status, 'explored');
});

test('topic connections have real endpoints and supported reasoning remains visible', () => {
  const { mergeObservations } = load();
  const result = mergeObservations([], { nodes: [], links: [] }, { patterns: [], topics: [
    { key: 'input', label: 'Input', summary: 'A changing input', status: 'explored', evidence: ['u1'] },
    { key: 'proportionality', label: 'Proportionality', summary: 'Explained a proportional relationship', status: 'applied', evidence: ['u2'] },
  ], links: [{ from: 'input', to: 'proportionality', label: 'Scales with' }, { from: 'fake', to: 'input', label: 'bad' }] }, sample, 'p', now);
  assert.equal(result.graph.links.length, 1);
  assert.equal(result.graph.nodes[1].status, 'applied');
});

test('a worked application followed by a confirmation question remains evidence', () => {
  const { mergeObservations } = load();
  const result = mergeObservations([], { nodes: [], links: [] }, { patterns: [], topics: [
    { key: 'cost', label: 'Opportunity cost', summary: 'Applied an opportunity-cost comparison', status: 'applied', evidence: ['reasoning'] },
  ], links: [] }, [{ id: 'reasoning', content: 'A deposit gives me 15% but the factory only returns 12%, so I choose the deposit. Is that right?' }], 'p', now);
  assert.equal(result.graph.nodes[0].status, 'applied');
});

test('sampling waits for four substantive prompts and then six new ones', () => {
  const { advanceObservationSchedule } = load();
  let state;
  let due = [];
  for (let i = 1; i <= 10; i++) {
    const result = advanceObservationSchedule(state, `turn-${i}`, 'Why would the result change in this concrete situation?');
    state = result.state;
    if (result.due) due.push(i);
    assert.equal(advanceObservationSchedule(state, `turn-${i}`, 'same turn').due, false);
  }
  assert.deepEqual(due, [4, 10]);
});

test('empty observations preserve the original core and ordinary response', () => {
  const { buildChatSystemPrompt } = require('../lib/chat/context.ts');
  const { CORE_SYSTEM_INSTRUCTION } = require('../lib/ai/core-instruction.ts');
  const base = { projectId: 'p', projectTitle: '', projectDescription: '', goal: '', mode: 'auto', materials: [], knowledgeItems: [], prompt: '2+2' };
  assert.equal(buildChatSystemPrompt(base), CORE_SYSTEM_INSTRUCTION);
  assert.equal(buildChatSystemPrompt({ ...base, adaptiveContext: '' }), CORE_SYSTEM_INSTRUCTION);
});

test('ordinary observation and work prompts do not request a memory notification', () => {
  const { isExplicitMemoryRequest } = require('../lib/memory/normalize.ts');
  assert.equal(isExplicitMemoryRequest('ლექციაზე ამ განსხვავების ახსნა მინდა ყოველდღიური მაგალითით.'), false);
  assert.equal(isExplicitMemoryRequest('Now the example makes sense because the assumptions changed.'), false);
  assert.equal(isExplicitMemoryRequest('დაიმახსოვრე რომ პასუხები ქართულად მინდა.'), true);
  assert.equal(isExplicitMemoryRequest('Please remember that I prefer plain paragraphs.'), true);
});
