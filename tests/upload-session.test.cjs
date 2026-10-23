/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const docs = new Map();
let nextId = 0;
let cloudBytes = 0;
let cloudCancelled = false;
let deleted = 0;
let normalizedInputs = [];
const cap = 300 * 1024 * 1024;
const userPath = 'users/alice';

function reference(key) {
  return {
    id: key.split('/').at(-1),
    key,
    collection: (name) => ({ doc: (id = String(++nextId).padStart(20, '0')) => reference(`${key}/${name}/${id}`) }),
    get: async () => ({ exists: docs.has(key), data: () => docs.get(key) }),
    set: async (data) => docs.set(key, { ...data }),
    update: async (patch) => {
      const data = { ...docs.get(key) };
      for (const [field, value] of Object.entries(patch)) {
        if (field === 'usage.storageBytes') data.usage = { ...data.usage, storageBytes: value };
        else data[field] = value;
      }
      docs.set(key, data);
    },
  };
}
const db = {
  collection: (name) => ({ doc: (id) => reference(`${name}/${id}`) }),
  runTransaction: async (callback) => callback({ get: (ref) => ref.get(), update: (ref, patch) => ref.update(patch) }),
};
class QuotaError extends Error {
  constructor(remainingBytes) { super('Not enough storage'); this.remainingBytes = remainingBytes; this.status = 413; }
}
const mocks = {
  '@/lib/api/assert': {
    assertAccountRequest: async (req) => { if (!req.headers.get('authorization')) throw new Error('Sign in required'); return { uid: req.headers.get('authorization').replace(/^Bearer /, '') }; },
    authErrorResponse: (error) => Response.json({ error: error.message }, { status: 500 }),
  },
  '@/lib/server/firestore-admin': { getAdminFirestore: () => db },
  '@/lib/server/material-storage-quota': { MaterialStorageQuotaError: QuotaError, userStorageCap: async () => cap },
  '@/lib/account/plan': { STORAGE_CAP_BYTES: cap },
  '@/lib/auth': { requireSignedInUser: async () => ({ uid: 'alice', getIdToken: async () => 'alice' }) },
  '@/lib/firestore': { materialStoragePath: (...segments) => segments.join('/') },
  '@/lib/materials/image-normalization': {
    normalizeImageUpload: async (input) => { normalizedInputs.push(input); return { buffer: Buffer.alloc(10), filename: 'photo.jpg', mime: 'image/jpeg', converted: true }; },
  },
  '@/lib/storage-gcs': {
    startGcsResumableUpload: async () => 'https://storage.googleapis.com/private-session',
    writeGcsUploadChunk: async (_url, total, chunk) => {
      if (chunk) { assert.equal(chunk.offset, cloudBytes); cloudBytes += chunk.bytes.length; }
      return { offset: cloudBytes, done: cloudBytes === total };
    },
    cancelGcsUpload: async () => { cloudCancelled = true; },
    deleteGcsObject: async () => { deleted += 1; },
    downloadGcsObject: async () => ({ buffer: Buffer.alloc(100), contentType: 'image/heic' }),
    uploadGcsObject: async () => undefined,
  },
};
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (mocks[name]) return mocks[name];
  if (name.startsWith('@/')) name = path.join(root, name.slice(2));
  return originalLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const route = require('../app/api/materials/upload-session/route.ts');
const { sendUploadChunks } = require('../lib/materials/resumable-upload.ts');
const objectPath = 'users/alice/projects/project/materials/material/book.pdf';
const request = (method, id = '', body, extra = {}) => new Request(`http://localhost/api/materials/upload-session?id=${id}`, {
  method, headers: { authorization: 'alice', ...extra }, body,
});
async function begin(sizeBytes = 50 * 1024 * 1024, storagePath = objectPath, contentType = 'application/pdf') {
  return route.POST(request('POST', '', JSON.stringify({ path: storagePath, sizeBytes, contentType, reservePool: true })));
}
test.beforeEach(() => { docs.clear(); docs.set(userPath, { usage: { storageBytes: 1024 } }); cloudBytes = 0; cloudCancelled = false; deleted = 0; normalizedInputs = []; });

test('chunked chat photos receive vision preparation and charge the final optimized byte count', async () => {
  const chatPath = 'users/alice/projects/project/materials/chat-image-test/photo.png';
  const { id } = await (await begin(100, chatPath, 'image/png')).json();
  const response = await route.PUT(request('PUT', id, new Blob([new Uint8Array(100)]), { 'x-upload-offset': '0' }));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(normalizedInputs[0].chatImage, true);
  assert.equal(result.contentType, 'image/jpeg');
  assert.equal(result.sizeBytes, 10);
  assert.equal(docs.get(userPath).usage.storageBytes, 1034);
});

