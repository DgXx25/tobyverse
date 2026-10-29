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
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  module._compile(output, filename);
};

test("admin keeps the shared plan layout and gets an unlimited usage meter", () => {
  const { usageMeterState } = require("../lib/billing/usage-meter.ts");
  const component = fs.readFileSync(path.join(root, "components/account/plan-usage.tsx"), "utf8");
  const meter = usageMeterState("admin", null, 123_456);

  assert.match(component, /<PlanOptions currentPlan={plan}/);
  assert.match(component, /Included in \{displayPlan\(plan\)\}/);
  assert.equal(meter.label, "∞");
  assert.equal(meter.widthPercent, 100);
  assert.equal(meter.unlimited, true);
  assert.equal(meter.ariaValueText, "Unlimited usage");
  assert.equal(meter.ariaValueNow, undefined);
});

test("finite plans keep showing their actual usage percentage", () => {
  const { usageMeterState } = require("../lib/billing/usage-meter.ts");
  assert.deepEqual(usageMeterState("pro", 2_000_000, 750_000), {
    label: "38% used",
    widthPercent: 37.5,
    unlimited: false,
    ariaValueText: "38% used",
    ariaValueNow: 38,
  });
});
