# Plan, Usage, and AI Metering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one Codex-style Plan & usage experience backed by real Gemini token-cost accounting, a $2 weekly beta allowance, unlimited-but-metered Admin access, a future plans catalog, and a corrected storage quota path.

**Architecture:** Keep pricing and plan rules pure, report provider-returned token metadata through an explicit request-scoped collector, and write one server-owned aggregate document per user/week after each user-visible AI operation. Desktop and mobile share one PlanUsage component and subscribe to the current week only while that surface is mounted.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Firebase client SDK, Firebase Admin SDK, Firestore rules, `@google/generative-ai`, Tailwind CSS, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-23-plan-usage-and-ai-metering-design.md`

## Global Constraints

- Preserve `docs/mindset.md`; this feature must not alter TobyVerse chat voice or add a teaching ritual.
- Free Beta has one $2 USD AI-provider-cost allowance per UTC week; the week starts Monday at 00:00 UTC.
- Admin has no enforced AI cap, but exact token totals and cost remain visible.
- Gemini `usageMetadata` is the usage source of truth; do not estimate tokens from characters.
- Use Gemini 2.5 Flash standard rates: $0.30/1M input tokens and $2.50/1M candidate-plus-thinking tokens.
- Store money as integer microdollars; `2_000_000` microdollars is the Free Beta weekly cap.
- Perform at most one Firestore usage write per user-visible AI operation, including operations that internally repair or retry JSON.
- Lite is $10/month, Pro $20/month, Max $50/month; Lite, Pro, Max, and Team are preview-only during beta and cannot mutate entitlement.
- Team UI communicates one payer, multiple seats, invitations, and shared administration without creating seat or invitation data.
- Storage remains a separate 1 GB operational quota and is not charged against the AI allowance.
- Preserve unrelated uncommitted changes and stage only files owned by the current task.

## Review Focus

- A final request that crosses $2 is recorded at its actual cost and every later ordinary request is rejected until reset.
- A JSON repair that makes two Gemini calls contributes both calls to one weekly transaction.
- A streamed response uses the SDK's final aggregate metadata once and does not sum duplicated partial chunk metadata.
- An admin profile containing the server-owned `admin` field can reserve 3.9 MB + a valid file without receiving a false 1 GB error.
- A model without a price entry fails closed for ordinary users and emits an observable warning for Admin instead of silently recording free work.

---

## File Structure

New focused modules:

- `types/billing.ts` — persisted weekly usage, provider-call usage, plan catalog, and effective-plan types.
- `lib/billing/plans.ts` — plan normalization, labels, prices, weekly allowance, reset time, and admin resolution.
- `lib/billing/pricing.ts` — Gemini price snapshots, metadata normalization, integer cost calculation, and usage aggregation.
- `lib/billing/collector.ts` — in-memory per-operation collector that combines retries/calls.
- `lib/billing/server.ts` — Admin SDK preflight, effective-plan lookup, weekly transaction, typed limit errors.
- `lib/billing/client.ts` — current-week read-only subscription used by the UI.
- `components/account/plan-usage.tsx` — shared Overview/Analytics experience for desktop and mobile.
- `components/account/plans-page.tsx` — responsive beta plan catalog.
- `app/plans/page.tsx` — plans route and metadata.
- `tests/billing-domain.test.cjs` — pure pricing/plan/week tests.
- `tests/billing-provider.test.cjs` — provider metadata and collector tests.
- `tests/billing-routes.test.cjs` — source-contract coverage for all AI endpoints and one-commit behavior.
- `tests/storage-quota.test.cjs` — permission/quota regression tests.
- `tests/plan-usage-ui.test.cjs` — merged navigation and plans-page contracts.

Existing modules changed in place:

- `types/user.ts`, `lib/account/plan.ts`, `lib/account/store.ts`, `components/account/use-user-profile.ts` — compatibility and effective plan data.
- `lib/ai/types.ts`, `lib/ai/gemini.ts`, `lib/ai/json.ts` — provider usage reporting.
- AI endpoint/routes and the note/path/image/material helpers listed in Task 4 — explicit collector propagation.
- `firestore.rules`, `lib/firestore.ts` — read-only weekly usage and preserved server-owned profile fields.
- `components/workspace/settings-modal.tsx`, `components/account-sheet.tsx`, `components/workspace/shell-context.tsx`, `components/sidebar.tsx` — one Plan & usage destination.
- `components/account/account-workspace.tsx` — correct Admin/Free Beta label and plans link.
- `lib/exercises/generate-set.ts`, `lib/study-sheets/generate-client.ts`, `components/project-chat.tsx` — remove legacy feature-counter writes.

### Task 1: Plan, week, pricing, and aggregation domain

**Files:**
- Create: `types/billing.ts`
- Create: `lib/billing/plans.ts`
- Create: `lib/billing/pricing.ts`
- Create: `lib/billing/collector.ts`
- Modify: `types/user.ts`
- Modify: `lib/account/plan.ts`
- Test: `tests/billing-domain.test.cjs`

**Interfaces:**
- Produces: `EffectivePlanId`, `AiCallUsage`, `AiUsageDelta`, `AiUsageWeek`, `PLAN_CATALOG`, `FREE_BETA_WEEKLY_MICROS`, `normalizeStoredPlan(value)`, `resolveEffectivePlan(input)`, `utcWeekWindow(now)`, `priceAiCall(input)`, `emptyAiUsageWeek(weekStart)`, `mergeAiUsage(base, delta)`, `createAiUsageCollector(options)`.
- Consumes: existing `UserPlan`, `utcWeekStart`, and the persisted legacy string `free`.

- [ ] **Step 1: Write failing domain tests**

Add the repository's TypeScript require hook used by `tests/pass-a.test.cjs`, then pin exact behavior:

```js
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
```

- [ ] **Step 2: Run the domain test and confirm the missing-module failure**

Run: `node --test tests/billing-domain.test.cjs`

Expected: FAIL because `lib/billing/plans.ts` and `lib/billing/pricing.ts` do not exist.

- [ ] **Step 3: Define billing and user types**

In `types/billing.ts`, define exact persisted and call-level contracts:

```ts
export type EffectivePlanId = "free_beta" | "lite" | "pro" | "max" | "team" | "admin";
export type AiCallUsage = {
  provider: "gemini";
  model: string;
  modelVersion?: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
};
export type AiModelUsage = { requestCount: number; costMicros: number };
export type AiUsageDelta = Omit<AiCallUsage, "provider" | "model" | "modelVersion"> & {
  requestCount: number;
  costMicros: number;
  byModel: Record<string, AiModelUsage>;
  pricingVersion: string;
};
export type AiUsageWeek = AiUsageDelta & { weekStart: string; updatedAt: string | null };
export type AiUsageReporter = (usage: AiCallUsage) => void;
```

Change `USER_PLANS` in `types/user.ts` to `free_beta`, `lite`, `pro`, `max`, `team`; add `admin: boolean` to `UserProfile`; keep legacy persisted input handled as `unknown`, not as a current `UserPlan`.

- [ ] **Step 4: Implement the pure plan and pricing modules**

Use one catalog with `monthlyPriceCents`, `weeklyBudgetMicros`, `available`, and display copy. Implement Monday UTC window calculation and exact price math:

```ts
export const FREE_BETA_WEEKLY_MICROS = 2_000_000;

