/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
};

const { createChunkBuffer, revealRate, snapToWord } = require("../lib/ai/chunk-stream.ts");

function fakeScheduler() {
  let time = 0;
  let queued = null;
  return {
    scheduler: {
      request(callback) {
        queued = callback;
        return 1;
      },
      cancel() {
        queued = null;
      },
      now: () => time,
    },
    frame(ms = 16) {
      time += ms;
      const callback = queued;
      queued = null;
      callback?.();
      return Boolean(queued);
    },
    get pending() {
      return Boolean(queued);
    },
  };
}

test("a large burst is revealed over several frames, never in one jump", () => {
  const clock = fakeScheduler();
  const seen = [];
  const buffer = createChunkBuffer((text) => seen.push(text), { scheduler: clock.scheduler });
  const burst = "Photosynthesis converts light into chemical energy. ".repeat(6);
  buffer.push(burst);
  while (clock.frame()) {
    /* run until caught up */
  }
  assert.ok(seen.length >= 6, `expected a gradual reveal, got ${seen.length} updates`);
  assert.equal(seen.at(-1).trim(), burst.trim());
  for (let i = 1; i < seen.length; i += 1) {
    assert.ok(seen[i].startsWith(seen[i - 1]), "text only ever grows");
  }
});

test("reveal never cuts inside a word", () => {
  const clock = fakeScheduler();
  const seen = [];
  const buffer = createChunkBuffer((text) => seen.push(text), { scheduler: clock.scheduler });
  buffer.push("alpha beta gamma delta epsilon zeta eta theta iota kappa");
  while (clock.frame()) {
    /* run */
  }
  for (const text of seen.slice(0, -1)) {
    assert.ok(/\s$/.test(text) || text === seen.at(-1), `partial "${text}" ended mid-word`);
  }
});

test("finish shows everything immediately and returns the final text", () => {
  const clock = fakeScheduler();
  const seen = [];
  const buffer = createChunkBuffer((text) => seen.push(text), { scheduler: clock.scheduler });
  buffer.push("one two three four five six seven eight nine ten");
  clock.frame();
  const final = buffer.finish();
  assert.equal(final, "one two three four five six seven eight nine ten");
  assert.equal(seen.at(-1), final);
  assert.equal(clock.pending, false);
});

test("drain resolves once the visible text caught up", async () => {
  const clock = fakeScheduler();
  const buffer = createChunkBuffer(() => undefined, { scheduler: clock.scheduler });
  buffer.push("a fairly long answer that arrives in one network burst of text");
  const drained = buffer.drain(5_000);
  while (clock.frame()) {
    /* run */
  }
  await drained;
  assert.equal(buffer.text.length > 0, true);
});

test("cumulative and incremental provider chunks both merge", () => {
  const clock = fakeScheduler();
  const buffer = createChunkBuffer(() => undefined, { scheduler: clock.scheduler });
  buffer.push("Hello");
  buffer.push("Hello world");
  buffer.push(" again");
  assert.equal(buffer.raw, "Hello world again");
});

test("the rate speeds up with the backlog and never drops to zero", () => {
  assert.ok(revealRate(0) > 0);
  assert.ok(revealRate(2000) > revealRate(100));
});

test("snapToWord does not split a surrogate pair", () => {
  const text = "😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀";
  const index = snapToWord(text, 1);
  assert.notEqual(index, 1);
});
