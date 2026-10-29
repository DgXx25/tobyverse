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
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
require.extensions['.tsx'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);

test('search sources render as a compact site chip with a site icon and without a Sources label', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { SearchSources } = require('../components/workspace/search-sources.tsx');
  const html = renderToStaticMarkup(React.createElement(SearchSources, { sources: [
    { title: 'Met Office forecast', url: 'https://weather.metoffice.gov.uk/forecast/gcpvj0v07', hostname: 'weather.metoffice.gov.uk' },
    { title: 'Tbilisi weather', url: 'https://amindi.net/weather/tbilisi', hostname: 'amindi.net' },
  ] }));
  assert.doesNotMatch(html, /Sources:/);
  assert.match(html, /source-citation-pill/);
  assert.match(html, /Met Office/);
  assert.match(html, /\+1/);
  assert.match(html, /google\.com\/s2\/favicons/);
  const component = fs.readFileSync(path.join(root, 'components/workspace/search-sources.tsx'), 'utf8');
  assert.match(component, /source-citation-popover/);
  assert.match(component, /top-full[^\"]*pt-2/);
  const styles = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
  assert.match(styles, /\.chat-body \.source-citation-pill:hover[\s\S]*?border-color: var\(--panel-border\)/);
  assert.match(styles, /\.source-citation-popover a:hover \.source-citation-title[\s\S]*?text-decoration: underline/);
  assert.match(styles, /\.source-citation-popover a,[\s\S]*?text-decoration: none/);
});
