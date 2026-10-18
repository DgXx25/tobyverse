/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args); };
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

// Only the external storage boundary is replaced; the real reservation, merge,
// ownership, revision, context-selection and control code executes in these tests.
const documents = new Map();
const delayedReads = new Map();
let queue = Promise.resolve();
const snapshot = key => { const value = structuredClone(documents.get(key)); return { exists: documents.has(key), data: () => value }; };
function reference(key) {
  return { key, collection: name => reference(`${key}/${name}`), doc: name => reference(`${key}/${name}`), get: async () => {
    if (key.includes('broken')) throw new Error('Storage unavailable');
    if (delayedReads.has(key)) {
      const delay = delayedReads.get(key); delayedReads.delete(key);
      const old = snapshot(key);
      return new Promise(resolve => { delay.release = () => resolve(old); });
    }
    return snapshot(key);
  } };
}
const db = {
  collection: name => reference(name),
  runTransaction(fn) {
    const run = queue.then(async () => {
      const writes = [];
      const result = await fn({ get: ref => ref.get(), set: (ref, data) => writes.push(() => documents.set(ref.key, structuredClone(data))), delete: ref => writes.push(() => documents.delete(ref.key)) });
      writes.forEach(write => write());
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  },
};
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === '@/lib/server/firestore-admin') return { getAdminFirestore: () => db };
  return originalLoad.call(this, name, parent, isMain);
};
const api = require('../lib/adaptation/server.ts');

test('concurrent identical batches reserve one paid observation', async () => {
  const reservations = await Promise.all([api.reserveObservation('concurrent', 'same-batch'), api.reserveObservation('concurrent', 'same-batch')]);
  assert.equal(reservations.filter(Boolean).length, 1);
  assert.equal(documents.get('users/concurrent/profile/adaptation').dailyRuns, 1);
});

test('pause and clear invalidate a generation already in flight', async () => {
  documents.set('projects/p', { userId: 'controls' });
  const reserved = await api.reserveObservation('controls', 'batch');
  await api.controlAdaptiveState('controls', { enabled: false, clear: true, projectId: 'p', clearGraph: true });
  const saved = await api.saveObservation('controls', 'p', reserved.revision, { patterns: [], topics: [{ key: 'topic', label: 'Topic', summary: 'An old in-flight update', status: 'explored', evidence: ['u'] }], links: [] }, [{ id: 'u', content: 'Explain how this mechanism works.' }]);
  assert.equal(saved, false);
  assert.equal(documents.has('users/controls/knowledgeMaps/p'), false);
  assert.equal((await api.readAdaptiveState('controls')).enabled, false);
});

test('the owner guard rejects another account and missing projects', async () => {
  documents.set('projects/owned', { userId: 'owner' });
  await api.requireOwnedProject('owner', 'owned');
  await assert.rejects(api.requireOwnedProject('other', 'owned'), /Project not found/);
  await assert.rejects(api.requireOwnedProject('owner', 'missing'), /Project not found/);
  await assert.rejects(api.requireOwnedProject('owner', '../owned'), /Invalid project/);
});

test('private maps and patterns are saved together and supplied to the next relevant chat', async () => {
  documents.set('projects/work', { userId: 'working' });
  const state = await api.reserveObservation('working', 'work-batch');
  const patch = { patterns: [{ key: 'compare', scope: 'project', when: 'Comparing investment options', observation: 'Tests the choice with concrete numbers', approach: 'Use a small numerical comparison', evidence: ['a', 'b'] }], topics: [{ key: 'investment', label: 'Investment', summary: 'Cost of capital changes decisions', status: 'developing', evidence: ['a'] }], links: [] };
  assert.equal(await api.saveObservation('working', 'work', state.revision, patch, [{ id: 'a', content: 'Why would investment fall?' }, { id: 'b', content: 'Then a 15% deposit beats a 12% investment.' }]), true);
  assert.match(await api.adaptiveContextForChat('working', 'work', 'Compare investment options'), /numerical comparison/);
  assert.equal(await api.adaptiveContextForChat('different-account', 'work', 'Compare investment options'), undefined);
  assert.equal(await api.adaptiveContextForChat('working', 'unrelated', 'Write an invitation'), undefined);
});

test('failed optional storage leaves the original chat prompt usable', async () => {
  assert.equal(await api.adaptiveContextForChat('broken-user', 'p', 'What is inflation?'), undefined);
});

test('a slow pre-pause read cannot resurrect observations in later reads', async () => {
  documents.set('users/racing/profile/adaptation', { enabled: true, revision: 0, patterns: [] });
  documents.set('users/racing/knowledgeMaps/p', { nodes: [{ key: 'old', label: 'Old topic', summary: 'Before clear', status: 'explored', support: ['a'], updatedAt: Date.now() }], links: [] });
  const profileDelay = {}, graphDelay = {};
  delayedReads.set('users/racing/profile/adaptation', profileDelay);
  delayedReads.set('users/racing/knowledgeMaps/p', graphDelay);
  const oldProfile = api.readAdaptiveState('racing');
  const oldGraph = api.readKnowledgeGraph('racing', 'p');
  await api.controlAdaptiveState('racing', { enabled: false, clear: true, projectId: 'p', clearGraph: true });
  profileDelay.release(); graphDelay.release();
  await Promise.all([oldProfile, oldGraph]);
  assert.equal((await api.readAdaptiveState('racing')).enabled, false);
  assert.deepEqual((await api.readKnowledgeGraph('racing', 'p')).nodes, []);
});