export function priceAiCall(call: AiCallUsage): AiUsageDelta {
  const rate = MODEL_PRICES[call.model];
  if (!rate) throw new UnknownModelPriceError(call.model);
  const numerator = call.inputTokens * rate.inputMicrosPerMillion
    + (call.outputTokens + call.thinkingTokens) * rate.outputMicrosPerMillion;
  const costMicros = Math.ceil(numerator / 1_000_000);
  return {
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    thinkingTokens: call.thinkingTokens,
    totalTokens: call.totalTokens,
    requestCount: 1,
    costMicros,
    byModel: { [call.model]: { requestCount: 1, costMicros } },
    pricingVersion: rate.version,
  };
}
```

Keep `lib/account/plan.ts` exports used by storage and memories, but make `asUserPlan()` delegate to `normalizeStoredPlan()` and make `planLabel()` accept an effective plan.

- [ ] **Step 5: Implement the request-scoped collector**

`createAiUsageCollector(options)` exposes a stable reporter and a snapshot without Firestore knowledge:

```ts
export function createAiUsageCollector(options: { allowUnpriced: boolean }) {
  let delta = emptyAiUsageDelta();
  const report: AiUsageReporter = (call) => {
    try {
      delta = mergeAiUsageDelta(delta, priceAiCall(call));
    } catch (error) {
      if (!options.allowUnpriced) throw error;
      console.error("[ai-usage] unpriced model", { model: call.model });
      delta = mergeAiUsageDelta(delta, unpricedAiCall(call));
    }
  };
  return { report, snapshot: () => structuredClone(delta) };
}
```

An ordinary collector throws on an unknown model price. An Admin collector records tokens with zero `costMicros`, `pricingVersion: "unpriced"`, and an explicit structured warning.

- [ ] **Step 6: Run the domain tests and TypeScript**

Run: `node --test tests/billing-domain.test.cjs`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: existing call sites compile after compatibility exports; any exhaustive `UserPlan` switch is updated.

- [ ] **Step 7: Commit the domain layer**

```powershell
git add -- types/billing.ts types/user.ts lib/billing/plans.ts lib/billing/pricing.ts lib/billing/collector.ts lib/account/plan.ts tests/billing-domain.test.cjs
git commit -m "feat: add plan and AI cost domain"
```

### Task 2: Gemini usage metadata reporting

**Files:**
- Modify: `lib/ai/types.ts`
- Modify: `lib/ai/gemini.ts`
- Modify: `lib/ai/json.ts`
- Modify: `lib/ai/index.ts`
- Test: `tests/billing-provider.test.cjs`

**Interfaces:**
- Consumes: `AiUsageReporter`, `AiCallUsage`, `createAiUsageCollector(options)` from Task 1.
- Produces: `GenerateOptions.usage?: AiUsageReporter`; every central Gemini generation method reports exactly once per provider call.

- [ ] **Step 1: Write failing provider/collector tests**

Test metadata normalization and multi-call collection without a live API:

```js
const { geminiCallUsage } = require("../lib/ai/gemini.ts");
const { createAiUsageCollector } = require("../lib/billing/collector.ts");

