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
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
function isolated(relativePath, mocks) {
  const filename = path.join(root, relativePath);
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths;
  loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  return loaded.exports;
}

test('plain note requests route to notes while study notes remain educational', () => {
  const { fallbackToolAfterProvider, forcedToolForRequest } = require('../lib/chat/tool-routing.ts');
  for (const prompt of ['Jot this down: **Monday** meeting', 'Save a note with the deadline', 'ჩაინიშნე ეს: შეხვედრა ორშაბათს']) {
    assert.equal(fallbackToolAfterProvider({ prompt, mode: 'auto' }).name, 'create_note');
  }
  assert.equal(fallbackToolAfterProvider({ prompt: 'Make study notes on cells', mode: 'auto' }).name, 'create_sheet');
  assert.equal(forcedToolForRequest({ prompt: 'ჩაინიშნე ეს: შეხვედრა ორშაბათს', mode: 'auto' }).name, 'create_note');
  assert.equal(forcedToolForRequest({ prompt: 'Update that note with Tuesday', mode: 'auto', active: { kind: 'study_sheet', id: 'n', noteKind: 'note' } }).name, 'edit_note');
  for (const active of [{ kind: 'study_sheet', id: 'n', noteKind: 'study' }, { kind: 'study_sheet', id: 'n' }]) {
    assert.equal(forcedToolForRequest({ prompt: 'Update that note with Tuesday', mode: 'auto', active }).name, 'edit_sheet');
    assert.equal(fallbackToolAfterProvider({ prompt: 'Update that note with Tuesday', mode: 'auto', active }).name, 'edit_sheet');
  }
  const { acceptedToolFromSkill } = require('../lib/composer/slash.ts');
  assert.equal(acceptedToolFromSkill('notes'), 'create_note');
  const active = { kind: 'study_sheet', id: 'existing', noteKind: 'note' };
  const prompt = 'Create a note: Add milk to the shopping list.';
  assert.equal(forcedToolForRequest({ prompt, mode: 'auto', active }).name, 'create_note');
  const { gateChatTool } = require('../lib/composer/intent.ts');
  assert.equal(gateChatTool({ tool: { name: 'edit_note', args: { content: 'Milk' } }, prompt, active }).name, 'create_note');
});

test('note tool preserves Markdown and every provider exposes both note workflows', () => {
  const tools = require('../lib/ai/tools.ts');
  assert.equal(tools.parseToolCall('create_note', { title: 'Deadline', content: '**Monday**\n\n- Send draft' }).args.content, '**Monday**\n\n- Send draft');
  for (const names of [tools.toOpenAITools().map(x => x.function.name), tools.toGeminiTools().map(x => x.name), tools.toAnthropicTools().map(x => x.name)]) {
    assert.ok(names.includes('create_note')); assert.ok(names.includes('edit_note')); assert.ok(names.includes('create_sheet'));
  }
});

test('plain note record preserves its kind and ignores legacy study sections', () => {
  const { mapNoteRecord } = require('../lib/notes/compat.ts');
  const record = mapNoteRecord('n', 'p', { kind: 'note', content: '**Monday**', summary: 'stale lesson' }, { title: 'Deadline', userId: 'u', sourceMaterialIds: [], createdAt: null });
  assert.equal(record.kind, 'note'); assert.equal(record.prose, '**Monday**');
});

test('Studio note subscriptions distinguish a pending local write from a saved note', () => {
  let publish; const snapshots = [];
  const { subscribeStudySheets } = isolated('lib/study-sheets/store.ts', {
    '@/lib/firebase': { getFirebaseDb: () => ({}) },
    'firebase/firestore': { collection: () => ({}), onSnapshot: (_ref, options, onChange) => { assert.equal(options.includeMetadataChanges, true); publish = onChange; return () => {}; } },
  });
  subscribeStudySheets('p', items => snapshots.push(items));
  for (const hasPendingWrites of [true, false]) publish({ docs: [{ id: 'n', metadata: { hasPendingWrites }, data: () => ({ kind: 'note', title: 'Deadline', content: 'Monday' }) }] });
  assert.equal(snapshots[0][0].pendingSave, true); assert.equal(snapshots[1][0].pendingSave, false);
});

test('artifact titles keep context and use distinct bounded names for repeated generations', () => {
  const { uniqueArtifactTitle } = require('../lib/artifacts/title.ts');
  assert.equal(uniqueArtifactTitle('Cell transport', ['Cell transport', 'Cell transport (2)']), 'Cell transport (3)');
  assert.equal(uniqueArtifactTitle('Notes', [], 'Cell transport', 'Study notes'), 'Cell transport · Study notes');
  assert.equal(uniqueArtifactTitle('x'.repeat(500), []).length <= 100, true);
});

