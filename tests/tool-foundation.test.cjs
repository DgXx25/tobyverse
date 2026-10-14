/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, options);
};
function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  module._compile(output, filename);
}
require.extensions[".ts"] = loadTypeScript;
require.extensions[".tsx"] = loadTypeScript;
require.extensions[".css"] = () => {};

const {
  CHAT_TOOL_DEFINITIONS,
  eligibleChatToolNames,
  parseToolCall,
  toAnthropicTools,
  toGeminiTools,
  toOpenAITools,
} = require("../lib/ai/tools.ts");
const { runToolLoop } = require("../lib/ai/tool-loop.ts");
const { forcedToolForRequest, fallbackToolAfterProvider } = require("../lib/chat/tool-routing.ts");
const { consumeSlashCommand } = require("../lib/composer/slash.ts");
const { ChatComposer } = require("../components/workspace/chat-composer.tsx");
const { IllustrationBlocks } = require("../components/workspace/illustration-blocks.tsx");

test("all provider mappers derive the same Auto registry, including artifact tools", () => {
  const names = eligibleChatToolNames("auto");
  assert.ok(names.includes("answer"));
  assert.ok(names.includes("illustrate"));
  assert.ok(names.includes("create_sheet"));
  assert.ok(names.includes("edit_sheet"));
  assert.ok(names.includes("create_practice"));
  assert.ok(names.includes("append_practice"));
  assert.equal(names.includes("start_path"), false);

  assert.deepEqual(toOpenAITools().map((item) => item.function.name), names);
  assert.deepEqual(toAnthropicTools().map((item) => item.name), names);
  assert.deepEqual(toGeminiTools().map((item) => item.name), names);
  assert.ok(CHAT_TOOL_DEFINITIONS.every((item) => typeof item.execute === "function"));
});

test("Teacher alone receives start_path while Fast ignores course creation", () => {
  assert.ok(eligibleChatToolNames("teacher").includes("start_path"));
  assert.equal(eligibleChatToolNames("fast").includes("start_path"), false);
  assert.equal(eligibleChatToolNames("fast").includes("create_path"), false);
  assert.equal(
    forcedToolForRequest({ accepted: "create_path", prompt: "economics", mode: "fast", hasMaterials: false }),
    null,
  );
});

test("Gemini-style tool loop executes calls and continues until text", async () => {
  const turns = [
    { parts: [{ functionCall: { name: "illustrate", args: { blocks: [{ type: "graph", slope: -1 }] } } }] },
    { parts: [{ functionCall: { name: "answer", args: {} } }] },
    { parts: [{ text: "Demand falls as price rises." }] },
  ];
  const executed = [];
  const result = await runToolLoop({
    maxRounds: 3,
    callModel: async () => turns.shift(),
    execute: async (call) => {
      executed.push(call.name);
      return { ok: true };
    },
  });

  assert.deepEqual(executed, ["illustrate", "answer"]);
  assert.equal(result.text, "Demand falls as price rises.");
  assert.equal(result.tool.name, "illustrate");
  assert.equal(result.rounds, 3);
});

test("only explicit slash or chip choices bypass the provider", () => {
  assert.deepEqual(
    forcedToolForRequest({ accepted: "create_sheet", prompt: "demand curve", mode: "auto", hasMaterials: false }),
    { name: "create_sheet", args: { topic: "demand curve" } },
  );
  assert.equal(
    forcedToolForRequest({ prompt: "გააკეთე კონსპექტი მოთხოვნის მრუდზე", mode: "auto", hasMaterials: false }),
    null,
  );
  assert.equal(
    fallbackToolAfterProvider({ prompt: "გააკეთე კონსპექტი მოთხოვნის მრუდზე", mode: "auto", hasMaterials: false }).name,
    "create_sheet",
  );
});

test("forced note clarifies only when both topic and materials are empty", () => {
  assert.equal(
    forcedToolForRequest({ accepted: "create_sheet", prompt: "", mode: "auto", hasMaterials: false }).name,
    "clarify",
  );
  assert.equal(
    forcedToolForRequest({ accepted: "create_sheet", prompt: "", mode: "auto", hasMaterials: true }).name,
    "create_sheet",
  );
  assert.equal(
    fallbackToolAfterProvider({ prompt: "გააკეთე კონსპექტი", mode: "auto", hasMaterials: false }).name,
    "clarify",
  );
});

test("illustrate parses catalog blocks without turning them into chat JSON", () => {
  const call = parseToolCall("illustrate", {
    blocks: [
      { type: "graph", title: "Demand", slope: -1, intercept: 0 },
      { type: "formula_card", formula: "Q_d = a - bP" },
      { type: "cycle", title: "Market cycle", items: ["Demand", "Price", "Supply"] },
    ],
  });
  assert.equal(call.name, "illustrate");
  assert.deepEqual(call.args.blocks.map((block) => block.type), ["graph", "formula_card", "flow"]);
  assert.deepEqual(call.args.blocks[2].items, ["Demand", "Price", "Supply", "Demand"]);

  const html = renderToStaticMarkup(React.createElement(IllustrationBlocks, { blocks: call.args.blocks }));
  assert.match(html, /<svg/);
  assert.match(html, /Q_d/);
  assert.doesNotMatch(html, /\"type\":\"graph\"/);
});

test("mid-thread selected slash tool renders as a removable pre-prompt chip", () => {
  assert.deepEqual(consumeSlashCommand("/note demand curve"), {
    skill: "notes",
    prompt: "demand curve",
  });
  const html = renderToStaticMarkup(
    React.createElement(ChatComposer, {
      draft: "demand curve",
      onDraft() {},
      sending: false,
      error: null,
      chips: [],
      onRemoveChip() {},
      onSend() {},
      onFile() {},
      onPasteText() {},
      onUrl() {},
      skill: "notes",
      onSkill() {},
    }),
  );
  assert.match(html, />Note</);
  assert.match(html, /aria-label="Remove Note tool"/);
});