test("Gemini metadata maps prompt, candidate, thought, and total counts", () => {
  assert.deepEqual(
    geminiCallUsage("gemini-2.5-flash", "gemini-2.5-flash-001", {
      promptTokenCount: 100,
      candidatesTokenCount: 40,
      thoughtsTokenCount: 10,
      totalTokenCount: 150,
    }),
    {
      provider: "gemini",
      model: "gemini-2.5-flash",
      modelVersion: "gemini-2.5-flash-001",
      inputTokens: 100,
      outputTokens: 40,
      thinkingTokens: 10,
      totalTokens: 150,
    },
  );
});

test("two provider reports become two requests in one collector", () => {
  const collector = createAiUsageCollector({ allowUnpriced: false });
  collector.report(geminiCallUsage("gemini-2.5-flash", "v1", { promptTokenCount: 2, candidatesTokenCount: 1, totalTokenCount: 3 }));
  collector.report(geminiCallUsage("gemini-2.5-flash", "v1", { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 }));
  assert.equal(collector.snapshot().requestCount, 2);
});
```

- [ ] **Step 2: Run the provider test and confirm it fails**

Run: `node --test tests/billing-provider.test.cjs`

Expected: FAIL because `geminiCallUsage` is not exported and `GenerateOptions` has no reporter.

- [ ] **Step 3: Extend the AI interface without changing generated content**

Add `usage?: AiUsageReporter` to `GenerateOptions`. Add a pure `geminiCallUsage(model, modelVersion, usageMetadata)` normalizer that converts missing counts to zero and returns `null` only when metadata is absent.

For non-stream generation, report after `result.response` resolves:

```ts
const response = result.response;
const usage = geminiCallUsage(modelName, response.modelVersion, response.usageMetadata);
if (usage) options.usage?.(usage);
```

For `generateTextStream` and `generateToolStream`, consume `result.stream`, then await `result.response` once and report the aggregate response metadata once. Do not inspect chunk-level `usageMetadata`.

- [ ] **Step 4: Propagate reporters through JSON generation and repair**

Change `generateJson` and `validateOrRepairJson` option types to include `usage?: AiUsageReporter`, and pass the same reporter to the initial call and repair call:

```ts
export async function generateJson(
  prompt: string,
  schema: ZodTypeAny,
  options: { systemInstruction?: string; usage?: AiUsageReporter } = {},
) { /* both generateText calls receive usage: options.usage */ }
```

This is the mechanism that lets two repair calls become one route-level transaction.

- [ ] **Step 5: Run provider tests and TypeScript**

Run: `node --test tests/billing-provider.test.cjs`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit provider reporting**

```powershell
git add -- lib/ai/types.ts lib/ai/gemini.ts lib/ai/json.ts lib/ai/index.ts tests/billing-provider.test.cjs
git commit -m "feat: report Gemini token usage"
```

### Task 3: Server budget preflight and weekly aggregate

**Files:**
- Create: `lib/billing/server.ts`
- Modify: `lib/firestore.ts`
- Modify: `firestore.rules`
- Test: `tests/billing-server.test.cjs`

**Interfaces:**
- Consumes: domain types and collector from Task 1; `getAdminFirestore()`; `isAdminUid()`.
- Produces: `startAiUsageSession(uid, options): Promise<AiUsageSession>`, `AiUsageLimitError`, `aiUsageErrorResponse(error)`, and read-only `aiUsageWeeks` Firestore paths.

- [ ] **Step 1: Write failing server-policy tests**

Keep Firestore I/O behind injected functions so budget decisions are pure-testable:

```js
const { decideAiBudget, AiUsageLimitError } = require("../lib/billing/server.ts");

