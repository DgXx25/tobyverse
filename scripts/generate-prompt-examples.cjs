/* eslint-disable @typescript-eslint/no-require-imports */
// Run from the repository root: node scripts/generate-prompt-examples.cjs
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

const { buildChatSystemPrompt } = require('../lib/chat/context.ts');
const { CORE_SYSTEM_INSTRUCTION } = require('../lib/ai/core-instruction.ts');
const base = { projectId: 'example', projectTitle: 'Workspace', projectDescription: '', goal: '', mode: 'auto', materials: [], knowledgeItems: [] };
const examples = [
  ['Normal chat', { ...base, prompt: 'Help me phrase a polite reply declining an invitation.' }],
  ['Active path thread', {
    ...base, mode: 'teacher', prompt: 'Walk me through this step.', inPathThread: true,
    path: { title: 'Release planning', courseTitle: 'Delivery', nodeTitle: 'Define the scope', teach: 'Identify the intended outcome and constraints.', outcome: 'A clear scope', done: 0, total: 4, courseCount: 1, started: true },
  }],
  ['Subject skill with memory and RAG', {
    ...base, prompt: 'Explain photosynthesis.', memories: [{ id: 'm1', content: 'Preferred language: English' }],
    sources: [{ n: 1, materialId: 'm', title: 'Biology notes', page: 2, pageEnd: 2, section: 'Energy', text: 'Photosynthesis converts light energy to chemical energy. Chloroplasts contain chlorophyll.' }],
  }],
];
const lines = [
  '# Generated system prompt examples', '',
  'Regenerate with `node scripts/generate-prompt-examples.cjs`. These complete prompts come from `buildChatSystemPrompt` with the inputs below. No model call is needed. Tool schemas and the latest user message travel separately through the existing API. The static core is identical in all three.', '',
  `Core word count: ${CORE_SYSTEM_INSTRUCTION.split(/\s+/).length}.`, '',
];
for (const [name, context] of examples) {
  lines.push(`## ${name}`, '', 'Context input:', '', '```json', JSON.stringify(context, null, 2), '```', '',
    'Final system prompt:', '', '````text', buildChatSystemPrompt(context), '````', '');
}
fs.writeFileSync(path.join(root, 'docs/prompt-examples.md'), lines.join('\n'));
console.log('Generated docs/prompt-examples.md');
