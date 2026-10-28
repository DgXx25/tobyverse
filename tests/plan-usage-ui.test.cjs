const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");

test("settings exposes one Plan & usage destination", () => {
  const settings = read("components/workspace/settings-modal.tsx");
  assert.doesNotMatch(settings, /label: "Help"|label: "Parameters"|<ParametersPanel/);
  assert.match(settings, /label: "Plan & usage"/);
  assert.doesNotMatch(settings, /label: "Billing"/);
  assert.doesNotMatch(settings, /label: "Usage"/);
  assert.match(settings, /<PlanUsage/);
  assert.doesNotMatch(read("components/topbar.tsx"), /label="Help"/);
});

test("mobile sheet exposes the same destination", () => {
  const sheet = read("components/account-sheet.tsx");
  assert.doesNotMatch(sheet, /label="Parameters"|<ParametersPanel/);
  assert.doesNotMatch(read("components/landing-settings-menu.tsx"), /ParametersPanel|Parameters/);
  assert.match(sheet, /Plan & usage/);
  assert.match(sheet, /<PlanUsage/);
});

test("plan surface shows plan cards, metered usage by model, and billing controls", () => {
  const component = read("components/account/plan-usage.tsx");
  assert.match(component, /PlanOptions/);
  assert.match(component, /Usage by model/);
  assert.match(component, /Included in/);
  assert.match(component, /storageBytes/);
  assert.match(component, /Billing history/);
  const cards = read("components/account/plan-options.tsx");
  assert.match(cards, /Tobyverse/);
  assert.match(cards, /Premium/);
  assert.match(cards, /Current usage/);
  assert.equal(component.includes("`$${"), false);
  assert.equal(cards.includes("`$${"), false);
  assert.match(component, /% used/);
  assert.match(cards, /usagePercent/);
});

test("model options use plan access and persist through the account API", () => {
  const modelOptions = read("components/workspace/model-options.tsx");
  assert.doesNotMatch(modelOptions, /useUserProfile/);
  assert.doesNotMatch(modelOptions, /paidOnly: true|gemini-4-argon/);
  assert.match(read("lib/account/store.ts"), /api\/account\/preferred-model/);
  assert.match(read("app/api/account/preferred-model/route.ts"), /readAccountAccess/);
  assert.match(read("app/api/account/preferred-model/route.ts"), /isAllowedModelSelection/);
  assert.match(read("components/account/use-user-profile.ts"), /Firestore browser WebChannel is blocked/);
  assert.match(read("components/account/use-preferred-model.tsx"), /readPreferredModel/);
});

test("public pricing owns plan selection and legacy plans links redirect there", () => {
  const pricing = read("app/pricing/page.tsx");
  const legacyPlans = read("app/plans/page.tsx");
  assert.match(pricing, /PlansPage/);
  assert.doesNotMatch(pricing, /redirect\(/);
  assert.match(legacyPlans, /redirect\("\/pricing"\)/);
});

test("storage, AI, and model limits open the plan upgrade dialog", () => {
  const dialog = read("components/account/plan-limit-dialog.tsx");
  const providers = read("components/app-route-providers.tsx");
  const storage = read("lib/materials/storage.ts");
  const ai = read("lib/ai/sse.ts");
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /View plans/);
  assert.match(dialog, /Gemini 4 Argon is a Premium model/);
  assert.match(providers, /<PlanLimitDialog/);
  assert.match(storage, /remainingBytes/);
  assert.match(storage, /requestPlanUpgrade\("storage"\)/);
  assert.doesNotMatch(dialog, /window\.fetch\s*=|nativeFetch|observedFetch/);
  assert.match(ai, /weekly_ai_budget_exhausted/);
  assert.match(ai, /requestPlanUpgrade\("ai"\)/);
});

test("server enforces Premium-only models and supports account-aware routing", () => {
  const chat = read("app/api/chat/route.ts");
  const model = read("components/account/use-preferred-model.tsx");
  assert.match(chat, /readAccountAccess/);
  assert.match(chat, /premium_model_required/);
  assert.match(chat, /selectModel\(prompt, requestedSelection\)/);
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