test("ordinary account at cap is rejected with reset time", () => {
  assert.throws(
    () => decideAiBudget({ plan: "free_beta", costMicros: 2_000_000, resetsAt: "2026-09-28T00:00:00.000Z" }),
    (error) => error instanceof AiUsageLimitError && error.code === "weekly_ai_budget_exhausted",
  );
});

test("admin remains allowed above the beta cap", () => {
  assert.equal(decideAiBudget({ plan: "admin", costMicros: 9_000_000, resetsAt: "2026-09-28T00:00:00.000Z" }).allowed, true);
});

test("the final crossing request is merged at actual cost", () => {
  const merged = mergeCommittedUsage(emptyAiUsageWeek("2026-09-21"), { costMicros: 2_100_000, requestCount: 1 });
  assert.equal(merged.costMicros, 2_100_000);
});
```

Add a source assertion that `firestore.rules` permits owner reads and denies client writes under `aiUsageWeeks`.

- [ ] **Step 2: Run the server tests and confirm they fail**

Run: `node --test tests/billing-server.test.cjs`

Expected: FAIL because server budget functions and rules are absent.

- [ ] **Step 3: Implement effective-plan lookup and preflight**

Read `users/{uid}` and current `aiUsageWeeks/{weekStart}` in parallel. Resolve Admin from `ADMIN_UIDS`, `admin: true`, or the existing legacy admin email check. Normalize missing/legacy plan to `free_beta`.

`startAiUsageSession(uid, { models })` must validate every declared model against the price catalog before generation for ordinary users, then:

```ts
export type AiUsageSession = {
  plan: EffectivePlanId;
  weekStart: string;
  resetsAt: string;
  report: AiUsageReporter;
  commit(): Promise<void>;
};
```

It performs the preflight read, throws the typed limit error for an ordinary account at cap, creates one collector with `allowUnpriced` set only for Admin, and makes `commit()` a no-op when no provider call was reported. Every route declares the requested model before streaming starts, so an unknown ordinary model fails before any content is sent.

- [ ] **Step 4: Implement one transaction per operation**

`commit()` takes one immutable collector snapshot and runs one Admin SDK transaction on the weekly document. The transaction re-reads the latest document and adds token/cost/model totals atomically. It writes `pricingVersion` and a server timestamp. A repeated `commit()` call must return without a second write.

Admin may commit an explicitly unpriced model with zero `costMicros` plus `pricingVersion: "unpriced"`; the collector has already emitted a structured warning containing the model.

- [ ] **Step 5: Add Firestore paths and security rules**

Add `aiUsageWeeks` to `COLLECTIONS` and path helpers. Under `match /users/{userId}`, add:

```text
match /aiUsageWeeks/{weekStart} {
  allow read: if isOwner(userId);
  allow create, update, delete: if false;
}
```

No prompt, response, file name, or chat text is stored.

- [ ] **Step 6: Run server tests and TypeScript**

Run: `node --test tests/billing-server.test.cjs`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 7: Commit server metering**

```powershell
git add -- lib/billing/server.ts lib/firestore.ts firestore.rules tests/billing-server.test.cjs
git commit -m "feat: enforce weekly AI budget"
```

### Task 4: Meter every user-triggered AI path

**Files:**
- Modify: `app/api/chat/route.ts`
- Modify: `app/api/study-sheets/generate/route.ts`
- Modify: `app/api/paths/generate/route.ts`
- Modify: `app/api/exercises/generate/route.ts`
- Modify: `app/api/exercises/feedback/route.ts`
- Modify: `app/api/memory/route.ts`
- Modify: `app/api/projects/title/route.ts`
- Modify: `app/api/images/search/route.ts`
- Modify: `app/api/materials/extract/route.ts`
- Modify: `app/api/admin/run/route.ts`
- Modify: `app/api/admin/audit/route.ts`
- Modify: `lib/study-sheets/generate-stream.ts`
- Modify: `lib/paths/generate-stream.ts`
- Modify: `lib/paths/generate.ts`
- Modify: `lib/images/query.ts`
- Modify: `lib/images/search.ts`
- Modify: `lib/materials/extract.ts`
- Test: `tests/billing-routes.test.cjs`

**Interfaces:**
- Consumes: `startAiUsageSession(uid, { models: [requestedModel] })`, `aiUsageErrorResponse(error)`, and `GenerateOptions.usage`.
- Produces: every authenticated model operation preflights once, passes one reporter through all internal calls, and commits once in `finally`.

- [ ] **Step 1: Write failing route source-contract tests**

Read the listed route/helper files and assert:

```js
for (const file of meteredRoutes) {
  const source = read(file);
  assert.match(source, /startAiUsageSession/);
  assert.match(source, /usage\.report/);
  assert.match(source, /usage\.commit/);
}
assert.doesNotMatch(read("lib/materials/extract.ts"), /new GoogleGenerativeAI/);
assert.match(read("lib/ai/json.ts"), /usage:\s*options\.usage/g);
```

Use per-file expectations rather than requiring direct reporter use in a route whose helper receives it. Also assert that streaming routes commit in `finally`, and non-stream routes wrap generation with `try/finally`.

- [ ] **Step 2: Run route contracts and confirm they fail**

Run: `node --test tests/billing-routes.test.cjs`

Expected: FAIL because routes do not start or commit sessions.

- [ ] **Step 3: Integrate streaming chat, notes, and paths**

After authentication and body validation, start one usage session. Pass `usage.report` to every central generation call. In each `ReadableStream.start`, commit before closing:

```ts
try {
  for await (const delta of generateTextStream(prompt, { ...options, usage: usage.report })) {
    controller.enqueue(encodeSse({ delta }));
  }
} catch (error) {
  controller.enqueue(encodeSse({ error: messageFor(error) }));
} finally {
  await usage.commit().catch((error) => console.error("[ai-usage] commit failed", error));
  controller.close();
}
```

Pass the same reporter into `streamNotesDocument`, `streamPathDocument`, and every `generateJson` repair called inside them.

- [ ] **Step 4: Integrate JSON and short-text endpoints**

For exercise generation/feedback, memory, and title routes: validate the body first, then start the session, pass the reporter, and await one commit in `finally`. Return `aiUsageErrorResponse` for typed preflight errors so clients receive `code`, `message`, and `resetsAt`.

- [ ] **Step 5: Integrate image search planning and image OCR**

Add an optional `usage: AiUsageReporter` parameter from `/api/images/search` through `searchWebImages` and `planImageSearch`. Cached query plans report no provider call.

Replace the direct Gemini SDK construction in `lib/materials/extract.ts` with central generation:

```ts
const text = await generateText(
  "Extract all readable text from this image. If it is a diagram, describe it briefly. Plain text only.",
  { images: [{ mimeType: mime || "image/jpeg", data: buffer.toString("base64") }], usage },
);
```

Pass the reporter from `/api/materials/extract` only for image extraction; PDF, DOCX, XLSX, PPTX, TXT, paste, and URL extraction remain zero-AI operations and cause a no-op commit.

- [ ] **Step 6: Meter Admin playground and audit**

Use the UID returned by `assertAdminRequest`, start an Admin session, pass its reporter, and commit exactly once. Admin remains unlimited. Eval traffic that reaches `/api/chat` is already attributed by the authenticated admin UID and must not create a second outer metering session.

- [ ] **Step 7: Run route tests, focused existing tests, and TypeScript**

Run: `node --test tests/billing-routes.test.cjs tests/pass-a.test.cjs`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 8: Commit route integration**

```powershell
git add -- app/api/chat/route.ts app/api/study-sheets/generate/route.ts app/api/paths/generate/route.ts app/api/exercises/generate/route.ts app/api/exercises/feedback/route.ts app/api/memory/route.ts app/api/projects/title/route.ts app/api/images/search/route.ts app/api/materials/extract/route.ts app/api/admin/run/route.ts app/api/admin/audit/route.ts lib/study-sheets/generate-stream.ts lib/paths/generate-stream.ts lib/paths/generate.ts lib/images/query.ts lib/images/search.ts lib/materials/extract.ts tests/billing-routes.test.cjs
git commit -m "feat: meter user AI operations"
```

### Task 5: Correct false storage quota failures and retire feature counters

**Files:**
- Modify: `firestore.rules`
- Modify: `lib/account/store.ts`
- Modify: `lib/exercises/generate-set.ts`
- Modify: `lib/study-sheets/generate-client.ts`
- Modify: `components/project-chat.tsx`
- Test: `tests/storage-quota.test.cjs`

**Interfaces:**
- Consumes: existing `wouldExceedStorage(used, extra)` and `StorageQuotaError`.
- Produces: calculated quota errors only; schema/permission failures remain service errors; legacy feature counters are no longer written.

- [ ] **Step 1: Write the failing storage regression tests**

Pin both rule shape and error classification:

```js
test("admin is server-owned and preserved by client profile updates", () => {
  const rules = read("firestore.rules");
  assert.match(rules, /isValidOptionalAdmin/);
  assert.match(rules, /adminFieldUnchanged/);
});

