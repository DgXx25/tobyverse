/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

test('topic words do not turn ordinary questions into external image searches', () => {
  const { wantsImages } = require('../lib/composer/intent.ts');
  const { fallbackToolAfterProvider } = require('../lib/chat/tool-routing.ts');
  for (const prompt of ['რა არის ფოტოსინთეზი?', 'როგორ მუშაობს ფოტორესპირაცია?', 'რა არის ფოტოგრაფია?', 'რას ნიშნავს ეს გრაფიკი?', 'What does a normal distribution graph mean?', 'მომიძებნე x-ის მნიშვნელობა']) {
    assert.equal(wantsImages(prompt), false, prompt);
    assert.equal(fallbackToolAfterProvider({ prompt, mode: 'auto' }).name, 'answer', prompt);
  }
  for (const prompt of ['მაჩვენე კატის ფოტოები', 'ფოტოებს მაჩვენებ?', 'კატის ფოტოსურათები', 'ფოტოსინთეზის სურათები', 'მომიძებნე გულის დიაგრამა', 'Find photos of a plant', 'Show me a diagram of the heart']) {
    assert.equal(wantsImages(prompt), true, prompt);
    assert.equal(fallbackToolAfterProvider({ prompt, mode: 'auto' }).name, 'search_images', prompt);
  }
});

test('short labels and long descriptions retain equal table columns', () => {
  const { layoutChatTable } = require('../lib/visuals/markdown-table.ts');
  const view = layoutChatTable(['Name', 'Explanation'], [['A', 'A much longer explanation that must wrap without shrinking the other column.']]);
  assert.deepEqual(view.compact, [false, false]);
});

test('review and Continue never request an unsolicited chat drill', () => {
  const { leadPathPrompt, moveOnPrompt } = require('../lib/paths/lead.ts');
  const prompts = [leadPathPrompt('Grammar', '', 'review'), moveOnPrompt('Next')];
  for (const prompt of prompts) {
    assert.doesNotMatch(prompt, /then drill|or one `question`|or one \\`question\\`|reuse those shapes with new numbers in chat/);
    assert.match(prompt, /suggest_practice/);
  }
});

test('chat checks require an explicit request rather than Continue or a path lead', () => {
  const { requestedChatExercise } = require('../lib/chat/prompt-ask.ts');
  assert.equal(requestedChatExercise('შემდეგი'), false);
  assert.equal(requestedChatExercise('Explain present perfect'), false);
  assert.equal(requestedChatExercise('Move-on (not a user request): ask me a question'), false);
  assert.equal(requestedChatExercise('Ask me a question about present perfect'), true);
  assert.equal(requestedChatExercise('აქ გამომცადე'), true);
  assert.equal(requestedChatExercise('Current exercise', true), true);
});
