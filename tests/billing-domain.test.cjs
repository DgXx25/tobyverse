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
const { storageLimitForPlan } = require("../lib/account/plan.ts");
const { availableAiModels } = require("../lib/ai/catalog.ts");
const { planPolicies, resolveAccountAccess } = require("../lib/billing/access.ts");

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

test("free storage is 300 MiB and storage grows with each paid plan", () => {
  const caps = ["free_beta", "lite", "pro", "max", "team", "admin"].map(storageLimitForPlan);
  assert.deepEqual(caps.slice(0, 5), [300, 2048, 10_240, 51_200, 204_800].map((value) => value * 1024 * 1024));
  assert.equal(caps[5], null);
});

test("Lite and higher paid plans can choose every released model", () => {
  const free = availableAiModels("free_beta");
  const lite = availableAiModels("lite");
  assert.ok(lite.length > free.length);
  assert.ok(lite.every((model) => model.paidOnly === false || model.paidOnly === true));
  assert.ok(lite.some((model) => model.paidOnly));
  assert.equal(availableAiModels("admin").length, lite.length);
});

test("paid plan allowances have progressive defaults and survive weekly renewal", () => {
  const policies = planPolicies(undefined);
  const budgets = policies.map((policy) => policy.weeklyBudgetMicros);
  assert.ok(budgets.every((budget) => typeof budget === "number" && budget > 0));
  assert.ok(budgets.every((budget, index) => index === 0 || budget > budgets[index - 1]));
  assert.equal(utcWeekWindow(new Date("2026-09-28T00:00:00Z")).weekStart, "2026-09-28");

  const access = resolveAccountAccess({
    account: { revision: 1, grant: null, subscriptions: { subscription: {
      id: "subscription", customerId: "customer", planId: "lite", environment: "production", status: "active",
      periodEndsAt: "2026-10-31T00:00:00Z", scheduledEndsAt: null, occurredAt: "2026-10-01T00:00:00Z", priceId: "price",
    } } },
    policies,
    now: new Date("2026-10-21T00:00:00Z"),
  });
  assert.equal(access.plan, "lite");
  assert.equal(access.weeklyBudgetMicros, budgets[0]);
});
