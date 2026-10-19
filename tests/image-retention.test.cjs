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
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
function isolated(relative, mocks, source) {
  const filename = path.join(root, relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  loaded.require = name => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  loaded._compile(ts.transpileModule(source ?? fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
  return loaded.exports;
}
const storagePath = 'users/u/projects/p/materials/photo/compressed.webp';
const textPath = 'users/u/projects/p/materials/photo/extracted.txt';

function retentionFixture(text, type = 'image', source) {
  let material = { userId: 'u', type, storagePath, textPath, sizeBytes: 100, originalName: 'camera.png', originalMime: 'image/png', originalSizeBytes: 5000, textChars: text.length };
  let user = { usage: { storageBytes: 300, other: 7 } };
  const objects = new Map([[storagePath, { buffer: Buffer.alloc(100), contentType: 'image/webp' }], [textPath, { buffer: Buffer.from(text), contentType: 'text/plain' }]]);
  const ref = { get: async () => ({ data: () => material }) };
  const userRef = { get: async () => ({ data: () => user }) };
  const db = { collection: () => ({ doc: () => userRef }), runTransaction: async fn => fn({
    get: target => target.get(),
    set: (target, data) => { if (target === ref) material = { ...material, ...data }; else user = { ...user, ...data }; },
  }) };
  const api = isolated('lib/materials/retention.ts', {
    'server-only': {},
    'firebase-admin/firestore': { FieldValue: { delete: () => null, serverTimestamp: () => 'now' } },
    '@/lib/api/assert': { AuthError: class extends Error {} },
    '@/lib/firestore': { COLLECTIONS: { users: 'users' } },
    '@/lib/server/firestore-admin': { getAdminFirestore: () => db },
    '@/lib/storage-gcs': { downloadGcsObject: async key => { if (!objects.has(key)) throw new Error('Missing object'); return objects.get(key); }, deleteGcsObject: async key => objects.delete(key) },
  }, source);
  return { run: () => api.retainMaterialText({ uid: 'u', projectId: 'p', materialId: 'photo', ref }), get material() { return material; }, get user() { return user; }, objects };
}

test('photo keeps exactly its compressed image and OCR; quota counts UTF-8 bytes once on retry', async () => {
  const fixture = retentionFixture('OCR ✓');
  await fixture.run();
  await fixture.run();
  const total = 100 + Buffer.byteLength('OCR ✓');
  assert.equal(fixture.material.storagePath, storagePath);
  assert.equal(fixture.material.sizeBytes, total);
  assert.equal(fixture.user.usage.storageBytes, 200 + total);
  assert.equal(fixture.user.usage.other, 7);
  assert.deepEqual([...fixture.objects.keys()], [storagePath, textPath]);
  assert.deepEqual(fixture.material.images, [{ page: 1, path: storagePath, mime: 'image/webp' }]);
  assert.equal(fixture.material.originalName, 'camera.png');
  assert.equal(fixture.material.originalMime, 'image/png');
  assert.equal(fixture.material.originalSizeBytes, 5000);
});

test('photo without readable text remains an image with an empty extracted.txt', async () => {
  const fixture = retentionFixture('');
  await fixture.run();
  await fixture.run();
  assert.equal(fixture.material.sizeBytes, 100);
  assert.equal(fixture.user.usage.storageBytes, 300);
  assert.equal(fixture.material.hasImages, true);
  assert.equal(fixture.objects.get(textPath).buffer.byteLength, 0);
});

test('document retention still deletes the binary only after verifying nonempty text', async () => {
  const fixture = retentionFixture('text', 'docx');
  await fixture.run();
  await fixture.run();
  assert.equal(fixture.material.originalRemoved, true);
  assert.equal(fixture.material.storagePath, textPath);
  assert.equal(fixture.user.usage.storageBytes, 204);
  assert.deepEqual([...fixture.objects.keys()], [textPath]);
  const empty = retentionFixture('', 'docx');
  await assert.rejects(empty.run(), /No text was extracted/);
  assert.equal(empty.objects.has(storagePath), true);
});

test('OCR accepts the explicit no-text marker and preserves real extracted content', async () => {
  for (const [answer, expected] of [['[NO_READABLE_TEXT]', ''], ['', ''], ['  readable text  ', 'readable text']]) {
    const { extractImageText } = isolated('lib/materials/extract.ts', {
      '@/lib/ai/gemini': { generateText: async () => answer },
      '@/lib/materials/docx': {}, '@/lib/materials/pdf': {}, '@/lib/materials/pptx': {}, '@/lib/materials/txt': {},
    });
    assert.equal(await extractImageText(Buffer.from('compressed'), 'image/webp'), expected);
  }
});

test('image ingest uploads the compressed bytes and preserves original identity even with empty OCR', async t => {
  const writes = [];
  const uploaded = [];
  const compressed = new Blob(['small'], { type: 'image/webp' });
  const { prepareMaterialIngest, commitMaterialText } = isolated('lib/materials/ingest-client.ts', {
    '@/lib/auth': { requireSignedInUser: async () => ({ uid: 'u' }) },
    '@/lib/api/client': { authHeaders: async () => ({}) },
    '@/lib/workspace/draft-notebook': { clearUntouchedNotebook: () => {} },
    '@/lib/materials/compress-image': { compressImageForUpload: async () => ({ blob: compressed, name: 'compressed.webp', mime: 'image/webp' }) },
    '@/lib/materials/store': { newMaterialRef: () => ({ id: 'photo' }), writeMaterialDoc: async (_p, _id, data) => writes.push(data), patchMaterialStatus: async (_p, _id, status) => writes.push({ status }) },
    '@/lib/materials/storage': {
      originalStoragePath: () => storagePath, extractedTextPath: () => textPath,
      uploadMaterialBytes: async (_path, bytes, mime) => { uploaded.push({ bytes, mime }); return { path: storagePath, sizeBytes: 5, contentType: mime, reservedBytes: 5 }; },
      uploadExtractedText: async (_path, text) => { assert.equal(text, ''); return textPath; },
    },
  });
  const calls = [];
  t.mock.method(global, 'fetch', async (url) => { calls.push(url); return Response.json(url.endsWith('/extract') ? { type: 'image', text: '', textChars: 0 } : { done: true }); });
  const file = new File(['uncompressed pixels'], 'camera.png', { type: 'image/png' });
  const prepared = await prepareMaterialIngest({ projectId: 'p', userId: 'untrusted', source: { kind: 'file', file } });
  assert.equal(uploaded[0].bytes, compressed);
  assert.equal(prepared.originalName, file.name);
  assert.equal(prepared.originalSizeBytes, file.size);
  assert.equal(prepared.originalMime, 'image/png');
  await commitMaterialText(prepared);
  const final = writes.find(row => row.hasImages);
  assert.equal(final.originalMime, 'image/png');
  assert.equal(final.storedMime, 'image/webp');
  assert.equal(final.images[0].mime, 'image/webp');
  assert.equal(final.originalSizeBytes, file.size);
  assert.equal(writes.at(-1).status, 'ready');
  assert.deepEqual(calls, ['/api/materials/extract', '/api/materials/index']);
});

test('browser compression bounds dimensions, applies orientation, preserves alpha and releases the bitmap', async () => {
  let closed = false;
  let canvas;
  const previousBitmap = global.createImageBitmap;
  global.createImageBitmap = async (_file, options) => {
    assert.equal(options.imageOrientation, 'from-image');
    return { width: 4000, height: 3000, close: () => { closed = true; } };
  };
  const previous = global.document;
  global.document = { createElement: () => (canvas = { getContext: () => ({ drawImage: () => {} }), toBlob: (callback, mime) => callback(new Blob(['pixels'], { type: mime })) }) };
  try {
    const { compressImageForUpload } = require('../lib/materials/compress-image.ts');
    const result = await compressImageForUpload(new File(['original'], 'camera.png', { type: 'image/png' }));
    assert.equal(canvas.width, 2560);
    assert.equal(canvas.height, 1920);
    assert.equal(result.name, 'camera.webp');
    assert.equal(result.mime, 'image/webp');
    assert.equal(closed, true);
  } finally { global.document = previous; global.createImageBitmap = previousBitmap; }
});

test('server fallback bakes EXIF orientation and preserves transparent pixels', async () => {
  const sharp = require('sharp');
  const { normalizeImageUpload } = require('../lib/materials/image-normalization.ts');
  const transparent = await sharp({ create: { width: 12, height: 8, channels: 4, background: { r: 25, g: 50, b: 75, alpha: 0 } } }).png().toBuffer();
  const result = await normalizeImageUpload({ filename: 'transparent.png', mime: 'image/png', buffer: transparent });
  const meta = await sharp(result.buffer).metadata();
  assert.equal(meta.hasAlpha, true);
  assert.equal(meta.format, 'webp');
  const jpeg = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#ffaacc' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const rotated = await normalizeImageUpload({ filename: 'camera.jpg', mime: 'image/jpeg', buffer: jpeg });
  const rotatedMeta = await sharp(rotated.buffer).metadata();
  assert.equal(rotatedMeta.width, 8);
  assert.equal(rotatedMeta.height, 12);
  assert.equal(rotatedMeta.orientation, undefined);
});

test('viewer and thumbnail use the compressed storage name while keeping original metadata', () => {
  const { originalStoredName } = require('../lib/materials/viewer-files.ts');
  const { libraryThumbTarget } = require('../lib/library/media.ts');
  const material = { type: 'image', storagePath, originalName: 'camera.png', originalMime: 'image/png' };
  assert.equal(originalStoredName(material), 'compressed.webp');
  assert.deepEqual(libraryThumbTarget({ kind: 'material', materialType: 'image', storagePath }), { name: 'compressed.webp', mode: 'image' });
});

test('a selected photo with no OCR reaches vision even for a short request', async () => {
  const { pickChatFigures } = isolated('lib/materials/figures.ts', {
    '@/lib/materials/storage': { isMissingMaterialFile: () => false, readStorageBytes: async () => new Uint8Array([1]) },
  });
  const material = { id: 'photo', type: 'image', title: 'Scene', storagePath, textChars: 0, extractedTextPreview: '', images: [{ page: 1, path: storagePath, mime: 'image/webp' }] };
  for (const prompt of ['What is this?', 'What do you see?', 'აღწერე ეს', 'Summarize the selected source']) {
    const result = await pickChatFigures(prompt, [material]);
    assert.equal(result.figures[0].path, storagePath, prompt);
    assert.equal(result.figures[0].mime, 'image/webp');
  }
});

test('source photos without OCR are not reread for unrelated prompts without a current photo attachment', async () => {
  const gets = [];
  const { pickChatFigures, shouldAttachChatFigures } = isolated('lib/materials/figures.ts', {
    '@/lib/materials/storage': { isMissingMaterialFile: () => false, readStorageBytes: async path => { gets.push(path); return new Uint8Array([1]); } },
  });
  const material = { id: 'photo', type: 'image', title: 'Scene', storagePath, textChars: 0, extractedTextPreview: '', images: [{ page: 1, path: storagePath, mime: 'image/webp' }] };
  for (const prompt of ['hello', '2+2', 'What is the capital of France?', 'Explain HTTP', 'Explain this JavaScript function', 'რა არის HTTP?', 'აღწერე ეს ფუნქცია']) {
    assert.equal(shouldAttachChatFigures(prompt, [material]), false, prompt);
    assert.deepEqual(await pickChatFigures(prompt, [material]), { figures: [], fileGets: 0 });
  }
  assert.deepEqual(gets, []);
  const attached = await pickChatFigures('hello', [material], [{ materialId: 'photo', type: 'image', title: 'Scene', storagePath }]);
  assert.equal(attached.figures[0].path, storagePath, 'a current explicit photo still reaches vision');
});

test('empty extracted text sidecar can be stored through the upload endpoint', async () => {
  const stored = [];
  const { POST } = isolated('app/api/materials/upload/route.ts', {
    '@/lib/api/assert': { assertAccountRequest: async () => ({ uid: 'u' }), authErrorResponse: error => { throw error; } },
    '@/lib/storage-gcs': { uploadGcsObject: async (...args) => stored.push(args) },
    '@/lib/server/material-storage-quota': { MaterialStorageQuotaError: class extends Error {} },
  });
  const form = new FormData();
  form.set('path', textPath); form.set('text', ''); form.set('contentType', 'text/plain; charset=utf-8');
  const response = await POST(new Request('http://local/api/materials/upload', { method: 'POST', body: form }));
  assert.equal(response.status, 200);
  assert.equal(stored[0][0], textPath);
  assert.equal(stored[0][1].byteLength, 0);
});

test('indexing a text-free photo completes with zero chunks and no embedding call', async () => {
  let state = {};
  const { indexTextStep } = isolated('lib/rag/ingest.ts', {
    'firebase-admin/firestore': { FieldValue: {} },
    '@/lib/ai/gemini': {}, '@/lib/materials/pdf': {},
    '@/lib/storage-gcs': { downloadGcsObject: async () => ({ buffer: Buffer.alloc(0) }) },
    '@/lib/rag/server': { INDEX_VERSION: 1, indexChunks: () => { throw new Error('No embeddings for empty OCR'); } },
  });
  const ref = { get: async () => ({ data: () => state }), set: async data => { state = { ...state, ...data }; } };
  const result = await indexTextStep({ uid: 'u', projectId: 'p', materialId: 'photo', textPath, ref, budgetMs: 100 });
  assert.deepEqual(result, { done: true, chunks: 0, total: 0, textChars: 0 });
  assert.equal(state.index.status, 'ready');
});

test('a public chat projects the retained image basename, keeping the original name only as metadata', async () => {
  const shareId = 's'.repeat(32);
  const docs = new Map([
    ['projects/p', { userId: 'u', title: 'Project' }],
    ['projects/p/chats/main', { userId: 'u' }],
    ['projects/p/materials/photo', { type: 'image', storagePath, textPath, originalName: 'camera.png', originalMime: 'image/png', storedMime: 'image/webp', hasImages: true, images: [{ page: 1, path: storagePath, mime: 'image/webp' }] }],
  ]);
  const reference = key => ({
    get: async () => ({ exists: docs.has(key), id: key.split('/').at(-1), data: () => docs.get(key) }),
    doc: id => reference(`${key}/${id}`),
    collection: name => name === 'messages' ? { get: async () => ({ docs: [{ id: 'message', data: () => ({ role: 'user', content: 'Describe this photo', attachments: [{ materialId: 'photo', type: 'image', title: 'camera.png' }] }) }] }) } : reference(`${key}/${name}`),
  });
  const query = { where: () => query, limit: () => query, get: async () => ({ docs: [{ id: 'chat', data: () => ({ userId: 'u', projectId: 'p', nestedId: 'main', public: true, shareId }) }] }) };
  const { loadSharedChat } = isolated('lib/sharing/server.ts', {
    'server-only': {}, '@/lib/notes/compat': {},
    '@/lib/server/firestore-admin': { getAdminFirestore: () => ({ collection: name => name === 'chats' ? query : reference(name) }) },
  });
  const result = await loadSharedChat(shareId);
  assert.equal(result.materials[0].storagePath, 'compressed.webp');
  assert.equal(result.materials[0].originalName, 'camera.png');
  assert.equal(result.materials[0].storedMime, 'image/webp');
  assert.equal(result.messages[0].attachments[0].materialId, 'photo');
});
