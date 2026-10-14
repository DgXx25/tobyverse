const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");

test("settings exposes one Plan & usage destination", () => {
  const settings = read("components/workspace/settings-modal.tsx");
  assert.match(settings, /label: "Plan & usage"/);
  assert.doesNotMatch(settings, /label: "Billing"/);
  assert.doesNotMatch(settings, /label: "Usage"/);
  assert.match(settings, /<PlanUsage/);
});

test("mobile sheet exposes the same destination", () => {
  const sheet = read("components/account-sheet.tsx");
  assert.match(sheet, /Plan & usage/);
  assert.match(sheet, /<PlanUsage/);
});

test("plan surface has no AI usage listener and shows plan inclusion copy", () => {
  const component = read("components/account/plan-usage.tsx");
  assert.doesNotMatch(component, /useCurrentAiUsage|subscribeCurrentAiUsage|AI usage|Analytics/);
  assert.match(component, /Included in/);
  assert.match(component, /Upgrade available/);
  assert.match(component, /storageBytes/);
});

test("plans page presents beta and future plans without fake checkout", () => {
  const page = read("components/account/plans-page.tsx");
  for (const label of ["Free Beta", "Lite", "Pro", "Max", "Team"]) assert.ok(page.includes(label));
  for (const price of ["$10", "$20", "$50"]) assert.ok(page.includes(price));
  assert.match(page, /Available after beta/);
  assert.doesNotMatch(page, /checkout|stripe|setDoc|updateDoc/i);
});

test("account resolves Admin instead of always displaying Free", () => {
  const account = read("components/account/account-workspace.tsx");
  assert.match(account, /resolveEffectivePlan/);
  assert.doesNotMatch(account, /hint="Beta"/);
});
