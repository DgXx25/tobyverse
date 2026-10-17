/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args);
};
const loadTypeScript = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
require.extensions['.ts'] = loadTypeScript;
require.extensions['.tsx'] = loadTypeScript;
require.extensions['.css'] = () => {};

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

const { parseSearchHits } = require('../lib/images/hits.ts');
const { readChatSse } = require('../lib/ai/sse.ts');
const cat = { url: 'https://example.com/cat.jpg', thumb: 'https://example.com/cat.jpg', title: 'Cat', source: 'web', license: '', credit: '', galleryId: 'gallery-cats' };
const dog = { ...cat, url: 'https://example.com/dog.jpg', thumb: 'https://example.com/dog.jpg', title: 'Dog', galleryId: 'gallery-dogs' };
const fence = (galleryId) => '```image-gallery\n' + JSON.stringify({ galleryId }) + '\n```';

test('SSE image normalization keeps valid gallery references and rejects arbitrary references', () => {
  const hits = parseSearchHits([cat, dog, { ...cat, galleryId: 'https://forged.example/images' }]);
  assert.deepEqual(hits.map((hit) => hit.galleryId), ['gallery-cats', 'gallery-dogs', undefined]);
});

test('image galleries interleave with prose, native blocks, and visual blocks in answer order', () => {
  const { layoutImageGalleries } = require('../lib/images/galleries.ts');
  const native = '```toby\n{"type":"paper","reuse":true}\n```';
  const visual = '```visual\n{"type":"unknown"}\n```';
  const text = ['## Cats', fence('gallery-cats'), native, '## Dogs', fence('gallery-dogs'), visual, 'Concluding text.'].join('\n\n');
  const layout = layoutImageGalleries(text, [cat, dog]);
  assert.deepEqual(layout.segments.map((part) => part.kind === 'fence' ? part.lang : part.kind), ['md', 'gallery', 'md', 'toby', 'md', 'gallery', 'md', 'visual', 'md']);
  assert.deepEqual(layout.segments.filter((part) => part.kind === 'gallery').map((part) => part.images.map((hit) => hit.title)), [['Cat'], ['Dog']]);
  assert.deepEqual(layout.remaining, []);
  assert.match(layout.segments.at(-1).text, /Concluding text/);
});

test('only known galleries render, with duplicate references consumed once and untouched hits in fallback', () => {
  const { layoutImageGalleries } = require('../lib/images/galleries.ts');
  const local = { ...cat, galleryId: undefined, kind: 'upload', storagePath: 'local/cat.png' };
  const text = [fence('gallery-cats'), fence('gallery-cats'), fence('forged-id'), '```image-gallery\n{"url":"https://forged.example/image.jpg"}\n```'].join('\n\n');
  const layout = layoutImageGalleries(text, [cat, dog, local]);
  assert.equal(layout.segments.filter((part) => part.kind === 'gallery').length, 1);
  assert.deepEqual(layout.remaining.map((hit) => hit.title), ['Dog', 'Cat']);
  assert.ok(layout.segments.every((part) => part.kind !== 'fence'));
});

test('an inline gallery resolves when either its marker or its SSE data arrives later', () => {
  const { layoutImageGalleries } = require('../lib/images/galleries.ts');
  const incomplete = 'Cats\n\n```image-gallery\n{"galleryId":"gallery-c';
  assert.equal(layoutImageGalleries(incomplete, [cat]).segments.filter((part) => part.kind === 'gallery').length, 0);
  const openFence = 'Cats\n\n```image-gallery\n{"galleryId":"gallery-cats"}';
  assert.equal(layoutImageGalleries(openFence, [cat]).segments.at(-1).kind, 'gallery');
  assert.equal(layoutImageGalleries(openFence, []).segments.filter((part) => part.kind === 'gallery').length, 0);
  assert.equal(layoutImageGalleries(openFence, [cat]).remaining.length, 0);
});

test('legacy replies retain their original prose and footer images', () => {
  const { layoutImageGalleries } = require('../lib/images/galleries.ts');
  const layout = layoutImageGalleries('Here are some photos.\n\nMore text.', [cat, dog]);
  assert.deepEqual(layout.segments, [{ kind: 'md', text: 'Here are some photos.\n\nMore text.' }]);
  assert.deepEqual(layout.remaining, [cat, dog]);
});