test('50 MiB passes through route in chunks; quota charges once only on completion', async () => {
  const response = await begin();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.sessionUrl, undefined);
  assert.equal(docs.get(userPath).usage.storageBytes, 1024);
  const blob = new Blob([new Uint8Array(50 * 1024 * 1024)]);
  await sendUploadChunks(blob, async (chunk, offset) => {
    const result = await route.PUT(request('PUT', body.id, chunk, { 'x-upload-offset': String(offset) }));
    assert.equal(result.status, 200);
    return result.json();
  }, async () => (await route.GET(request('GET', body.id))).json());
  assert.equal(docs.get(userPath).usage.storageBytes, 1024 + blob.size);
  await route.GET(request('GET', body.id));
  await route.GET(request('GET', body.id));
  assert.equal(docs.get(userPath).usage.storageBytes, 1024 + blob.size);
});

test('quota and ownership failures happen before any bytes upload', async () => {
  assert.equal((await begin(50, objectPath.replace('alice', 'bob'))).status, 403);
  docs.set(userPath, { usage: { storageBytes: cap - 10 } });
  assert.equal((await begin(50)).status, 413);
  assert.equal(cloudBytes, 0);
});

test('quota is rechecked at completion if another upload consumed storage', async () => {
  const { id } = await (await begin(100)).json();
  docs.set(userPath, { usage: { storageBytes: cap - 10 } });
  const response = await route.PUT(request('PUT', id, new Blob([new Uint8Array(100)]), { 'x-upload-offset': '0' }));
  assert.equal(response.status, 413);
  assert.equal(deleted, 1);
  assert.equal(docs.get(userPath).usage.storageBytes, cap - 10);
});

test('cancelled and cross-account sessions cannot be written; cancellation is quota-safe', async () => {
  const { id } = await (await begin()).json();
  const foreign = new Request(`http://localhost/api/materials/upload-session?id=${id}`, { headers: { authorization: 'bob' } });
  assert.equal((await route.GET(foreign)).status, 404);
  assert.equal((await route.DELETE(request('DELETE', id))).status, 200);
  assert.equal(cloudCancelled, true);
  assert.equal((await route.PUT(request('PUT', id, new Blob(['abc']), { 'x-upload-offset': '0' }))).status, 410);
  assert.equal(docs.get(userPath).usage.storageBytes, 1024);
});

test('oversized chunks and total-size overflow are rejected', async () => {
  const { id } = await (await begin(100)).json();
  assert.equal((await route.PUT(request('PUT', id, new Blob([new Uint8Array(101)]), { 'x-upload-offset': '0' }))).status, 413);
  assert.equal((await route.PUT(request('PUT', id, new Blob(['x']), { 'x-upload-offset': '0', 'content-length': String(9 * 1024 * 1024) }))).status, 400);
  assert.equal(cloudBytes, 0);
});

test('resume accepts an unaligned committed offset returned by cloud storage', async () => {
  const { id } = await (await begin(100)).json();
  cloudBytes = 43;
  const response = await route.PUT(request('PUT', id, new Blob([new Uint8Array(57)]), { 'x-upload-offset': '43' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).done, true);
});

test('HEIC converts after chunk staging, charges JPEG size and retains transport offset on retry', async () => {
  const { id } = await (await begin(100, objectPath.replace('book.pdf', 'photo.heic'))).json();
  const completed = await (await route.PUT(request('PUT', id, new Blob([new Uint8Array(100)]), { 'x-upload-offset': '0' }))).json();
  assert.equal(completed.offset, 100);
  assert.equal(completed.sizeBytes, 10);
  assert.equal(completed.reservedBytes, 10);
  assert.equal(completed.contentType, 'image/jpeg');
  assert.match(completed.path, /photo\.jpg$/);
  assert.equal(docs.get(userPath).usage.storageBytes, 1034);
  const retried = await (await route.GET(request('GET', id))).json();
  assert.equal(retried.offset, 100);
  assert.equal(retried.sizeBytes, 10);
  assert.equal(docs.get(userPath).usage.storageBytes, 1034);
});

test('two sessions for the same requested path own distinct objects', async () => {
  const a = await (await begin()).json();
  const b = await (await begin()).json();
  assert.notEqual(docs.get(`${userPath}/materialUploads/${a.id}`).path, docs.get(`${userPath}/materialUploads/${b.id}`).path);
});

test('large extracted text returns the actual sidecar path for persistence and indexing', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const req = new Request(`http://localhost${url}`, options);
    return route[options.method || 'GET'](req);
  };
  try {
    const { uploadExtractedText } = require('../lib/materials/storage.ts');
    const requested = objectPath.replace('book.pdf', 'extracted.txt');
    const actual = await uploadExtractedText(requested, 'x'.repeat(9 * 1024 * 1024));
    assert.notEqual(actual, requested);
    assert.match(actual, /-extracted\.txt$/);
    assert.equal(docs.get(userPath).usage.storageBytes, 1024);
  } finally { global.fetch = originalFetch; }
});

test('HEIC with a JPEG filename does not delete its converted object', async () => {
  const { id } = await (await begin(100, objectPath.replace('book.pdf', 'photo.jpg'), 'image/heic')).json();
  const result = await route.PUT(request('PUT', id, new Blob([new Uint8Array(100)]), { 'x-upload-offset': '0' }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).contentType, 'image/jpeg');
  assert.equal(deleted, 0);
});
