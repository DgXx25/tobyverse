# Plan, Usage, and AI Metering Design

## Outcome

TobyVerse will replace separate Billing and Usage surfaces with one Codex-style **Plan & usage** experience. During beta, every regular signed-in account receives one shared weekly AI allowance worth **$2 USD**. Chat, notes, practice, paths, memory generation, titles, and other user-triggered model work all consume the same allowance. Feature counts are analytics only; they are not separate quotas.

Administrators receive an **Admin** plan with no enforced AI spending limit. Their token use and estimated provider cost remain visible and are recorded through the same path as ordinary accounts.

The release also includes a preview-only plans page for Lite ($10/month), Pro ($20/month), Max ($50/month), and Team. No paid entitlement or checkout flow will be simulated before a payment provider and paid-plan allowances are specified.

## Product rules

### Active beta plans

- `free_beta`: $0 charged to the user, $2 of AI provider cost available per UTC week.
- `admin`: no weekly cap, visible usage and cost tracking.
- The week starts Monday at 00:00 UTC. The UI shows the next reset time.
- The old Chat, Practice, and Notes caps are removed. Storage remains an operational quota, not part of the AI allowance.

### Future plans

The plan catalog contains the following preview entries:

- Lite — $10/month
- Pro — $20/month
- Max — $50/month
- Team — price not yet set; one payer, multiple seats, invitations, and shared administration

Future cards are marked as unavailable during beta. Buttons must not change the user's stored entitlement or imply that a payment succeeded. Team data structures, invitations, and seat billing are deferred until the actual team implementation.

## AI usage source of truth

The Gemini API's returned `usageMetadata` is the source of truth. It provides prompt, candidate, thought, and total token counts. TobyVerse must not estimate token usage from characters or count only user-visible response text.

The current model is `gemini-2.5-flash`. The initial price snapshot is:

- text/image/video input: $0.30 per 1,000,000 tokens
- output, including thinking tokens: $2.50 per 1,000,000 tokens

Cost is calculated with integer microdollars to avoid floating-point drift:

`input cost + (candidate output + thought tokens) cost`

The pricing table is isolated in a model-price catalog. Each calculation records a pricing version so later price changes affect new usage only and do not rewrite historical totals. Official references:

- <https://ai.google.dev/gemini-api/docs/pricing>
- <https://ai.google.dev/api/generate-content>

## Request-scoped collection

Every authenticated, user-triggered AI endpoint creates a request-scoped usage collector after authentication and budget preflight. The collector is passed through the central generation layer, so direct text generation, streaming generation, tool streaming, JSON generation, and JSON repair retries all report into the same collector.

The Gemini provider reads the final response metadata. For streams it uses the SDK's aggregated response after the stream finishes, rather than summing partial chunks. A route may make multiple provider calls, but it commits the collector only once in its `finally` path. Completed provider calls are recorded even when a later retry fails or the client disconnects.

Admin-only playground and evaluation traffic is attributed to the acting administrator and remains unlimited. Anonymous guest chat keeps its existing turn cap and is not added to account billing because it has no persistent paid account identity.

## Firestore model and write volume

Weekly aggregates live at:

`users/{uid}/aiUsageWeeks/{YYYY-MM-DD}`

Each document contains:

- `weekStart`
- `inputTokens`
- `outputTokens`
- `thinkingTokens`
- `totalTokens`
- `requestCount`
- `costMicros`
- a small `byModel` aggregate keyed by stable model ID
- `pricingVersion`
- `updatedAt`

The server performs one transaction per completed user-visible AI operation, regardless of internal retry count. The UI subscribes only to the current week's document while Plan & usage is open; it does not add a global listener to every application screen. Previous week documents provide inexpensive history without growing the user profile document.

Client rules allow owners to read their weekly documents and deny all client writes. Server code uses the Admin SDK for budget reads and aggregate transactions.

This design avoids a Firestore document per provider request while preserving weekly history. It also prevents clients from forging usage values.

## Budget enforcement

Before starting a user-triggered model operation, the server reads the current week's aggregate and resolves the effective plan on the server. A regular account at or above $2 receives a typed `weekly_ai_budget_exhausted` response with the reset timestamp. Admin requests bypass this rejection but still create usage records.

Provider cost is known only after generation. Therefore, one final operation can exceed the remaining allowance by the cost of that operation. After it is recorded, later operations are blocked. The UI shows actual spend even when it is above 100%, while the progress bar is visually clamped. This is preferred over speculative reservations, which would add writes and could block unused budget. Strict prepaid reservations can be introduced with payment processing later.

