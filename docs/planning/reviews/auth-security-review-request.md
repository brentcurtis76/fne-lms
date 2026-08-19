# Review request — authentication-security remediation, fourth pass

> This is independent remediation, not a numbered GENERA phase. The review
> protocol still applies, but inventing a `fase-<N>` identifier would make the
> project ledger inaccurate.

## 1. Review verdict and exact branch facts

**Verdict: READY FOR INDEPENDENT REVIEW.** This means the local implementation
and required evidence are ready to be challenged. It does **not** mean deployed,
production-verified, or confirmed to deliver e-mail.

| Fact | Value |
| --- | --- |
| Branch | `fix/auth-sec2` |
| Base | `4399949942bfcf49dfa8de40cbf7edbf40f0490e` |
| Previously reviewed head | `aea9920856bf1c86c3b19914f758edf3808fb2e0` |
| Exact implementation head | `242be503e21172c8a8c8160608c5cbafbbacdc58` |
| Review packet head | The documentation commit directly after `242be503`; resolve exactly with `git rev-parse fix/auth-sec2` |
| Final commit count from base | **20** |
| Final diff from base | **140 files, +23,475 / -3,667** |

A Git commit cannot contain its own hash: changing the document changes the
hash. For that reason the exact code-bearing head is pinned above, while the
packet commit is identified structurally and the final execution report records
its exact SHA. The count and diff describe the final packet tree, not the
implementation commit alone.

The two commits added after the reviewed head are:

```text
242be503e21172c8a8c8160608c5cbafbbacdc58  fix(auth): harden recovery ceremonies and password boundary
<packet commit>                            docs(auth): finalize security review evidence
```

No history was rewritten. Nothing was deployed or merged, no production data or
database was accessed, and all test identities were synthetic.

## 2. Objective and scope

The objective was to close the six blocking findings against the reviewed head
systemically:

1. durable public-recovery abuse and enumeration controls;
2. a default-deny password-write boundary that is not payload-shape dependent;
3. a retryable, bounded recovery grant rather than burning proof before the
   provider accepts a password;
4. accurate unauthenticated actor attribution and delivery-state semantics;
5. exact CI status-check reconciliation; and
6. runbook, project-state, evidence, policy/privilege verification, and the
   `Hola Hola,` fallback defect.

In scope were the self-service recovery request/exchange/completion pipeline,
existing-account password and auth-admin primitives, Resend recovery dispatch
and webhooks, audit outcomes, CI guards, local database proofs, mandatory e2e,
and their operational documentation.

Explicitly out of scope were deployment, merge, live GitHub settings, provider
dashboard changes, production migrations or queries, credential rotation, CDN
purge, a controlled real send, and unrelated legacy RLS/advisor debt. No new
minor-data table was introduced: the current LMS population is adult staff, the
private recovery state contains encrypted envelopes or one-way fingerprints,
and the grant ledger contains no user identifier.

## 3. Finding disposition and design

### 3.1 Durable recovery throttling and dispatch

`POST /api/auth/recovery-request` now normalizes the address, derives an HMAC IP
fingerprint, encrypts the request envelope with AES-256-GCM, and makes one
service-role RPC call. It always returns the same no-store 200 response body and
uses the same response floor; it does not call GoTrue link generation, Resend,
or the profile API inline.

`enqueue_password_recovery` owns both controls in one transaction:

- a distributed IP bucket increments atomically before account lookup;
- a per-account transaction advisory lock serializes different IPs and different
  server instances targeting the same resolved account;
- the ten-minute cooldown is decided from durable outbox state under that lock;
- an unknown address performs one-way work and returns only an internal coarse
  status that the public route discards; and
- the queued audit row has `actor_user_id = NULL` and the account only as target.

The cron worker claims rows with leases. It generates a recovery link once,
encrypts and persists the entire prepared message **before** the first provider
call, and reuses both that ciphertext and a stable Resend idempotency key on
retry. Therefore a retry after transport ambiguity does not mint and e-mail a
new link that supersedes the recipient-visible one. Retryable transport/429/5xx
outcomes are bounded to eight attempts; a deterministic 4xx rejection is
terminal. Overlapping workers cannot claim the same job.

