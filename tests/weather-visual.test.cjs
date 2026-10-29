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
require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);

let weatherMood;
try { ({ weatherMood } = require('../lib/blocks/kinds/weather-style.ts')); } catch { /* The behavior is added with the implementation. */ }

test('weather mood follows forecast conditions and switches to a night palette after sunset', () => {
  assert.equal(typeof weatherMood, 'function', 'weatherMood helper should exist');
  assert.equal(weatherMood(0, 'Clear sky', true), 'clear');
  assert.equal(weatherMood(61, 'Rain', true), 'rain');
  assert.equal(weatherMood(95, 'Thunderstorm', true), 'storm');
  assert.equal(weatherMood(0, 'Clear sky', false), 'night');
});

test('weather card stays compact and only shows current conditions, today, and the next three hours', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { WeatherView } = require('../components/blocks/weather.tsx');
  const html = renderToStaticMarkup(React.createElement(WeatherView, { block: {
    locale: 'en',
    labels: { current: 'Now', today: 'Today', feelsLike: 'Feels like', humidity: 'Humidity', wind: 'Wind', nextHours: 'Next hours', now: 'Now', threeDay: '3-day forecast' },
    location: 'Tbilisi, Georgia',
    localTime: '2026-10-29T10:00',
    current: { tempC: 16, feelsLikeC: 15, condition: { text: 'Cloudy', code: 3 }, humidity: 61, windKph: 12, isDay: true },
    hours: [
      { time: '11:00', tempC: 16, condition: { text: 'Cloudy', code: 3 } },
      { time: '12:00', tempC: 17, condition: { text: 'Cloudy', code: 3 } },
      { time: '13:00', tempC: 18, condition: { text: 'Sunny', code: 0 } },
      { time: '14:00', tempC: 19, condition: { text: 'Sunny', code: 0 } },
    ],
    days: [
      { date: '2026-10-29', minC: 10, maxC: 18, condition: { text: 'Cloudy', code: 3 } },
      { date: '2026-10-30', minC: 9, maxC: 17, condition: { text: 'Rain', code: 61 } },
      { date: '2026-10-31', minC: 8, maxC: 16, condition: { text: 'Cloudy', code: 3 } },
    ],
  } }));

  assert.match(html, /Tbilisi, Georgia/);
  assert.match(html, /Feels like/);
  assert.match(html, /11:00/);
  assert.match(html, /13:00/);
  assert.match(html, /14:00/);
  assert.doesNotMatch(html, /Humidity|Wind|3-day forecast|Search sources are cited below/);
});

test('weather card can show a compact horizontal daily forecast when hourly data is unavailable', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { WeatherView } = require('../components/blocks/weather.tsx');
  const { weatherSchema } = require('../lib/blocks/kinds/weather.ts');
  const block = weatherSchema.parse({
    locale: 'en',
    location: 'Tbilisi, Georgia',
    current: { tempC: 16, condition: { text: 'Cloudy', code: 3 } },
    days: [
      { date: '2026-10-29', minC: 11, maxC: 17, condition: { text: 'Cloudy', code: 3 } },
      { date: '2026-10-30', minC: 12, maxC: 18, condition: { text: 'Rain', code: 61 } },
      { date: '2026-10-31', minC: 10, maxC: 15, condition: { text: 'Sunny', code: 0 } },
    ],
  });
  const html = renderToStaticMarkup(React.createElement(WeatherView, { block }));
  assert.match(html, /Thu/);
  assert.match(html, /Fri/);
  assert.match(html, /Sat/);
  assert.match(html, /12°/);
  assert.match(html, /18°/);
});

test('weather card displays a sourced temperature range without inventing a midpoint', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { WeatherView } = require('../components/blocks/weather.tsx');
  const { weatherSchema } = require('../lib/blocks/kinds/weather.ts');
  const block = weatherSchema.parse({
    locale: 'ka-GE',
    labels: { current: 'ახლა' },
    location: 'Tbilisi, Georgia',
    current: { tempRangeC: [12, 14], condition: { text: 'ნოტიო და ღრუბლიანი' } },
  });
  const html = renderToStaticMarkup(React.createElement(WeatherView, { block }));
  assert.match(html, /12–14°/);
  assert.match(html, /ნოტიო და ღრუბლიანი/);
});

test('weather card omits an unsupported temperature instead of showing a placeholder', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { WeatherView } = require('../components/blocks/weather.tsx');
  const { weatherSchema } = require('../lib/blocks/kinds/weather.ts');
  const block = weatherSchema.parse({
    locale: 'ka-GE',
    location: 'თბილისი',
    current: { condition: { text: 'ღრუბლიანი' } },
  });
  const html = renderToStaticMarkup(React.createElement(WeatherView, { block }));
  assert.match(html, /თბილისი/);
  assert.match(html, /ღრუბლიანი/);
  assert.doesNotMatch(html, />—<|>NaN°?</);
});
