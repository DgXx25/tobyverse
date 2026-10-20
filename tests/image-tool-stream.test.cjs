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

const { runToolLoop } = require('../lib/ai/tool-loop.ts');
const { upsertToolStatus } = require('../lib/ai/tool-execution.ts');
const { GeminiProvider } = require('../lib/ai/gemini.ts');
const { readChatSse } = require('../lib/ai/sse.ts');
const { createChunkBuffer } = require('../lib/ai/chunk-stream.ts');
const image = { url: 'https://example.com/leaf.jpg', thumbnail: 'https://example.com/leaf.jpg', alt: 'Leaf', source: 'web' };

test('ordinary Gemini answers yield a signed live chunk before the provider finishes', async () => {
  const provider = new GeminiProvider();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let finished = false;
  const usage = [];
  provider.getModel = () => ({
    generateContent: async () => { throw new Error('Ordinary chat must use the streaming endpoint'); },
    generateContentStream: async (_request, options) => {
      assert.equal(options.signal, controller.signal);
      return {
        stream: (async function* () {
          yield { candidates: [{ content: { parts: [{ text: 'First ', thoughtSignature: 'signed-text' }] } }] };
          await gate;
          finished = true;
          yield { candidates: [{ content: { parts: [{ text: 'second.' }] } }] };
        })(),
        response: Promise.resolve({ usageMetadata: { totalTokenCount: 9 } }),
      };
    },
  });
  const controller = new AbortController();
  const iterator = provider.generateToolStream('Explain', { tools: true, signal: controller.signal, usage: (item) => usage.push(item) });
  try {
    assert.deepEqual((await iterator.next()).value, { text: 'First ' });
    assert.equal(finished, false);
  } finally { release(); }
  const rest = [];
  for await (const part of iterator) rest.push(part);
  assert.equal(rest.map((part) => part.text ?? '').join(''), 'second.');
  assert.equal(usage.length, 1);
});

function isolatedModule(relativePath, mocks) {
  const filename = path.join(root, relativePath);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
  return loaded.exports;
}

test('image search completes before the loop hands off to streaming, discarding pre-search text', async () => {
  let rounds = 0;
  const result = await runToolLoop({
    callModel: async () => {
      rounds++;
      return { parts: [{ text: 'I will look for images.' }, { functionCall: { name: 'search_images', args: { query: 'photosynthesis' } } }] };
    },
    execute: async () => ({ images: [image] }),
    stopAfterTool: (call) => call.name === 'search_images',
  });
  assert.equal(rounds, 1);
  assert.equal(result.text, '');
  assert.equal(result.tool.name, 'search_images');
  assert.deepEqual(result.functionResponses, [{ name: 'search_images', response: { images: [image] } }]);
});

test('the default loop reaches a fourth round and ignores pre-tool narration', async () => {
  const statuses = [];
  const executed = [];
  const result = await runToolLoop({
    callModel: async ({ round, functionResponses }) => {
      if (round > 1) assert.equal(functionResponses[0].response.images.length, 1);
      return round === 4
        ? { parts: [{ text: 'Final comparison.' }] }
        : { parts: [{ text: 'Searching next.' }, { functionCall: { name: 'search_images', args: { query: `leaf ${round}` } } }] };
    },
    execute: async (call) => { executed.push(call.args.query); return { images: [image] }; },
    onToolStatus: (event) => statuses.push([event.call.args.query, event.phase]),
  });
  assert.equal(result.rounds, 4);
  assert.equal(result.text, 'Final comparison.');
  assert.deepEqual(executed, ['leaf 1', 'leaf 2', 'leaf 3']);
  assert.deepEqual(statuses, [
    ['leaf 1', 'start'], ['leaf 1', 'complete'],
    ['leaf 2', 'start'], ['leaf 2', 'complete'],
    ['leaf 3', 'start'], ['leaf 3', 'complete'],
  ]);
});

