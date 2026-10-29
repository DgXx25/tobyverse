const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { recentConversation, searchConversation, summaryBatch, conversationSummaryPrompt, CONVERSATION_SUMMARY_INSTRUCTION, usableConversationSummary } = require('../lib/chat/conversation-context.ts');
const message = (id, role, content) => ({ id, role, content });

test('short conversations stay identical and recent math/code fences are never cut', () => {
  const short = [message('1', 'user', 'Solve 4x=16'), message('2', 'assistant', '$$x=4$$')];
  assert.deepEqual(recentConversation(short), short);
  const large = `\`\`\`toby\n${'payload '.repeat(2000)}\n\`\`\``;
  const kept = recentConversation([...Array.from({length: 30}, (_, i) => message(`old-${i}`, 'user', 'old text')), message('large', 'assistant', large)]);
  assert.equal(kept.at(-1).content, large);
  assert.equal(kept.length, 2);
});

test('history search recovers exact older values and neighboring context in multiple languages', () => {
  const archive = [
    message('1', 'user', 'პროექტის კოდი არის TBV-472 და ვადა 17 ნოემბერია.'),
    message('2', 'assistant', 'კოდის და ვადის მიხედვით დავგეგმავ.'),
    message('3', 'user', 'El presupuesto de Aurora es 2300 euros.'),
    message('4', 'assistant', 'Entendido.'),
    message('5', 'user', '普通の挨拶です。'),
  ];
  assert.ok(searchConversation(archive, 'პროექტის კოდი').some(row => row.content.includes('TBV-472')));
  assert.ok(searchConversation(archive, 'presupuesto Aurora').some(row => row.content.includes('2300 euros')));
  assert.deepEqual(searchConversation(archive, 'quantum superconductor'), []);
  assert.equal(archive[0].content, 'პროექტის კოდი არის TBV-472 და ვადა 17 ნოემბერია.');
});

test('a match near the end of a long original message survives bounded excerpts', () => {
  const archive = [message('1', 'user', `${'unrelated '.repeat(1200)} exact ID ZETA-918 balance 731.25 end`)];
  const result = searchConversation(archive, 'ZETA-918');
  assert.match(result[0].content, /ZETA-918 balance 731\.25/);
  assert.ok(result[0].content.length <= 2000);
});

test('summaries update in batches, never on every short exchange, with bounded model input', () => {
  assert.deepEqual(summaryBatch([message('1', 'user', 'hello')]), []);
  const batch = summaryBatch(Array.from({length: 30}, (_, i) => message(String(i), i % 2 ? 'assistant' : 'user', 'x'.repeat(2000))));
  assert.ok(batch.length > 0 && batch.length < 30);
  assert.ok(batch.reduce((sum, row) => sum + row.content.length, 0) <= 24000);
  const prompt = conversationSummaryPrompt('Earlier decision: use blue.', batch);
  assert.match(prompt, /Earlier decision: use blue/);
  assert.match(CONVERSATION_SUMMARY_INSTRUCTION, /background data/i);
  assert.match(CONVERSATION_SUMMARY_INSTRUCTION, /original/i);
});

test('edited history and backwards retries cannot reuse a newer summary', () => {
  const state = { revision: 2, text: 'Known decision', throughAt: '2026-10-29T10:00:00Z' };
  assert.equal(usableConversationSummary(state, 2, '2026-10-29T11:00:00Z'), 'Known decision');
  assert.equal(usableConversationSummary(state, 3, '2026-10-29T11:00:00Z'), '');
  assert.equal(usableConversationSummary(state, 2, '2026-10-29T09:00:00Z'), '');
});

test('one oversized archived answer cannot permanently block all later summaries', () => {
  const original = message('large', 'assistant', `Opening ${'x'.repeat(40000)} conclusion ORION-731`);
  const batch = summaryBatch([original]);
  assert.equal(batch.length, 1);
  assert.match(batch[0].content, /conclusion ORION-731$/);
  assert.match(batch[0].content, /original message/i);
  assert.ok(batch[0].content.length <= 24000);
  assert.ok(original.content.length > 40000);
});

test('a short question before a near-budget answer cannot stall summary advancement', () => {
  const batch = summaryBatch([message('q', 'user', 'q'.repeat(1000)), message('a', 'assistant', 'a'.repeat(23500)), message('next', 'user', 'next')]);
  assert.ok(batch.length > 0);
  assert.equal(batch[0].id, 'q');
});

test('continuation context retains a complete saved prefix above the old 6000-character cap', () => {
  const { prepareRecentConversation } = require('../lib/chat/conversation-context.ts');
  const prefix = '```python\n' + 'x = 1\n'.repeat(1500) + '\n```';
  const history = prepareRecentConversation([message('q', 'user', 'Write code'), message('a', 'assistant', prefix)], 'Continue');
  assert.equal(history.at(-1).content, prefix);
});

test('an idempotent retry preserves original message ordering and reports content edits', () => {
  const { preserveMessageOrder } = require('../lib/chat/message-order.ts');
  const original = { content: 'first question', createdAt: '2026-10-29T10:00:00Z', createdAtClient: '2026-10-29T10:00:00Z' };
  const retry = preserveMessageOrder({ ...original, createdAt: '2026-10-29T11:00:00Z', createdAtClient: '2026-10-29T11:00:00Z' }, original);
  assert.equal(retry.createdAt, original.createdAt);
  assert.equal(retry.createdAtClient, original.createdAtClient);
});

test('a partial transcript is labeled as a tail and cannot be mistaken for the conversation beginning', () => {
  const { buildChatSystemPrompt } = require('../lib/chat/context.ts');
  const prompt = buildChatSystemPrompt({ projectId: 'p', projectTitle: '', projectDescription: '', goal: '', mode: 'auto', materials: [], knowledgeItems: [], historySearchAvailable: true });
  assert.match(prompt, /only the recent tail/i);
  assert.match(prompt, /beginning|earliest/i);
  assert.match(prompt, /assistant recollections are not/i);
});