test('gallery fences inside ordinary code and quoted examples cannot claim results', () => {
  const { layoutImageGalleries } = require('../lib/images/galleries.ts');
  for (const text of [
    '````markdown\n' + fence('gallery-cats') + '\n````',
    '~~~markdown\n' + fence('gallery-cats') + '\n~~~',
    fence('gallery-cats').split('\n').map((line) => '> ' + line).join('\n'),
    fence('gallery-cats').split('\n').map((line) => '    ' + line).join('\n'),
  ]) {
    const layout = layoutImageGalleries(text, [cat]);
    assert.equal(layout.segments.filter((part) => part.kind === 'gallery').length, 0, text);
    assert.deepEqual(layout.remaining, [cat]);
  }
});

test('existing same-line native and visual fences remain separate from subsequent galleries', () => {
  const { layoutImageGalleries } = require('../lib/images/galleries.ts');
  const text = '```toby {"type":"grid","cells":"x"}```\n\n' + fence('gallery-cats') + '\n\n```visual {"type":"steps","items":["One"]}```';
  const layout = layoutImageGalleries(text, [cat]);
  assert.deepEqual(layout.segments.filter((part) => part.kind !== 'md').map((part) => part.kind === 'gallery' ? part.kind : part.lang), ['toby', 'gallery', 'visual']);
  assert.equal(layout.remaining.length, 0);
});

test('RichContent renders each referenced gallery between the intended paragraphs without footer duplicates', () => {
  const { RichContent } = require('../components/rich-content.tsx');
  const text = ['## Cats', fence('gallery-cats'), '## Dogs', fence('gallery-dogs'), 'Together.'].join('\n\n');
  const html = renderToStaticMarkup(React.createElement(RichContent, { text, images: [cat, dog] }));
  assert.ok(html.indexOf('<h2>') < html.indexOf('title="Cat"'));
  assert.ok(html.indexOf('title="Cat"') < html.lastIndexOf('<h2>'));
  assert.ok(html.lastIndexOf('<h2>') < html.indexOf('title="Dog"'));
  assert.ok(html.indexOf('title="Dog"') < html.indexOf('Together.'));
  assert.equal((html.match(/title="Cat"/g) || []).length, 1);
  assert.equal((html.match(/title="Dog"/g) || []).length, 1);
  assert.doesNotMatch(html, /image-gallery|gallery-cats|gallery-dogs/);
});

test('streaming shows inline results immediately and waits to append unplaced fallback images', () => {
  const { RichContent } = require('../components/rich-content.tsx');
  const props = { text: 'Cats\n\n' + fence('gallery-cats'), images: [cat, dog] };
  const live = renderToStaticMarkup(React.createElement(RichContent, { ...props, streaming: true }));
  assert.match(live, /title="Cat"/);
  assert.doesNotMatch(live, /title="Dog"/);
  const settled = renderToStaticMarkup(React.createElement(RichContent, props));
  assert.match(settled, /title="Cat"/);
  assert.match(settled, /title="Dog"/);
});

test('distinct searches return independent server IDs even if the providers return the same image', async () => {
  const results = [];
  const provider = {
    generateToolStream: async function* (_prompt, options) {
      for (const query of ['cats', 'dogs']) results.push(await options.executeTool({ name: 'search_images', args: { query } }));
      yield { tool: { name: 'search_images', args: { query: 'cats' } } };
      yield { text: 'Cats\n\n' + fence(results[0].galleryId) + '\n\nDogs\n\n' + fence(results[1].galleryId) + '\n\nTogether.' };
    },
  };
  const { POST } = isolatedModule('app/api/chat/route.ts', {
    '@/lib/api/assert': { assertSignedInRequest: async () => ({ uid: 'test', anonymous: false }) },
    '@/lib/billing/server': { startAiUsageSession: async () => ({ report: () => {}, commit: async () => {} }) },
    '@/lib/admin/assert': {}, '@/lib/rag/server': { retrieveChunks: async () => [] },
    '@/lib/ai/gemini': { ...provider, getAIProvider: () => provider },
    '@/lib/images/search': {
      allowImageSearch: () => true, clampImageCount: () => 8,
      searchWebImages: async () => [{ url: cat.url, thumbnail: cat.thumb, alt: cat.title, source: cat.source }],
    },
  });
  const response = await POST(new Request('https://example.com/api/chat', { method: 'POST', body: JSON.stringify({ prompt: 'Compare pictures of cats and dogs', context: {} }) }));
  let images;
  const answer = await readChatSse(response, { onImages: (hits) => { images = hits; } });
  assert.match(results[0].galleryId, /^gallery-[A-Za-z0-9_-]+$/);
  assert.notEqual(results[0].galleryId, results[1].galleryId);
  assert.equal(images.length, 2);
  assert.deepEqual(images.map((hit) => hit.galleryId), results.map((result) => result.galleryId));
  const { layoutImageGalleries } = require('../lib/images/galleries.ts');
  assert.equal(layoutImageGalleries(answer.text, images).segments.filter((part) => part.kind === 'gallery').length, 2);
});

