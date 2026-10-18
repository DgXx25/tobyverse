/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(relative, dependencies) {
  const filename = path.resolve(__dirname, '..', relative);
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.require = name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
    return dependencies[name];
  };
  instance._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return instance.exports;
}
const input = { userId: 'u', projectId: 'p', threadId: 't', prompt: 'Explain this idea.', memories: [], personalization: 'Use concrete examples.' };
const settle = () => new Promise(resolve => setImmediate(resolve));

test('observation proceeds when direct memory storage stalls', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const observed = [];
  const { createMemorySession } = load('lib/memory/session.ts', {
    '@/lib/memory/client': { syncUserMemories: () => new Promise(() => {}) },
    '@/lib/memory/profile': { cachedLearningProfile: () => '' },
    '@/lib/adaptation/client': { observeConversation: async value => observed.push(value) },
  });
  const session = createMemorySession(input);
  session.observe({ turnId: 'turn', answer: 'Answer' });
  assert.equal(observed.length, 0);
  t.mock.timers.tick(1500);
  await settle();
  assert.equal(observed.length, 1);
  assert.equal(observed[0].personalization, input.personalization);
});

test('guest sessions skip both memory paths', async () => {
  const { createMemorySession } = load('lib/memory/session.ts', {
    '@/lib/memory/client': { syncUserMemories: () => assert.fail('guest memory update') },
    '@/lib/memory/profile': { cachedLearningProfile: () => assert.fail('guest cache') },
    '@/lib/adaptation/client': { observeConversation: () => assert.fail('guest observation') },
  });
  const session = createMemorySession({ ...input, skip: true });
  assert.equal(await session.updates, false);
  session.observe({ turnId: 'turn', answer: 'Answer' });
  await settle();
});

test('shared preferences remain usable without local storage and deletion stays empty', async () => {
  const originalWindow = global.window;
  let storageListener;
  global.window = { addEventListener: (name, listener) => { if (name === 'storage') storageListener = listener; }, localStorage: { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Quota'); }, removeItem() { throw new Error('Blocked'); } } };
  try {
    const profile = load('lib/memory/profile.ts', {
      'firebase/firestore': { doc: () => ({}), deleteDoc: async () => {}, setDoc: async () => {}, serverTimestamp: () => 0 },
      '@/lib/firestore': { COLLECTIONS: { users: 'users', profile: 'profile' }, omitUndefined: value => value },
      '@/lib/firebase': { getFirebaseDb: () => ({}) },
      '@/lib/memory/normalize': { sanitizePersonalization: value => typeof value === 'string' ? value.trim() : '' },
    });
    assert.equal(profile.cachedLearningProfile('u', 'Loaded preference'), 'Loaded preference');
    await profile.setLearningProfile('u', 'Updated preference');
    assert.equal(profile.cachedLearningProfile('u', 'Loaded preference'), 'Updated preference');
    // No Settings subscription is mounted: another tab's removal still invalidates chat's cache.
    storageListener({ key: 'tobyverse.learning.u', newValue: null });
    assert.equal(profile.cachedLearningProfile('u', 'Loaded preference'), '');
    await profile.setLearningProfile('u', 'Another preference');
    await profile.deleteLearningProfile('u');
    assert.equal(profile.cachedLearningProfile('u', 'Loaded preference'), '');
    await profile.setLearningProfile('u', 'Preference before storage clear');
    storageListener({ key: null, newValue: null });
    assert.equal(profile.cachedLearningProfile('u', 'Loaded preference'), '');
  } finally {
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
  }
});
