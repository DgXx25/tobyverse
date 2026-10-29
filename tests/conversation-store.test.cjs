const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), resolve = Module._resolveFilename, load = Module._load;
let database;
Module._resolveFilename = function(name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args); };
Module._load = function(name, ...args) {
  if (name === '@/lib/server/firestore-admin') return { getAdminFirestore: () => database };
  return load.call(this, name, ...args);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { openConversation } = require('../lib/chat/conversation-store.ts');

// A small in-memory repository double exercises real scope, cursor, summary
// threshold and lease logic; model output is the one external dependency.
function fixture() {
  const data = new Map([['projects/P', { userId: 'owner' }], ['projects/P/chats/main', { historyRevision: 0 }]]);
  for (let i = 0; i < 60; i++) data.set(`projects/P/chats/main/messages/m${i}`, {
    role: i % 2 ? 'assistant' : 'user', content: i === 2 ? `Project identifier ORION-731 ${'a'.repeat(900)}` : `message-${i} ${'x'.repeat(990)}`,
    createdAt: `2026-10-29T10:${String(i).padStart(2, '0')}:00Z`,
  });
  class Ref {
    constructor(p) { this.path = p; this.id = p.split('/').at(-1); }
    collection(name) { return new Query(`${this.path}/${name}`); }
    async get() { const value = data.get(this.path); return { id: this.id, ref: this, exists: value !== undefined, data: () => value && structuredClone(value), get: k => value?.[k] }; }
  }
  class Query {
    constructor(p, opts = {}) { this.path = p; this.opts = opts; }
    doc(id) { return new Ref(`${this.path}/${id}`); }
    next(opts) { return new Query(this.path, { ...this.opts, ...opts }); }
    orderBy(_, direction = 'asc') { return this.next({ direction }); }
    startAfter(doc) { return this.next({ start: doc, inclusive: false }); }
    startAt(doc) { return this.next({ start: doc, inclusive: true }); }
    endBefore(doc) { return this.next({ end: doc }); }
    limit(n) { return this.next({ limit: n }); }
    async get() {
      let rows = [...data].filter(([key]) => key.startsWith(`${this.path}/`) && key.split('/').length === this.path.split('/').length + 1)
        .sort((a,b) => a[1].createdAt.localeCompare(b[1].createdAt));
      if (this.opts.direction === 'desc') rows.reverse();
      if (this.opts.start) {
        const index = rows.findIndex(([p]) => p === this.opts.start.ref.path);
        rows = rows.slice(index + (this.opts.inclusive ? 0 : 1));
      }
      if (this.opts.end) rows = rows.slice(0, rows.findIndex(([p]) => p === this.opts.end.ref.path));
      rows = rows.slice(0, this.opts.limit ?? rows.length);
      const docs = await Promise.all(rows.map(([p]) => new Ref(p).get()));
      return { docs, empty: !docs.length, size: docs.length };
    }
  }
  database = {
    collection: p => new Query(p),
    async runTransaction(fn) {
      const writes = [];
      const result = await fn({ get: ref => ref.get(), set: (ref, value, opts) => writes.push(() => data.set(ref.path, opts?.merge ? { ...data.get(ref.path), ...value } : value)),
        update: (ref, value) => writes.push(() => data.set(ref.path, { ...data.get(ref.path), ...value })) });
      writes.forEach(write => write());
      return result;
    },
  };
  return data;
}

test('the server never opens another owner or an invalid project/thread path', async () => {
  fixture();
  assert.equal(await openConversation({ uid: 'other', projectId: 'P', threadId: 'main', beforeId: 'm59' }), null);
  assert.equal(await openConversation({ uid: 'owner', projectId: '../P', threadId: 'main', beforeId: 'm59' }), null);
  assert.equal(await openConversation({ uid: 'owner', projectId: 'P', threadId: 'missing', beforeId: 'm59' }), null);
});

test('a backwards retry cannot see future turns; original old messages remain retrievable', async () => {
  fixture();
  const context = await openConversation({ uid: 'owner', projectId: 'P', threadId: 'main', beforeId: 'm35' });
  assert.ok(context.recent.every(row => Number(row.id.slice(1)) < 35));
  const result = await context.search('ORION-731');
  assert.ok(result.messages.some(row => row.content.includes('ORION-731')));
  assert.deepEqual((await context.search('anything', 'm50')).messages, []);
});

test('background compaction advances a bounded checkpoint and history edits invalidate it', async () => {
  const data = fixture();
  let calls = 0;
  const context = await openConversation({ uid: 'owner', projectId: 'P', threadId: 'main', beforeId: 'm59' });
  await context.refresh(async prompt => { calls++; assert.ok(prompt.length < 28000); return 'Project identifier ORION-731.'; });
  assert.equal(calls, 1);
  const state = data.get('projects/P/chats/main/contextState/summary');
  assert.equal(state.leaseUntil, 0);
  assert.ok(Number(state.throughId.slice(1)) < Number(context.recent[0].id.slice(1)));
  const next = await openConversation({ uid: 'owner', projectId: 'P', threadId: 'main', beforeId: 'm59' });
  assert.match(next.summary, /ORION-731/);
  data.set('projects/P/chats/main', { historyRevision: 1 });
  const edited = await openConversation({ uid: 'owner', projectId: 'P', threadId: 'main', beforeId: 'm59' });
  assert.equal(edited.summary, '');
  await next.refresh(async () => { calls++; return 'stale'; });
  assert.equal(calls, 1);
});

test('a failed summary releases its lease and retains the original history', async () => {
  const data = fixture(), original = structuredClone(data.get('projects/P/chats/main/messages/m2'));
  const context = await openConversation({ uid: 'owner', projectId: 'P', threadId: 'main', beforeId: 'm59' });
  await assert.rejects(context.refresh(async () => { throw new Error('provider unavailable'); }));
  assert.equal(data.get('projects/P/chats/main/contextState/summary').leaseUntil, 0);
  assert.deepEqual(data.get('projects/P/chats/main/messages/m2'), original);
});
