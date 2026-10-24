/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

function load(relative, dependencies = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.require = name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.startsWith('node:')) return require(name);
    assert.fail(`Unexpected dependency ${name}`);
  };
  instance._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return instance.exports;
}

test('memory capacity scales with the trusted effective plan and admin is uncapped', () => {
  const { memoryLimitsForPlan } = load('lib/memory/limits.ts');
  assert.deepEqual(memoryLimitsForPlan('free_beta'), { savedFacts: 40, inferredPatterns: 3, projectFacts: 12, topicsPerProject: 20 });
  assert.deepEqual(memoryLimitsForPlan('lite'), { savedFacts: 80, inferredPatterns: 6, projectFacts: 20, topicsPerProject: 30 });
  assert.deepEqual(memoryLimitsForPlan('pro'), { savedFacts: 160, inferredPatterns: 12, projectFacts: 40, topicsPerProject: 50 });
  assert.deepEqual(memoryLimitsForPlan('max'), { savedFacts: 320, inferredPatterns: 24, projectFacts: 80, topicsPerProject: 100 });
  assert.deepEqual(memoryLimitsForPlan('team'), memoryLimitsForPlan('max'));
  assert.deepEqual(memoryLimitsForPlan('admin'), { savedFacts: null, inferredPatterns: null, projectFacts: null, topicsPerProject: null });
});

test('full or downgraded quotas block additions but preserve existing memories', () => {
  const { hasMemoryCapacity } = load('lib/memory/limits.ts');
  assert.equal(hasMemoryCapacity(39, 40), true);
  assert.equal(hasMemoryCapacity(40, 40), false);
  assert.equal(hasMemoryCapacity(45, 40), false);
  assert.equal(hasMemoryCapacity(1000, null), true);
});

test('automatic memory writes use the server-resolved plan and Firestore blocks client quota bypasses', () => {
  const route = source('app/api/memory/route.ts');
  const insights = source('app/api/insights/route.ts');
  const rules = source('firestore.rules');
  assert.match(route, /memoryStatus\(session\.uid\)/);
  assert.match(route, /persistMemoryChanges\(/);
  assert.match(insights, /readAccountAccess\(uid\)/);
  assert.match(rules, /allow create, update: if false;[\s\S]*?allow delete: if isOwner\(userId\)/);
  assert.match(rules, /!request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasAny\(\["projectMemory"\]\)/);
});

test('older project-memory clients receive an authenticated retirement response without storage access', async () => {
  let authenticated = false;
  const { PUT } = load('app/api/memory/project/route.ts', {
    '@/lib/api/assert': { assertAccountRequest: async () => { authenticated = true; }, authErrorResponse: () => assert.fail('unexpected auth failure') },
  });
  const result = await PUT(new Request('http://localhost/api/memory/project', { method: 'PUT' }));
  assert.equal(authenticated, true);
  assert.equal(result.status, 410);
});
