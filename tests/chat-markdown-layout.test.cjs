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

test('chat response headings are slightly larger than body text', () => {
  const css = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
  const headingRule = css.match(/\.chat-body h1,[\s\S]*?\.chat-body h3\s*\{([\s\S]*?)\}/)?.[1] || '';
  assert.match(headingRule, /font-size:\s*16px/);
});

test('ordered lists keep their starting number across intervening math blocks', () => {
  const html = renderToStaticMarkup(React.createElement(RichContent, { text: '1. Subtract four.\n\n$$3x=15$$\n\n$$x+1=6$$\n\n2. Divide by three.\n\n$$x=5$$' }));
  assert.match(html, /<ol start="2">/);
});

test('multi-step equation lists render as one native MATH card with separate rows', () => {
  const examples = [
    [
      'ამოხსნა:',
      '',
      '1. გადაიტანე 4 მარჯვნივ: \\(6z = 28 - 4\\), ანუ \\(6z = 24\\)',
      '2. გაყავი 6-ზე: \\(z = 4\\)',
    ].join('\n'),
    [
      'Solution:',
      '',
      '1. Subtract 4: \\(6z = 28 - 4\\), so \\(6z = 24\\)',
      '2. Divide by 6: \\(z = 4\\)',
    ].join('\n'),
  ];
  for (const text of examples) {
    const html = renderToStaticMarkup(React.createElement(RichContent, { text }));
    assert.equal((html.match(/data-kind="math"/g) || []).length, 1);
    assert.doesNotMatch(html, /<ol class="chat-math-step-list">/);
    assert.doesNotMatch(html, /<li>/);
    assert.equal((html.match(/class="chat-math"/g) || []).length, 2);
    assert.doesNotMatch(html, /tobyverse-step|tobyverse-note/);
  }
});

test('multi-equation reasoning in a paragraph becomes vertically stacked math rows', () => {
  const text = 'Subtract 6 from both sides: $3x = 15$. Then divide both sides by 3: $x = 5$.';
  const html = renderToStaticMarkup(React.createElement(RichContent, { text }));
  assert.equal((html.match(/data-kind="math"/g) || []).length, 1);
  assert.equal((html.match(/class="chat-math"/g) || []).length, 2);
  assert.doesNotMatch(html, /Subtract 6|Then divide/);
});

test('separate equation blocks stay inside one numbered list and inline LaTeX notes render', () => {
  const text = [
    'Solution:',
    '',
    '1. Subtract 2 from both sides:',
    '$$',
    '9x = 45',
    '$$',
    '',
    '1. Divide both sides by 9:',
    '$$x = 5$$',
    '',
    '$$',
    'x = 5',
    '\\text{Substitute $x=5$ to check}',
    '$$',
  ].join('\n');
  const html = renderToStaticMarkup(React.createElement(RichContent, { text }));
  assert.doesNotMatch(html, /<ol class="chat-math-step-list">/);
  assert.doesNotMatch(html, /<li>/);
  assert.equal((html.match(/data-kind="math"/g) || []).length, 2);
  assert.doesNotMatch(html, /Divide both sides by 9/);
  assert.match(html, /text-center text-\[12px\] font-semibold/);
  assert.match(html, /chat-inline-math/);
  assert.match(html, /Substitute/);
  assert.doesNotMatch(html, /tobyverse-step|tobyverse-note/);
});

test('single-step and mixed-content lists keep their original Markdown layout', () => {
  const oneStep = renderToStaticMarkup(React.createElement(RichContent, { text: '1. პასუხია \\(x = 4\\).' }));
  const mixed = renderToStaticMarkup(React.createElement(RichContent, {
    text: '1. \\(x = 4\\)\n2. შემოწმება წარმატებულია.',
  }));
  assert.doesNotMatch(oneStep, /data-kind="math"/);
  assert.match(mixed, /<ol>/);
  assert.doesNotMatch(mixed, /data-kind="math"/);
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
