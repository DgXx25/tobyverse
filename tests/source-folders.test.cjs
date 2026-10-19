/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function setup(entries = {}) {
  const records = new Map(Object.entries(entries));
  let counter = 0;
  const ref = (...args) => {
    const value = args.flatMap(x => typeof x === 'string' ? [x] : x?.path ? [x.path] : []).join('/');
    return { path: value, id: value.split('/').at(-1) };
  };
  const snapshot = r => ({ id: r.path.split('/').at(-1), ref: r, exists: () => records.has(r.path), data: () => records.get(r.path) });
  const removed = Symbol('delete');
  const apply = (r, fields) => {
    const value = { ...records.get(r.path) };
    for (const [key, item] of Object.entries(fields)) if (item === removed) delete value[key]; else value[key] = item;
    records.set(r.path, value);
  };
  const mocks = {
    '@/lib/firebase': { getFirebaseDb: () => null },
    '@/lib/firestore': { COLLECTIONS: { projects: 'projects', materials: 'materials', sourceFolders: 'sourceFolders' } },
    '@/lib/workspace/draft-notebook': { clearUntouchedNotebook: () => {} },
    'firebase/firestore': {
      collection: ref,
      doc: (...args) => args.length === 1 ? ref(args[0], `new-${++counter}`) : ref(...args),
      serverTimestamp: () => 'now', deleteField: () => removed,
      onSnapshot: () => () => {},
      where: (field, _operator, value) => ({ field, value }),
      query: (r, condition) => ({ ...r, condition }),
      getDocs: async q => ({ docs: [...records.keys()].filter(key => key.startsWith(q.path + '/') && records.get(key)[q.condition.field] === q.condition.value).map(key => snapshot(ref(key))) }),
      runTransaction: async (_db, run) => {
        const changes = [];
        const result = await run({
          get: async r => snapshot(r),
          set: (r, data) => changes.push(() => records.set(r.path, data)),
          update: (r, fields) => changes.push(() => apply(r, fields)),
          delete: r => changes.push(() => records.delete(r.path)),
        });
        changes.forEach(change => change());
        return result;
      },
    },
  };
  const filename = path.resolve(__dirname, '../lib/materials/folders.ts');
  const loaded = new Module(filename, module);
  loaded.require = name => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return { api: loaded.exports, records };
}

test('bulk source moves preserve content and reject missing/deleting destination folders', async () => {
  const { api, records } = setup({
    'projects/p/sourceFolders/f': { name: 'Photos' },
    'projects/p/sourceFolders/deleting': { name: 'Old', deleting: true },
    'projects/p/materials/a': { title: 'Camera', textPath: 'a.txt' },
    'projects/p/materials/b': { title: 'Brief', folderId: 'previous' },
  });
  await api.moveSourcesToFolder('p', ['a', 'b', 'a'], 'f');
  assert.deepEqual(records.get('projects/p/materials/a'), { title: 'Camera', textPath: 'a.txt', folderId: 'f' });
  assert.equal(records.get('projects/p/materials/b').folderId, 'f');
  await assert.rejects(api.moveSourcesToFolder('p', ['a'], 'missing'));
  await assert.rejects(api.moveSourcesToFolder('p', ['a'], 'deleting'));
  await assert.rejects(api.moveSourcesToFolder('other', ['a'], 'f'));
  assert.equal(records.get('projects/p/materials/a').folderId, 'f');
});

test('deleting a source folder returns its materials to root without deleting files', async () => {
  const { api, records } = setup({
    'projects/p/sourceFolders/f': { name: 'Shoot' },
    'projects/p/materials/a': { title: 'Portrait', folderId: 'f', storagePath: 'compressed.webp' },
    'projects/p/materials/b': { title: 'Other', folderId: 'different' },
  });
  await api.deleteSourceFolder('p', 'f');
  assert.equal(records.has('projects/p/sourceFolders/f'), false);
  assert.deepEqual(records.get('projects/p/materials/a'), { title: 'Portrait', storagePath: 'compressed.webp' });
  assert.equal(records.get('projects/p/materials/b').folderId, 'different');
});

test('moving back to root clears membership and an invalid mixed selection moves nothing', async () => {
  const { api, records } = setup({ 'projects/p/materials/a': { title: 'A', folderId: 'f' } });
  await api.moveSourcesToFolder('p', ['a'], null);
  assert.equal(Object.hasOwn(records.get('projects/p/materials/a'), 'folderId'), false);
  await assert.rejects(api.moveSourcesToFolder('p', ['a', 'missing'], null));
  await assert.rejects(api.moveSourcesToFolder('p', ['../foreign'], null));
});

test('unrecognized folder ids never hide a material and folder names are validated', async () => {
  const { api } = setup();
  const a = { id: 'a', folderId: 'missing' }, b = { id: 'b', folderId: 'f' }, c = { id: 'c' };
  const groups = api.groupSourcesByFolder([a, b, c], [{ id: 'f', name: 'One' }]);
  assert.deepEqual(groups.root, [a, c]);
  assert.deepEqual(groups.folders.get('f'), [b]);
  await assert.rejects(api.createSourceFolder('p', '  '));
  await assert.rejects(api.createSourceFolder('p', 'x'.repeat(121)));
});

test('creating and renaming a folder preserves its id and moves no materials', async () => {
  const { api, records } = setup({ 'projects/p/materials/a': { title: 'A' } });
  const id = await api.createSourceFolder('p', '  Shoot  ');
  assert.equal(records.get(`projects/p/sourceFolders/${id}`).name, 'Shoot');
  await api.renameSourceFolder('p', id, 'Revisions');
  assert.equal(records.get(`projects/p/sourceFolders/${id}`).name, 'Revisions');
  assert.deepEqual(records.get('projects/p/materials/a'), { title: 'A' });
});