test("permission denied is not presented as storage exhausted", () => {
  const source = read("lib/account/store.ts");
  assert.doesNotMatch(source, /isPermissionDenied\(error\).*StorageQuotaError/s);
  assert.match(source, /wouldExceedStorage/);
});

test("legacy per-feature counters are no longer incremented", () => {
  for (const file of ["lib/exercises/generate-set.ts", "lib/study-sheets/generate-client.ts", "components/project-chat.tsx"]) {
    assert.doesNotMatch(read(file), /incrementUsage\(/);
  }
});
```

Also retain pure assertions that `wouldExceedStorage(3.9 * 1024 * 1024, 15 * 1024 * 1024)` is false and a true over-cap request is rejected.

- [ ] **Step 2: Run the storage tests and confirm they fail**

Run: `node --test tests/storage-quota.test.cjs`

Expected: FAIL on rules and permission-error remapping.

- [ ] **Step 3: Preserve server-owned admin fields in Firestore rules**

Permit optional boolean `admin` in the user schema. On client create it must be absent or false. On client update it must equal the existing value:

```text
function adminFieldUnchanged() {
  return (!("admin" in resource.data) && !("admin" in request.resource.data))
    || request.resource.data.admin == resource.data.admin;
}
```

Keep plan locked to beta values for browser writes. Admin SDK remains the only writer for admin and paid entitlement.

- [ ] **Step 4: Stop converting permission failures into quota failures**

In `reserveStorageBytes`, throw `StorageQuotaError` only inside the transaction when `wouldExceedStorage` is true. For transaction permission/schema failures, rethrow `Error("Could not verify storage. Try again.")` and preserve a structured console error with the original Firebase code.

Do not change the 1 GB cap or the existing rollback behavior after upload/extraction failure.

- [ ] **Step 5: Remove old Chat/Practice/Notes increments**

Delete the `incrementUsage` imports and calls from the three client-side generation paths. Leave legacy fields readable for compatibility and leave `usage.storageBytes` intact.

- [ ] **Step 6: Run storage tests and affected suites**

Run: `node --test tests/storage-quota.test.cjs tests/material-preview.test.cjs tests/pass-a.test.cjs`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 7: Commit storage and counter corrections**

```powershell
git add -- firestore.rules lib/account/store.ts lib/exercises/generate-set.ts lib/study-sheets/generate-client.ts components/project-chat.tsx tests/storage-quota.test.cjs
git commit -m "fix: distinguish storage quota from permission errors"
```

### Task 6: Current-week client subscription and unified Plan & usage UI

**Files:**
- Create: `lib/billing/client.ts`
- Create: `components/account/plan-usage.tsx`
- Modify: `components/account/use-user-profile.ts`
- Modify: `components/workspace/settings-modal.tsx`
- Modify: `components/account-sheet.tsx`
- Modify: `components/workspace/shell-context.tsx`
- Modify: `components/sidebar.tsx`
- Modify: `components/account/billing-card.tsx`
- Modify: `components/account/usage-meters.tsx`
- Test: `tests/plan-usage-ui.test.cjs`

**Interfaces:**
- Consumes: `AiUsageWeek`, `utcWeekWindow()`, `resolveEffectivePlan()`, `PLAN_CATALOG`, user profile `admin`.
- Produces: `subscribeCurrentAiUsage(uid, onChange, onError)`, `useCurrentAiUsage()`, and `<PlanUsage profile={profile} />` shared by desktop/mobile.

- [ ] **Step 1: Write failing unified-navigation and rendering contracts**

```js
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

test("usage listener exists only in the mounted PlanUsage tree", () => {
  const component = read("components/account/plan-usage.tsx");
  assert.match(component, /useCurrentAiUsage/);
  assert.match(component, /Overview/);
  assert.match(component, /Analytics/);
});
```

- [ ] **Step 2: Run UI contracts and confirm they fail**

Run: `node --test tests/plan-usage-ui.test.cjs`

Expected: FAIL because PlanUsage and merged navigation do not exist.

- [ ] **Step 3: Implement the current-week subscription**

Subscribe to `users/{uid}/aiUsageWeeks/{utcWeekStart()}` and map missing documents to `emptyAiUsageWeek`. Expose `{ usage, loading, error }`. Unsubscribe on unmount; do not mount the hook in the global app shell or profile provider.

- [ ] **Step 4: Map Admin state in the profile**

Update user mapping/fallback so `admin` is always boolean. `PlanUsage` resolves the displayed plan from stored plan plus `profile.admin`; it never trusts a URL/query plan.

- [ ] **Step 5: Build the shared Overview and Analytics component**

Implement local tab state and these exact states:

- Overview: current-plan card, `View plans` link to `/plans`, `$used / $2.00` and remaining amount for Free Beta, `Unlimited` plus actual spend for Admin, reset countdown, clamped progress bar, separate storage row.
- Analytics: input, output, thinking, total tokens, request count, provider cost.
- Loading: stable skeleton rows without fake zero values.
- Missing week: real zero values.
- Error: `Usage is temporarily unavailable.` while current plan remains visible.

Use existing `bg-surface-2`, `border-border`, `text-foreground`, `text-muted`, and `accent-symbol` tokens. Do not introduce a second color system or copy ChatGPT logos/copy.

- [ ] **Step 6: Merge desktop and mobile navigation**

Replace `billing` and `usage` section/page union members with `planUsage`. Replace two rows with one **Plan & usage** row. Keep existing calls that open `billing` working temporarily by mapping legacy `billing`/`usage` inputs to `planUsage`, then update `components/sidebar.tsx` callers to use `planUsage` and remove the aliases.

Retain `BillingCard` and `UsageMeters` only as thin exports of the new component if another import remains; otherwise remove their imports and leave the files unused for a later cleanup commit.

- [ ] **Step 7: Run UI tests and accessibility-focused source checks**

Run: `node --test tests/plan-usage-ui.test.cjs tests/icon-settings.test.cjs`

Expected: PASS with the existing Account behavior preserved.

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 8: Commit the unified surface**

```powershell
git add -- lib/billing/client.ts components/account/plan-usage.tsx components/account/use-user-profile.ts components/workspace/settings-modal.tsx components/account-sheet.tsx components/workspace/shell-context.tsx components/sidebar.tsx components/account/billing-card.tsx components/account/usage-meters.tsx tests/plan-usage-ui.test.cjs
git commit -m "feat: unify plan and usage settings"
```

### Task 7: Plans page and correct account plan display

**Files:**
- Create: `app/plans/page.tsx`
- Create: `components/account/plans-page.tsx`
- Modify: `components/account/account-workspace.tsx`
- Modify: `tests/plan-usage-ui.test.cjs`

**Interfaces:**
- Consumes: `PLAN_CATALOG`, `resolveEffectivePlan()`, `useUserProfile()`.
- Produces: authenticated `/plans` catalog and correct plan label on `/account`.

- [ ] **Step 1: Extend the failing UI test for plan cards**

```js
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
```

- [ ] **Step 2: Run the plan-page tests and confirm they fail**

Run: `node --test tests/plan-usage-ui.test.cjs`

Expected: FAIL because `/plans` does not exist and account still hardcodes Beta hint.

- [ ] **Step 3: Build the plans route and responsive catalog**

Create route metadata `Plans · TobyVerse`. Build a responsive grid using the shared plan catalog:

- Free Beta card: current for ordinary users, $0 during beta, $2 weekly AI allowance.
- Lite/Pro/Max: visible monthly price and concise positioning; disabled `Available after beta` button.
- Team: one payer, seats, invitations, shared administration; disabled beta button and no price invention.
- Admin: when effective plan is Admin, show a compact current-plan banner above the public catalog; do not add Admin to purchasable cards.

All cards need a heading, price/status, feature list, and accessible button/link state. Mobile is one column; wider view uses a balanced grid rather than horizontal overflow.

- [ ] **Step 4: Correct `/account` plan display**

Resolve the effective plan from `profile.plan` and `profile.admin`, display `Admin` or `Free Beta`, and add a `View plans` link. Remove the unconditional `Beta` hint; Free Beta already communicates beta status in its label.

- [ ] **Step 5: Run UI tests and TypeScript**

Run: `node --test tests/plan-usage-ui.test.cjs`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit plans and account display**

```powershell
git add -- app/plans/page.tsx components/account/plans-page.tsx components/account/account-workspace.tsx tests/plan-usage-ui.test.cjs
git commit -m "feat: add beta plans catalog"
```

### Task 8: Full verification and manual product checks

**Files:**
- Modify only files required by verified failures from the commands below.

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: a buildable, lint-clean feature with evidence for metering, limits, UI, and storage regression behavior.

- [ ] **Step 1: Run all targeted billing and storage tests**

Run:

```powershell
node --test tests/billing-domain.test.cjs tests/billing-provider.test.cjs tests/billing-server.test.cjs tests/billing-routes.test.cjs tests/storage-quota.test.cjs tests/plan-usage-ui.test.cjs
```

Expected: all tests PASS.

- [ ] **Step 2: Run the existing regression suite**

Run: `node --test tests/*.test.cjs`

Expected: all tests PASS. If PowerShell does not expand the wildcard in the installed Node version, run `Get-ChildItem tests/*.test.cjs | ForEach-Object { node --test $_.FullName }` and require every process to exit 0.

- [ ] **Step 3: Run static checks**

Run: `npx tsc --noEmit`

Expected: exit 0.

Run:

```powershell
npx eslint types/billing.ts types/user.ts lib/billing lib/ai/types.ts lib/ai/gemini.ts lib/ai/json.ts lib/account/plan.ts lib/account/store.ts components/account components/workspace/settings-modal.tsx components/workspace/shell-context.tsx app/plans app/api/chat app/api/study-sheets app/api/paths app/api/exercises app/api/memory app/api/projects/title app/api/images app/api/materials/extract app/api/admin/run app/api/admin/audit
```

Expected: exit 0 with no new warnings.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: Next.js production build succeeds.

- [ ] **Step 5: Verify metering with a controlled local call**

Using a signed-in non-admin test account, record the current weekly document, make one short chat request, and verify exactly one write with increased `requestCount`, provider-returned token totals, `byModel.gemini-2.5-flash`, and positive `costMicros`. Trigger one JSON repair fixture and verify two provider requests were added in one final aggregate update.

- [ ] **Step 6: Verify limits and Admin behavior**

With emulator/test data, set an ordinary current-week document to `2_000_000` microdollars and verify every metered endpoint returns `weekly_ai_budget_exhausted` plus `resetsAt`. Set Admin usage above the cap and verify generation succeeds while usage and cost continue increasing.

- [ ] **Step 7: Verify desktop and mobile UI**

Open desktop Settings and mobile account sheet. Confirm one **Plan & usage** item, Overview and Analytics tabs, accurate reset text, Free Beta/Admin labels, actual spend, separate storage row, and `/plans` navigation. Confirm the plans grid at desktop and phone widths and verify every future-plan action is disabled with `Available after beta`.

- [ ] **Step 8: Reproduce and verify the storage regression**

Use an admin profile with about 3.9 MB recorded storage and upload a valid file below 15 MB. Confirm upload succeeds and the storage counter increases. Then test a request whose bytes truly exceed 1 GB remaining and confirm only that request receives the 1 GB quota message.

- [ ] **Step 9: Inspect the final diff for scope and secrets**

Run: `git diff --check`

Run: `git status --short`

Inspect only task-owned changes. Confirm no API key, service-account JSON, prompt text, response text, or user content is written into usage documents or logs.

- [ ] **Step 10: Commit verification-only corrections**

If verification required source changes, stage only those exact files and commit:

```powershell
git commit -m "fix: close plan usage verification gaps"
```

If no source changes were required, do not create an empty commit.
