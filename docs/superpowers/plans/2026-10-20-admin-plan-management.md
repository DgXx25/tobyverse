# Admin plan management implementation plan

**Goal:** Manage time-bound and permanent plan grants securely, and prepare Paddle subscriptions.

**Architecture:** Pure entitlement resolution, server-owned billing accounts, transactional audited grants, provider adapters and protected APIs; a list-and-drawer admin UI shares contracts with account UI and enforcement.

**Tech stack:** Existing Next.js, React, Firebase Admin/Firestore, Zod, native crypto/fetch.

**Spec:** docs/superpowers/specs/2026-10-20-admin-plan-management-design.md

## Constraints and review focus

- No client-writeable entitlements, admin-role escalation, unconfigured unlimited paid plans or browser-success provisioning.
- Expiration, revoke/fallback, concurrent stale admin edits, webhook replay/order and UID/price binding must be explicit.
- No live payments or real access changes during development. No broad test suite or new dependencies.
- Match the supplied list proportions using existing application tokens, not an unrelated dashboard template.

## Work

- [x] Define shared types and pure resolver with strict server validation.
- [x] Implement account access reads, paginated admin search, plan policy configuration and transactional grant/audit APIs.
- [x] Implement provider configuration, raw-signature verification, checkout adapter and disabled-by-default client launch helper.
- [x] Bind checkout/webhooks transactionally and enforce subscriptions separately from manual grants.
- [x] Build admin list, access drawer and plan allowance editor; add sidebar/page entry.
- [x] Integrate access with AI budgets, upload policy, account plan display and secure Firestore boundaries.
- [x] Document setup; review combined security boundaries and TypeScript/build output; show local admin page.

## Evidence

- Production Next.js build completed successfully (existing unrelated lint warnings remain).
- TypeScript static checking completed successfully.
- Read-only browser review of the authenticated account list, management drawer and allowance editor completed; no real grants, policies or payments were changed.
- Security review findings addressed: durable checkout reuse, preserved legacy fallback, exact provider timestamp ordering, verified admin identity and authoritative recipient emails.
- Paddle activation and payment lifecycle verification remain operator setup work; checkout is disabled by default.
