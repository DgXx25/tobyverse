/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

test('the model sees only compact guide metadata before activation', () => {
  const { RUNTIME_SKILL_CATALOG, formatRuntimeSkillCatalog } = require('../lib/skills/catalog.ts');
  assert.deepEqual(RUNTIME_SKILL_CATALOG.map(({ name }) => name), [
    'technical-problem-solving', 'algebra-equations', 'calculus-derivatives', 'statistics-estimation',
  ]);
  for (const entry of RUNTIME_SKILL_CATALOG) assert.deepEqual(Object.keys(entry).sort(), ['description', 'name']);
  const catalog = formatRuntimeSkillCatalog();
  assert.ok(catalog.length < 1500, `four descriptions should be compact, got ${catalog.length} characters`);
  assert.doesNotMatch(catalog, /SKILL\.md|sample standard deviation is|x\^2 - 5x|\bbody\b/);
  const { chatToolDefinition } = require('../lib/ai/tools.ts');
  const tool = chatToolDefinition('load_skill');
  assert.equal(tool.internal, true);
  assert.ok(tool.description.includes(catalog));
  assert.deepEqual(tool.parameters.properties.id.enum, RUNTIME_SKILL_CATALOG.map(({ name }) => name));
});

test('a selected guide loads its full plain-text body and matches its SKILL.md metadata', async () => {
  const { RUNTIME_SKILL_CATALOG } = require('../lib/skills/catalog.ts');
  const { loadRuntimeSkill } = require('../lib/skills/server.ts');
  for (const entry of RUNTIME_SKILL_CATALOG) {
    const source = fs.readFileSync(path.join(root, 'lib/skills/library', entry.name, 'SKILL.md'), 'utf8');
    const loaded = await loadRuntimeSkill(entry.name);
    assert.equal(source.match(/^name: (.+)$/m)[1], entry.name);
    assert.equal(JSON.parse(source.match(/^description: (.+)$/m)[1]), entry.description);
    assert.equal(loaded.name, entry.name);
    assert.equal(loaded.content, source.split(/\r?\n---\r?\n/)[1].trim());
    assert.ok(loaded.content.length > 400);
    assert.doesNotMatch(loaded.content, /^---|^name:/);
  }
});

test('unknown guide IDs never become arbitrary file reads', async () => {
  const { loadRuntimeSkill, createSkillLoader } = require('../lib/skills/server.ts');
  const load = createSkillLoader();
  for (const id of ['../../.env.local', 'https://example.com/skill', '__proto__', 'constructor', '', 'math/../statistics']) {
    assert.equal(await loadRuntimeSkill(id), null);
    assert.equal((await load(id)).ok, false);
  }
});

test('each request loads at most two guides, and repeats do not resend the body', async () => {
  const { createSkillLoader } = require('../lib/skills/server.ts');
  const load = createSkillLoader();
  const generic = await load('technical-problem-solving');
  const stats = await load('statistics-estimation');
  assert.ok(generic.skill.content.length > 400);
  assert.ok(stats.skill.content.length > 400);
  const again = await load('technical-problem-solving');
  assert.equal(again.alreadyLoaded, true);
  assert.equal(again.skill, undefined);
  const third = await load('algebra-equations');
  assert.equal(third.ok, true, 'the budget is a nonfatal skip, not a broken tool');
  assert.equal(third.skipped, true);
  assert.equal(third.skill, undefined);
  assert.ok((await createSkillLoader()('algebra-equations')).skill.content.length > 400, 'a new request gets its own budget');
});

test('parallel duplicate activations return the body only once', async () => {
  const { createSkillLoader } = require('../lib/skills/server.ts');
  const load = createSkillLoader();
  const results = await Promise.all([load('algebra-equations'), load('algebra-equations')]);
  assert.equal(results.filter((result) => result.skill).length, 1);
  assert.equal(results.filter((result) => result.alreadyLoaded).length, 1);
});

test('guide loading stays inside the tool loop and does not become the final client action', async () => {
  const { runToolLoop } = require('../lib/ai/tool-loop.ts');
  const { createSkillLoader } = require('../lib/skills/server.ts');
  const load = createSkillLoader();
  const result = await runToolLoop({
    callModel: async ({ round, functionResponses }) => {
      if (round === 1) return { parts: [{ text: 'Loading a guide.' }, { functionCall: { name: 'load_skill', args: { id: 'algebra-equations' } } }] };
      assert.ok(functionResponses[0].response.skill.content.length > 400);
      return { parts: [{ text: 'x = 8.' }] };
    },
    execute: async (call) => load(call.args.id),
  });
  assert.equal(result.rounds, 2);
  assert.equal(result.tool, null);
  assert.equal(result.text, 'x = 8.');
});

