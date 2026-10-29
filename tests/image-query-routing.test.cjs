const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...args);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

delete process.env.TOBYVERSE_IMAGE_SEARCH_PLANNER;
const { imageHitRelevant, planImageSearch } = require('../lib/images/query.ts');
const { searchWebImages } = require('../lib/images/search.ts');
const { getGenerateTextCallCount } = require('../lib/ai/gemini.ts');

test('image search uses the model-selected query without a second planner call by default', async () => {
  const before = getGenerateTextCallCount();
  const plan = await planImageSearch('sunset colors over mountains');
  assert.match(plan.query, /sunset colors over mountains/);
  assert.deepEqual(plan.must, ['sunset', 'colors', 'over', 'mountains']);
  assert.equal(getGenerateTextCallCount(), before);
});

test('image relevance requires the subject instead of matching generic context words', () => {
  const query = 'sunsets around the world';
  assert.equal(
    imageHitRelevant('Narrative of a Voyage around the World - 1843 - Volume 2.djvu', query),
    false,
  );
  assert.equal(imageHitRelevant('Sunset over mountains.jpg', query), true);
  assert.equal(imageHitRelevant('Any unrelated image.jpg', 'around the world'), false);
});

test('non-English image searches get a concise English query when local translation is unavailable', async () => {
  const gemini = require('../lib/ai/gemini.ts');
  const originalGenerateText = gemini.generateText;
  gemini.generateText = async () => '{"query":"sunset sea","must":["sunset","sea"],"avoid":["book scan"]}';
  try {
    const plan = await planImageSearch('მაჩვენე მზის ჩასვლის ფოტო');
    assert.equal(plan.query, 'sunset sea');
    assert.ok(plan.must.includes('sunset'));
  } finally {
    gemini.generateText = originalGenerateText;
  }
});

test('general photo requests prefer stock-photo providers over arbitrary archive illustrations', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.PEXELS_API_KEY;
  const calls = [];
  process.env.PEXELS_API_KEY = 'test-pexels-key';
  global.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.hostname);
    if (url.hostname === 'api.pexels.com') {
      return Response.json({
        photos: [1, 2, 3].map((n) => ({
          alt: `Sunset over mountain ${n}`,
          src: { medium: `https://images.pexels.com/photos/${n}/photo.jpeg`, tiny: `https://images.pexels.com/photos/${n}/tiny.jpeg` },
        })),
      });
    }
    throw new Error(`unexpected source request: ${url.hostname}`);
  };
  try {
    const results = await searchWebImages('sunset mountain', 3);
    assert.equal(results.length, 3);
    assert.deepEqual(calls, ['api.pexels.com']);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.PEXELS_API_KEY;
    else process.env.PEXELS_API_KEY = originalKey;
  }
});