test('project title reservations recognize legacy notes and distinguish later generations', async () => {
  const saved = new Map();
  const { reserveArtifactTitle } = isolated('lib/artifacts/title-store.ts', {
    '@/lib/firebase': { getFirebaseDb: () => ({}) },
    'firebase/firestore': {
      collection: (_db, ...parts) => parts.join('/'), query: (ref) => ref, limit: () => ({}),
      getDocs: async ref => ({ docs: ref.endsWith('studySheets') ? [{ data: () => ({ title: 'Cell transport' }) }] : [] }),
      doc: (_db, ...parts) => parts.join('/'), serverTimestamp: () => 1,
      runTransaction: async (_db, run) => run({ get: async key => ({ exists: () => saved.has(key) }), set: (key, value) => saved.set(key, value) }),
    },
  });
  assert.equal(await reserveArtifactTitle('p', 'Cell transport'), 'Cell transport (2)');
  assert.equal(await reserveArtifactTitle('p', 'Cell transport'), 'Cell transport (3)');
  assert.equal(saved.size, 2);
});

function dispatchWith(store, generation = {}) {
  return isolated('lib/chat/dispatch.ts', {
    '@/lib/images/client': {}, '@/lib/images/local': {}, '@/lib/exercises/generate-set': {}, '@/lib/exercises/mutate-client': {},
    '@/lib/study-sheets/generate-client': generation, '@/lib/study-sheets/store': store,
    '@/lib/paths/generate-client': {}, '@/lib/paths/store': {}, '@/lib/chats': {},
    '@/lib/artifacts/title-store': { reserveArtifactTitle: async (_projectId, title) => title },
  }).dispatchChatTool;
}

test('save confirmation follows persistence and preserves only the requested Markdown', async () => {
  let finishSave; const writes = [];
  const dispatch = dispatchWith({ createStudySheet: async (input) => { writes.push(input); return new Promise(resolve => { finishSave = resolve; }); } });
  const pending = dispatch({ tool: { name: 'create_note', args: { title: 'Deadline', content: '**Monday**\n\n- Send draft' } }, text: 'Saved it!', prompt: 'Save a note', project: { id: 'p' }, userId: 'u', materials: [] });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(writes.length, 1); assert.equal(writes[0].kind, 'note'); assert.deepEqual(writes[0].blocks, []);
  finishSave('saved'); const result = await pending;
  assert.equal(result.artifact.id, 'saved'); assert.equal(result.content, 'Saved note.');
});

test('failed note persistence cannot repeat an unearned saved claim', async () => {
  const dispatch = dispatchWith({ createStudySheet: async () => { throw new Error('offline'); } });
  const result = await dispatch({ tool: { name: 'create_note', args: { title: 'Deadline', content: 'Monday' } }, text: 'Saved it!', prompt: 'Save a note', project: { id: 'p' }, userId: 'u', materials: [] });
  assert.equal(result.artifact, undefined); assert.doesNotMatch(result.content, /Saved it!/);
});

test('editing a plain note persists the same id without the study generator', async () => {
  const writes = [];
  const dispatch = dispatchWith({ getStudySheet: async () => ({ id: 'n', kind: 'note', title: 'Deadline', content: 'Monday', sourceMaterialIds: [] }), updateStudySheet: async (...args) => writes.push(args) }, { generatePlainNote: async input => { assert.equal(input.currentContent, 'Monday'); return { title: 'Deadline', content: '**Tuesday**' }; } });
  const result = await dispatch({ tool: { name: 'edit_note', args: { content: '**Tuesday**' } }, prompt: 'Change Monday to Tuesday', project: { id: 'p' }, userId: 'u', materials: [], active: { kind: 'study_sheet', id: 'n', title: 'Deadline' } });
  assert.equal(writes[0][1], 'n'); assert.equal(writes[0][2].content, '**Tuesday**'); assert.equal(result.artifact.id, 'n');
});

test('plain note exact patches preserve untouched content beyond all old clipping boundaries', () => {
  const { applyPlainNoteEdits } = require('../lib/notes/plain.ts');
  const original = 'Monday\n\n' + 'untouched paragraph\n'.repeat(2000) + '\nTAIL';
  assert.equal(applyPlainNoteEdits(original, [{ oldText: 'Monday', newText: 'Tuesday' }]), original.replace('Monday', 'Tuesday'));
  assert.throws(() => applyPlainNoteEdits('Monday Monday', [{ oldText: 'Monday', newText: 'Tuesday' }]), /unique/i);
});