Budget lookup or usage persistence failures must never silently grant an ordinary account unlimited access. Preflight failure returns a retryable service error. If generation succeeds but the final usage write fails, the route logs a structured server error and returns the generated result; a failed write must be observable rather than swallowed.

## Plan and admin resolution

The public user profile plan type accepts `free_beta`, `lite`, `pro`, `max`, and `team`. `admin` is an effective server-resolved plan, not a client-writable entitlement.

An account is an administrator when the existing admin authorization path accepts it: configured `ADMIN_UIDS`, or a server-maintained `admin: true` user field. UI display may read the server-maintained boolean, but the browser cannot create or change it. Firestore user validation must preserve server-owned fields during ordinary profile updates.

Existing `free` values normalize to `free_beta`, so no bulk migration is required before release.

## Unified UI

Desktop Settings and the mobile account sheet each replace Billing and Usage with one navigation item labeled **Plan & usage**.

The page follows the reference hierarchy:

1. **Overview** tab
   - current plan card (`Free Beta`, or `Admin`)
   - plan price/status
   - `View plans` action
   - weekly AI allowance card with actual dollars used, dollars remaining, a progress meter, and reset countdown
   - compact storage row shown separately from AI allowance
2. **Analytics** tab
   - input tokens
   - output tokens
   - thinking tokens
   - total provider requests
   - current-week provider cost

Admin sees `Unlimited` instead of a monetary cap but still sees exact spend. Loading, missing-week, and error states are explicit; a missing weekly document means zero usage for the current week.

The standalone `/plans` page uses responsive plan cards inspired by the supplied reference without copying ChatGPT branding. `Free Beta` is marked current for ordinary users. Admin sees an Admin current-plan summary above the public catalog. Lite, Pro, Max, and Team display their future pricing and availability; their buttons are disabled with clear beta copy.

The `/account` page also shows the correct effective plan instead of always reporting Free.

## Storage quota defect

The screenshots show 3.9 MB used in Settings while uploads report that the full 1 GB is exhausted. The traced failure path is:

1. `prepareMaterialIngest` calls `reserveStorageBytes`.
2. `reserveStorageBytes` updates the whole user document through a client transaction.
3. Firestore can reject that update when the existing profile contains a server-owned field not admitted by `isValidUser`, notably `admin`.
4. `reserveStorageBytes` converts every `permission-denied` error into `StorageQuotaError`.
5. The UI therefore displays the full-quota message even though the stored counter remains 3.9 MB.

The correction has three parts:

- Firestore user rules recognize server-owned `admin` state and require it to remain unchanged in client updates.
- Storage reservation reports permission/schema failures as service errors; only a calculated `used + requested > cap` condition produces the 1 GB quota message.
- A regression test covers an admin profile with low storage usage and verifies that reserving a file is allowed. Separate tests verify real over-cap rejection and correct rollback after failed uploads.

The storage counter remains at 1 GB during beta. It appears separately because the $2 plan allowance measures AI provider work, not file bytes.

## Compatibility and migration

Legacy `usage.chatTurns`, `usage.practiceGenerated`, and `usage.notesGenerated` values remain readable during rollout but are no longer incremented or displayed as limits. `usage.storageBytes` remains the storage source of truth in this release to avoid an unrelated file inventory migration.

The first successful server usage transaction creates the current weekly aggregate. Existing accounts require no eager write. Existing `plan: "free"` profiles display as Free Beta until a future server-side entitlement migration changes them.

## Error and security behavior

- Plan identity and budgets are resolved server-side; request bodies and query parameters cannot select a plan.
- Clients cannot write weekly AI aggregates, admin status, or paid plan values.
- Usage documents expose totals only and never store prompts, responses, file names, or chat text.
- Limit responses include a stable code and reset timestamp so every AI surface can show the same message.
- Provider failures preserve recorded usage for any completed provider call.
- Unknown model pricing fails closed for ordinary users instead of recording zero-cost work. Admin requests may proceed only with a structured warning so model rollout can be diagnosed.

## Verification

Pure unit tests cover:

- UTC week boundaries and reset timestamps
- legacy plan normalization and admin resolution
- microdollar pricing, including thought tokens
- aggregation across retries and multiple provider calls
- ordinary $2 rejection and admin bypass
- missing and unknown pricing behavior
- storage permission errors versus real quota exhaustion

Integration/source-contract tests cover:

- one usage commit for a multi-call user operation
- current-week read-only Firestore rules
- merged Settings and mobile navigation
- correct account plan label
- plans page cards and beta-disabled actions

Final verification includes the targeted Node test suite, TypeScript compilation, linting of changed files, a production build, and manual desktop/mobile checks of Plan & usage, `/plans`, limit errors, admin display, and a low-usage file upload.