The real-Postgres concurrency proof opens independent connections and shows that
simultaneous requests from two instances and two IPs create exactly one durable
job, exactly one worker obtains its lease, and exactly one recovery grant obtains
its attempt lease.

### 3.2 Default-deny password boundary

There is no route allowlist. Raw password-capable Supabase primitives may occur
only in these three fixed-purpose low-level modules:

- `lib/auth/password-completion.ts` — four identity-establishing password
  ceremonies; its raw writer is module-private;
- `lib/auth/admin-user-maintenance.ts` — fixed email update and reset-marker
  cleanup operations; and
- `lib/auth/account-provisioning.ts` — constructs account-create fields itself.

The AST/import-graph guard rejects `updateUserById` and `createUser` outside those
modules regardless of inline, variable, spread, element-access, or aliased
payload shape. Imports of low-level modules are limited to pinned exports via
static, non-aliased named imports. Default, namespace, alias, `require`, dynamic
import, and re-export/barrel forms fail closed. The currently reviewed
`pages/api/admin/update-user.ts` is an ordinary caller and has no exemption.

The 26-test guard suite injects and requires rejection of every requested
adversarial form, including a password write in the former email-update escape
hatch. Positive controls prove comments/strings and approved ceremony imports do
not trigger false positives. The final scan covered 1,129 source files, 682
browser modules, and 513 entrypoints.

### 3.3 Retryable recovery grants and threat model

`POST /api/auth/recovery-exchange` consumes the one-time provider recovery proof
server-side with the literal purpose `recovery`. It then issues a 256-bit random,
authenticated, encrypted grant whose claims bind purpose, subject, issued time,
and expiry. The browser holds the opaque grant; the private database ledger
stores only its SHA-256 hash, expiry, state, attempt count, and lease.

The application lifetime is 15 minutes, the SQL hard ceiling is one hour, and a
grant permits at most five leased provider attempts. Every submit atomically
claims one attempt. A 422 policy/same-password rejection, 5xx, or network error
releases the lease and leaves the remaining bounded attempts usable. Success,
expiry, exhaustion, tampering, a different account, an ordinary access/session
token, or replay is rejected. Concurrent submissions produce one active lease.

There is an unavoidable distributed boundary between Supabase Auth and the
application database. The password update therefore writes
`last_recovery_grant_hash` into provider user metadata in the **same** provider
operation as the password. Before every grant claim, the server reads that
marker. If the provider committed but the database success transition was lost,
the marker burns the durable grant before another password update. This closes
the provider-commit/database-response-loss replay gap without storing a user id
in the grant ledger.

The grant does not elevate general authorization: it is accepted by the recovery
ceremony only, cannot become a session, carries no caller-selectable user id, and
the password audit action is derived from the ceremony rather than request data.

### 3.4 Audit and delivery semantics

Recovery audit rows use the account as `target_user_id` and always use a null
actor because the requester is unauthenticated. Metadata is allowlisted; links,
tokens, passwords, email addresses, encrypted envelopes, and raw provider error
text are excluded from audit/log output.

The states mean exactly:

| State | Evidence |
| --- | --- |
| `queued` | the durable job committed |
| `provider_attempted` | the worker is about to invoke the provider |
| `provider_accepted` | Resend returned an accepted message id |
| `provider_rejected` | Resend returned a terminal request rejection |
| `delivered` | a signature-verified `email.delivered` webhook matched that provider id |
| `bounced` | a signature-verified `email.bounced` webhook matched that provider id |

Only `/api/webhooks/resend`, after Svix verification over the raw request body,
may create `delivered` or `bounced`. Duplicate events are idempotent; bounce may
supersede accepted/delivered, while delivered may not overwrite bounced. A
provider API 2xx is **acceptance, never delivery**.

### 3.5 CI enforcement

The workflow emits exactly seven contexts:

1. `Migration safety guard`
2. `Browser/server boundary guard`
3. `Gate 1 — Typecheck`
4. `Gate 1b — Lint`
5. `Gate 2 — Unit (Vitest)`
6. `Gate 3 — RLS pgTAP (supabase test db)`
7. `Gate 4 — E2E (Playwright on seeded local Supabase)`

