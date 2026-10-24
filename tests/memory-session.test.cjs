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
const privacy = { containsSensitiveMemory: () => false, isWorkNoteRequest: () => false };

test('completed answers do not create project maps or inferred personal profiles', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const observed = [];
  const { createMemorySession } = load('lib/memory/session.ts', {
    '@/lib/memory/client': { syncUserMemories: () => new Promise(() => {}) },
    '@/lib/memory/profile': { cachedLearningProfile: () => '' },
    '@/lib/adaptation/client': { observeConversation: async value => observed.push(value) },
    '@/lib/memory/privacy': privacy,
  });
  const session = createMemorySession(input);
  session.observe({ turnId: 'turn', answer: 'Answer' });
  assert.equal(observed.length, 0);
  t.mock.timers.tick(1500);
  await settle();
  assert.equal(observed.length, 0);
});

test('guest sessions skip both memory paths', async () => {
  const { createMemorySession } = load('lib/memory/session.ts', {
    '@/lib/memory/client': { syncUserMemories: () => assert.fail('guest memory update') },
    '@/lib/memory/profile': { cachedLearningProfile: () => assert.fail('guest cache') },
    '@/lib/adaptation/client': { observeConversation: () => assert.fail('guest observation') },
    '@/lib/memory/privacy': privacy,
  });
  const session = createMemorySession({ ...input, skip: true });
  assert.equal(await session.updates, false);
  session.observe({ turnId: 'turn', answer: 'Answer' });
  await settle();
});

test('authoritative deletion clears legacy preference caches without writing them back', async () => {
  const originalWindow = global.window;
  let storageListener;
  global.window = { addEventListener: (name, listener) => { if (name === 'storage') storageListener = listener; }, localStorage: { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Quota'); }, removeItem() { throw new Error('Blocked'); } } };
  try {
    const profile = load('lib/memory/profile.ts', {
      'firebase/firestore': { doc: () => ({}), deleteDoc: async () => {}, getDoc: async () => ({ exists: () => false }) },
      '@/lib/firestore': { COLLECTIONS: { users: 'users', profile: 'profile' }, omitUndefined: value => value },
      '@/lib/firebase': { getFirebaseDb: () => ({}) },
      '@/lib/memory/normalize': { sanitizePersonalization: value => typeof value === 'string' ? value.trim() : '' },
      '@/lib/api/client': { authHeaders: async () => ({}) },
    });
    assert.equal(profile.cachedLearningProfile('u', 'Loaded preference'), 'Loaded preference');
    storageListener({ key: 'tobyverse.learning.u', newValue: 'Updated preference' });
    assert.equal(profile.cachedLearningProfile('u', 'Loaded preference'), 'Updated preference');
    // No Settings subscription is mounted: another tab's removal still invalidates chat's cache.
    storageListener({ key: 'tobyverse.learning.u', newValue: null });
    assert.equal(profile.cachedLearningProfile('u', 'Loaded preference'), '');
    storageListener({ key: 'tobyverse.learning.u', newValue: 'Another preference' });
    assert.equal(await profile.getLearningProfile('u'), '');
    assert.equal(profile.cachedLearningProfile('u', 'Loaded preference'), '');
    await profile.deleteLearningProfile('u');
    assert.equal(profile.cachedLearningProfile('u', 'Loaded preference'), '');
    storageListener({ key: 'tobyverse.learning.u', newValue: 'Preference before storage clear' });
    storageListener({ key: null, newValue: null });
    assert.equal(profile.cachedLearningProfile('u', 'Loaded preference'), '');
  } finally {
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
  }
});
