/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) request = path.join(root, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
};

function isolated(relativePath, mocks) {
  const filename = path.join(root, relativePath);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  loaded.require = name => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}

test('a question about a source photo answers from its OCR passage without external image search', async () => {
  const ocr = 'Image 1 — Visible text: R-squared = 0.9390; StudyH coefficient = 1.215842. Visual description: regression output table.';
  let searched = 0;
  let sawPassage = false;
  const provider = {
    generateToolStream: async function* (_prompt, options) {
      sawPassage = options.systemInstruction.includes(ocr);
      assert.equal(options.tools.includes('search_images'), false);
      assert.equal(options.webSearch, false);
      const blocked = await options.executeTool({ name: 'search_images', args: { query: 'regression' } });
      assert.equal(blocked.ok, false);
      yield { tool: { name: 'answer', args: {} } };
      yield { text: 'დიახ, ცხრილში R-squared არის 0.9390.' };
    },
  };
  const { POST } = isolated('app/api/chat/route.ts', {
    'next/server': { after: () => {} },
    '@/lib/api/assert': { assertSignedInRequest: async () => ({ uid: 'u', anonymous: false }) },
    '@/lib/admin/assert': {},
    '@/lib/billing/account-server': { readAccountAccess: async () => ({ plan: 'free_beta' }) },
    '@/lib/billing/server': { startAiUsageSession: async () => ({ report: () => {}, commit: async () => {} }) },
    '@/lib/chat/conversation-store': { openConversation: async () => null },
    '@/lib/chat/linked-pages': { readChatLinkedPages: async () => [] },
    '@/lib/skills/server': { createSkillLoader: () => () => ({}) },
    '@/lib/rag/server': { retrieveChunks: async input => {
      assert.deepEqual(input.materialIds, ['seminar']);
      assert.deepEqual(input.previousUserPrompts, ['სემინარი 3-ში რა წერია?']);
      return [{ id: 'seminar/chunk', materialId: 'seminar', title: 'სემინარი 3', page: 1, pageEnd: 1, section: '', text: ocr, score: 1 }];
    } },
    '@/lib/ai/gemini': {
      generateToolStream: (...args) => provider.generateToolStream(...args),
      generateTextStream: async function* () { throw new Error('Unexpected text fallback'); },
      getAIProvider: () => provider,
      resolveAIRequest: () => ({ provider, model: 'claude-haiku-5-5' }),
    },
    '@/lib/images/search': { allowImageSearch: () => true, clampImageCount: () => 8, searchWebImages: async () => { searched++; return []; } },
  });
  const response = await POST(new Request('https://example.com/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'ფაილში ორიგინალში ფოტოს სახით არის ცხრილი; მისი მონაცემები რა არის?',
      history: [{ role: 'user', content: 'სემინარი 3-ში რა წერია?' }, { role: 'assistant', content: 'სემინარის ტექსტი წავიკითხე.' }],
      context: { projectId: 'p', hasMaterials: true, materialIds: ['seminar'] },
    }),
  }));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(sawPassage, true);
  assert.equal(searched, 0);
  assert.match(body, /R-squared არის 0\.9390/);
  assert.doesNotMatch(body, /gallery-/);
});
