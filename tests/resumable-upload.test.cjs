/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { sendUploadChunks, UPLOAD_CHUNK_BYTES } = require('../lib/materials/resumable-upload.ts');

test('a 50 MiB file uses bounded chunks and preserves every byte', async () => {
  const blob = new Blob([new Uint8Array(50 * 1024 * 1024).fill(23)]);
  let received = 0;
  await sendUploadChunks(blob, async (chunk, offset) => {
    assert.equal(offset, received);
    assert.ok(chunk.size <= UPLOAD_CHUNK_BYTES);
    assert.equal(new Uint8Array(await chunk.arrayBuffer()).at(-1), 23);
    received += chunk.size;
    return { offset: received, done: received === blob.size };
  }, async () => { throw new Error('unexpected retry'); });
  assert.equal(received, blob.size);
});

test('a lost response resumes from committed bytes including a completed final chunk', async () => {
  const blob = new Blob([new Uint8Array(UPLOAD_CHUNK_BYTES + 100)]);
  let received = 0;
  const starts = [];
  await sendUploadChunks(blob, async (chunk, offset) => {
    starts.push(offset);
    received += chunk.size;
    throw new Error('response lost after commit');
  }, async () => ({ offset: received, done: received === blob.size }));
  assert.deepEqual(starts, [0, UPLOAD_CHUNK_BYTES]);
});

test('invalid progress fails rather than looping or skipping data', async () => {
  await assert.rejects(sendUploadChunks(new Blob(['abc']), async () => ({ offset: 0, done: false }), async () => ({ offset: 0, done: false })), /Invalid upload progress/);
});

test('an interrupted chunk resumes from an unaligned persisted byte offset', async () => {
  const blob = new Blob([new Uint8Array(UPLOAD_CHUNK_BYTES + 100)]);
  const starts = [];
  let first = true;
  await sendUploadChunks(blob, async (chunk, offset) => {
    starts.push(offset);
    if (first) { first = false; throw new Error('only 43 bytes persisted'); }
    return { offset: offset + chunk.size, done: offset + chunk.size === blob.size };
  }, async () => ({ offset: 43, done: false }));
  assert.deepEqual(starts, [0, 43, 43 + UPLOAD_CHUNK_BYTES]);
});

test('a temporary outage affecting both the chunk and first status probe recovers', async () => {
  let sends = 0;
  let probes = 0;
  await sendUploadChunks(new Blob(['abc']), async () => {
    sends += 1;
    throw new Error('lost response');
  }, async () => {
    probes += 1;
    if (probes === 1) throw new Error('still offline');
    return { offset: 3, done: true };
  });
  assert.equal(sends, 1);
  assert.equal(probes, 2);
});
