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
const normalize = require('../lib/memory/normalize.ts');
const memory = require('../lib/memory/prompt.ts');
const adaptation = require('../lib/adaptation/model.ts');

test('durable preferences about note behavior stay distinct from note command bodies', () => {
  const { isWorkNoteRequest } = require('../lib/memory/privacy.ts');
  const preferences = ['I prefer short notes.', 'When you create notes, always keep them short.', 'When you write notes, always keep them short.', 'მირჩევნია მოკლე ჩანაწერები.', 'როცა ჩანაწერებს წერ, ყოველთვის მოკლედ დაწერე.'];
  for (const prompt of preferences) {
    assert.equal(isWorkNoteRequest(prompt), false, prompt);
    assert.equal(normalize.shouldExtractMemory(prompt), true, prompt);
    assert.equal(adaptation.observationSample([], prompt).length, 1, prompt);
  }
  for (const prompt of ['Save a note: I always prefer short answers.', 'Please create a note: When you write notes, always keep them short.', 'Can you save a note: I prefer short notes.', 'ჩაინიშნე: მირჩევნია მოკლე პასუხები.', 'გთხოვ შექმენი ჩანაწერი: როცა წერ, ყოველთვის მოკლედ დაწერე.']) {
    assert.equal(isWorkNoteRequest(prompt), true, prompt);
    assert.equal(normalize.shouldExtractMemory(prompt), false, prompt);
    assert.equal(adaptation.observationSample([], prompt).length, 0, prompt);
  }
  assert.equal(normalize.shouldExtractMemory('Confidential: I prefer short notes.'), false);
});

test('no-memory instructions exclude direct extraction in both languages', () => {
  for (const text of ["Do not remember this. I prefer short paragraphs.", "Don't save this to memory: my name is Avery.", 'Confidential: remember my role.', 'არ დაიმახსოვრო ეს. ყოველთვის მოკლედ მიპასუხე.', 'ეს კონფიდენციალურია, არ შეინახო.']) {
    assert.equal(normalize.shouldExtractMemory(text), false, text);
    assert.equal(normalize.isExplicitMemoryRequest(text), false, text);
  }
  assert.equal(normalize.shouldExtractMemory('Remember that my name is Avery.'), true);
  assert.equal(normalize.shouldExtractMemory('Save a work note: remember to order paper.'), false);
  assert.equal(normalize.shouldExtractMemory('ჩაინიშნე: ყოველთვის შეუკვეთე ქაღალდი.'), false);
  assert.equal(normalize.shouldExtractMemory('Jot down: remember to order paper.'), false);
  assert.equal(normalize.shouldExtractMemory('Remember that I prefer visual examples.'), true);
  assert.equal(normalize.shouldExtractMemory('Rewrite this bio: My name is Avery and I work as an editor.'), false);
  assert.equal(normalize.shouldExtractMemory('Translate this: My name is Avery.'), false);
});

const privateFacts = [
  'Email: avery@example.test', 'Phone: +1 (202) 555-0198', 'Personal ID: 01012345678',
  'IBAN: GE00ZZ0000000000000000', 'My salary is 4200 GEL.', 'Address: 17 Cedar Road',
  'Password: synthetic-secret', 'კონფიდენციალური: შიდა გეგმა', 'Phone: 555-0198',
  'Salary: 4200', 'პირადი ნომერია 01012345678', 'ტელეფონი: 555-0198',
  'შემოსავალი: 4200 ლარი',
];
test('private facts cannot enter fact, preference or project persistence', () => {
  const { asProjectMemory } = require('../lib/memory/project.ts');
  for (const text of privateFacts) {
    assert.equal(normalize.sanitizeMemoryContent(text), '', text);
    assert.equal(normalize.sanitizePersonalization(text), '', text);
    assert.deepEqual(asProjectMemory([text]), [], text);
    assert.deepEqual(normalize.parseMemoryOps({ operations: [{ op: 'add', content: text }] }, new Set()), [], text);
  }
  assert.equal(normalize.sanitizeMemoryContent('My name is Avery.'), 'My name is Avery.');
  assert.equal(normalize.sanitizePersonalization('Prefers concise work updates.'), 'Prefers concise work updates.');
});