test('saved gallery IDs survive normal chat reloads', async () => {
  const { listChatMessages } = isolatedModule('lib/chats.ts', {
    'firebase/firestore': { collection: () => ({}), getDocs: async () => ({ docs: [{ id: 'answer', data: () => ({ role: 'assistant', content: fence('gallery-cats'), images: [cat] }) }] }), query: (value) => value, orderBy: () => ({}) },
    '@/lib/firebase': { getFirebaseDb: () => ({}) },
  });
  const messages = await listChatMessages('p', 'main');
  assert.equal(messages[0].images[0].galleryId, 'gallery-cats');
});

test('shared chat client preserves the saved gallery IDs', async () => {
  let reads = 0;
  const { loadSharedChatClient } = isolatedModule('lib/sharing/client.ts', {
    'firebase/firestore': {
      collection: () => ({}), doc: () => ({}), query: (value) => value, where: () => ({}), limit: () => ({}),
      getDocs: async () => ++reads === 1
        ? { docs: [{ id: 'chat', data: () => ({ projectId: 'p', nestedId: 'main' }) }] }
        : { docs: [{ id: 'answer', data: () => ({ role: 'assistant', content: fence('gallery-cats'), images: [cat] }) }] },
      getDoc: async () => ({ exists: () => true, data: () => ({ title: 'Chat' }) }),
    },
    '@/lib/firebase': { getFirebaseDb: () => ({}) },
  });
  const snapshot = await loadSharedChatClient('a'.repeat(32));
  assert.equal(snapshot.messages[0].images[0].galleryId, 'gallery-cats');
});

test('shared chat server preserves the saved gallery IDs', async () => {
  const indexData = { userId: 'u', projectId: 'p', nestedId: 'main' };
  const data = { role: 'assistant', content: fence('gallery-cats'), images: [cat] };
  function ref(parts) {
    return {
      collection: (name) => ref([...parts, name]), doc: (name) => ref([...parts, name]),
      where() { return this; }, limit() { return this; },
      get: async () => parts.join('/') === 'chats'
        ? { docs: [{ id: 'chat', data: () => indexData }] }
        : parts.at(-1) === 'messages'
          ? { docs: [{ id: 'answer', data: () => data }] }
          : { exists: true, data: () => ({ userId: 'u', title: 'Shared chat' }) },
    };
  }
  const { loadSharedChat } = isolatedModule('lib/sharing/server.ts', {
    'server-only': {}, '@/lib/server/firestore-admin': { getAdminFirestore: () => ref([]) },
  });
  const snapshot = await loadSharedChat('a'.repeat(32));
  assert.equal(snapshot.messages[0].images[0].galleryId, 'gallery-cats');
});

test('image dispatch retains independent groups sharing one URL and local fallback hits', async () => {
  const upload = { ...cat, galleryId: undefined, kind: 'upload', materialId: 'figure', storagePath: 'figure.png' };
  const { dispatchChatTool } = isolatedModule('lib/chat/dispatch.ts', {
    '@/lib/images/client': { toImageAttach: (hit) => ({ title: hit.title, type: 'image' }) },
    '@/lib/images/local': { localImageHits: () => [upload] },
    '@/lib/exercises/generate-set': {}, '@/lib/exercises/mutate-client': {},
    '@/lib/study-sheets/generate-client': {}, '@/lib/study-sheets/store': {},
    '@/lib/paths/generate-client': {}, '@/lib/paths/store': {}, '@/lib/chats': {},
  });
  const content = 'Cats\n\n' + fence('gallery-cats') + '\n\nDogs\n\n' + fence('gallery-dogs') + '\n\nTogether.';
  const result = await dispatchChatTool({
    tool: { name: 'search_images', args: { query: 'cats and dogs' } }, prompt: 'Compare pictures', text: content,
    project: {}, userId: 'u', materials: [], imageSearchResults: [cat, { ...cat, galleryId: 'gallery-dogs' }],
  });
  assert.equal(result.content, content);
  assert.deepEqual(result.images.map((hit) => hit.galleryId), [undefined, 'gallery-cats', 'gallery-dogs']);
});