test('a failed tool returns a nonfatal response for a text-only fallback', async () => {
  const statuses = [];
  const result = await runToolLoop({
    callModel: async () => ({ parts: [{ functionCall: { name: 'search_images', args: { query: 'leaf' } } }] }),
    execute: async () => { throw new Error('unavailable'); },
    onToolStatus: (event) => statuses.push(event.phase),
  });
  assert.equal(result.tool, null, 'a failed tool must not be dispatched again');
  assert.equal(result.failed, true);
  assert.equal(result.functionResponses[0].response.ok, false);
  assert.deepEqual(statuses, ['start', 'error']);
});

test('a failed parallel call still supplies a response for every call in the signed turn', async () => {
  const result = await runToolLoop({
    callModel: async () => ({ parts: [
      { functionCall: { name: 'search_images', args: { query: 'leaf' } } },
      { functionCall: { name: 'search_images', args: { query: 'stem' } } },
    ] }),
    execute: async (call) => { if (call.args.query === 'leaf') throw new Error('offline'); return { images: [image] }; },
  });
  assert.equal(result.failed, true);
  assert.equal(result.functionResponses.length, 2);
});

test('a hanging tool times out after ten seconds and aborts its work', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const statuses = [];
  const pending = runToolLoop({
    callModel: async () => ({ parts: [{ functionCall: { name: 'search_images', args: { query: 'leaf' } } }] }),
    execute: async (_call, options) => { signal = options?.signal; return new Promise(() => {}); },
    onToolStatus: (event) => statuses.push(event.phase),
  });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  t.mock.timers.tick(9999);
  assert.deepEqual(statuses, ['start']);
  t.mock.timers.tick(1);
  const result = await pending;
  assert.equal(signal.aborted, true);
  assert.equal(result.failed, true);
  assert.match(result.functionResponses[0].response.error, /timed out/i);
  assert.deepEqual(statuses, ['start', 'error']);
});

test('Gemini yields the executed image tool first, then live answer chunks with signed replay and no forced tool', async () => {
  const provider = new GeminiProvider();
  const events = [];
  const usage = [];
  const chunks = ['ფოტოსინთეზი', '\n', '\n', '| ნაწილი | როლი |\n', '| --- | --- |\n', '| ქლოროფილი | შთანთქავს სინათლეს |'];
  provider.getModel = () => ({
    generateContent: async () => {
      events.push('select');
      return { response: { candidates: [{ content: { parts: [{ functionCall: { name: 'search_images', args: { query: 'photosynthesis' } }, thoughtSignature: 'sig-image' }] } }], usageMetadata: { totalTokenCount: 10 } } };
    },
    generateContentStream: async (request) => {
      events.push('stream-start');
      assert.equal(request.toolConfig.functionCallingConfig.mode, 'NONE');
      assert.equal(request.contents[1].parts[0].thoughtSignature, 'sig-image');
      assert.ok(request.contents[2].parts.every((part) => part.functionResponse), 'tool-result content must not mix function responses and text');
      assert.deepEqual(request.contents[2].parts[0].functionResponse.response, { images: [image] });
      return {
        stream: (async function* () {
          for (const text of chunks) {
            events.push('chunk');
            yield { candidates: [{ content: { parts: [{ text }] } }] };
          }
        })(),
        response: Promise.resolve({ usageMetadata: { totalTokenCount: 20 } }),
      };
    },
  });
  const iterator = provider.generateToolStream('რა არის ფოტოსინთეზი?', {
    tools: true, toolChoice: 'search_images', usage: (report) => usage.push(report),
    executeTool: async (call) => {
      assert.equal(call.name, 'search_images');
      events.push('searched');
      return { images: [image] };
    },
  })[Symbol.asyncIterator]();
  assert.equal((await iterator.next()).value.tool.name, 'search_images');
  assert.deepEqual(events, ['select', 'searched']);
  assert.deepEqual((await iterator.next()).value, { text: chunks[0] });
  assert.equal(events.filter((event) => event === 'chunk').length, 1, 'first chunk arrives before the rest are generated');
  let answer = chunks[0];
  for await (const part of iterator) answer += part.text ?? '';
  assert.equal(answer, chunks.join(''));
  assert.equal(usage.length, 2);
});

