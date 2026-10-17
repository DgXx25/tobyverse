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
Module._resolveFilename = function(name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args);
};
const load = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop:true, jsx:ts.JsxEmit.ReactJSX },
}).outputText, filename);
require.extensions['.ts'] = load;
require.extensions['.tsx'] = load;
require.extensions['.css'] = () => {};

const block = { items:[{ symbol:'shuffle', title:'ეტაპი 1 — არჩევა', text:'ერთი **მთავარი აზრი**.\n\nშემდეგ $x = 2$.' },{ symbol:'filter', title:'შემოწმება', text:'- პირველი\n- მეორე', accent:'blue' }] };

test('sections validate row content and symbols without imposing a three-step template', () => {
  const { parseTobyFence } = require('../lib/blocks/registry.ts');
  const parsed = parseTobyFence('toby-sections', JSON.stringify(block));
  assert.equal(parsed?.type, 'sections');
  assert.equal(parsed.data.items.length, 2);
  assert.equal(parseTobyFence('toby-sections', JSON.stringify({ items:[block.items[0]] })).data.items.length, 1);
  for(const value of [{items:[]},{items:[{...block.items[0],symbol:'<svg onload=evil()>'}]},{items:[{...block.items[0],accent:'url(evil)'}]}]) assert.equal(parseTobyFence('toby-sections',JSON.stringify(value)),null);
});

test('section glyphs follow specific row meaning over a mismatched model pick', () => {
  const { resolveSectionSymbol } = require('../lib/blocks/section-symbols.ts');
  assert.equal(resolveSectionSymbol('ტემპერატურის მატება', 'წყალი თბება და ტემპერატურა იმატებს', 'sliders'), 'temperature');
  assert.equal(resolveSectionSymbol('ინტენსიური აორთქლება', 'წყალი თხევადიდან ორთქლად გადადის', 'check'), 'water');
  assert.equal(resolveSectionSymbol('დუღილი (100°C)', 'წყალი დუღს', 'process'), 'flame');
  assert.equal(resolveSectionSymbol('შედარება', 'მოთხოვნა და მიწოდება ერთმანეთს შეადარე', 'idea'), 'compare');
  assert.equal(resolveSectionSymbol('სხვა საკითხი', 'მოკლე ტექსტი უცნობ თემაზე', 'search'), 'search');
  const { RichContent } = require('../components/rich-content.tsx');
  const html = renderToStaticMarkup(React.createElement(RichContent, { text: '```toby sections\n'+JSON.stringify({ items:[{ symbol:'process', title:'ტემპერატურის მატება', text:'წყალი თბება.' }] })+'\n```' }));
  assert.match(html, /data-symbol="temperature"/);
});

test('sections render in answer order with rich text, math, lists and bounded nesting', () => {
  const { RichContent } = require('../components/rich-content.tsx');
  const nested = {...block,items:[...block.items,{symbol:'search',title:'მაგალითი',text:'```toby sections\n'+JSON.stringify(block)+'\n```'}]};
  const html = renderToStaticMarkup(React.createElement(RichContent,{text:'მანამდე\n\n```toby sections\n'+JSON.stringify(nested)+'\n```\n\nშემდეგ'}));
  assert.ok(html.indexOf('მანამდე') < html.indexOf('ეტაპი 1'));
  assert.ok(html.lastIndexOf('შემდეგ') > html.indexOf('შემოწმება'));
  assert.match(html,/<strong>/);
  assert.match(html,/class="katex"/);
  assert.match(html,/<li>/);
  assert.equal((html.match(/class="toby-sections"/g)||[]).length,1);
  assert.match(html,/var\(--palette-blue\)/);
});

test('completed section rows remain visible while the next row is still streaming', () => {
  const { parseTobyFence } = require('../lib/blocks/registry.ts');
  const partial = '{"items":[{"symbol":"check","title":"Ready","text":"Completed row"},{"symbol":"search","title":"Next"';
  const parsed = parseTobyFence('toby-sections',partial);
  assert.equal(parsed?.data.items.length,1);
  assert.equal(parsed.data.items[0].text,'Completed row');
});

test('sections are offered for relevant explanations without affecting translations or arithmetic', () => {
  const { matchChatBlocks } = require('../lib/blocks/match.ts');
  const base = {projectId:'p',projectTitle:'',projectDescription:'',goal:'',mode:'auto',materials:[],knowledgeItems:[]};
  for(const prompt of ['როგორ შევარჩიო ბრენდის სახელი?', 'ამოხსენი ეს განტოლება: x² − 5x + 6 = 0', 'Explain how a compiler works']) assert.ok(matchChatBlocks({...base,prompt}).some(x=>x.id==='sections'),prompt);
  for(const prompt of ['2+2','Hello','Translate this: steps','ინგლისურად როგორ ვთქვა: ხვალ ცოტა დამაგვიანდება?','How do I say hello in Georgian?']) assert.ok(!matchChatBlocks({...base,prompt}).some(x=>x.id==='sections'),prompt);
});

test('block color tokens use the exact shared light and dark accent palettes', () => {
  const { ACCENT_OPTIONS, applyThemeAccent } = require('../lib/workspace/theme.ts');
  const before = global.document;
  const beforeWindow = global.window;
  try {
    global.window = {};
    for(const theme of ['light','dark']) {
      const properties = new Map();
      global.document = {documentElement:{style:{setProperty:(key,value)=>properties.set(key,value)},classList:{toggle(){}}}};
      applyThemeAccent(theme,'blue',false);
      for(const option of ACCENT_OPTIONS) assert.equal(properties.get(`--palette-${option.id}`),option[theme]);
    }
  } finally { global.document = before; global.window = beforeWindow; }
});
