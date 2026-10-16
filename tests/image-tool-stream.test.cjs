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
const { GeminiProvider } = require('../lib/ai/gemini.ts');
const { readChatSse } = require('../lib/ai/sse.ts');
const { createChunkBuffer } = require('../lib/ai/chunk-stream.ts');
const image = { url: 'https://example.com/leaf.jpg', thumbnail: 'https://example.com/leaf.jpg', alt: 'Leaf', source: 'web' };

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
    let searches = 0;
    const call = { name: 'search_images', args: { query: 'photosynthesis' } };
    const provider = {
      generateToolStream: async function* (_prompt, options) {
        const result = await options.executeTool(call);
        assert.equal(result.images.length, failSearch ? 0 : 1);
        if (!failSearch) assert.deepEqual(result.images, [{ title: 'Leaf', source: 'web' }]);
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
    });
    assert.equal(searches, 1);
    assert.deepEqual(events, ['tool', 'images', 'text', 'text']);
    assert.match(result.text, /\n\n\| ნაწილი \| როლი \|\n/);
  }
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
