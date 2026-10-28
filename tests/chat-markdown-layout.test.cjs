/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args);
};
const load = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
require.extensions['.ts'] = load;
require.extensions['.tsx'] = load;
require.extensions['.css'] = () => {};

const { prepareChatMarkdown, splitMarkdownTables } = require('../lib/visuals/markdown-table.ts');
const { RichContent } = require('../components/rich-content.tsx');
const { readChatSse } = require('../lib/ai/sse.ts');
const { createChunkBuffer } = require('../lib/ai/chunk-stream.ts');

const collapsed = 'ფოტოსინთეზი სინათლის ენერგიას გარდაქმნის. ### მთავარი კომპონენტები | კომპონენტი | როლი | წყარო | |:---|:---|:---| | **მზის ენერგია** | ენერგიის წყარო | მზე | | **წყალი** ($H_2O$) | ნედლეული | ფესვები | | **ჟანგბადი** ($O_2$) | პროდუქტი | ფოთლები | ### სად მიმდინარეობს პროცესი? პროცესი მიმდინარეობს ქლოროპლასტებში.';

test('collapsed Markdown with an explicit delimiter row becomes a table between prose and headings', () => {
  const parts = splitMarkdownTables(prepareChatMarkdown(collapsed));
  const table = parts.find((part) => part.kind === 'table');
  assert.ok(table, 'recognize the explicit three-column table');
  assert.deepEqual(table.headers, ['კომპონენტი', 'როლი', 'წყარო']);
  assert.equal(table.rows.length, 3);
  assert.equal(table.rows[1][0], '**წყალი** ($H_2O$)');
  const html = renderToStaticMarkup(React.createElement(RichContent, { text: collapsed }));
  assert.match(html, /<h3><span>მთავარი კომპონენტები<\/span><\/h3>/);
  assert.match(html, /<table/);
  assert.match(html, /<h3><span>სად მიმდინარეობს პროცესი\?<\/span><\/h3>/);
  assert.match(html, /<p><span>პროცესი მიმდინარეობს ქლოროპლასტებში\.<\/span><\/p>/);
  assert.doesNotMatch(html, /###|:---/);
});

test('valid Markdown, literal pipes, math, and fenced examples keep their structure', () => {
  const prose = 'Use A | B for alternatives; 1 | 2 is an example. ### is a Markdown marker.';
  assert.equal(prepareChatMarkdown(prose), prose);
  const code = '```text\n' + collapsed + '\n| A | B |\n| --- | --- |\n| \\(x\\) | \\(y\\) |\n```';
  assert.equal(prepareChatMarkdown(code), code);
  assert.equal(prepareChatMarkdown('Example: `' + collapsed + '`'), 'Example: `' + collapsed + '`');
  const source = 'Intro\n\n## Components\n\n| A | B |\n| --- | --- |\n| $|x|$ | a \\| b |\n\nAfter.';
  const parts = splitMarkdownTables(prepareChatMarkdown(source));
  assert.deepEqual(parts.find((part) => part.kind === 'table').rows, [['$|x|$', 'a | b']]);
  const prepared = prepareChatMarkdown(collapsed);
  assert.equal(prepareChatMarkdown(prepared), prepared, 'normalization is stable on repeated renders');
  const afterFence = '```toby {"type":"paper","reuse":true}```\n\n' + collapsed;
  assert.ok(splitMarkdownTables(prepareChatMarkdown(afterFence)).some((part) => part.kind === 'table'));
});

test('chat Markdown omits horizontal dividers after quotes while preserving the quote and following content', () => {
  const html = renderToStaticMarkup(React.createElement(RichContent, { text: '> Quote callout\n\n---\n\nFollowing paragraph.' }));
  assert.match(html, /<blockquote class="note-highlight my-5 px-3\.5 py-2\.5">/);
  assert.match(html, /Following paragraph\./);
  assert.doesNotMatch(html, /<hr\b/);
});

test('arbitrary UTF-8 network boundaries preserve opening Georgian words and Markdown through storage cleanup', async () => {
  const answer = 'ფოტოსინთეზი არის მნიშვნელოვანი პროცესი.\n\n### კომპონენტები\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
  const encoder = new TextEncoder();
  const wire = encoder.encode([...answer].map((delta) => `data: ${JSON.stringify({ delta })}\n\n`).join(''));
  const response = new Response(new ReadableStream({ start(controller) {
    for (let offset = 0; offset < wire.length; offset += 7) controller.enqueue(wire.slice(offset, offset + 7));
    controller.close();
  } }));
  const buffer = createChunkBuffer(() => {}, { deltaMode: 'append', scheduler: { request: () => 1, cancel: () => {}, now: () => 0 } });
  const result = await readChatSse(response, { onDelta: (delta) => buffer.push(delta) });
  assert.equal(result.text, answer);
  assert.equal(buffer.finish(), answer);
});
