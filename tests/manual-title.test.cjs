/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const records = new Map();
let beforeCommit;
const snapshot = (ref) => ({ id: ref.split('/').at(-1), exists: () => records.has(ref), data: () => records.get(ref) });
const write = (ref, data, options) => records.set(ref, options?.merge ? { ...records.get(ref), ...data } : data);
const firestore = {
  collection: (...parts) => parts.filter((part) => part !== 'db').join('/'),
  doc: (...parts) => parts.filter((part) => part !== 'db').join('/'),
  getDoc: async (ref) => snapshot(ref),
  setDoc: async (ref, data, options) => write(ref, data, options),
  updateDoc: async (ref, data) => write(ref, data, { merge: true }),
  serverTimestamp: () => 'now',
  runTransaction: async (_db, callback) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const reads = new Map();
      const writes = [];
      const result = await callback({
        get: async (ref) => { reads.set(ref, JSON.stringify(records.get(ref))); return snapshot(ref); },
        set: (ref, data, options) => writes.push(() => write(ref, data, options)),
        update: (ref, data) => writes.push(() => write(ref, data, { merge: true })),
      });
      const interfere = beforeCommit;
      beforeCommit = undefined;
      await interfere?.();
      if ([...reads].some(([ref, value]) => JSON.stringify(records.get(ref)) !== value)) continue;
      writes.forEach((commit) => commit());
      return result;
    }
    throw new Error('Transaction failed to settle');
  },
};
const stubs = {
  'firebase/firestore': firestore,
  '@/lib/firebase': { getFirebaseDb: () => 'db' },
  '@/lib/firestore': { COLLECTIONS: { projects: 'projects', chats: 'chats' }, omitUndefined: (data) => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) },
  '@/lib/api/client': { authHeaders: async () => ({}) },
  '@/lib/core/constants': { DEFAULT_CHAT_THREAD_ID: 'main', DEFAULT_PROJECT_GOAL: 'understand_topic' },
  '@/lib/core/chat-modes': { asChatMode: (value) => value || 'auto', preferredChatModeForGoal: () => 'auto' },
  '@/lib/core/recipes': { recipeForGoal: () => ({}) },
  '@/lib/memory/project': { asProjectMemory: () => [] },
  '@/lib/timestamps': { asString: (value, fallback = '') => typeof value === 'string' ? value : fallback, toIsoDate: () => null },
  '@/lib/workspace/draft-notebook': { clearUntouchedNotebook: () => {} },
  '@/types': { PROJECT_GOALS: ['understand_topic'] },
};
const actualModules = new Set(['@/lib/chats', '@/lib/projects', '@/lib/workspace/auto-title', '@/lib/workspace/title', '@/lib/workspace/routes']);
const load = Module._load;
Module._load = function (request, parent, ...rest) {
  if (stubs[request]) return stubs[request];
  if (request.startsWith('@/')) {
    if (!actualModules.has(request)) return {};
    request = path.join(root, request.slice(2));
  }
  return load.call(this, request, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { autoNameChat } = require('../lib/workspace/auto-title.ts');
const { updateProjectTitle } = require('../lib/projects.ts');
const { updateChatTitle } = require('../lib/chats.ts');
const input = { projectId: 'p', threadId: 'main', userId: 'u', currentTitle: 'Untitled notebook', prompt: 'Explain photosynthesis' };
function reset({ listed = false, nested = false } = {}) {
  records.clear();
  beforeCommit = undefined;
  records.set('projects/p', { userId: 'u', title: 'Untitled notebook', listed });
  records.set(`projects/p/chats/${nested ? 'nested' : 'main'}`, { userId: 'u', title: 'New chat' });
  records.set(`chats/${nested ? 'nested' : 'p'}`, { userId: 'u', title: 'New chat' });
  global.fetch = async () => ({ json: async () => ({ title: 'Photosynthesis basics' }) });
}

test('a project name set before the first prompt survives automatic naming, including long names and placeholders', async () => {
  for (const title of ['My detailed notebook name with more than seven words for biology', 'Untitled notebook']) {
    reset();
    await updateProjectTitle('p', 'u', title);
    assert.equal(await autoNameChat(input), null);
    assert.equal(records.get('projects/p').title, title);
    assert.equal(records.get('chats/p').title, 'New chat');
  }
});

test('a project rename while title generation is pending wins over its stale response', async () => {
  reset();
  let resolveResponse;
  global.fetch = () => new Promise((resolve) => { resolveResponse = resolve; });
  const pending = autoNameChat(input);
  await Promise.resolve();
  await updateProjectTitle('p', 'u', 'My biology notebook');
  resolveResponse({ json: async () => ({ title: 'Photosynthesis basics' }) });
  assert.equal(await pending, null);
  assert.equal(records.get('projects/p').title, 'My biology notebook');
  assert.equal(records.get('projects/p/chats/main').title, 'New chat');
});

test('a manual rename that conflicts with the automatic transaction survives its retry', async () => {
  reset();
  beforeCommit = () => updateProjectTitle('p', 'u', 'Untitled notebook');
  assert.equal(await autoNameChat(input), null);
  assert.equal(records.get('projects/p').title, 'Untitled notebook');
  assert.equal(records.get('projects/p/chats/main').title, 'New chat');
  assert.equal(records.get('chats/p').title, 'New chat');
});

test('a nested thread rename while generation is pending protects both thread and chat index', async () => {
  reset({ nested: true });
  let resolveResponse;
  global.fetch = () => new Promise((resolve) => { resolveResponse = resolve; });
  const pending = autoNameChat({ ...input, threadId: 'nested', currentTitle: 'New chat' });
  await Promise.resolve();
  await updateChatTitle('p', 'nested', 'New chat');
  resolveResponse({ json: async () => ({ title: 'Photosynthesis basics' }) });
  assert.equal(await pending, null);
  assert.equal(records.get('projects/p/chats/nested').title, 'New chat');
  assert.equal(records.get('chats/nested').title, 'New chat');
});

test('untouched notebooks still receive a generated title', async () => {
  reset();
  assert.equal(await autoNameChat(input), 'Photosynthesis basics');
  assert.equal(records.get('projects/p').title, 'Photosynthesis basics');
  assert.equal(records.get('projects/p/chats/main').title, 'Photosynthesis basics');
  assert.equal(records.get('chats/p').title, 'Photosynthesis basics');
});

test('nested and listed project threads name themselves without renaming their notebook', async () => {
  for (const options of [{ nested: true }, { listed: true }]) {
    reset(options);
    await updateProjectTitle('p', 'u', 'Biology notebook');
    const threadId = options.nested ? 'nested' : 'main';
    assert.equal(await autoNameChat({ ...input, threadId, currentTitle: 'New chat', listedProject: options.listed }), 'Photosynthesis basics');
    assert.equal(records.get('projects/p').title, 'Biology notebook');
    assert.equal(records.get(`projects/p/chats/${threadId}`).title, 'Photosynthesis basics');
    assert.equal(records.get(`chats/${options.nested ? 'nested' : 'p'}`).title, 'Photosynthesis basics');
  }
});
