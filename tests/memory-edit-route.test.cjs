/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function load(dependencies) {
  const filename = path.join(root, 'app/api/memory/edit/route.ts');
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.require = name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name);
  instance._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return instance.exports;
}

function fixture(modelResult) {
  const calls = { model: 0, replace: null, committed: 0 };
  class AuthError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const route = load({
    '@/lib/api/assert': { assertAccountRequest: async () => ({ uid: 'user-1' }), authErrorResponse: error => Response.json({ error: error.message }, { status: error.status || 500 }), AuthError },
    '@/lib/billing/server': { startAiUsageSession: async () => ({ report: {}, commit: async () => { calls.committed++; } }), aiUsageErrorResponse: () => Response.json({ error: 'usage denied' }, { status: 403 }) },
    '@/lib/ai/json': { generateJson: async () => { calls.model++; return modelResult; } },
    '@/lib/memory/prompt': { memoryEditPrompt: input => JSON.stringify(input), MEMORY_EDIT_SYSTEM: 'system' },
    '@/lib/memory/normalize': { asMemoryFacts: facts => facts, parseMemoryOps: value => value.operations },
    '@/lib/memory/privacy': { memorySafeText: text => text, containsSensitiveMemory: () => false },
    '@/lib/memory/summary': {
      formatPersonalMemory: (_facts, text) => text,
      parsePersonalMemory: text => text ? [{ content: text, date: null }] : [],
      applyPersonalMemoryEdit: (current, operations) => {
        const copy = current.map(item => ({ ...item }));
        for (const operation of operations) {
          if (operation.op === 'update') copy.find(item => item.id === operation.id).content = operation.content;
          if (operation.op === 'add') copy.push({ id: 'new', content: operation.content, date: null });
          if (operation.op === 'delete') copy.splice(copy.findIndex(item => item.id === operation.id), 1);
        }
        return copy.map(({ content, date }) => ({ content, date }));
      },
    },
    '@/lib/memory/personal-server': {
      memoryStatus: async () => ({ revision: 2, memories: [{ id: 'f1', content: 'Studies economics.', createdAt: '2026-10-10T00:00:00.000Z', updatedAt: null }], personalization: 'Prefers concise replies.' }),
      replacePersonalMemory: async (_uid, summary, revision) => { calls.replace = { summary, revision }; return { summary, revision: revision + 1 }; },
    },
  });
  return { route, calls };
}

test('prompt edit merges a targeted change in place and preserves unrelated dates', async () => {
  const { route, calls } = fixture({ ok: true, data: { operations: [
    { op: 'update', id: 'legacy-0', content: 'Prefers concise Georgian replies.' },
    { op: 'add', content: 'Works as a cameraman.' },
  ] } });
  const response = await route.POST(new Request('http://localhost/api/memory/edit', { method: 'POST', body: JSON.stringify({ instruction: 'Update my language preference to Georgian and add my job.', revision: 2 }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls.replace, { summary: '- Studies economics. [2026-10-10]\n- Prefers concise Georgian replies.\n- Works as a cameraman.', revision: 2 });
  assert.equal(calls.committed, 1);
});

test('ambiguous model result leaves memory untouched', async () => {
  const { route, calls } = fixture({ ok: true, data: { operations: [] } });
  const response = await route.POST(new Request('http://localhost/api/memory/edit', { method: 'POST', body: JSON.stringify({ instruction: 'Make it nicer.', revision: 2 }) }));
  assert.equal(response.status, 422);
  assert.equal(calls.replace, null);
});

test('a model-suggested delete is ignored unless the user explicitly asks to remove memory', async () => {
  const { route, calls } = fixture({ ok: true, data: { operations: [{ op: 'delete', id: 'f1' }] } });
  const response = await route.POST(new Request('http://localhost/api/memory/edit', { method: 'POST', body: JSON.stringify({ instruction: 'Change my study preference.', revision: 2 }) }));
  assert.equal(response.status, 422);
  assert.equal(calls.replace, null);
});

test('a request that explicitly forbids deletion overrides a model-suggested delete', async () => {
  const { route, calls } = fixture({ ok: true, data: { operations: [{ op: 'delete', id: 'f1' }] } });
  const response = await route.POST(new Request('http://localhost/api/memory/edit', { method: 'POST', body: JSON.stringify({ instruction: "Don't delete any memory; update my study preference.", revision: 2 }) }));
  assert.equal(response.status, 422);
  assert.equal(calls.replace, null);
});

test('stale editor revision is rejected before spending on a model update', async () => {
  const { route, calls } = fixture({ ok: true, data: { operations: [] } });
  const response = await route.POST(new Request('http://localhost/api/memory/edit', { method: 'POST', body: JSON.stringify({ instruction: 'Add my language.', revision: 1 }) }));
  assert.equal(response.status, 409);
  assert.equal(calls.model, 0);
  assert.equal(calls.replace, null);
});
