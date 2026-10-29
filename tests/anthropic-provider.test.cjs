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

test('cache usage includes all input tokens and bills reads and writes at their own rates', () => {
  const { anthropicCallUsage } = require('../lib/ai/anthropic.ts');
  const { priceAiCall, mergeAiUsageDelta, emptyAiUsageDelta } = require('../lib/billing/pricing.ts');
  const call = anthropicCallUsage('claude-haiku-5-5', { usage: {
    input_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200,
    cache_creation: { ephemeral_5m_input_tokens: 200, ephemeral_1h_input_tokens: 0 }, output_tokens: 20,
  } });
  assert.equal(call.inputTokens, 1300);
  assert.equal(call.totalTokens, 1320);
  assert.equal(call.cacheReadInputTokens, 1000);
  assert.equal(call.cacheWriteInputTokens, 200);
  assert.equal(priceAiCall(call).costMicros, 55);
  assert.equal(priceAiCall({ ...call, model: 'claude-sonnet-5-5' }).costMicros, 1000);
  const merged = mergeAiUsageDelta(emptyAiUsageDelta(), priceAiCall(call));
  assert.equal(merged.cacheReadInputTokens, 1000);
  assert.equal(merged.cacheWriteInputTokens, 200);
  // Cached tokens also count toward the long-input threshold; 1h writes cost 2x.
  assert.equal(priceAiCall({ ...call, inputTokens: 100001, cacheReadInputTokens: 100000,
    cacheWriteInputTokens: 1, cacheWrite1hInputTokens: 1, outputTokens: 0 }).costMicros, 5001);
});