test('save that supplies the previous response as data and missing context cannot create a guessed note', async () => {
  const writes = []; const requests = [];
  const dispatch = dispatchWith({ createStudySheet: async input => { writes.push(input); return 'n'; } }, { generatePlainNote: async input => { requests.push(input); return { title: 'Deadline', content: 'Monday' }; } });
  const base = { tool: { name: 'create_note', args: { instruction: 'Save that' } }, prompt: 'Save that', project: { id: 'p' }, userId: 'u', materials: [], active: null };
  const missing = await dispatch(base);
  assert.equal(writes.length, 0); assert.equal(requests.length, 0); assert.equal(missing.artifact, undefined);
  const missingGeorgian = await dispatch({ ...base, prompt: 'ჩაინიშნე ეს', tool: { name: 'create_note', args: { content: 'A guessed note' } } });
  assert.equal(missingGeorgian.artifact, undefined); assert.equal(writes.length, 0);
  const result = await dispatch({ ...base, messages: [{ role: 'assistant', content: '**Monday** is the deadline.', artifact: null }] });
  assert.equal(result.artifact.id, 'n'); assert.equal(requests[0].history[0].content, '**Monday** is the deadline.');
});

test('plain note edit generation receives the entire saved note and applies only exact patches', async () => {
  const original = 'Monday\n' + 'untouched\n'.repeat(4000) + 'TAIL';
  let sent;
  const { streamNotesDocument } = isolated('lib/study-sheets/generate-stream.ts', {
    '@/lib/ai/gemini': { generateTextStream: async function* (_prompt, options) { sent = options.systemInstruction; yield JSON.stringify({ changes: [{ oldText: 'Monday', newText: 'Tuesday' }] }); } },
  });
  const events = [];
  for await (const event of streamNotesDocument('Change Monday to Tuesday', { kind: 'note', currentNote: { title: 'Deadline', content: original } })) events.push(event);
  assert.match(sent, /oldText/); assert.equal(events.at(-1).content, original.replace('Monday', 'Tuesday'));
});

test('plain note API keeps the full current note and recent response data without the study clipping limit', async () => {
  const original = 'Monday\n' + 'untouched\n'.repeat(4000) + 'TAIL';
  let received;
  const { POST } = isolated('app/api/study-sheets/generate/route.ts', {
    '@/lib/api/assert': { assertAccountRequest: async () => ({ uid: 'u' }) },
    '@/lib/billing/server': { startAiUsageSession: async () => ({ report: () => {}, commit: async () => {} }) },
    '@/lib/study-sheets/generate-stream': { streamNotesDocument: async function* (prompt, options) { received = { prompt, options }; yield { type: 'done', title: 'Deadline', content: original }; } },
  });
  const response = await POST(new Request('https://example.com/api/study-sheets/generate', { method: 'POST', body: JSON.stringify({ kind: 'note', instruction: 'Change Monday to Tuesday', currentTitle: 'Deadline', currentContent: original, history: [{ role: 'assistant', content: 'Prior response' }] }) }));
  await response.text();
  assert.equal(received.options.currentNote.content, original); assert.ok(received.prompt.includes(original)); assert.match(received.prompt, /Prior response/);
});

test('native chat routing suppresses a provider saved claim before note persistence', async () => {
  const { readChatSse } = require('../lib/ai/sse.ts');
  let choice;
  const provider = { generateToolStream: async function* (_prompt, options) { choice = options.toolChoice; yield { tool: { name: 'answer', args: {} } }; yield { text: 'Saved it!' }; } };
  const { POST } = isolated('app/api/chat/route.ts', {
    '@/lib/api/assert': { assertSignedInRequest: async () => ({ uid: 'test', anonymous: false }) },
    '@/lib/billing/server': { startAiUsageSession: async () => ({ report: () => {}, commit: async () => {} }) },
    '@/lib/admin/assert': {}, '@/lib/rag/server': { retrieveChunks: async () => [] },
    '@/lib/ai/gemini': { ...provider, getAIProvider: () => provider },
  });
  const response = await POST(new Request('https://example.com/api/chat', { method: 'POST', body: JSON.stringify({ prompt: 'Jot this down: Monday', mode: 'auto', context: {} }) }));
  const result = await readChatSse(response);
  assert.equal(choice, 'create_note'); assert.equal(result.tool.name, 'create_note'); assert.equal(result.text, '');
});