There is no `.github/branch-protection.json` in this repository.
`docs/ci-setup.md` names the same seven contexts and provides the exact human/API
configuration procedure. Live GitHub branch protection was not queried or
changed and remains **PENDING EXTERNAL**.

## 4. Files changed, grouped by risk

The authoritative complete inventory is:

```bash
git diff --name-status 4399949942bfcf49dfa8de40cbf7edbf40f0490e..fix/auth-sec2
```

Risk grouping for all 140 branch files:

### Critical — schema, RLS, durable state, and server trust boundaries

- Five migrations: `supabase/migrations/20260818120000_*` through
  `20260819120300_*`.
- `lib/auth/{password-completion,admin-password-reset,forced-password-change,recovery-proof,recovery-crypto,recovery-grant,recovery-request-queue,admin-user-maintenance,account-provisioning}.ts`.
- `middleware.ts`, `lib/supabase-wrapper.ts`, `lib/security/audit.ts`, and
  `lib/email/{invitations,outbox}.ts`.
- Authentication/admin/cron/webhook API routes under `pages/api/auth/`,
  `pages/api/admin/`, `pages/api/cron/recovery-outbox.ts`, and
  `pages/api/webhooks/resend.ts`.

### High — browser behavior and authorization-sensitive surfaces

- `pages/{login,reset-password,change-password}.tsx`,
  `components/PasswordResetModal.tsx`, `components/admin/BulkUserImportModal.tsx`,
  and the three admin user-management pages.
- Meeting-deletion boundary files under `lib/meetings/`, `pages/api/meetings/`,
  and `utils/meetingDeletion.ts`.
- Seven credential/diagnostic pages and the password-retrieval API were deleted.

### High — CI controls and production scheduling

- `.github/workflows/ci.yml`, `scripts/ci/check-browser-boundaries.mjs`,
  `scripts/ci/check-destructive-migrations.mjs`,
  `scripts/ci/recovery-concurrency-proof.mjs`, `scripts/ci/e2e-mandatory.mjs`,
  `playwright.config.ts`, `package.json`, and `vercel.json`.

### Verification — adversarial, integration, database, and browser tests

- All auth/admin/security suites under `__tests__/api/`, `__tests__/lib/auth/`,
  `__tests__/lib/email/`, `__tests__/lib/security/`, and `__tests__/security/`.
- The negative boundary fixtures in
  `__tests__/security/__boundary_fixtures__/`.
- `supabase/tests/050-*` through `054-*`, with compatibility updates to `030-*`
  and `040-*`.
- `tests/e2e/auth-lifecycle.spec.ts` and the supporting component/middleware
  suites.

### Documentation and low-risk type/UI support

- `docs/ci-setup.md`, this review request,
  `docs/runbooks/auth-security.md`, and `PROJECT_STATE.md`.
- `.gitignore`, `types/bulk.ts`, `utils/bulkUserParser.ts`,
  `utils/passwordGenerator.ts`, and their associated tests.

## 5. Final command evidence

All commands ran from `/Users/brentcurtis/dev/fne-lms` on 2026-08-19. The local
database was reset from repository migrations before pgTAP; no remote database
was involved.