test('Claude caching preserves instructions exactly and reports streaming cache counts once', async () => {
  const { AnthropicProvider } = require('../lib/ai/anthropic.ts');
  const payloads = [], usage = [];
  const originalFetch = global.fetch, originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  global.fetch = async (_url, init) => {
    payloads.push(JSON.parse(init.body));
    const frames = [
      { type: 'message_start', message: { usage: { input_tokens: 8, cache_read_input_tokens: 1000, cache_creation_input_tokens: 20 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '4' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
    ];
    return new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(''));
  };
  const system = 'Stable core\n\n<project_context>\nTest\n</project_context>\n\n<turn_context>\nChanging data\n</turn_context>';
  try {
    const provider = new AnthropicProvider();
    for await (const _ of provider.generateToolStream('2+2', { systemInstruction: system, tools: ['answer'], webSearch: false, usage: v => usage.push(v) })) {}
    assert.deepEqual(payloads[0].cache_control, { type: 'ephemeral' });
    assert.equal(payloads[0].system.map(b => b.text).join(''), system);
    assert.ok(payloads[0].system[0].cache_control);
    assert.equal(payloads[0].system[1].cache_control, undefined);
    assert.ok(payloads[0].tools.at(-1).cache_control);
    assert.equal(usage.length, 1);
    assert.equal(usage[0].inputTokens, 1028);
    assert.equal(usage[0].cacheReadInputTokens, 1000);
    await provider.generateText('one-off summary', { systemInstruction: 'Summary rules', cache: false });
    assert.equal(payloads[1].cache_control, undefined);
    assert.equal(payloads[1].system, 'Summary rules');
    await provider.generateText('one-off transformation', { systemInstruction: 'Unique artifact input' });
    assert.equal(payloads[2].cache_control, undefined);
    assert.equal(payloads[2].system, 'Unique artifact input');
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  }
});

test('Anthropic web-search request fees are included in weekly plan spend', () => {
  const { priceAiCall, mergeAiUsageDelta, emptyAiUsageWeek } = require('../lib/billing/pricing.ts');
  const usage = priceAiCall({
    provider: 'anthropic', model: 'claude-haiku-5-5', inputTokens: 1_000, outputTokens: 1_000,
    thinkingTokens: 0, totalTokens: 2_000, webSearchRequests: 2,
  });
  assert.equal(usage.webSearchRequests, 2);
  assert.equal(usage.costMicros, 20_600);
  assert.equal(mergeAiUsageDelta(emptyAiUsageWeek('2026-10-26'), usage).costMicros, 20_600);
});

test('actual citations stay ahead of earlier raw search results in the compact source list', async () => {
  const { AnthropicProvider } = require('../lib/ai/anthropic.ts');
  const previousFetch = global.fetch, previousKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  global.fetch = async () => new Response([
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'web_search_tool_result', content: Array.from({ length: 6 }, (_, i) => ({ type: 'web_search_result', url: `https://example.com/result${i}`, title: `Result ${i}` })) } },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'The arithmetic mean of the two middle values.' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'citations_delta', citation: { type: 'web_search_result_location', url: 'https://docs.python.org/3/library/statistics.html', title: 'Python statistics' } } },
    { type: 'message_delta', usage: { output_tokens: 10 }, delta: { stop_reason: 'end_turn' } },
  ].map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(''));
  try {
    let answer = '';
    for await (const part of new AnthropicProvider().generateToolStream('Look up median', { tools: [] })) answer += part.text ?? '';
    assert.match(answer, /Sources:\n- \[Python statistics\]/);
    assert.equal((answer.match(/^- \[/gm) || []).length, 5);
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
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

test('Claude can use native web search, returns source links, and reports search usage', async () => {
  const { AnthropicProvider } = require('../lib/ai/anthropic.ts');
  const provider = new AnthropicProvider();
  const payloads = [];
  const usage = [];
  const originalFetch = global.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  global.fetch = async (_url, init) => {
    payloads.push(JSON.parse(init.body));
    const frames = [
      { type: 'message_start', message: { usage: { input_tokens: 10 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Today is sunny.' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'citations_delta', citation: { type: 'web_search_result_location', title: 'Weather source', url: 'https://example.com/weather', cited_text: 'Sunny today.' } } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4, server_tool_use: { web_search_requests: 2 } } },
      { type: 'message_stop' },
    ];
    return new Response(frames.map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join(''), {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };
  const parts = [];
  try {
    for await (const part of provider.generateToolStream('What is the current weather?', {
      model: 'claude-haiku-5-5', tools: [],
      systemInstruction: 'For current or future weather, use Claude web_search. For a Georgian city, the first search must target amindige.com.',
      webSearchRequired: true,
      usage: (value) => usage.push(value),
    })) parts.push(part);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  }
  assert.ok(payloads[0].tools.some((tool) => tool.type === 'web_search_20250305' && tool.name === 'web_search'));
  assert.deepEqual(payloads[0].tool_choice, { type: 'tool', name: 'web_search' });
  assert.equal(payloads[0].tools.find((tool) => tool.name === 'web_search').max_uses, 2);
  assert.deepEqual(payloads[0].tools.find((tool) => tool.name === 'web_search').allowed_domains, ['meteo.gov.ge', 'amindige.com', 'amindi.net']);
  assert.equal(usage[0].webSearchRequests, 2);
  assert.match(parts.map((part) => part.text ?? '').join(''), /Sources:\n- \[Weather source\]\(https:\/\/example.com\/weather\)/);
});

test('Claude web-search result URLs remain available as sources when it omits citation annotations', async () => {
  const { AnthropicProvider } = require('../lib/ai/anthropic.ts');
  const provider = new AnthropicProvider();
  const originalFetch = global.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  global.fetch = async () => {
    const frames = [
      { type: 'message_start', message: { usage: { input_tokens: 10 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'web_search_tool_result', tool_use_id: 'search-1', content: [{ type: 'web_search_result', title: 'Tbilisi weather today', url: 'https://example.com/tbilisi' }] } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'It is cloudy in Tbilisi today.' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 6, server_tool_use: { web_search_requests: 1 } } },
      { type: 'message_stop' },
    ];
    return new Response(frames.map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join(''), {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };
  const parts = [];
  try {
    for await (const part of provider.generateToolStream('Weather in Tbilisi?', { model: 'claude-haiku-5-5', tools: [] })) parts.push(part);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  }
  assert.match(parts.map((part) => part.text ?? '').join(''), /\[Tbilisi weather today\]\(https:\/\/example\.com\/tbilisi\)/);
});

test('Claude can ignore native web search for a self-contained question without search fees', async () => {
  const { AnthropicProvider } = require('../lib/ai/anthropic.ts');
  const provider = new AnthropicProvider();
  const usage = [];
  const originalFetch = global.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  global.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body);
    assert.ok(payload.tools.some((tool) => tool.type === 'web_search_20250305'));
    assert.equal(payload.tools.find((tool) => tool.name === 'web_search').max_uses, 1);
    const frames = [
      { type: 'message_start', message: { usage: { input_tokens: 8 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '4' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ];
    return new Response(frames.map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join(''), {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };
  try {
    for await (const _part of provider.generateToolStream('What is 2 + 2?', {
      model: 'claude-haiku-5-5', tools: [], usage: (value) => usage.push(value),
    })) { /* Consume the mocked response. */ }
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  }
  assert.equal(usage[0].webSearchRequests, 0);
});

test('Claude preserves thinking text and signature when continuing after a server search pause', async () => {
  const { AnthropicProvider } = require('../lib/ai/anthropic.ts');
  const provider = new AnthropicProvider();
  const payloads = [];
  const originalFetch = global.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  global.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body);
    payloads.push(payload);
    const frames = payloads.length === 1 ? [
      { type: 'message_start', message: { usage: { input_tokens: 8 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Need a current source.' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'signed-thought' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'server_tool_use', id: 'search-1', name: 'web_search', input: { query: 'current fact' } } },
      { type: 'content_block_stop', index: 1 },
      { type: 'content_block_start', index: 2, content_block: { type: 'web_search_tool_result', tool_use_id: 'search-1', content: [] } },
      { type: 'content_block_stop', index: 2 },
      { type: 'message_delta', delta: { stop_reason: 'pause_turn' }, usage: { output_tokens: 3, server_tool_use: { web_search_requests: 1 } } },
      { type: 'message_stop' },
    ] : [
      { type: 'message_start', message: { usage: { input_tokens: 10 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Here is the current fact.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
      { type: 'message_stop' },
    ];
    return new Response(frames.map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join(''), {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };
  try {
    for await (const _part of provider.generateToolStream('What is the latest fact?', {
      model: 'claude-haiku-5-5', tools: [],
    })) { /* Consume the mocked response. */ }
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  }
  assert.equal(payloads[1].messages[1].content[0].thinking, 'Need a current source.');
  assert.equal(payloads[1].messages[1].content[0].signature, 'signed-thought');
});

test('Claude API rejection logs only a bounded provider error summary, never the prompt or API key', async () => {
  const { AnthropicProvider } = require('../lib/ai/anthropic.ts');
  const provider = new AnthropicProvider();
  const originalFetch = global.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalWarn = console.warn;
  const warnings = [];
  process.env.ANTHROPIC_API_KEY = 'test-key-secret';
  console.warn = (...args) => warnings.push(args.join(' '));
  global.fetch = async () => Response.json({
    type: 'error',
    error: { type: 'invalid_request_error', message: 'tools.0.input_schema was invalid' },
    request_id: 'req_test-safe-id',
  }, { status: 400 });
  try {
    await assert.rejects(provider.generateText('private prompt value', { model: 'claude-haiku-5-5' }), /HTTP 400/);
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /invalid_request_error/);
  assert.match(warnings[0], /req_test-safe-id/);
  assert.match(warnings[0], /input_schema was invalid/);
  assert.doesNotMatch(warnings[0], /private prompt value|test-key-secret/);
});

test('a forced presentation tool is selected once, then Claude can finish the answer', async () => {
  const { AnthropicProvider } = require('../lib/ai/anthropic.ts');
  const provider = new AnthropicProvider();
  const payloads = [];
  const originalFetch = global.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  global.fetch = async (_url, init) => {
    payloads.push(JSON.parse(init.body));
    const frames = payloads.length === 1
      ? [
          { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tool-1', name: 'illustrate', input: {} } },
          { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"blocks":[{"type":"formula_card","formula":"4x=16"}]}' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } },
          { type: 'message_stop' },
        ]
      : [
          { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'x = 4' } },
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
    for await (const part of provider.generateToolStream('Find x: 4x = 16', {
      model: 'claude-haiku-5-5', tools: ['illustrate'], toolChoice: 'illustrate',
      executeTool: async () => ({ ok: true }),
    })) parts.push(part);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  }
  assert.equal(payloads.length, 2);
  assert.deepEqual(payloads[0].tool_choice, { type: 'tool', name: 'illustrate' });
  assert.equal(payloads[1].tool_choice, undefined);
  assert.ok(parts.some((part) => part.tool?.name === 'illustrate'));
  assert.ok(parts.some((part) => part.text === 'x = 4'));
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
  assert.equal(requestBody.system.map(block => block.text).join(''), 'shared-tobyverse-system-instruction');
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