test('loading a guide before image search still returns the image action and its final answer', async () => {
  const { runToolLoop } = require('../lib/ai/tool-loop.ts');
  const executed = [];
  const result = await runToolLoop({
    callModel: async ({ round }) => ({ parts: round === 1 ? [
      { functionCall: { name: 'load_skill', args: { id: 'technical-problem-solving' } } },
      { functionCall: { name: 'search_images', args: { query: 'geometry triangle' } } },
    ] : [{ text: 'A triangle has three sides.' }] }),
    execute: async (call) => { executed.push(call.name); return { ok: true }; },
  });
  assert.deepEqual(executed, ['load_skill', 'search_images']);
  assert.equal(result.tool.name, 'search_images');
  assert.equal(result.text, 'A triangle has three sides.');
});

function isolatedModule(relativePath, mocks) {
  const filename = path.join(root, relativePath);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
  return loaded.exports;
}

test('Gemini receives the selected full guide after activation and preserves signed replay', async () => {
  const { GeminiProvider } = require('../lib/ai/gemini.ts');
  const { createSkillLoader } = require('../lib/skills/server.ts');
  const provider = new GeminiProvider();
  let rounds = 0;
  provider.getModel = () => ({
    generateContentStream: async (request) => {
      rounds++;
      if (rounds === 1) {
        assert.doesNotMatch(JSON.stringify(request), /# Algebra and equations/);
        const response = { candidates: [{ content: { parts: [{
          functionCall: { name: 'load_skill', args: { id: 'algebra-equations' } }, thoughtSignature: 'sig-guide',
        }] } }] };
        return { stream: (async function* () { yield response; })(), response: Promise.resolve(response) };
      }
      assert.equal(request.contents[1].parts[0].thoughtSignature, 'sig-guide');
      const skill = request.contents[2].parts[0].functionResponse.response.skill;
      assert.equal(skill.name, 'algebra-equations');
      assert.match(skill.content, /# Algebra and equations/);
      const response = { candidates: [{ content: { parts: [{ text: 'x = 8.' }] } }] };
      return { stream: (async function* () { yield response; })(), response: Promise.resolve(response) };
    },
  });
  const load = createSkillLoader();
  const parts = [];
  for await (const part of provider.generateToolStream('Use algebra-equations: 2(x - 3) = 10', {
    tools: true, executeTool: (call) => load(call.args.id),
  })) parts.push(part);
  assert.equal(rounds, 2);
  assert.deepEqual(parts, [{ text: 'x = 8.' }], 'the internal guide is never a client action');
});

test('chat route streams guide activity, keeps the core, and never searches photos after a guided photo solution', async () => {
  const { readChatSse } = require('../lib/ai/sse.ts');
  const { CORE_SYSTEM_INSTRUCTION } = require('../lib/ai/core-instruction.ts');
  for (const { valid, priorClarify } of [
    { valid: true, priorClarify: false },
    { valid: true, priorClarify: true },
    { valid: false, priorClarify: false },
  ]) {
    const updates = [];
    const clientTools = [];
    const events = [];
    const provider = {
      generateToolStream: async function* (_prompt, options) {
        assert.ok(options.systemInstruction.startsWith(CORE_SYSTEM_INSTRUCTION));
        assert.doesNotMatch(options.systemInstruction, /# Algebra and equations/);
        const result = await options.executeTool({ name: 'load_skill', args: { id: valid ? 'algebra-equations' : '../.env' } });
        assert.equal(result.ok, valid);
        if (valid) assert.match(result.skill.content, /x = 8/);
        yield { text: 'x = 8.' };
      },
    };
    const { POST } = isolatedModule('app/api/chat/route.ts', {
      '@/lib/api/assert': { assertSignedInRequest: async () => ({ uid: 'test', anonymous: false }) },
      '@/lib/billing/server': { startAiUsageSession: async () => ({ report: () => {}, commit: async () => {} }) },
      '@/lib/admin/assert': {}, '@/lib/rag/server': { retrieveChunks: async () => [] },
      '@/lib/ai/gemini': { ...provider, getAIProvider: () => provider },
      '@/lib/images/search': {},
    });
    const response = await POST(new Request('https://example.com/api/chat', {
      method: 'POST', body: JSON.stringify({
        prompt: valid ? 'ამოხსენი ფოტოზე მოცემული ამოცანა.' : 'ამოხსენი 2(x - 3) = 10', mode: 'auto',
        context: priorClarify ? { priorClarify: true, pendingKind: 'images' } : {},
      }),
    }));
    const result = await readChatSse(response, {
      onToolStatus: (update) => { updates.push(update); events.push('status'); },
      onTool: (tool) => clientTools.push(tool.name),
      onDelta: () => events.push('text'),
    });
    assert.equal(result.text, 'x = 8.');
    assert.deepEqual(clientTools, ['answer']);
    assert.deepEqual(events, ['status', 'status', 'text']);
    assert.deepEqual(updates.map((update) => update.phase), ['start', valid ? 'complete' : 'error']);
    assert.equal(updates[0].toolName, 'load_skill');
    assert.equal(updates[0].id, updates[1].id);
    assert.match(updates[0].status, /გზამკვლევ/);
    assert.equal(updates[0].detail, valid ? 'algebra-equations' : '../.env');
  }
});
