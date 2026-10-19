/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

function renderSources(options = {}) {
  let stateIndex = 0;
  let id = 0;
  const uploads = [];
  const moves = [];
  const sourceSelections = [];
  const filename = path.resolve(__dirname, '../components/workspace/sources-pane.tsx');
  const loaded = new Module(filename, module);
  const mocks = {
    react: {
      ...React,
      useEffect: () => {},
      useRef: (current) => ({ current }),
      useState: (initial) => {
        const index = stateIndex++;
        const overrides = { 2: true, 13: options.folders ?? [], 15: options.organizing ?? false, 16: options.managed ?? [] };
        return [Object.hasOwn(overrides, index) ? overrides[index] : initial, () => {}];
      },
    },
    'react-dom': { createPortal: (children) => ({ type: 'portal', props: { children } }) },
    '@/lib/composer/attach': { newChipId: () => String(++id) },
    '@/lib/materials/ingest-client': { ingestMaterialFile: async (input) => { uploads.push(input); return 'material'; } },
    '@/lib/materials/save': {}, '@/lib/materials/store': {}, '@/lib/materials/types': {},
    '@/lib/workspace/context-menu-position': {},
    '@/lib/workspace/project-activity': { markProjectActivityComplete: () => {} },
    '@/lib/materials/folders': {
      SOURCE_DRAG_TYPE: 'application/x-tobyverse-sources',
      moveSourcesToFolder: async (...args) => { moves.push(args); },
      groupSourcesByFolder: (items, folders) => ({ root: items.filter(item => !folders.some(folder => folder.id === item.folderId)), folders: new Map(folders.map(folder => [folder.id, items.filter(item => item.folderId === folder.id)])) }),
    },
    '@/components/workspace/file-kind-icon': {}, '@/components/workspace/material-text': {}, '@/components/workspace/ui-icon': {},
    '@/components/workspace/material-viewer': {},
  };
  loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
  const pane = loaded.exports.SourcesPane({ projectId: 'p', userId: 'u', items: options.items ?? [], selectedIds: [], onSelectedIds: ids => sourceSelections.push(ids), onOpenMaterial: () => {} });
  return { pane, uploads, moves, sourceSelections };
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) {
    const result = find(child, predicate);
    if (result) return result;
  }
}

function dropEvent(files) {
  let stopped = false;
  let prevented = false;
  return {
    dataTransfer: { files, types: files.length ? ['Files'] : ['text/plain'] },
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; },
    get stopped() { return stopped; },
    get prevented() { return prevented; },
  };
}

test('dropping into the portaled source dialog uploads once, without bubbling into its source pane', async () => {
  const oldDocument = global.document;
  global.document = { body: {} };
  try {
    const { pane, uploads } = renderSources();
    const dialogElement = find(pane, (node) => node.type?.name === 'AddSourcesDialog');
    const dialog = dialogElement.type(dialogElement.props);
    const target = find(dialog, (node) => typeof node.props?.onDrop === 'function');
    const file = new File(['slides'], 'ლექცია 1-3 (1).pptx');
    const event = dropEvent([file]);
    target.props.onDrop(event);
    // React portal events bubble through the React owner tree, including the source pane.
    if (!event.stopped) pane.props.onDrop(event);
    await Promise.resolve();
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].file, file);
    assert.equal(event.stopped, true);
  } finally {
    global.document = oldDocument;
  }
});

test('source pane consumes its own file drop, leaving unrelated text drops alone', async () => {
  const { pane, uploads } = renderSources();
  const fileDrop = dropEvent([new File(['content'], 'notes.pdf')]);
  pane.props.onDrop(fileDrop);
  await Promise.resolve();
  assert.equal(uploads.length, 1);
  assert.equal(fileDrop.stopped, true);
  assert.equal(fileDrop.prevented, true);
  const textDrop = dropEvent([]);
  pane.props.onDrop(textDrop);
  assert.equal(textDrop.stopped, false);
  assert.equal(textDrop.prevented, false);
});

test('dropping a selected group into a folder moves sources without changing AI selection', async () => {
  const oldDocument = global.document;
  global.document = { body: {} };
  try {
    const { pane, moves, sourceSelections } = renderSources({ items: [{ id: 'a', title: 'Image', type: 'image' }, { id: 'b', title: 'Brief', type: 'txt' }], folders: [{ id: 'f', name: 'Shoot' }], organizing: true, managed: ['a', 'b'] });
    const folder = find(pane, node => node.props?.['data-source-folder'] === 'f');
    const event = dropEvent([]);
    event.dataTransfer.types = ['application/x-tobyverse-sources'];
    event.dataTransfer.getData = () => JSON.stringify({ projectId: 'p', ids: ['a', 'b'] });
    folder.props.onDrop(event);
    await Promise.resolve();
    assert.deepEqual(moves, [['p', ['a', 'b'], 'f']]);
    assert.deepEqual(sourceSelections, []);
    assert.equal(event.stopped, true);
    event.dataTransfer.getData = () => JSON.stringify({ projectId: 'foreign', ids: ['a'] });
    folder.props.onDrop(event);
    assert.equal(moves.length, 1);
  } finally { global.document = oldDocument; }
});
