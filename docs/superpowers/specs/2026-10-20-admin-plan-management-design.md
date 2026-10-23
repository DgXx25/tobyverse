# Admin plan management and Paddle foundation

## Intent

Give the owner a real administrative workspace for assigning a plan to a registered account permanently or until a chosen time. Make that assignment control server-enforced access, not merely a profile label. Prepare subscription checkout and verified Paddle events while payment configuration is pending.

The user's request authorizes implementation. Existing Next.js/Firebase architecture, individual plans and admin authorization remain the foundation. No separate admin-role delegation is introduced.

## Interface

Add Plans to the admin sidebar. Use the application's existing neutral light/dark tokens, font and icons. A broad, left-aligned account list uses roughly 88px rows with an avatar/name/email, effective plan, access origin, expiry and Manage action, following the supplied YouTube list density. No decorative summary-card grid or top category strip.

Search by exact email or account UID, with paginated browsing. A detail drawer shows effective access, a grant form, separate provider subscription information and an audit history. Grant duration supports permanent, presets and a custom date. Revocation explicitly removes the manual grant and never cancels a purchased subscription. Plan allowance configuration is a separate clearly named section/dialog. Unconfigured paid allowances must be configured before granting or enabling checkout; do not invent commercial limits.

## Authority and expiration

Billing account records are server-owned and separate from editable user profiles. One pure resolver chooses the highest valid manual/subscription entitlement, then falls back to legacy/free access. An admin remains a separate authorization capability. Every AI preflight and upload policy resolves current access using server time. Expiration needs no scheduled downgrade job. Revocation and grant replacement are transactions with expected revisions, actor, reason and immutable audit entries. Granting a plan cannot grant admin powers.

Free beta retains its existing $2 provider-cost allowance per UTC week. Other plan allowances are administrator-configured positive bounded integer microdollars. Unknown/unconfigured plans never become unlimited. Storage remains 1 GiB. The tier upload-policy helper resolves effective access; the existing server upload routes retain their operational file cap. Account UI reads the same server result and refreshes at expiry/focus. Billing failures fail closed. A client-editable profile email cannot prove administrator status or serve as the authoritative recipient identity in the admin list. Protected legacy access remains an independent fallback.

## Payment boundary

Paddle stays disabled until explicit server configuration, credentials, public client token and allowlisted price mappings are present. Checkout is account-authenticated, has same-origin checks, rate/duplicate protection, server-selected prices and a persisted opaque checkout binding. A brief preparation lock becomes a durable reservation of a still-payable ready transaction; the first subscription attachment verifies its completed provider receipt and consumes that binding. Browser success never grants access. Sandbox checkout is limited to administrator/allowlisted UIDs and cannot affect production-environment entitlements.

Webhook processing verifies the exact raw body using Paddle's timestamped HMAC signature and a timing-safe comparison; it rejects stale/future signatures, duplicates by event ID and older subscription updates. Signed events bind to an existing server-created checkout/customer mapping, with matching price and account. Never accept a body-supplied UID alone. Store compact billing state and audit metadata, not card details or full payloads. Keep provider subscriptions separate from promotional grants. Only active/trialing subscriptions within their recorded valid window grant access; paused/canceled/past-due states do not. A scheduled cancellation preserves access through its effective time.

## Delivery and limits

Prepare real provider adapters and routes, but do not activate charges, create a live checkout or change real customer access during implementation. Document environment variables, Paddle event subscriptions, deployment/rules and sandbox activation steps. Team access does not create a seat-management product. No new dependencies are needed. Use static TypeScript/build checks and focused security review; do not add or run a test suite without a user request.

Official integration references: [signature verification](https://developer.paddle.com/webhooks/signature-verification), [provisioning](https://developer.paddle.com/build/subscriptions/provision-access-webhooks), [transaction creation](https://developer.paddle.com/api-reference/transactions/create-transaction), [checkout](https://developer.paddle.com/build/checkout/build-overlay-checkout).
