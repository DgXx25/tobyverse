const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  const parent = args[0];
  if (name.startsWith('@/')) return resolve.call(this, path.join(root, name.slice(2)), ...args);
  if (parent?.filename && name.startsWith('.') && name.endsWith('.js')) {
    const tsSibling = path.resolve(path.dirname(parent.filename), `${name.slice(0, -3)}.ts`);
    if (fs.existsSync(tsSibling)) return tsSibling;
  }
  return resolve.call(this, name, ...args);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

test('Haiku is available on free plans; Sonnet is Premium-only and neither enters Auto', () => {
  const { availableAiModels, isAllowedAiModel } = require('../lib/ai/catalog.ts');
  assert.equal(isAllowedAiModel('claude-haiku-5-5', 'free_beta'), true);
  assert.equal(isAllowedAiModel('claude-sonnet-5-5', 'free_beta'), false);
  assert.equal(isAllowedAiModel('claude-sonnet-5-5', 'pro'), true);
  assert.ok(!availableAiModels('free_beta').some((model) => model.id.startsWith('claude-sonnet')));
  assert.deepEqual(availableAiModels('free_beta').filter((model) => model.id.startsWith('claude-')).map((model) => model.id), ['claude-haiku-5-5']);
});

test('Claude usage is priced with current Haiku 5.5 and Sonnet 5.5 rates', () => {
  const { priceAiCall } = require('../lib/billing/pricing.ts');
  const haiku = priceAiCall({ provider: 'anthropic', model: 'claude-haiku-5-5', inputTokens: 1_000, outputTokens: 1_000, thinkingTokens: 0, totalTokens: 2_000 });
  const sonnet = priceAiCall({ provider: 'anthropic', model: 'claude-sonnet-5-5', inputTokens: 1_000_000, outputTokens: 1_000_000, thinkingTokens: 0, totalTokens: 2_000_000 });
  assert.equal(haiku.costMicros, 600);
  assert.equal(sonnet.costMicros, 12_000_000);
});

test('Claude tool calls use Tobyverse tool schemas and execute a native artifact tool', async () => {
  const { AnthropicProvider } = require('../lib/ai/anthropic.ts');
  const provider = new AnthropicProvider();
  const events = [];
  const originalFetch = global.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  global.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body);
    events.push(payload);
    const frames = [
      { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tool-1', name: 'create_note', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"title":"Draft","content":"Hello"}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } },
      { type: 'message_stop' },
    ];
    return new Response(frames.map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join(''), {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };
  try {
    for await (const part of provider.generateToolStream('Make a note', {
      model: 'claude-haiku-5-5', tools: ['create_note'],
      executeTool: async (call) => ({ ok: true, saved: call.args.title }),
    })) events.push(part);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  }
  assert.equal(events[0].tools.some((tool) => tool.name === 'create_note'), true);
  assert.equal(events.at(-1).tool.name, 'create_note');
  assert.equal(events.at(-1).tool.args.title, 'Draft');
  assert.equal(events.at(-1).tool.args.content, 'Hello');
});

test('Claude receives the shared system instruction and keeps streamed answer text in tool-loop state', async () => {
  const { AnthropicProvider } = require('../lib/ai/anthropic.ts');
  const provider = new AnthropicProvider();
  const originalFetch = global.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  let requestBody;
  global.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    const frames = [
      { type: 'message_start', message: { usage: { input_tokens: 12, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ზუსტი პასუხი.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } },
      { type: 'message_stop' },
    ];
    return new Response(frames.map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join(''), {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };
  const parts = [];
  try {
    for await (const part of provider.generateToolStream('ეს ჩემი კითხვა', {
      model: 'claude-haiku-5-5', tools: false,
      systemInstruction: 'shared-tobyverse-system-instruction',
    })) parts.push(part);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  }
  assert.equal(requestBody.system, 'shared-tobyverse-system-instruction');
  assert.deepEqual(parts, [{ text: 'ზუსტი პასუხი.' }]);
});

test('photo requests use the dedicated Gemini Flash image route while text stays on Claude', () => {
  const { selectModel } = require('../lib/ai/model-routing.ts');
  const { getAIProvider, resolveAIRequest, GEMINI_IMAGE_MODEL } = require('../lib/ai/gemini.ts');
  assert.equal(selectModel('What is 2+2?', 'claude-haiku-5-5').model, 'claude-haiku-5-5');
  assert.equal(selectModel('What is 2+2?', 'auto').model, 'claude-haiku-5-5');
  assert.equal(getAIProvider('claude-sonnet-5-5').id, 'anthropic');
  assert.equal(getAIProvider().id, 'anthropic');
  assert.throws(() => getAIProvider('gemini-3.5-flash'), /disabled/);
  const images = [{ mimeType: 'image/jpeg', data: 'sample' }];
  const photoRequest = resolveAIRequest('claude-haiku-5-5', images);
  assert.equal(photoRequest.provider.id, 'gemini');
  assert.equal(photoRequest.model, GEMINI_IMAGE_MODEL);
  assert.equal(GEMINI_IMAGE_MODEL, 'gemini-3.1-flash-lite');
  const textRequest = resolveAIRequest('claude-haiku-5-5', []);
  assert.equal(textRequest.provider.id, 'anthropic');
  assert.equal(textRequest.model, 'claude-haiku-5-5');
  assert.equal(resolveAIRequest('claude-haiku-5-5', [{ mimeType: 'image/jpeg', data: '' }]).provider.id, 'anthropic');
});
