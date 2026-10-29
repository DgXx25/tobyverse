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

const { forcedToolForRequest } = require('../lib/chat/tool-routing.ts');
const { weatherBlock, weatherSchema } = require('../lib/blocks/kinds/weather.ts');
const { matchChatBlocks } = require('../lib/blocks/match.ts');
const { parseTobyFence } = require('../lib/blocks/registry.ts');
const {
  compactWeatherReply,
  ensureCitedWeatherCard,
  extractWeatherFence,
  hasCitedWeatherResult,
  isPlainWeatherQuestion,
  isValidWeatherFence,
  weatherFenceFromCitedAnswer,
} = require('../lib/blocks/kinds/weather-response.ts');

test('weather questions are left to Claude web search instead of a forced custom weather tool', () => {
  const prompt = 'დღეს თბილისში რა ამინდია?';
  const result = forcedToolForRequest({ prompt, mode: 'auto' });
  assert.equal(result, null);
  assert.equal(isPlainWeatherQuestion(prompt), true);
  assert.ok(matchChatBlocks({ prompt, mode: 'auto' }).some((block) => block.id === 'weather'));
  assert.equal(isPlainWeatherQuestion('Compare today and yesterday weather in Tbilisi in detail'), false);
});

test('valid current weather data still renders when the model only localizes the labels it uses', () => {
  const parsed = parseTobyFence('toby weather', JSON.stringify({
    location: 'Tbilisi, Georgia',
    labels: { current: 'ახლა', today: 'დღეს' },
    current: { tempRangeC: [12, 14], condition: { text: 'ნოტიო და ღრუბლიანი' } },
    days: [{ date: '2026-10-29', minC: 12, maxC: 14, condition: { text: 'ღრუბლიანი' } }],
  }));
  assert.equal(parsed?.type, 'weather');
});

test('cited weather facts can be repaired into a validated range card without another search', async () => {
  const answer = 'დღეს თბილისში ნოტიო და ღრუბლიანი ამინდია, ტემპერატურა დაახლოებით 12–14°C.\n\nSources:\n- [Weather in Tbilisi today](https://amindi.net/en/page/yvela-qalaqi)';
  const fence = '```toby weather\n{"locale":"ka-GE","location":"Tbilisi, Georgia","current":{"tempRangeC":[12,14],"condition":{"text":"ნოტიო და ღრუბლიანი"}}}\n```';
  assert.equal(hasCitedWeatherResult(answer), true);
  assert.equal(isValidWeatherFence(extractWeatherFence(fence)), true);
  let formatCalls = 0;
  const repaired = await ensureCitedWeatherCard(answer, async (sourceBackedText) => {
    formatCalls += 1;
    assert.equal(sourceBackedText, answer);
    return fence;
  });
  assert.equal(formatCalls, 1);
  const compact = compactWeatherReply(repaired);
  assert.match(compact, /```toby weather/);
  assert.match(compact, /12,14/);
  assert.match(compact, /\[Weather in Tbilisi today\]/);
  assert.equal(hasCitedWeatherResult('ვერ დავადგენ ახლანდელ ამინდს.\n\nSources:\n- [Old page](https://example.com)'), false);
  assert.equal(hasCitedWeatherResult('ზუსტი დღევანდელი მონაცემი ვერ დავადგინე.\n\nSources:\n- [Old page](https://example.com)'), false);
  let staleFormatCalls = 0;
  await ensureCitedWeatherCard('ზუსტი დღევანდელი მონაცემი ვერ დავადგინე.\n\nSources:\n- [Old page](https://example.com)', async () => {
    staleFormatCalls += 1;
    return fence;
  });
  assert.equal(staleFormatCalls, 0);
});

test('formatter failure still creates a condition-only card from cited facts without duplicate prose or invented temperature', async () => {
  const answer = 'დღეს თბილისში ღრუბლიანი ამინდია.\n\nSources:\n- [Tbilisi weather today](https://example.com/weather)';
  const fence = weatherFenceFromCitedAnswer(answer, 'დღეს თბილისში როგორი ამინდია?');
  assert.equal(isValidWeatherFence(fence), true);
  const payload = JSON.parse(fence.match(/^```toby weather\s*([\s\S]*?)```$/i)[1]);
  assert.equal(payload.location, 'თბილისში');
  assert.deepEqual(payload.current, { condition: { text: 'დღეს თბილისში ღრუბლიანი ამინდია.' } });
  const repaired = await ensureCitedWeatherCard(answer, async () => { throw new Error('empty formatter response'); }, 'დღეს თბილისში როგორი ამინდია?');
  const compact = compactWeatherReply(repaired);
  assert.match(compact, /```toby weather/);
  assert.doesNotMatch(compact, /^დღეს თბილისში ღრუბლიანი ამინდია\./);
  assert.match(compact, /\[Tbilisi weather today\]/);
});