test('Gemini can search twice before answering and replays each completed result', async () => {
  const provider = new GeminiProvider();
  let rounds = 0;
  const queries = [];
  provider.getModel = () => ({
    generateContentStream: async (request) => {
      rounds++;
      if (rounds > 1) assert.deepEqual(request.contents.at(-1).parts[0].functionResponse.response, { images: [image] });
      const parts = rounds < 3
        ? [{ functionCall: { name: 'search_images', args: { query: rounds === 1 ? 'mitosis' : 'meiosis' } }, thoughtSignature: `sig-${rounds}` }]
        : [{ text: 'Here is the comparison.' }];
      const response = { candidates: [{ content: { parts } }] };
      return { stream: (async function* () { yield response; })(), response: Promise.resolve(response) };
    },
  });
  const parts = [];
  for await (const part of provider.generateToolStream('Compare these cells', {
    tools: true,
    executeTool: async (call) => { queries.push(call.args.query); return { images: [image] }; },
  })) parts.push(part);
  assert.deepEqual(queries, ['mitosis', 'meiosis']);
  assert.equal(rounds, 3);
  assert.equal(parts.map((part) => part.text ?? '').join(''), 'Here is the comparison.');
});

test('Gemini switches to a text-only continuation on tool failure without dispatching it again', async () => {
  const provider = new GeminiProvider();
  provider.getModel = () => ({
    generateContent: async () => ({ response: { candidates: [{ content: { parts: [{ functionCall: { name: 'search_images', args: { query: 'leaf' } }, thoughtSignature: 'sig-fail' }] } }] } }),
    generateContentStream: async (request) => {
      if (!request.toolConfig) {
        const response = { candidates: [{ content: { parts: [{ functionCall: { name: 'search_images', args: { query: 'leaf' } }, thoughtSignature: 'sig-fail' }] } }] };
        return { stream: (async function* () { yield response; })(), response: Promise.resolve(response) };
      }
      assert.equal(request.toolConfig.functionCallingConfig.mode, 'NONE');
      assert.equal(request.contents.at(-1).parts[0].functionResponse.response.ok, false);
      return { stream: (async function* () { yield { candidates: [{ content: { parts: [{ text: 'I can describe the leaf.' }] } }] }; })(), response: Promise.resolve({}) };
    },
  });
  const parts = [];
  for await (const part of provider.generateToolStream('Describe this leaf', { tools: true, executeTool: async () => { throw new Error('unavailable'); } })) parts.push(part);
  assert.equal(parts[0].tool.name, 'answer');
  assert.equal(parts[1].text, 'I can describe the leaf.');
});

test('SSE status events arrive separately from final text, including fragmented frames', async () => {
  const encoder = new TextEncoder();
  const wire = [
    { type: 'thinking', text: 'Planning…' },
    { type: 'tool_status', status: 'Searching images…' },
    { type: 'tool_status', status: 'Found 5 results' },
    { delta: 'Final answer.' },
    { done: true },
  ].map((payload) => `data: ${JSON.stringify(payload)}\n\n`).join('');
  const bytes = encoder.encode(wire);
  const response = new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
    controller.close();
  } }));
  const statuses = [];
  const result = await readChatSse(response, { onStatus: (status, type) => statuses.push([status, type]) });
  assert.deepEqual(statuses, [['Planning…', 'thinking'], ['Searching images…', 'tool_status'], ['Found 5 results', 'tool_status']]);
  assert.equal(result.text, 'Final answer.');
});

test('structured progress preserves query and call identity across start and completion', async () => {
  const events = [
    { type: 'tool_status', id: 'tool-1', toolName: 'search_images', phase: 'start', status: 'Searching images…', detail: 'cute cat photo' },
    { type: 'tool_status', id: 'tool-1', toolName: 'search_images', phase: 'complete', status: 'Found 3 results', detail: 'cute cat photo' },
    { delta: 'Here are the images.' },
  ];
  const response = new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''));
  const updates = [];
  const result = await readChatSse(response, { onToolStatus: (update) => updates.push(update) });
  assert.equal(updates.length, 2);
  assert.equal(updates[0].detail, 'cute cat photo');
  assert.equal(updates[0].id, updates[1].id);
  assert.equal(updates[1].phase, 'complete');
  assert.equal(result.text, 'Here are the images.');
});

