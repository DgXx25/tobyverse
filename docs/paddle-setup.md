# Paddle setup

Paddle checkout is disabled until `PADDLE_BILLING_ENABLED=1` and all configuration checks pass. This implementation prepares the integration; no payment or live customer change was performed during development.

## Server environment

Keep API keys and webhook secrets in the deployment's secret storage. Do not use `NEXT_PUBLIC_` for these variables. Only the client token, environment and a server-created transaction ID are returned to the authenticated checkout client. Paddle distinguishes [server API keys from public client tokens](https://developer.paddle.com/api-reference/about/authentication/).

| Variable | Value |
| --- | --- |
| `PADDLE_BILLING_ENABLED` | `0` while configuring; exactly `1` enables billing |
| `PADDLE_ENVIRONMENT` | `sandbox` (default) or explicitly `production` |
| `PADDLE_API_KEY` | Modern `pdl_sdbx_apikey_…` sandbox key or `pdl_live_apikey_…` production key with `price.read`, `transaction.read`, `transaction.write` and `customer_portal_session.write` permissions |
| `PADDLE_CLIENT_TOKEN` | Public `test_…` sandbox token or `live_…` production token |
| `PADDLE_WEBHOOK_SECRET` | `pdl_ntfset_…` secret for this notification destination |
| `PADDLE_PRICE_LITE` | Lite recurring price ID (`pri_…`) |
| `PADDLE_PRICE_PRO` | Pro recurring price ID (`pri_…`) |
| `PADDLE_PRICE_MAX` | Max recurring price ID (`pri_…`) |
| `PADDLE_PRICE_TEAM` | Optional reserved Team price mapping (`pri_…`); Team checkout is unavailable while its catalog price is unspecified |
| `PADDLE_CHECKOUT_URL` | HTTPS application payment page on a domain approved in the selected Paddle environment |
| `PADDLE_SANDBOX_UIDS` | Comma-separated account UIDs permitted to use sandbox checkout, in addition to administrators. Public users cannot obtain sandbox paid access. Use a separate staging Firebase project for full isolation. |

At least one plan price must be configured; other plans can be enabled later. All configured price IDs must be valid and distinct. Readiness validates configuration shape and environment compatibility; it does not contact Paddle to verify credentials, permissions, approved domains or recurring product settings. Its per-plan flags show available mappings, while `PADDLE_PRICE_MAPPING` means no prices were configured. Paid plans have progressive default weekly AI allowances; administrators can adjust them in the admin workspace. Existing manual grants do not require Paddle.

For Firebase Frameworks deployments, keep the non-secret production values above in the ignored, project-specific `.env.<firebase-project-id>` file so deployments retain the same runtime configuration. Keep `PADDLE_API_KEY` and `PADDLE_WEBHOOK_SECRET` as Secret Manager bindings on the generated SSR function; never put them in this file. Verify the secret bindings remain after redeployment.

