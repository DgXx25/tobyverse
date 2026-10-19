/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(relative) {
  const filename = path.resolve(__dirname, '..', relative);
  const loaded = new Module(filename, module);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}

test('normal pasted work prose remains editable; only genuinely large text becomes a source', () => {
  const { shouldAttachPastedText, LARGE_PASTE_CHARS } = load('lib/composer/paste-policy.ts');
  const ordinaryDocument = 'This is a short application which needs two targeted changes. '.repeat(22);
  assert.equal(shouldAttachPastedText(ordinaryDocument), false);
  assert.equal(shouldAttachPastedText('word '.repeat(3000)), true);
  assert.equal(shouldAttachPastedText('https://example.test/' + 'a'.repeat(LARGE_PASTE_CHARS)), false);
  assert.equal(shouldAttachPastedText(' '.repeat(LARGE_PASTE_CHARS)), false);
});

test('the shared voice requires current-turn format and targeted-edit fidelity within its budget', () => {
  const { CORE_SYSTEM_INSTRUCTION: core } = load('lib/ai/core-instruction.ts');
  assert.match(core, /Earlier code requests do not set later formats/);
  assert.match(core, /preserve supplied wording, structure and facts outside requested edits/);
  assert.match(core, /a format correction changes presentation only/);
  assert.ok(core.split(/\s+/).length <= 400);
});
