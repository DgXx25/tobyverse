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
function load(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
}
require.extensions['.ts'] = load;
function isolated(relative, mocks) {
  const filename = path.join(root, relative);
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths;
  loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  load(loaded, filename);
  return loaded.exports;
}
const { executeStudioGeneration } = require('../lib/workspace/studio-generation.ts');
const artifact = { kind: 'practice', id: 'q1', ids: ['q1', 'q2'], count: 2, title: 'Cells quiz' };
const request = { id: 1, type: 'quiz', label: 'Quiz', tool: 'create_practice', prompt: 'Quiz on cells', sourceIds: [] };

test('Studio waits for durable indexing before reporting completion', async () => {
  let finishSave;
  let completed = false;
  const pending = executeStudioGeneration({ request, generate: async () => ({ artifact, content: '' }), save: () => new Promise(resolve => { finishSave = resolve; }) }).then(result => { completed = true; return result; });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(completed, false);
  finishSave();
  assert.deepEqual(await pending, { artifact });
});

test('a clarification or prose response cannot silently complete a Studio job', async () => {
  let saved = false;
  const result = await executeStudioGeneration({ request, generate: async () => ({ content: 'Choose a topic first.' }), save: async () => { saved = true; } });
  assert.equal(result.error, 'Choose a topic first.');
  assert.equal(saved, false);
});

test('failed persistence retains the generated artifact and retries without another model call', async () => {
  const failed = await executeStudioGeneration({ request, generate: async () => ({ artifact, content: '' }), save: async () => { throw new Error('Connection lost'); } });
  assert.equal(failed.error, 'Connection lost');
  assert.deepEqual(failed.artifact, artifact);
  let saved;
  const result = await executeStudioGeneration({ request: { ...request, retryArtifact: failed.artifact }, generate: async () => { throw new Error('Must not generate twice'); }, save: async value => { saved = value; } });
  assert.deepEqual(result, { artifact });
  assert.deepEqual(saved, artifact);
});

test('generation failures and cancellation are returned as explicit failed results', async () => {
  const failed = await executeStudioGeneration({ request, generate: async () => { throw new Error('Quota exhausted'); }, save: async () => {} });
  assert.equal(failed.error, 'Quota exhausted');
  const controller = new AbortController(); controller.abort();
  let generated = false;
  const cancelled = await executeStudioGeneration({ request, signal: controller.signal, generate: async () => { generated = true; return { artifact, content: '' }; }, save: async () => {} });
  assert.ok(cancelled.error);
  assert.equal(generated, false);
});

test('Studio artifacts persist and reload independently of chat messages', async () => {
  const documents = new Map(); let publish;
  const store = isolated('lib/workspace/studio-store.ts', {
    '@/lib/firebase': { getFirebaseDb: () => ({}) },
    'firebase/firestore': {
      collection: (_db, ...parts) => parts.join('/'), doc: (ref, id) => `${ref}/${id}`,
      setDoc: async (ref, data) => documents.set(ref, data),
      onSnapshot: (_ref, options, callback) => { assert.equal(options.includeMetadataChanges, true); publish = callback; return () => {}; },
    },
  });
  await store.saveStudioArtifact('project', 'quiz', artifact);
  let outputs;
  store.subscribeStudioArtifacts('project', values => { outputs = values; });
  publish({ docs: [...documents.values()].map(value => ({ metadata: { hasPendingWrites: true }, data: () => value })) });
  assert.equal(outputs.length, 0);
  publish({ docs: [...documents.values()].map(value => ({ metadata: { hasPendingWrites: false }, data: () => value })) });
  assert.equal(outputs.length, 1);
  assert.deepEqual(outputs[0].artifact, artifact);
  assert.equal(outputs[0].type, 'quiz');
  assert.equal([...documents.keys()][0], 'projects/project/studioArtifacts/practice:q1');
});

function dispatchWith(generation, practice = {}) {
  return isolated('lib/chat/dispatch.ts', {
    '@/lib/images/client': {}, '@/lib/images/local': {}, '@/lib/exercises/generate-set': practice, '@/lib/exercises/mutate-client': {},
    '@/lib/study-sheets/generate-client': generation, '@/lib/study-sheets/store': {},
    '@/lib/paths/generate-client': {}, '@/lib/paths/store': { getLatestPath: () => { throw new Error('Must not replace Studio intent with a course path'); } }, '@/lib/chats': {},
    '@/lib/artifacts/title-store': { reserveArtifactTitle: async (_id, title) => title },
  }).dispatchChatTool;
}

test('Studio flashcard generation preserves the complete format, language and topic instruction', async () => {
  let input;
  const dispatch = dispatchWith({ generateStudySheetFromPrompt: async value => { input = value; return { id: 'cards', title: 'Cell cards', blocks: [] }; } });
  const prompt = 'Make flashcards with a term on one side and meaning on the other.\nLength: Fewer.\nLanguage: Georgian.\nTopic: Cell transport';
  const result = await dispatch({ origin: 'studio', tool: { name: 'create_sheet', args: { topic: 'Wrong topic' } }, text: '', prompt, project: { id: 'p', title: 'Biology' }, userId: 'u', materials: [] });
  assert.equal(input.prompt, prompt);
  assert.equal(result.artifact.id, 'cards');
});

test('Studio dispatch propagates the real generation failure rather than returning a prose fallback', async () => {
  const dispatch = dispatchWith({ generateStudySheetFromPrompt: async () => { throw new Error('Provider unavailable'); } });
  await assert.rejects(dispatch({ origin: 'studio', tool: { name: 'create_sheet', args: {} }, text: '', prompt: 'Create flashcards', project: { id: 'p' }, userId: 'u', materials: [] }), /Provider unavailable/);
});

test('Studio Quiz forwards the chosen question count and full generation instruction', async () => {
  let input;
  const dispatch = dispatchWith({}, { generatePracticeSet: async value => { input = value; return { ids: ['q1'], count: 1 }; } });
  const prompt = 'Make a quiz.\nNumber of questions: 5.\nDifficulty: Hard.\nLanguage: Georgian.\nTopic: Cell transport';
  const result = await dispatch({ origin: 'studio', tool: { name: 'create_practice', args: {} }, text: '', prompt, project: { id: 'p', title: 'Biology' }, userId: 'u', materials: [] });
  assert.equal(input.count, 5);
  assert.equal(input.prompt, prompt);
  assert.equal(result.artifact.kind, 'practice');
});