test('progress updates settle their existing row and retain the order of multiple searches', () => {
  const first = { id: 'a', toolName: 'search_images', phase: 'start', status: 'Searching images…', detail: 'cat' };
  const second = { ...first, id: 'b', detail: 'dog' };
  let rows = upsertToolStatus([], first);
  rows = upsertToolStatus(rows, second);
  rows = upsertToolStatus(rows, { ...first, phase: 'complete', status: 'Found 3 results' });
  assert.deepEqual(rows.map(({ id, phase, detail }) => ({ id, phase, detail })), [
    { id: 'a', phase: 'complete', detail: 'cat' }, { id: 'b', phase: 'start', detail: 'dog' },
  ]);
  assert.equal(first.phase, 'start', 'updating progress must not mutate previous state');
});

test('SSE delivers a gallery after its tool event and before Markdown deltas', async () => {
  const events = [];
  const payloads = [{ tool: { name: 'search_images', args: { query: 'leaf' } }, images: [image] }, { delta: 'Intro\n\n' }, { delta: '| A | B |\n| --- | --- |\n| 1 | 2 |' }, { done: true }];
  const response = new Response(new ReadableStream({
    start(controller) {
      for (const payload of payloads) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`));
      controller.close();
    },
  }));
  const result = await readChatSse(response, {
    onTool: () => events.push('tool'),
    onImages: (images) => { assert.equal(images[0].title, 'Leaf'); events.push('images'); },
    onDelta: () => events.push('text'),
  });
  assert.deepEqual(events, ['tool', 'images', 'text', 'text']);
  assert.equal(result.text, payloads[1].delta + payloads[2].delta);
});

test('explicit delta chunks preserve repeated whitespace and Markdown delimiters exactly', () => {
  const buffer = createChunkBuffer(() => {}, { deltaMode: 'append', scheduler: { request: () => 1, cancel: () => {}, now: () => 0 } });
  const chunks = ['Intro', '\n', '\n', '| A | B |', '\n', '|', ' --- | --- |', '\n', '| 1 | 2 |'];
  for (const chunk of chunks) buffer.push(chunk);
  assert.equal(buffer.finish(), chunks.join(''));
});

test('image dispatch reuses completed searches and preserves a multiline answer', async () => {
  let searches = 0;
  const { dispatchChatTool } = isolatedModule('lib/chat/dispatch.ts', {
    '@/lib/images/client': { searchImagesClient: async () => { searches++; return []; }, toImageAttach: (hit) => hit },
    '@/lib/images/local': { localImageHits: () => [] },
    '@/lib/exercises/generate-set': {}, '@/lib/exercises/mutate-client': {},
    '@/lib/study-sheets/generate-client': {}, '@/lib/study-sheets/store': {},
    '@/lib/paths/generate-client': {}, '@/lib/paths/store': {}, '@/lib/chats': {},
  });
  const text = 'ფოტოსინთეზი\n\n| ნაწილი | როლი |\n| --- | --- |\n| ქლოროფილი | სინათლე |\n\n- წყალი\n- ნახშირორჟანგი';
  for (const imageSearchResults of [[{ ...image, title: 'Leaf', thumb: image.url }], []]) {
    const result = await dispatchChatTool({ tool: { name: 'search_images', args: { query: 'leaf' } }, prompt: 'რა არის ფოტოსინთეზი?', text, materials: [], imageSearchResults });
    assert.equal(result.content, text);
    assert.equal(result.images.length, imageSearchResults.length);
  }
  assert.equal(searches, 0, 'including an empty result prevents a second search');
});

test('chat route executes image search once, publishes gallery, and streams the full answer; search failures stay nonfatal', async () => {
  for (const failSearch of [false, true]) {
    const events = [];
    const statuses = [];
    let searches = 0;
    const call = { name: 'search_images', args: { query: 'photosynthesis' } };
    const provider = {
      generateToolStream: async function* (_prompt, options) {
        const result = await options.executeTool(call);
        assert.equal(result.images.length, failSearch ? 0 : 1);
        if (!failSearch) assert.deepEqual(result.images, [{ title: 'Leaf', source: 'web', imageIndex: 0 }]);
        yield { tool: call };
        yield { text: 'ფოტოსინთეზი\n\n' };
        yield { text: '| ნაწილი | როლი |\n| --- | --- |\n| ქლოროფილი | სინათლე |' };
      },
    };
    const { POST } = isolatedModule('app/api/chat/route.ts', {
      '@/lib/api/assert': { assertSignedInRequest: async () => ({ uid: 'test', anonymous: false }) },
      '@/lib/billing/server': { startAiUsageSession: async () => ({ report: () => {}, commit: async () => {} }) },
      '@/lib/admin/assert': {},
      '@/lib/rag/server': { retrieveChunks: async () => [] },
      '@/lib/ai/gemini': { ...provider, getAIProvider: () => provider },
      '@/lib/images/search': {
        allowImageSearch: () => true, clampImageCount: () => 8,
        searchWebImages: async () => { searches++; if (failSearch) throw new Error('Search unavailable'); return [image]; },
      },
    });
    const response = await POST(new Request('https://example.com/api/chat', { method: 'POST', body: JSON.stringify({ prompt: 'რა არის ფოტოსინთეზი?', mode: 'auto', context: {} }) }));
    const result = await readChatSse(response, {
      onTool: (tool) => { assert.equal(tool.name, 'search_images'); events.push('tool'); },
      onImages: (images) => { assert.equal(images.length, failSearch ? 0 : 1); events.push('images'); },
      onDelta: () => events.push('text'),
      onStatus: (status, type) => statuses.push({ status, type }),
    });
    assert.equal(searches, 1);
    assert.equal(statuses.length, 2);
    assert.ok(statuses.every(({ type }) => type === 'tool_status'));
    assert.match(statuses[0].status, /ფოტო/);
    assert.match(statuses[1].status, failSearch ? /ტექსტით/ : /1/);
    assert.deepEqual(events, ['tool', 'images', 'text', 'text']);
    assert.match(result.text, /\n\n\| ნაწილი \| როლი \|\n/);
  }
});

test('chat route establishes SSE before retrieval and forwards ordinary text before generation completes', async () => {
  let finishRetrieval;
  const retrieval = new Promise((resolve) => { finishRetrieval = resolve; });
  let finishAnswer;
  const answerGate = new Promise((resolve) => { finishAnswer = resolve; });
  let firstDelta;
  const gotDelta = new Promise((resolve) => { firstDelta = resolve; });
  let committed = 0;
  const provider = {
    generateToolStream: async function* () {
      yield { text: 'First live chunk. ' };
      await answerGate;
      yield { text: 'Last chunk.' };
    },
  };
  const { POST } = isolatedModule('app/api/chat/route.ts', {
    '@/lib/api/assert': { assertSignedInRequest: async () => ({ uid: 'test', anonymous: false }) },
    '@/lib/billing/server': { startAiUsageSession: async () => ({ report: () => {}, commit: async () => { committed++; } }) },
    '@/lib/admin/assert': {},
    '@/lib/rag/server': { retrieveChunks: () => retrieval },
    '@/lib/adaptation/server': { adaptiveContextForChat: async () => undefined },
    '@/lib/ai/gemini': { ...provider, getAIProvider: () => provider },
  });
  const response = await POST(new Request('https://example.com/api/chat', { method: 'POST', body: JSON.stringify({ prompt: 'Explain gravity', context: { projectId: 'p' } }) }));
  assert.equal(response.headers.get('Content-Type'), 'text/event-stream; charset=utf-8');
  const reading = readChatSse(response, { onDelta: () => firstDelta() });
  try {
    finishRetrieval([]);
    await Promise.race([gotDelta, new Promise((_, reject) => setTimeout(() => reject(new Error('Live text was buffered until completion')), 1000))]);
    assert.equal(committed, 0, 'receiving the first chunk must not require a completed generation');
  } finally { finishAnswer(); }
  assert.equal((await reading).text, 'First live chunk. Last chunk.');
  assert.equal(committed, 1);
});

test('client artifact dispatch times out, aborts generation, and returns text without late status updates', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let generation;
  const statuses = [];
  const noteEvents = [];
  const { dispatchChatTool } = isolatedModule('lib/chat/dispatch.ts', {
    '@/lib/images/client': {}, '@/lib/images/local': {},
    '@/lib/exercises/generate-set': {}, '@/lib/exercises/mutate-client': {},
    '@/lib/study-sheets/generate-client': { generateStudySheetFromPrompt: async (input) => { generation = input; return new Promise(() => {}); } },
    '@/lib/study-sheets/store': {}, '@/lib/paths/generate-client': {}, '@/lib/paths/store': {}, '@/lib/chats': {},
  });
  const pending = dispatchChatTool({
    tool: { name: 'create_sheet', args: { topic: 'cells' } },
    prompt: 'Make notes on cells', text: '', materials: [], project: { id: 'p' }, userId: 'u',
    onStatus: (status) => statuses.push(status),
    onNotesEvent: (event) => noteEvents.push(event),
  });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.ok(generation?.signal, 'artifact generation must receive a cancellation signal');
  t.mock.timers.tick(10_000);
  const result = await pending;
  assert.equal(generation.signal.aborted, true);
  assert.equal(result.intent, 'ask');
  assert.ok(result.content.length > 0);
  assert.equal(result.artifact, undefined);
  assert.equal(noteEvents.at(-1), null, 'the live artifact session must be cleared on fallback');
  const count = statuses.length;
  generation.onEvent?.({ status: 'Late completion' });
  assert.equal(statuses.length, count);
});

test('a timed-out path start cannot mutate the path when a pending read finishes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finishRead;
  const writes = [];
  const { dispatchChatTool } = isolatedModule('lib/chat/dispatch.ts', {
    '@/lib/images/client': {}, '@/lib/images/local': {},
    '@/lib/exercises/generate-set': {}, '@/lib/exercises/mutate-client': {},
    '@/lib/study-sheets/generate-client': {}, '@/lib/study-sheets/store': {}, '@/lib/paths/generate-client': {},
    '@/lib/paths/store': {
      getLatestPath: () => new Promise((resolve) => { finishRead = resolve; }),
      patchStudyPath: async () => writes.push('patch'),
    },
    '@/lib/chats': { pathThreadId: () => 'thread', pathThreadTitle: () => 'Path', ensureChatThread: async () => writes.push('thread') },
  });
  const pending = dispatchChatTool({ tool: { name: 'start_path', args: {} }, prompt: 'Start path', text: '', project: { id: 'p' } });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  t.mock.timers.tick(10_000);
  assert.equal((await pending).intent, 'ask');
  finishRead({ id: 'path', title: 'Path', started: false, courses: [], currentNodeId: 'node' });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.deepEqual(writes, [], 'late reads must not create a thread or change path progress');
});

test('saving a path checks cancellation after its internal lookup before writing', async () => {
  let finishRead;
  const writes = [];
  const { saveStudyPath } = isolatedModule('lib/paths/store.ts', {
    'firebase/firestore': {
      collection: () => ({}), getDocs: () => new Promise((resolve) => { finishRead = resolve; }),
      addDoc: async () => { writes.push('add'); return { id: 'new' }; }, serverTimestamp: () => 0,
    },
    '@/lib/firebase': { getFirebaseDb: () => ({}) },
    '@/lib/firestore': { COLLECTIONS: {}, omitUndefined: (value) => value },
  });
  const controller = new AbortController();
  const pending = saveStudyPath({ projectId: 'p', userId: 'u', title: 'Path', courses: [], signal: controller.signal });
  controller.abort();
  finishRead({ docs: [] });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.deepEqual(writes, []);
});

test('failed client tool dispatch preserves an existing text answer', async () => {
  const { dispatchChatTool } = isolatedModule('lib/chat/dispatch.ts', {
    '@/lib/images/client': {}, '@/lib/images/local': {},
    '@/lib/exercises/generate-set': {}, '@/lib/exercises/mutate-client': {},
    '@/lib/study-sheets/generate-client': { generateStudySheetFromPrompt: async () => { throw new Error('offline'); } },
    '@/lib/study-sheets/store': {}, '@/lib/paths/generate-client': {}, '@/lib/paths/store': {}, '@/lib/chats': {},
  });
  const result = await dispatchChatTool({ tool: { name: 'create_sheet', args: {} }, prompt: 'Make notes', text: 'Existing answer.', materials: [], project: {}, userId: 'u' });
  assert.equal(result.content, 'Existing answer.');
  assert.equal(result.intent, 'ask');
  assert.equal(result.artifact, undefined);
});

test('image search starts Wikimedia and Openverse together and never scrapes Google', async (t) => {
  const hosts = [];
  let finishWiki;
  t.mock.method(global, 'fetch', async (url) => {
    const host = new URL(url).hostname;
    hosts.push(host);
    if (host === 'commons.wikimedia.org') return new Promise((resolve) => { finishWiki = () => resolve(Response.json({ query: { pages: [] } })); });
    return Response.json({ results: [{ title: 'leaf', url: image.url, thumbnail: image.thumbnail }] });
  });
  const { searchWebImages } = isolatedModule('lib/images/search.ts', {
    '@/lib/images/query': { ...require('../lib/images/query.ts'), planImageSearch: async () => ({ query: 'leaf', must: ['leaf'], avoid: [] }) },
  });
  const pending = searchWebImages('leaf', 5);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  const startedTogether = hosts.includes('api.openverse.org');
  finishWiki();
  const hits = await pending;
  assert.equal(startedTogether, true, 'Openverse must start even while Wikimedia is pending');
  assert.equal(hits[0].source, 'openverse');
  assert.ok(hosts.every((host) => !host.includes('google')));
});

test('empty image providers do not fall back to the Google HTML scrape', async (t) => {
  const hosts = [];
  t.mock.method(global, 'fetch', async (url) => { hosts.push(new URL(url).hostname); return Response.json({ query: { pages: [] }, results: [], photos: [], hits: [] }); });
  const { searchWebImages } = isolatedModule('lib/images/search.ts', {
    '@/lib/images/query': { ...require('../lib/images/query.ts'), planImageSearch: async () => ({ query: 'leaf', must: ['leaf'], avoid: [] }) },
  });
  assert.deepEqual(await searchWebImages('leaf', 5), []);
  assert.ok(hosts.includes('commons.wikimedia.org'));
  assert.ok(hosts.includes('api.openverse.org'));
  assert.ok(hosts.every((host) => !host.includes('google')));
});

test('artifact tool selection keeps its original non-streaming dispatch behavior', async () => {
  const provider = new GeminiProvider();
  provider.getModel = () => ({
    generateContent: async () => ({ response: { candidates: [{ content: { parts: [{ functionCall: { name: 'create_practice', args: { topic: 'cells' } } }] } }] } }),
    generateContentStream: async () => { throw new Error('Artifact tools must not enter the image answer stream'); },
  });
  const parts = [];
  for await (const part of provider.generateToolStream('Make a quiz about cells', { tools: true, toolChoice: 'create_practice' })) parts.push(part);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].tool.name, 'create_practice');
});

test('distinct image queries get their own results and share a combined gallery', async () => {
  const searches = [];
  const provider = {
    generateToolStream: async function* (_prompt, options) {
      for (const query of ['mitosis', 'meiosis']) {
        const result = await options.executeTool({ name: 'search_images', args: { query } });
        assert.equal(result.images[0].title, query);
      }
      yield { tool: { name: 'search_images', args: { query: 'mitosis' } } };
      yield { text: 'Here is the comparison.' };
    },
  };
  const { POST } = isolatedModule('app/api/chat/route.ts', {
    '@/lib/api/assert': { assertSignedInRequest: async () => ({ uid: 'test', anonymous: false }) },
    '@/lib/billing/server': { startAiUsageSession: async () => ({ report: () => {}, commit: async () => {} }) },
    '@/lib/admin/assert': {}, '@/lib/rag/server': { retrieveChunks: async () => [] },
    '@/lib/ai/gemini': { ...provider, getAIProvider: () => provider },
    '@/lib/images/search': {
      allowImageSearch: () => true, clampImageCount: () => 8,
      searchWebImages: async (query) => { searches.push(query); return [{ ...image, url: `https://example.com/${query}.jpg`, alt: query }]; },
    },
  });
  let gallery;
  const response = await POST(new Request('https://example.com/api/chat', { method: 'POST', body: JSON.stringify({ prompt: 'Compare images of mitosis and meiosis', context: {} }) }));
  await readChatSse(response, { onImages: (images) => { gallery = images; } });
  assert.deepEqual(searches, ['mitosis', 'meiosis']);
  assert.deepEqual(gallery.map((hit) => hit.title), ['mitosis', 'meiosis']);
});

test('fallback image routing discards pre-search text and uses only streamed caption fallback', async () => {
  const events = [];
  const provider = {
    generateToolStream: async function* () { yield { text: 'STALE_PRE_SEARCH_TEXT' }; },
    generateTextStream: async function* () { events.push('caption'); yield 'Here are '; yield 'the photos.'; },
  };
  const { POST } = isolatedModule('app/api/chat/route.ts', {
    '@/lib/api/assert': { assertSignedInRequest: async () => ({ uid: 'test', anonymous: false }) },
    '@/lib/billing/server': { startAiUsageSession: async () => ({ report: () => {}, commit: async () => {} }) },
    '@/lib/admin/assert': {}, '@/lib/rag/server': { retrieveChunks: async () => [] },
    '@/lib/ai/gemini': { ...provider, getAIProvider: () => provider },
    '@/lib/images/search': {
      allowImageSearch: () => true, clampImageCount: () => 8,
      searchWebImages: async () => { events.push('search'); return [image]; },
    },
  });
  const response = await POST(new Request('https://example.com/api/chat', { method: 'POST', body: JSON.stringify({ prompt: 'leaf', context: { acceptedTool: 'search_images' } }) }));
  const result = await readChatSse(response, { onTool: () => events.push('tool'), onDelta: () => events.push('text') });
  assert.equal(result.text, 'Here are the photos.');
  assert.ok(events.indexOf('search') < events.indexOf('caption'));
  assert.equal(events.filter((event) => event === 'text').length, 2);
});

test('editing and appending preserve an active exam or custom practice title without an active mode field', async () => {
  const { dispatchChatTool } = isolatedModule('lib/chat/dispatch.ts', {
    '@/lib/images/client': {}, '@/lib/images/local': {},
    '@/lib/exercises/generate-set': {},
    '@/lib/exercises/mutate-client': { rewritePracticeItems: async () => 2, appendPracticeItems: async () => ['q3'] },
    '@/lib/study-sheets/generate-client': {}, '@/lib/study-sheets/store': {},
    '@/lib/paths/generate-client': {}, '@/lib/paths/store': {}, '@/lib/chats': {},
  });
  for (const title of ['Exam', 'Biology review']) {
    for (const name of ['edit_practice', 'append_practice']) {
      const result = await dispatchChatTool({
        tool: { name, args: { count: 1 } }, prompt: 'Update this set', text: '', materials: [], project: {}, userId: 'u',
        active: { kind: 'practice_set', id: 'set', title, status: 'ready', ids: ['q1', 'q2'] },
      });
      assert.equal(result.artifact.title, title);
      assert.equal(result.artifact.mode, title === 'Exam' ? 'exam' : 'practice');
      assert.deepEqual(result.artifact.ids, name === 'append_practice' ? ['q1', 'q2', 'q3'] : ['q1', 'q2']);
    }
  }
});
