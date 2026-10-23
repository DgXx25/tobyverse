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
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};
function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
}
require.extensions[".ts"] = loadTypeScript;

const { decideAiBudget, AiUsageLimitError, mergeCommittedUsage } = require("../lib/billing/server.ts");
const { emptyAiUsageWeek } = require("../lib/billing/pricing.ts");

test("ordinary account at cap is rejected with reset time", () => {
  assert.throws(
    () => decideAiBudget({ plan: "free_beta", costMicros: 2_000_000, resetsAt: "2026-09-28T00:00:00.000Z" }),
    (error) => error instanceof AiUsageLimitError && error.code === "weekly_ai_budget_exhausted",
  );
});

test("admin remains allowed above the beta cap", () => {
  assert.equal(decideAiBudget({ plan: "admin", costMicros: 9_000_000, resetsAt: "2026-09-28T00:00:00.000Z" }).allowed, true);
});

test("paid AI allowance blocks at its plan cap and a new UTC week starts at zero", () => {
  assert.equal(decideAiBudget({ plan: "lite", costMicros: 4_999_999, weeklyBudgetMicros: 5_000_000, resetsAt: "2026-09-28T00:00:00.000Z" }).allowed, true);
  assert.throws(() => decideAiBudget({ plan: "lite", costMicros: 5_000_000, weeklyBudgetMicros: 5_000_000, resetsAt: "2026-09-28T00:00:00.000Z" }), AiUsageLimitError);
  assert.equal(emptyAiUsageWeek("2026-09-28").costMicros, 0);
});

test("the final crossing request is merged at actual cost", () => {
  const merged = mergeCommittedUsage(emptyAiUsageWeek("2026-09-21"), { costMicros: 2_100_000, requestCount: 1 });
  assert.equal(merged.costMicros, 2_100_000);
});

test("usage week rules allow owner reads and deny client writes", () => {
  const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
  assert.match(rules, /aiUsageWeeks/);
  assert.match(rules, /allow read: if isOwner\(userId\)/);
  assert.match(rules, /allow create, update, delete: if false/);
});