test('private scheduling and task notes do not advance observation while useful learning survives', () => {
  const start = { lastTurn: 'old', pending: 3, started: false };
  for (const prompt of ['Do not remember this conversation.', 'Save a work note with these three points.']) {
    const next = adaptation.advanceObservationSchedule(start, 'private', prompt);
    assert.equal(next.due, false);
    assert.deepEqual(next.state, start);
  }
  assert.equal(normalize.sanitizeMemoryContent('Exam on 2026-10-26.'), 'Exam on 2026-10-26.');
  assert.equal(normalize.sanitizePersonalization('Prefers worked examples when learning algebra.'), 'Prefers worked examples when learning algebra.');
  assert.equal(normalize.sanitizePersonalization('Use visual examples.'), 'Use visual examples.');
  assert.equal(adaptation.observationSample([{ role: 'user', content: 'Save a work note with these three points.' }, { role: 'assistant', content: 'The three work points are summarized.' }], '').length, 0);
});

test('extraction and reply prompts exclude historical risky memories and private dialogue', () => {
  const source = { memories: [{ id: 'private', content: privateFacts[0] }, { id: 'safe', content: 'Reply in Georgian.' }], personalization: privateFacts[4], projectMemory: [privateFacts[2]], prompt: 'Remember I prefer short updates.', history: [
    { role: 'user', content: 'Confidential: internal launch is Project Juniper.' },
    { role: 'assistant', content: 'Project Juniper is the internal launch.' },
    { role: 'user', content: privateFacts[1] },
    { role: 'assistant', content: 'I will call that phone number.' },
  ] };
  const extraction = memory.memoryExtractPrompt(source);
  const reply = memory.formatKnownUserBlock(source);
  for (const value of [extraction, reply]) {
    assert.doesNotMatch(value, /example\.test|4200|01012345678|Juniper|555-0198|phone number/);
    assert.match(value, /Reply in Georgian/);
  }
});

test('excluded turns and their responses cannot supply observation evidence', () => {
  const turns = [
    { role: 'user', content: 'Do not remember this: use a secret supplier called Juniper.' },
    { role: 'assistant', content: 'The secret supplier Juniper is suitable.' },
    { role: 'user', content: 'Compare these two approaches using the same assumptions.' },
  ];
  const sample = adaptation.observationSample(turns, '');
  assert.equal(sample.length, 1);
  assert.doesNotMatch(JSON.stringify(sample), /Juniper/);
  const patch = { patterns: [{ key: 'secret', scope: 'general', when: 'Work', observation: 'Uses Juniper', approach: 'Choose Juniper', evidence: ['private'] }], topics: [], links: [] };
  const merged = adaptation.mergeObservations([], { nodes: [], links: [] }, patch, [{ id: 'private', role: 'user', content: turns[0].content }], 'p');
  assert.deepEqual(merged.patterns, []);
});

test('legacy adaptive records and generated sensitive output are filtered before runtime use', () => {
  const pattern = { key: 'contact', when: 'Work updates', observation: privateFacts[0], approach: 'Use concise paragraphs', support: ['u1', 'u2'], updatedAt: Date.now() };
  assert.deepEqual(adaptation.asAdaptiveState({ patterns: [pattern] }).patterns, []);
  assert.deepEqual(adaptation.asKnowledgeGraph({ nodes: [{ key: 'secret', label: 'Contact', summary: privateFacts[1] }] }).nodes, []);
  assert.equal(adaptation.formatAdaptiveContext([pattern], { nodes: [], links: [] }, 'Work updates', 'p'), null);
  const patch = { patterns: [{ ...pattern, scope: 'general', evidence: ['u1'] }], topics: [], links: [] };
  assert.deepEqual(adaptation.mergeObservations([], { nodes: [], links: [] }, patch, [{ id: 'u1', content: 'I compare both plans using the same assumptions.' }], 'p').patterns, []);
});
