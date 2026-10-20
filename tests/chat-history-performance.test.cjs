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
const { mergeChatMessages, indexChatHistory, chatVirtualizerOptions } = require('../lib/workspace/chat-history.ts');
const { createChatBlockStateStore } = require('../lib/workspace/chat-block-state.ts');
const { Virtualizer } = require('@tanstack/react-virtual');
const message = (index, patch = {}) => ({ id: `m${index}`, role: index % 2 ? 'assistant' : 'user', content: 'A compact answer.', createdAt: new Date(1700000000000 + index).toISOString(), ...patch });

test('a recent realtime page retains loaded history, updates matching rows and reuses unchanged objects', () => {
  const loaded = Array.from({ length: 1000 }, (_, index) => message(index));
  const changed = { ...loaded[999], content: 'Updated response' };
  const merged = mergeChatMessages(loaded, [...loaded.slice(-39, -1), changed, message(1000)]);
  assert.equal(merged.length, 1001);
  assert.equal(merged[0], loaded[0]);
  assert.equal(merged[999], changed);
  assert.equal(merged[1000].id, 'm1000');
  assert.equal(mergeChatMessages(merged, merged.slice(-40)), merged);
  const prepended = mergeChatMessages(loaded.slice(40), loaded.slice(0, 45));
  assert.deepEqual(prepended.map(item => item.id), loaded.map(item => item.id));
});

test('history indexes respect paper order and do not leak future papers into earlier rows', () => {
  const paper = (brief) => '```toby paper\n' + JSON.stringify({ form: 'ganckhadeba', brief }) + '\n```';
  const rows = [message(0), message(1, { content: paper('First form') }), message(2), message(3), message(4), message(5, { content: paper('Second form') }), message(6)];
  const index = indexChatHistory(rows);
  assert.equal(index.priorPapers.get('m1').length, 0);
  assert.equal(index.priorPapers.get('m3').length, 1);
  assert.equal(index.priorPapers.get('m5').length, 1);
  assert.equal(index.priorPapers.get('m6').length, 1);
  assert.equal(index.priorPapers.get('m6')[0].brief, 'Second form');
  assert.equal(index.papers.length, 2);
  assert.equal(index.lastUserIndex, 6);
  assert.equal(index.lastAssistantId, 'm5');
  assert.equal(indexChatHistory(rows).papers[0], index.papers[0]);
});

test('a long paper-writing chat retains at most one prior paper reference per row', () => {
  const rows = Array.from({ length: 5000 }, (_, index) => message(index, { role: 'assistant', content: '```toby paper\n' + JSON.stringify({ form: 'ganckhadeba', brief: `Form ${index}` }) + '\n```' }));
  const history = indexChatHistory(rows);
  assert.equal(history.papers.length, 5000);
  assert.equal([...history.priorPapers.values()].reduce((sum, prior) => sum + prior.length, 0), 4999);
  assert.equal(history.priorPapers.get('m4999')[0].brief, 'Form 4998');
});

test('ten thousand mixed-height messages produce a bounded render range at any scroll offset', () => {
  const rows = Array.from({ length: 10000 }, (_, index) => message(index, { content: 'Content '.repeat(index % 2 ? 300 : 5) }));
  const options = chatVirtualizerOptions(rows, 140);
  const create = (offset) => new Virtualizer({
    ...options, getScrollElement: () => null, initialRect: { width: 704, height: 850 }, initialOffset: offset,
    observeElementRect: () => () => {}, observeElementOffset: () => () => {}, scrollToFn: () => {},
  });
  const total = create(0).getTotalSize();
  for (const offset of [0, total / 2, total - 850]) {
    const instance = create(offset);
    const active = instance.getVirtualItems();
    assert.ok(active.length > 0 && active.length < 20, `only ${active.length} rows for offset ${offset}`);
    assert.ok(active.every(row => rows[row.index].id === row.key));
    const covering = active.find(row => row.start <= offset + 100 && row.end >= offset + 100);
    assert.ok(covering, 'rendered range covers the viewport');
  }
});

test('offscreen block values survive unmounts, scopes stay isolated, and subscriptions are cleaned up', () => {
  const store = createChatBlockStateStore();
  let firstChanges = 0;
  let secondChanges = 0;
  const unsubscribe = store.subscribe('message-a/scene/cutoff', () => firstChanges++);
  store.subscribe('message-b/scene/cutoff', () => secondChanges++);
  store.write('message-a/scene/cutoff', 2.5);
  unsubscribe();
  store.write('message-a/scene/cutoff', 1.5);
  assert.equal(firstChanges, 1);
  assert.equal(secondChanges, 0);
  assert.equal(store.read('message-a/scene/cutoff', 1.96), 1.5);
  assert.equal(store.read('message-b/scene/cutoff', 1.96), 1.96);
  let remounted = 0;
  store.subscribe('message-a/scene/cutoff', () => remounted++);
  store.write('message-a/scene/cutoff', 1.5);
  assert.equal(remounted, 0);
  store.write('message-a/scene/cutoff', 0);
  assert.equal(remounted, 1);
});

test('assistant growth and appended turns never follow the bottom, while prepended history retains its keyed anchor', () => {
  const rows = Array.from({ length: 30 }, (_, index) => message(index));
  const base = { getScrollElement: () => null, initialRect: { width: 700, height: 400 },
    observeElementRect: () => () => {}, observeElementOffset: () => () => {}, scrollToFn: () => {} };
  const instance = new Virtualizer({ ...base, ...chatVirtualizerOptions(rows, 140) });
  const total = instance.getTotalSize();
  instance.scrollElement = { scrollHeight: total, clientHeight: 400 };
  instance.scrollOffset = total - 400;
  const bottomOffset = instance.scrollOffset;
  const last = instance.getMeasurements().at(-1);
  instance.resizeItem(rows.length - 1, last.size + 700);
  assert.equal(instance.scrollOffset, bottomOffset, 'a growing answer must not move an exact-bottom viewport');
  instance.setOptions({ ...base, ...chatVirtualizerOptions([...rows, message(30)], 140) });
  assert.equal(instance.scrollOffset, bottomOffset, 'appending a message must not follow the bottom');

  instance.scrollOffset = 900;
  const anchor = instance.getVirtualItemForOffset(900);
  const distance = 900 - anchor.start;
  const older = message(-1);
  instance.setOptions({ ...base, ...chatVirtualizerOptions([older, ...rows, message(30)], 140) });
  const movedAnchor = instance.getMeasurements().find((row) => row.key === anchor.key);
  assert.equal(instance.scrollOffset, movedAnchor.start + distance, 'older history must preserve the currently visible content');
});