Before preparing each transaction, the adapter [reads the current provider price](https://developer.paddle.com/api-reference/prices/get-price/) using `price.read`. It requires an active price, a valid product ID, a recurring billing cycle of one month, and a USD amount equal to the plan catalog's `monthlyPriceCents`. Country price overrides must preserve that amount and currency. One-time, archived, annual and mismatched prices are rejected. Team cannot use self-service checkout while its catalog monthly price is `null`; administrators can still grant Team manually. This provider lookup runs when checkout is requested, so a locally ready configuration alone does not establish that a price is purchasable.

## Sandbox activation

1. Create a Paddle sandbox account, recurring products/prices and the sandbox credentials above. Keep billing disabled while configuring.
2. Set an approved application payment URL in Paddle and `PADDLE_CHECKOUT_URL`. Use a deployed HTTPS staging domain. [Transaction creation](https://developer.paddle.com/api-reference/transactions/create-transaction/) sends this URL and prepares an automatically collected draft transaction; it does not submit a charge.
3. Deploy the application and its Firestore rules/indexes. Keep billing collections inaccessible to direct client writes; authenticated server routes own account, checkout binding, processed-event and audit records. Check that the deployed server has Firebase Admin credentials and administrator UID authorization configured.
4. Add an HTTPS notification destination pointing to `/api/billing/webhook` on that deployment. Copy its own destination secret to `PADDLE_WEBHOOK_SECRET`.
5. Subscribe to `subscription.created`, `subscription.updated`, `subscription.activated`, `subscription.trialing`, `subscription.resumed`, `subscription.paused`, `subscription.canceled` and `subscription.past_due`. Subscription snapshots provide authoritative price and billing-window data; see [subscription.updated](https://developer.paddle.com/webhooks/subscriptions/subscription-updated/).
6. Confirm admin readiness and review the paid-plan allowances, then set `PADDLE_BILLING_ENABLED=1` in staging and redeploy. Initiate checkout from an authenticated account using `/api/billing/checkout`; the server selects the configured plan price and persists an opaque checkout binding before preparing the transaction.
7. With operator authorization, use Paddle's sandbox checkout and fresh webhook simulator deliveries to verify activation, renewal, cancellation, pause, past-due access removal, duplicate delivery and out-of-order handling. Browser completion alone must leave access unchanged until the signed event is accepted. These payment checks have not been run as part of implementation.

The browser helper loads the [official Paddle.js script and initializes once](https://developer.paddle.com/paddle-js/methods/paddle-initialize/) when checkout is invoked. It opens the [existing transaction ID](https://developer.paddle.com/paddle-js/methods/paddle-checkout-open/), sets the sandbox environment before initialization, and reports load failures. Any payment URL configured in Paddle must load Paddle.js with the matching public token as required by the chosen checkout flow.

## Webhook and access boundary

Read the exact raw request bytes before JSON parsing. [Signature verification](https://developer.paddle.com/webhooks/about/signature-verification/) uses HMAC-SHA256 of `ts:rawBody` and a timing-safe comparison, allowing a five-second timestamp window in either direction. Keep the server clock synchronized. Notification retries use a fresh delivery signature; replaying an old signed request will fail.

`custom_data.checkout_id` and `custom_data.uid` are correlation hints. The webhook route must match the existing server checkout/customer/subscription mapping and expected price; a signed body UID alone cannot establish account ownership. The event parser performs no writes. The route deduplicates by `event_id` and rejects subscription updates older than the stored `occurred_at` before applying compact billing state and audit entries.

On the first subscription attachment, the server reads the exact transaction it created and requires a completed payment, matching subscription, customer, custom data and item prices. The binding is durably consumed by that subscription. A short preparation lock is followed by a durable reservation of the ready checkout: repeating the same plan reopens that transaction, preventing multiple payable checkouts. A different plan is blocked until the outstanding checkout is resolved. An operator must confirm an unpaid transaction has been canceled in Paddle before releasing its reservation; never clear it while it remains payable. Existing non-canceled subscriptions must be managed through the customer portal before another can be started. Provider timestamps retain fractional precision for event ordering.

Unknown prices on an existing subscription withdraw that subscription's entitlement rather than retaining an older active tier. Cancellations continue to update state even if a plan allowance has been removed. New subscriptions with unmapped prices cannot be attached.

Only `active` or `trialing` subscriptions with a valid, unexpired recorded billing period can grant access. Scheduled cancellation/pause caps access at its effective time. Paused, canceled and past-due subscriptions do not grant access. Manual grants remain separate. Do not store card information or full webhook payloads.

## Production activation

After sandbox verification and an explicit decision to accept live payments, create separate live prices, a production API key, a `live_…` client token, an approved production payment URL and a production notification destination. Install that destination's secret, set `PADDLE_ENVIRONMENT=production`, and enable billing only after all readiness and allowance checks pass. Sandbox IDs and secrets must not be reused. Readiness is a local configuration check, not evidence that a live charge or entitlement flow has succeeded.

## Subscription management

The account server route must resolve the authenticated user's persisted customer mapping before calling `createPaddlePortalSession(customerId)`. It [creates a fresh customer portal session](https://developer.paddle.com/api-reference/customer-portals/create-customer-portal-session/) and returns only its overview URL. Keep the response private with `Cache-Control: no-store`; do not persist or log the URL because it includes a temporary authentication token. Open it as a top-level navigation, not an iframe.

The adapter accepts only HTTPS links on the environment's [official customer portal host](https://developer.paddle.com/changelog/2025/subscription-management-links-customer-portal/): `sandbox-customer-portal.paddle.com` or `customer-portal.paddle.com`. Portal creation needs valid API credentials and `customer_portal_session.write`; it remains available when new checkout is disabled. Keep the matching API credentials installed for existing subscribers. Cancellations and other subscription changes still affect access only after the verified subscription webhook is processed.

## Administrative operation

Open `/admin/plans`. Browse accounts or search by exact email/UID. Review a paid plan's weekly provider-cost allowance under **Plan allowances**; this is not the monthly subscription price. Every paid plan has a progressive default allowance that administrators can change. Free Beta has a $2 weekly allowance and 300 MB storage; Lite, Pro, Max and Team have higher weekly AI allowances and storage caps.

Use **Manage** to grant a plan permanently, for 7/30/90 days, or until a custom date. Every change requires a reason and records the actor. A revision conflict reloads the account before another attempt. **Revoke** removes only the manual grant; it cannot cancel a purchased subscription or grant admin privileges. Earlier protected legacy plans also remain independent fallback entitlements. Expiry is evaluated on the server for each AI request, without a scheduled downgrade job. User account display refreshes from the same resolved access.

Deploy `firestore.rules` and `storage.rules` with the application. Billing state and audit collections reject direct client access; uploads go through the existing authenticated server upload/extraction routes. Do not manually expose these collections to make the admin UI work.