test('plain weather replies keep one sentence, the weather card, and citations only', () => {
  const text = [
    'თბილისში ახლა ღრუბლიანია. ტემპერატურა 14°C-ია.',
    'სხვა წყაროები სხვა დროს აჩვენებს და ზუსტი მონაცემი გადაამოწმე.',
    '```toby weather\n{"location":"Tbilisi","current":{"tempC":14,"condition":{"text":"ღრუბლიანია"}}}\n```',
    'Sources:\n- [Weather](https://example.com/weather)',
  ].join('\n\n');
  const compact = compactWeatherReply(text);
  assert.match(compact, /^თბილისში ახლა ღრუბლიანია\./);
  assert.match(compact, /```toby weather/);
  assert.match(compact, /\[Weather\]\(https:\/\/example\.com\/weather\)/);
  assert.doesNotMatch(compact, /სხვა წყაროები/);
});

test('an unverified current lookup stays brief and does not pretend stale results are current', () => {
  const compact = compactWeatherReply([
    'ახლა თბილისში მიმდინარე ამინდს დამოწმებულად ვერ დავადგენ.',
    'ნაპოვნი გვერდები ძველია. სხვა წყაროებიც ერთმანეთს არ ემთხვევა.',
    'Sources:\n- [Weather](https://example.com/weather)',
  ].join('\n\n'));
  assert.equal(compact, 'ახლა თბილისში მიმდინარე ამინდს დამოწმებულად ვერ დავადგენ.\n\nSources:\n- [Weather](https://example.com/weather)');
});

test('weather search can render current conditions without inventing a forecast', () => {
  const parsed = weatherSchema.safeParse({
    locale: 'ka-GE',
    location: 'Tbilisi, Georgia',
    current: { tempC: 16, condition: { text: 'მოღრუბლულია' } },
    hours: [],
    days: [],
  });
  assert.equal(parsed.success, true);
  assert.match(weatherBlock.card(), /If a reliable source supports the condition and a temperature or temperature range, you MUST render this card/i);
  assert.match(weatherBlock.card(), /Use tempRangeC as \[minimum, maximum\]/i);
  assert.match(weatherBlock.card(), /web_search/);
  assert.match(weatherBlock.card(), /prefer an official national meteorological service or an established local weather service/i);
  assert.match(weatherBlock.card(), /Search in English, even if the user asked in another language, and answer in the user's language/i);
  assert.match(weatherBlock.card(), /For a Georgian city, the first search must target amindige\.com; if it does not return current conditions(?: for the requested city)?, the second search must target meteo\.gov\.ge or amindi\.net/i);
  assert.match(weatherBlock.card(), /second and final search with a focused English query/i);
  assert.doesNotMatch(weatherBlock.card(), /2026-10-29|T14:00/);
  assert.match(weatherBlock.card(), /exactly one concise, natural sentence/i);
  assert.match(weatherBlock.card(), /Do not repeat temperature, feels-like or high\/low/i);
  assert.match(weatherBlock.card(), /Do not talk about websites, search, citations, or stale\/conflicting sources/i);
  assert.match(weatherBlock.card(), /never add a Sources heading or source list/i);
  assert.doesNotMatch(weatherBlock.card(), /Do not call a weather API/);
});

test('weather card accepts verified conditions when no temperature is present', () => {
  const parsed = weatherSchema.safeParse({
    locale: 'ka-GE',
    location: 'თბილისი',
    current: { condition: { text: 'ღრუბლიანი' } },
  });
  assert.equal(parsed.success, true);
});
