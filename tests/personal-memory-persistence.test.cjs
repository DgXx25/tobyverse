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
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);

function setup(initial = {}, plan = 'free_beta') {
  const records = new Map(Object.entries(initial));
  let nextId = 0;
  const ref = (key, collection = false) => ({ path: key, id: key.split('/').at(-1), doc: id => ref(key + '/' + (id ?? `new-${++nextId}`)), collection: name => ref(key + '/' + name, true), isCollection: collection });
  const db = {
    collection: name => ref(name, true),
    async runTransaction(callback) {
      const writes = [];
      const snapshot = key => ({ id: key.split('/').at(-1), ref: ref(key), exists: records.has(key), data: () => records.get(key) });
      const tx = {
        get: async target => target.isCollection ? { docs: [...records.keys()].filter(key => key.startsWith(target.path + '/') && key.slice(target.path.length + 1).indexOf('/') < 0).map(snapshot), get size() { return this.docs.length; } } : snapshot(target.path),
        set: (target, value) => writes.push(['set', target.path, value]),
        create: (target, value) => writes.push(['set', target.path, value]),
        delete: target => writes.push(['delete', target.path]),
      };
      const result = await callback(tx);
      for (const [kind, key, value] of writes) { if (kind === 'delete') records.delete(key); else records.set(key, value); }
      return result;
    },
  };
  class AuthError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const overrides = {
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => '2026-10-25T00:00:00.000Z' } },
    '@/lib/server/firestore-admin': { getAdminFirestore: () => db },
    '@/lib/billing/account-server': { readAccountAccess: async () => ({ plan }) },
    '@/lib/api/assert': { AuthError },
  };
  const filename = path.join(root, 'lib/memory/personal-server.ts');
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.require = name => Object.hasOwn(overrides, name) ? overrides[name] : require(name);
  instance._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return { records, ...instance.exports };
}

test('manual deletion invalidates an extraction already in flight and leaves other accounts alone', async () => {
  const api = setup({ 'users/a/memories/one': { content: 'Works as a cameraman.' }, 'users/b/memories/one': { content: 'Studies economics.' } });
  const before = await api.memoryStatus('a');
  await api.replacePersonalMemory('a', '', before.revision);
  const late = await api.persistMemoryChanges({ uid: 'a', expectedRevision: before.revision, operations: [{ op: 'add', content: 'Works as a cameraman.' }] });
  assert.equal(late.stale, true);
  assert.equal((await api.memoryStatus('a')).summary, '');
  assert.equal(api.records.has('users/b/memories/one'), true);
  await assert.rejects(api.replacePersonalMemory('a', '- Studies economics.', before.revision), error => error.status === 409);
});

test('full and downgraded quotas allow edits and deletion without allowing growth', async () => {
  const data = Object.fromEntries(Array.from({ length: 42 }, (_, i) => [`users/a/memories/m${i}`, { content: `Studies subject ${i}.` }]));
  const api = setup(data);
  const result = await api.persistMemoryChanges({ uid: 'a', operations: [{ op: 'add', content: 'Speaks Georgian.' }] });
  assert.equal(result.savedFacts, false);
  const current = await api.memoryStatus('a');
  await assert.rejects(api.replacePersonalMemory('a', current.summary + '\n- Speaks Georgian.', current.revision), error => error.status === 403);
  const edited = await api.replacePersonalMemory('a', current.summary.replace('Studies subject 0.', 'Studies physics.'), current.revision);
  assert.equal(edited.usage.savedFacts, 42);
  assert.match(edited.summary, /Studies physics/);
  assert.equal((await api.replacePersonalMemory('a', '', edited.revision)).usage.savedFacts, 0);
});

test('legacy preferences remain reviewable and migrate into the single fact store on edit', async () => {
  const api = setup({ 'users/a/memories/one': { content: 'Works as a cameraman.', createdAt: '2026-10-24T00:00:00Z' }, 'users/a/profile/learning': { text: 'Prefers concise replies. Uses Georgian.' } });
  const before = await api.memoryStatus('a');
  assert.equal(before.usage.savedFacts, 3);
  assert.equal(before.needsReview, true);
  const after = await api.replacePersonalMemory('a', before.summary, before.revision);
  assert.equal(after.usage.savedFacts, 3);
  assert.match(after.summary, /Works as a cameraman\. \[2026-10-24\]/);
  assert.equal(api.records.has('users/a/profile/learning'), false);
  assert.equal(after.personalization, '');
  assert.equal(after.needsReview, false);
});
