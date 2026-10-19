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
function isolated(relativePath, mocks) {
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
const imagePath = 'users/alice/projects/project/materials/chat-image-123/problem.jpg';
const photo = { title: 'problem.heic', type: 'image', storagePath: imagePath, sizeBytes: 250 };

function composerUploads() {
  const materialDocs = [];
  const blobs = [];
  const api = isolated('lib/composer/attach-client.ts', {
    '@/lib/auth': { requireSignedInUser: async () => ({ uid: 'alice' }) },
    '@/lib/api/client': { authHeaders: async () => ({ Authorization: 'Bearer alice' }) },
    '@/lib/workspace/draft-notebook': { clearUntouchedNotebook: () => {} },
    '@/lib/materials/ingest-client': { ingestMaterialFile: async ({ file }) => { materialDocs.push(file.name); return 'document-id'; } },
    '@/lib/materials/store': { getMaterial: async () => ({ storagePath: imagePath, sizeBytes: 250 }) },
    '@/lib/materials/storage': {
      originalStoragePath: (uid, project, id, name) => `users/${uid}/projects/${project}/materials/${id}/${name}`,
      uploadMaterialBytes: async (storagePath, file, _mime, options) => {
        assert.equal(options.reservePool, true, 'chat blobs still count against the storage quota');
        blobs.push({ storagePath, name: file.name });
        return { path: imagePath, contentType: 'image/jpeg', sizeBytes: 250, reservedBytes: 250 };
      },
    },
  });
  return { api, materialDocs, blobs };
}

test('composer photos refer to the single saved image source with OCR and quota accounting', async () => {
  const { api, materialDocs, blobs } = composerUploads();
  const file = new File(['heic image'], 'problem.heic', { type: 'image/heic' });
  const result = await api.ingestComposerFile({ projectId: 'project', userId: 'ignored-client-id', file });
  assert.deepEqual(result, { ...photo, materialId: 'document-id' }, 'preserve the normalized path and reference the saved source for sharing');
  assert.deepEqual(materialDocs, ['problem.heic']);
  assert.equal(blobs.length, 0, 'never upload a duplicate standalone original');
});

test('composer documents retain normal source ingestion, including files whose names mention photos', async () => {
  const { api, materialDocs, blobs } = composerUploads();
  for (const name of ['photo-analysis.pdf', 'notes.docx', 'table.xlsx', 'lesson.txt']) {
    const result = await api.ingestComposerFile({ projectId: 'project', userId: 'alice', file: new File(['document'], name) });
    assert.equal(result, 'document-id');
  }
  assert.deepEqual(materialDocs, ['photo-analysis.pdf', 'notes.docx', 'table.xlsx', 'lesson.txt']);
  assert.equal(blobs.length, 0);
});

test('attachment snapshots preserve standalone photo paths and sizes through JSON persistence', () => {
  const { snapshotChatAttachments, compactChatAttachment } = require('../lib/composer/attach.ts');
  const snapshot = snapshotChatAttachments([{ ...photo, size: 250, status: 'ready' }], []);
  const stored = JSON.parse(JSON.stringify(snapshot));
  assert.deepEqual(stored, [photo]);
  assert.deepEqual(compactChatAttachment(stored[0]), photo);
  assert.equal(compactChatAttachment({ title: 'x', sizeBytes: -1 }).sizeBytes, undefined);
});

test('explicit chat photos reach vision without any source material and take priority over selected sources', async () => {
  const gets = [];
  const { pickChatFigures } = isolated('lib/materials/figures.ts', {
    '@/lib/materials/storage': { isMissingMaterialFile: () => false, readStorageBytes: async (storagePath) => { gets.push(storagePath); return new Uint8Array([1, 2, 3]); } },
  });
  const unrelated = { id: 'source', title: 'Other photo', type: 'image', storagePath: 'other.png', images: [{ page: 1, path: 'other.png', mime: 'image/png' }], extractedTextPreview: '' };
  for (const sources of [[], [unrelated]]) {
    const result = await pickChatFigures('ამოხსენი ფოტოზე მოცემული ამოცანა.', sources, [photo]);
    assert.deepEqual(result.figures.map(({ path, mime, data }) => ({ path, mime, data })), [{ path: imagePath, mime: 'image/jpeg', data: 'AQID' }]);
  }
  assert.deepEqual(gets, [imagePath, imagePath]);
});

test('multiple explicitly attached photos work with a short request and stay within the image limit', async () => {
  const { pickChatFigures } = isolated('lib/materials/figures.ts', {
    '@/lib/materials/storage': { isMissingMaterialFile: () => false, readStorageBytes: async () => new Uint8Array([1]) },
  });
  const photos = [1, 2, 3].map((id) => ({ title: `${id}.png`, type: 'image', storagePath: `users/alice/projects/project/materials/chat-image-${id}/image.png` }));
  const { figures } = await pickChatFigures('ამოხსენი', [], photos);
  assert.deepEqual(figures.map(({ path }) => path), [photos[0].storagePath, photos[1].storagePath]);
});

test('a later photo question reuses the latest image in this chat; an unrelated question does not reread it', () => {
  const { figureAttachmentsForTurn } = require('../lib/materials/figures.ts');
  const older = { ...photo, storagePath: 'older.jpg' };
  const messages = [{ role: 'user', attachments: [older] }, { role: 'user', attachments: [photo] }];
  assert.deepEqual(figureAttachmentsForTurn('იმ ფოტოს მეორე ნაბიჯი ამიხსენი', [], messages), [photo]);
  assert.deepEqual(figureAttachmentsForTurn('რა არის HTTP?', [], messages), []);
  assert.deepEqual(figureAttachmentsForTurn('Explain page 5', [], messages), [], 'a PDF page request must not be replaced by an old chat photo');
  assert.deepEqual(figureAttachmentsForTurn('ამოხსენი', [older], messages), [older]);
});

test('new-chat photos keep their saved source reference through the opening handoff without duplicate ingestion', async () => {
  const session = new Map();
  const previous = global.window;
  global.window = { sessionStorage: { getItem: (key) => session.get(key) ?? null, setItem: (key, value) => session.set(key, value), removeItem: (key) => session.delete(key) }, setTimeout: () => 0 };
  try {
    const materialDocs = [];
    const savedPhoto = { ...photo, materialId: 'photo-id' };
    const { startChatInProject, takeProjectStartIngest } = isolated('lib/workspace/start-project.ts', {
      '@/lib/projects': {}, '@/lib/chats': { createChatThread: async () => 'new-thread', allocateChatMessageId: () => 'message' },
      '@/lib/auth': { requireSignedInUser: async () => ({ uid: 'alice' }) },
      '@/lib/composer/attach-client': { uploadChatImage: async () => savedPhoto },
      '@/lib/materials/ingest-client': {
        prepareMaterialIngest: async ({ source }) => { materialDocs.push(source.file.name); return { materialId: 'pdf-id' }; },
        commitMaterialText: async (item) => item.materialId, discardPreparedMaterials: async () => {},
      },
    });
    const id = await startChatInProject({ projectId: 'project', userId: 'alice', prompt: 'ამოხსენი', attachments: [
      { kind: 'file', file: new File(['image'], 'problem.png') },
      { kind: 'file', file: new File(['pdf'], 'notes.pdf') },
    ] });
    const result = await takeProjectStartIngest(id);
    assert.deepEqual(result, { materialIds: ['pdf-id'], attachments: [savedPhoto] });
    assert.deepEqual(materialDocs, ['notes.pdf']);
    const { peekPendingStart } = require('../lib/workspace/pending-start.ts');
    assert.deepEqual(peekPendingStart(id).attachments, [savedPhoto]);
    assert.deepEqual(peekPendingStart(id).materialIds, ['pdf-id']);
  } finally { global.window = previous; }
});

test('both source and chat photos keep a compressed image small enough for vision', async () => {
  const sharp = require('sharp');
  const { randomBytes } = require('node:crypto');
  const { normalizeImageUpload } = require('../lib/materials/image-normalization.ts');
  const buffer = await sharp(randomBytes(1800 * 1800 * 3), { raw: { width: 1800, height: 1800, channels: 3 } }).png().toBuffer();
  assert.ok(buffer.length > 1_500_000);
  const source = await normalizeImageUpload({ filename: 'photo.png', mime: 'image/png', buffer });
  assert.ok(source.buffer.length <= 1_500_000);
  assert.equal(source.mime, 'image/webp');
  const chat = await normalizeImageUpload({ filename: 'photo.png', mime: 'image/png', buffer, chatImage: true });
  assert.ok(chat.buffer.length <= 1_500_000, 'an accepted chat photo must not be silently skipped by vision');
  assert.equal(chat.mime, 'image/webp');
  assert.equal(chat.filename, 'photo.webp');
  assert.equal((await sharp(chat.buffer).metadata()).format, 'webp');

  const stored = new Map();
  const { POST } = isolated('app/api/materials/upload/route.ts', {
    '@/lib/api/assert': { assertAccountRequest: async () => ({ uid: 'alice' }), authErrorResponse: (error) => { throw error; } },
    '@/lib/storage-gcs': { uploadGcsObject: async (key, bytes) => stored.set(key, bytes) },
    '@/lib/server/material-storage-quota': { reserveMaterialStorage: async () => {}, releaseMaterialStorage: async () => {}, MaterialStorageQuotaError: class extends Error {} },
  });
  const form = new FormData();
  form.set('path', 'users/alice/projects/project/materials/chat-image-test/photo.png');
  form.set('file', new Blob([buffer], { type: 'image/png' }), 'photo.png');
  form.set('contentType', 'image/png');
  form.set('reservePool', 'true');
  const response = await POST(new Request('http://localhost/api/materials/upload', { method: 'POST', body: form }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(stored.get(result.path).length <= 1_500_000, 'the upload endpoint must activate chat-specific preparation');
  assert.equal(result.reservedBytes, stored.get(result.path).length);
});

test('discarding standalone photos releases their quota without deleting sources or another account files', async (t) => {
  const { api } = composerUploads();
  const stored = new Map([[imagePath, 250], ['source.jpg', 500]]);
  let used = 750;
  t.mock.method(global, 'fetch', async (_url, request) => {
    const body = JSON.parse(request.body);
    stored.delete(body.path);
    used -= body.releaseBytes;
    return Response.json({ ok: true });
  });
  await api.discardChatImage(photo);
  await api.discardChatImage({ ...photo, materialId: 'real-source', storagePath: 'source.jpg' });
  await api.discardChatImage({ ...photo, storagePath: imagePath.replace('/alice/', '/bob/') });
  assert.deepEqual([...stored], [['source.jpg', 500]]);
  assert.equal(used, 500);
});