test('provider text fallback receives actual gallery IDs with no fixed one-line response contract', async () => {
  let instruction;
  let images;
  const provider = {
    generateToolStream: async function* () {},
    generateTextStream: async function* (_prompt, options) { instruction = options.systemInstruction; yield 'Completed answer.'; },
  };
  const { POST } = isolatedModule('app/api/chat/route.ts', {
    '@/lib/api/assert': { assertSignedInRequest: async () => ({ uid: 'test', anonymous: false }) },
    '@/lib/billing/server': { startAiUsageSession: async () => ({ report: () => {}, commit: async () => {} }) },
    '@/lib/admin/assert': {}, '@/lib/rag/server': { retrieveChunks: async () => [] },
    '@/lib/ai/gemini': { ...provider, getAIProvider: () => provider },
    '@/lib/images/search': { allowImageSearch: () => true, clampImageCount: () => 8, searchWebImages: async () => [{ url: cat.url, thumbnail: cat.thumb, alt: 'Cat', source: 'web' }] },
  });
  const response = await POST(new Request('https://example.com/api/chat', { method: 'POST', body: JSON.stringify({ prompt: 'Compare cat pictures in paragraphs', context: { acceptedTool: 'search_images' } }) }));
  await readChatSse(response, { onImages: (hits) => { images = hits; } });
  assert.ok(instruction.includes(images[0].galleryId));
  assert.ok(instruction.includes('Cat'));
  assert.doesNotMatch(instruction, /only one short line|Nothing else|No lists/);
  assert.doesNotMatch(instruction, /https:\/\/example.com\/cat.jpg/);
});

test('a successful gallery survives a later search failure and answer-tool fallback before streaming text', async () => {
  const events = [];
  let galleryId;
  let images;
  const provider = {
    generateToolStream: async function* (_prompt, options) {
      const found = await options.executeTool({ name: 'search_images', args: { query: 'cats' } });
      galleryId = found.galleryId;
      const failed = await options.executeTool({ name: 'search_images', args: { query: 'dogs' } });
      assert.equal(failed.ok, false);
      yield { tool: { name: 'answer', args: {} } };
      yield { text: 'Cats\n\n' + fence(galleryId) + '\n\nDog photos unavailable.' };
    },
  };
  const { POST } = isolatedModule('app/api/chat/route.ts', {
    '@/lib/api/assert': { assertSignedInRequest: async () => ({ uid: 'test', anonymous: false }) },
    '@/lib/billing/server': { startAiUsageSession: async () => ({ report: () => {}, commit: async () => {} }) },
    '@/lib/admin/assert': {}, '@/lib/rag/server': { retrieveChunks: async () => [] },
    '@/lib/ai/gemini': { ...provider, getAIProvider: () => provider },
    '@/lib/images/search': { allowImageSearch: () => true, clampImageCount: () => 8, searchWebImages: async (query) => {
      if (query === 'dogs') throw new Error('Dogs unavailable');
      return [{ url: cat.url, thumbnail: cat.thumb, alt: cat.title, source: cat.source }];
    } },
  });
  const response = await POST(new Request('https://example.com/api/chat', { method: 'POST', body: JSON.stringify({ prompt: 'Compare cat and dog photos', context: {} }) }));
  const answer = await readChatSse(response, { onImages: (hits) => { images = hits; events.push('images'); }, onDelta: () => events.push('text') });
  assert.equal(answer.tool.name, 'answer');
  assert.equal(images?.[0].galleryId, galleryId);
  assert.deepEqual(events, ['images', 'text']);
});

test('answer dispatch persists completed search results after a later tool failure', async () => {
  const { dispatchChatTool } = isolatedModule('lib/chat/dispatch.ts', {
    '@/lib/images/client': {}, '@/lib/images/local': {},
    '@/lib/exercises/generate-set': {}, '@/lib/exercises/mutate-client': {},
    '@/lib/study-sheets/generate-client': {}, '@/lib/study-sheets/store': {},
    '@/lib/paths/generate-client': {}, '@/lib/paths/store': {}, '@/lib/chats': {},
  });
  const result = await dispatchChatTool({ tool: { name: 'answer', args: {} }, prompt: 'Compare pictures', text: fence('gallery-cats'), imageSearchResults: [cat] });
  assert.deepEqual(result.images, [cat]);
});
