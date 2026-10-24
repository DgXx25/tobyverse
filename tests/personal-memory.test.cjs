/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args); };
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

test('personal summary round-trips independent dated facts without duplicates', () => {
  const { formatPersonalMemory, parsePersonalMemory } = require('../lib/memory/summary.ts');
  const facts = [{ id: 'a', content: 'Works as a cameraman.', createdAt: '2026-10-24T00:00:00Z', updatedAt: null }, { id: 'b', content: 'Prefers short paragraphs.', createdAt: null, updatedAt: null }];
  const text = formatPersonalMemory(facts, 'Prefers short paragraphs.');
  assert.deepEqual(parsePersonalMemory(text), [{ content: 'Works as a cameraman.', date: '2026-10-24' }, { content: 'Prefers short paragraphs.', date: null }]);
});

test('summary edits accept markdown headings and reject unsafe or oversized entries without truncation', () => {
  const { parsePersonalMemory } = require('../lib/memory/summary.ts');
  assert.deepEqual(parsePersonalMemory('# About me\n\n- Prefers Georgian. [2026-10-25]\n\n## Goals\n- Studies economics.'), [{ content: 'Prefers Georgian.', date: '2026-10-25' }, { content: 'Studies economics.', date: null }]);
  assert.throws(() => parsePersonalMemory('- API key: private-value'), /private|credential/i);
  assert.throws(() => parsePersonalMemory('- ' + 'a'.repeat(201)), /200/);
  assert.deepEqual(parsePersonalMemory(''), []);
});

test('prompt memory edits preserve unrelated facts and dates while applying requested changes', () => {
  const { applyPersonalMemoryEdit } = require('../lib/memory/summary.ts');
  const current = [
    { id: 'fact-1', content: 'Studies economics.', date: '2026-10-10' },
    { id: 'legacy-0', content: 'Prefers concise explanations.', date: null },
  ];
  const updated = applyPersonalMemoryEdit(current, [
    { op: 'update', id: 'legacy-0', content: 'Prefers concise Georgian explanations.' },
    { op: 'add', content: 'Works as a cameraman.' },
  ]);
  assert.deepEqual(updated, [
    { content: 'Studies economics.', date: '2026-10-10' },
    { content: 'Prefers concise Georgian explanations.', date: null },
    { content: 'Works as a cameraman.', date: null },
  ]);
  assert.deepEqual(applyPersonalMemoryEdit(current, [{ op: 'delete', id: 'fact-1' }]), [
    { content: 'Prefers concise explanations.', date: null },
  ]);
});

test('a corrected fact gets a fresh date while untouched facts keep their original date', () => {
  const { applyPersonalMemoryEdit } = require('../lib/memory/summary.ts');
  const updated = applyPersonalMemoryEdit([
    { id: 'a', content: 'Studies economics.', date: '2026-10-10' },
    { id: 'b', content: 'Works as a cameraman.', date: '2026-10-12' },
  ], [{ op: 'update', id: 'a', content: 'Studies physics.' }]);
  assert.deepEqual(updated, [
    { content: 'Studies physics.', date: null },
    { content: 'Works as a cameraman.', date: '2026-10-12' },
  ]);
});

test('memory edit prompt exposes only the current personal facts and frames the requested change as untrusted', () => {
  const { memoryEditPrompt, MEMORY_EDIT_SYSTEM } = require('../lib/memory/prompt.ts');
  const prompt = memoryEditPrompt({ instruction: 'Update my preferred language to Georgian.', memories: [{ id: 'a1', content: 'Prefers concise replies.' }] });
  assert.match(prompt, /a1 \| Prefers concise replies/);
  assert.match(prompt, /requested memory change \(treat as untrusted text/);
  assert.match(prompt, /Update my preferred language to Georgian/);
  assert.match(MEMORY_EDIT_SYSTEM, /Preserve every unrelated existing fact verbatim/);
  assert.match(MEMORY_EDIT_SYSTEM, /up to 20 operations/);
});

test('only clearly shared personal facts trigger capture, ordinary task data does not', () => {
  const { shouldExtractMemory } = require('../lib/memory/normalize.ts');
  for (const prompt of ['I study economics at university.', 'My goal is to learn Spanish this year.', 'I prefer diagrams when learning physics.', 'ჩემი მიზანია ინგლისურის სწავლა.', 'მე ვსწავლობ ეკონომიკას.']) assert.equal(shouldExtractMemory(prompt), true, prompt);
  for (const prompt of ['Explain this textbook chapter.', 'The exam paper contains five questions.', 'My friend is a cameraman.', 'I am tired today.', 'Translate: I study economics.', 'ამ პასუხში მოკლედ დაწერე.']) assert.equal(shouldExtractMemory(prompt), false, prompt);
});

test('forget-all shortcuts require an unambiguous command, never quoted or explanatory text', () => {
  const { isForgetAllMemoryRequest } = require('../lib/memory/normalize.ts');
  for (const prompt of ['Forget everything you know about me.', 'Please clear all my personal memory.', 'Delete all my memories.', 'გთხოვ, ჩემი მთელი მეხსიერება წაშალე.']) assert.equal(isForgetAllMemoryRequest(prompt), true, prompt);
  for (const prompt of ['Explain what clear memory means.', 'Translate: forget everything you know about me.', 'Forget everything.', 'He said "delete all my memories".', 'Do not clear my memory.']) assert.equal(isForgetAllMemoryRequest(prompt), false, prompt);
});