| Command | Exit | Exact result |
| --- | ---: | --- |
| `npm run type-check` | 0 | clean |
| `npm run lint` | 0 | clean, zero warnings |
| `npm test` | 0 | **338 files; 7,832 passed, 11 skipped, 0 failed; 7,843 total** |
| local-env `npm run build` | 0 | Next 14.2.35; compiled; **149 static pages** |
| `npm run guard:migrations` | 0 | **23 migrations** scanned; no RLS disable or destructive statement |
| `npm run guard:browser` | 0 | **1,129 files; 682 browser modules; 513 entrypoints** |
| `npm run test:db` | 0 | **16 files; 818 tests; 0 failed** |
| `npm run test:recovery-concurrency` | 0 | one durable job, one outbox claim, one grant lease across independent connections |
| `npm run test:queue` | 0 | **40/40 exactly once** across two workers (21/19), all done |
| mandatory Playwright command, Chromium | 0 | **121 passed, 0 failed, 0 skipped** |
| `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | 0 | **12 mandatory specs ran with no skips** |
| `git diff --check` | 0 | clean |

The mandatory command used the exact repository expansion:

```bash
npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium
```

The 12 specs were `auth-lifecycle`, `ci-fixture`, `footer-heading-order`,
`pasantias-form`, `pasantias-leads-admin`, `pasantias-page`,
`session-disclosure`, `session-ical`, `smoke`, `zoom-join-authz`,
`zoom-managed-join`, and `zoom-mock-mode`.

The 11 Vitest skips are the pre-existing, explicitly parked Z3b tests. pgTAP
and mandatory Playwright had no skips or failures. One intermediate full Vitest
run exposed a stale expectation that still required raw audit error text; the
test was corrected to require the new redacted logging contract, its isolated
suite passed 61/61, and the final full run above is green.

The local browser run set `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` to empty.
It proved request → durable outbox → cron worker → captured application message →
proof exchange → bounded grant → password change. It did **not** contact Resend
and is not evidence of provider acceptance or delivery.

## 6. Areas the reviewer should scrutinize hardest

1. **Atomic recovery SQL.** Check advisory-lock keying, IP-bucket ordering,
   cooldown time boundaries, lease expiry, terminal transitions, and whether any
   exception can leave a recipient-visible link superseded.
2. **The provider/database commit gap.** Challenge the metadata-marker design,
   especially a provider success followed by response loss, marker read failure,
   concurrent submits, and whether any alternate password writer can omit it.
3. **Outbox confidentiality and idempotency.** Validate AES-GCM domain
   separation/key derivation, ciphertext-only persistence, stable Resend keys,
   the eight-attempt policy, and behavior after a worker outage longer than the
   provider's idempotency window.
4. **Boundary-guard completeness.** Try computed properties, nested aliases,
   alternate module specifiers, new extensions, re-export chains, and an added
   export from one of the three low-level modules. The control must remain
   structural rather than becoming a fixture-specific parser.
5. **Webhook truth model.** Review raw-body limits, Svix verification/replay
   behavior, provider-id correlation, duplicate/out-of-order events, and the
   choice that bounce can supersede delivered but delivered cannot supersede
   bounce.

## 7. Known limitations and pending actions

- **PENDING EXTERNAL:** an independent review and live `main` branch-protection
  verification for all seven exact contexts.
- **PENDING PRODUCTION:** apply the five migrations in order and perform the
  runbook's read-only policy, privilege, trigger, pre-request, and `BYPASSRLS`
  checks. Until then none of the new database controls exists in production.
- **PENDING PROVIDER/VERCEL:** verify the canonical origin, `RESEND_API_KEY`,
  `EMAIL_FROM_ADDRESS`, and `RESEND_WEBHOOK_SECRET`; register only the delivered
  and bounced webhook events; follow the normal `main` deployment path.
- **PENDING LIVE EVIDENCE:** perform one controlled synthetic send and separately
  record outbox commit, provider acceptance, and verified delivery/bounce. No
  real send occurred during this work.
- **PENDING INCIDENT OPERATIONS:** rotate the exposed administrator credential,
  invalidate sessions, decide on CDN purge/history cleanup, and verify removed
  routes after deployment.
- Resend idempotency is provider-window bounded. The application retries within
  eight one-minute attempts, but a worker outage longer than that provider window
  after an accepted-but-unacknowledged call deserves explicit reviewer scrutiny.
- The recovery and audit tables have no shipped retention job; operational
  retention is still a follow-up.
- The process-local endpoint limiters remain defense-in-depth only. Security
  decisions for public recovery and grants are durable SQL decisions.
- The broader pre-existing auth/RLS/advisor debt listed in `PROJECT_STATE.md`
  remains out of scope.

## 8. Questions for the independent reviewer

1. Can any concurrent or response-loss sequence generate two recipient-visible
   usable links or permit a successful grant replay?
2. Does the default-deny boundary have a syntactic or module-resolution bypass
   not represented by the adversarial fixtures?
3. Is storing the success marker in provider metadata with the password the best
   available compensation for the cross-system commit gap?
4. Are the webhook transition precedence and retained provider message id
   sufficient for accurate delivery evidence without leaking recovery material?
5. Are the five production migrations operationally acceptable in their stated
   order, including the wide restrictive RLS policy and private-schema grants?
