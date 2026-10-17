const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, filename);

test('a stalled browser dependency fails with its actual step instead of hanging', async () => {
  const { waitForChatStep } = require('../lib/ai/chat-deadline.ts');
  await assert.rejects(waitForChatStep('Saving message', () => new Promise(() => {}), {timeoutMs: 15}),
    {name: 'ChatTimeoutError', message: /Saving message/});
});

test('Stop releases even a Firestore operation that ignores AbortSignal', async () => {
  const { waitForChatStep } = require('../lib/ai/chat-deadline.ts');
  const controller = new AbortController();
  const pending = waitForChatStep('Saving message', () => new Promise(() => {}), {signal: controller.signal});
  controller.abort();
  await assert.rejects(pending, {name: 'AbortError'});
});

test('cancelled work never starts on the following microtask', async () => {
  const { waitForChatStep } = require('../lib/ai/chat-deadline.ts');
  const controller = new AbortController();
  let started = false;
  const pending = waitForChatStep('Saving message', async () => {started = true;}, {signal: controller.signal});
  controller.abort();
  await assert.rejects(pending, {name: 'AbortError'});
  assert.equal(started, false);
});

test('a completed dependency preserves its result', async () => {
  const { waitForChatStep } = require('../lib/ai/chat-deadline.ts');
  assert.equal(await waitForChatStep('Memory', async () => 'saved preference'), 'saved preference');
});

test('SSE done finishes even if the proxy leaves the connection open', async () => {
  const { readChatSse } = require('../lib/ai/sse.ts');
  let cancelled = false;
  const stream = new ReadableStream({start(c) {
    c.enqueue(new TextEncoder().encode('data: {"delta":"answer"}\n\ndata: {"done":true}\n\n'));
  }, cancel() {cancelled = true;}});
  const result = await Promise.race([
    readChatSse(new Response(stream)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('SSE ignored done')), 100)),
  ]);
  assert.equal(result.text, 'answer');
  assert.equal(cancelled, true);
});

test('a silent stream times out and cancels the reader', async () => {
  const { readChatSse } = require('../lib/ai/sse.ts');
  let cancelled = false;
  const stream = new ReadableStream({cancel() {cancelled = true;}});
  await assert.rejects(readChatSse(new Response(stream), undefined, {idleTimeoutMs: 15}), {name:'ChatTimeoutError'});
  assert.equal(cancelled, true);
});

test('an HTTP error with a stalled body also has a deadline', async () => {
  const { readChatSse } = require('../lib/ai/sse.ts');
  const response = new Response(new ReadableStream(), {status:503});
  await assert.rejects(readChatSse(response, undefined, {idleTimeoutMs:15}), {name:'ChatTimeoutError'});
});

test('all ordinary send preflight waits occur after cancellation is installed', () => {
  const source = fs.readFileSync(path.join(root,'components/project-chat.tsx'),'utf8');
  const send = source.slice(source.indexOf('async function sendPrompt('),source.indexOf('async function retryImageSearch('));
  assert.ok(send.indexOf('new AbortController()') < send.indexOf('await '));
  assert.doesNotMatch(source,/missingAttached \|\| source.length === 0/);
  assert.match(send,/userMessageId: savedUserMessageId/);
  assert.match(send,/void pending.catch\(\(\) => restoreClaimed\(\)\)/);
});
