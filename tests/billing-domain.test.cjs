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
function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
}
require.extensions[".ts"] = loadTypeScript;

const {
  FREE_BETA_WEEKLY_MICROS,
  normalizeStoredPlan,
  resolveEffectivePlan,
  utcWeekWindow,
} = require("../lib/billing/plans.ts");
const { priceAiCall, mergeAiUsage, emptyAiUsageWeek } = require("../lib/billing/pricing.ts");

test("legacy free normalizes to free_beta and admin wins over stored plan", () => {
  assert.equal(normalizeStoredPlan("free"), "free_beta");
  assert.equal(resolveEffectivePlan({ storedPlan: "free", admin: true }), "admin");
  assert.equal(FREE_BETA_WEEKLY_MICROS, 2_000_000);
});

test("week is Monday UTC through next Monday UTC", () => {
  assert.deepEqual(utcWeekWindow(new Date("2026-09-27T23:59:59Z")), {
    weekStart: "2026-09-21",
    resetsAt: "2026-09-28T00:00:00.000Z",
  });
});

test("Gemini Flash cost includes thinking at output price", () => {
  const priced = priceAiCall({
    provider: "gemini",
    model: "gemini-2.5-flash",
    inputTokens: 1_000_000,
    outputTokens: 100_000,
    thinkingTokens: 100_000,
    totalTokens: 1_200_000,
  });
  assert.equal(priced.costMicros, 800_000);
  assert.equal(priced.pricingVersion, "gemini-2026-09-23");
});

test("merge keeps integer totals across calls", () => {
  const week = emptyAiUsageWeek("2026-09-21");
  const merged = mergeAiUsage(week, {
    inputTokens: 12,
    outputTokens: 5,
    thinkingTokens: 3,
    totalTokens: 20,
    requestCount: 2,
    costMicros: 9,
    byModel: { "gemini-2.5-flash": { requestCount: 2, costMicros: 9 } },
  });
  assert.equal(merged.requestCount, 2);
  assert.equal(merged.costMicros, 9);
});
