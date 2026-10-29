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

const { trimChatHistory, CHAT_HISTORY_MAX_CHARS, CHAT_HISTORY_MAX_MESSAGES } = require('../lib/chat/history-budget.ts');

test('chat history keeps a recent suffix within the configured input budget', () => {
  const history = Array.from({ length: 24 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `turn-${index} ${'x'.repeat(1800)}`,
  }));
  const trimmed = trimChatHistory(history);

  assert.ok(trimmed.length <= CHAT_HISTORY_MAX_MESSAGES);
  assert.ok(trimmed.reduce((sum, turn) => sum + turn.content.length, 0) <= CHAT_HISTORY_MAX_CHARS);
  assert.equal(trimmed.at(-1).content.slice(0, 7), 'turn-23');
  assert.equal(trimmed.at(-2).content.slice(0, 7), 'turn-22');
  assert.match(trimmed[0].content, /^turn-17/);
  assert.match(trimmed[0].content, /earlier context omitted/i);
});

test('an oversized latest assistant response keeps its beginning and conclusion', () => {
  const content = `Opening context ${'a'.repeat(9000)} final conclusion`;
  const trimmed = trimChatHistory([{ role: 'assistant', content }]);

  assert.ok(trimmed[0].content.length <= CHAT_HISTORY_MAX_CHARS);
  assert.match(trimmed[0].content, /^Opening context/);
  assert.match(trimmed[0].content, /final conclusion$/);
  assert.match(trimmed[0].content, /earlier context omitted/i);
});

test('the current prompt is not resent if present as the final history entry', () => {
  const history = [
    { role: 'user', content: 'previous question' },
    { role: 'user', content: 'current prompt' },
  ];
  assert.deepEqual(trimChatHistory(history, 'current prompt'), [history[0]]);
});
