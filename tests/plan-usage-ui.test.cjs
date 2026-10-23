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
  assert.doesNotMatch(component, /useCurrentAiUsage|subscribeCurrentAiUsage|Analytics/);
  assert.doesNotMatch(component, /PlanOptions|Available plans|Choose plan/);
  assert.match(component, /Included in/);
  assert.match(component, /storageBytes/);
  assert.match(component, /300 MB material storage/);
  assert.match(component, /2 GB material storage/);
  assert.match(component, /10 GB material storage/);
  assert.match(component, /50 GB material storage/);
  assert.match(component, /200 GB material storage/);
});

test("public pricing owns plan selection and legacy plans links redirect there", () => {
  const pricing = read("app/pricing/page.tsx");
  const legacyPlans = read("app/plans/page.tsx");
  assert.match(pricing, /PlansPage/);
  assert.doesNotMatch(pricing, /redirect\(/);
  assert.match(legacyPlans, /redirect\("\/pricing"\)/);
});

test("storage and weekly AI limit responses open the plan upgrade dialog", () => {
  const dialog = read("components/account/plan-limit-dialog.tsx");
  const layout = read("app/layout.tsx");
  const storage = read("lib/materials/storage.ts");
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /View plans/);
  assert.match(dialog, /weekly_ai_budget_exhausted/);
  assert.match(layout, /<PlanLimitDialog/);
  assert.match(storage, /remainingBytes/);
  assert.match(storage, /requestPlanUpgrade\("storage"\)/);
});

test("server refuses paid models on Free and accepts the server-resolved paid plan", () => {
  const chat = read("app/api/chat/route.ts");
  const model = read("components/account/use-preferred-model.tsx");
  assert.match(chat, /readAccountAccess/);
  assert.match(chat, /access\.plan === "free_beta"/);
  assert.match(model, /availableAiModels\(modelPlan\)/);
});

test("plans page presents plan storage/model allowances and real checkout flow", () => {
  const page = read("components/account/plans-page.tsx");
  for (const label of ["Free Beta", "Lite", "Pro", "Max"]) assert.ok(page.includes(label));
  assert.doesNotMatch(page, /label: "Team"/);
  assert.match(page, /storageLimitForPlan/);
  assert.match(page, /All released AI models/);
  assert.match(page, /openPaddleCheckout/);
  assert.match(page, /Choose plan/);
});

test("account resolves Admin instead of always displaying Free", () => {
  const account = read("components/account/account-workspace.tsx");
  assert.match(account, /resolveEffectivePlan/);
  assert.doesNotMatch(account, /hint="Beta"/);
});
