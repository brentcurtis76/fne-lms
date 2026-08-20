# Review request — authentication-security remediation, fifth pass

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
| Previously reviewed head (fourth pass) | `8e9b0530b9de6905d9676eef8e54c8331a764311` |
| Exact implementation head | `3009af540d35bcc9961319487b3bb6dc6bd290a4` |
| Review packet head | The documentation commit directly after `3009af54`; resolve exactly with `git rev-parse fix/auth-sec2` |
| Final commit count from base | **22** |
| Final diff from base | **149 files, +26,572 / -3,666** |

A Git commit cannot contain its own hash, so the exact code-bearing head is
pinned above while the packet commit is identified structurally. The count and
diff describe the final packet tree, not the implementation commit alone.

The two commits added after the fourth reviewed head are:

```text
3009af540d35bcc9961319487b3bb6dc6bd290a4  fix(auth): anti-enumeration, durable recovery context, fenced writes
<packet commit>                            docs(auth): fifth-pass review request, runbook retention, PROJECT_STATE
```

No history was rewritten. Nothing was deployed or merged, no production data or
database was accessed, and all test identities were synthetic.

## 2. Objective and scope

The objective was to close the fourth independent review's seven remaining
design defects systemically, while preserving what that review judged sound:
server-side purpose-bound proof consumption, the durable outbox, the
provider-state vocabulary, null unauthenticated actors, the data-layer
forced-password guard, and the exact CI context documentation.

1. the recovery account-existence timing branch on the public request path;
2. an exchanged recovery context that lived only in a React ref and died on
   refresh or tab remount;
3. the expired-lease concurrent password-write race (a 45-second lease with an
   unfenced, unbounded provider operation);
4. a boundary that named WHICH modules may hold password primitives but not
   WHAT those modules may do — an approved wrapper could gain a `password`
   field and stay green — plus password policy enforced only in callers;
5. delivery webhooks that dropped signature-verified evidence when the event
   raced the outbox's provider-acceptance commit, and a Resend acceptance
   without a message id becoming a terminal untrackable state;
6. no retention or scrubbing for recovery/audit state; and
7. database/concurrency proofs that only passed on a clean database.

Explicitly out of scope were deployment, merge, live GitHub settings, provider
dashboard changes, production migrations or queries, credential rotation, CDN
purge, a controlled real send, and unrelated legacy RLS/advisor debt. No new
minor-data table was introduced; the private recovery state contains encrypted
envelopes or one-way fingerprints, and the grant ledger contains no user id.

## 3. Finding disposition and design

### 3.1 The timing branch is gone: candidates, not accounts (finding 1)

The public request path no longer performs ANY account-dependent work:

- `fingerprintRecoveryCandidate` (lib/auth/recovery-crypto.ts) computes a keyed,
  domain-separated HMAC of the normalized address. The route hands the database
  only that fingerprint, the IP fingerprint, and the AES-256-GCM envelope —
  never the address, and there is no profile lookup anywhere on the path.
- `enqueue_password_recovery` now keys the IP budget, the advisory lock, the
  durable cooldown, and the enqueue on the **candidate fingerprint**. Known and
  unknown candidates perform structurally identical work because the transaction
  cannot distinguish them: nothing in it reads `profiles`.
- Account existence is resolved asynchronously by the outbox worker via
  `resolve_password_recovery_outbox` — ONE canonical, case-insensitive,
  whitespace-normalized SQL comparison, replacing the worker's previous exact
  `profiles.email` equality. Unknown candidates are terminally `discarded`,
  scrubbed, and never mailed; targeted audit rows exist only after a real
  account is resolved.
- The bounded response floor on the public route remains, as defense in depth
  rather than as the mechanism.

The real-Postgres proof (§5) enqueues a known and an unknown candidate
concurrently (both return `queued`), holds one candidate's advisory lock while
a different candidate completes without waiting, and drives the canonical
resolution against a deliberately mixed-case, whitespace-padded profile email.

### 3.2 The recovery context survives refresh (finding 2)

The grant no longer travels in any response body and no page script ever holds
it. `/api/auth/recovery/exchange` stores it in an **HttpOnly, SameSite=Strict
cookie whose `Path` is `/api/auth/recovery`** (lib/auth/recovery-cookie.ts), so
the browser presents it to the four recovery endpoints and to nothing else:

- `exchange` — consumes the e-mailed proof server-side, mints the grant, sets
  the cookie with `Max-Age` equal to the grant TTL;
- `context` — a read-only peek (`peek_recovery_attempt_grant`) that lets a
  refreshed or remounted tab re-open the form WITHOUT consuming an attempt;
- `complete` — reads the grant from the cookie alone; it reads no
  `Authorization` header and no body identity of any kind, and clears the
  cookie on every terminal outcome;
- `invalidate` — explicit abandonment: closes the durable grant and clears the
  cookie; idempotent.

The cookie carries no ordinary session authority — its value is the
purpose-bound grant, useless to any other endpoint, unable to become a session,
and a session token placed in it fails grant verification by shape. Substitution
across accounts/ceremonies moves the substituted grant's OWN claims; the
ceremony acts on the account inside the grant, never on caller input.

**The unavoidable external boundary, stated honestly:** the one-time proof is
burned at the provider before the grant can be stored, and the two systems share
no transaction. If the grant store then fails, the exchange answers 503 with a
message that says to request a NEW link — it does not claim the failure is
retryable, because nothing can un-burn the proof. This is
`EXCHANGE_STORE_FAILED_MESSAGE` in `pages/api/auth/recovery/exchange.ts`, and
the storage-failure test pins it.

The mandatory e2e reloads the page after the exchange and proves the form
reopens from the bare URL with nothing but the cookie. Unit suites cover tab
remount, cookie expiry, clearing on success/exhaustion/invalidation, tampering,
ordinary-session substitution, and exchange storage failure.

### 3.3 Exactly one password can become authoritative (finding 3)

The recovery writer now fences the provider mutation inside its owned lease:

- `RECOVERY_PROVIDER_BUDGET_MS` (30 s) is strictly inside the 45 s lease.
- Before contacting the provider, an elapsed deadline refuses with
  `PROVIDER_NOT_ATTEMPTED` — provably safe to retry, no request was issued.
- A provider call that has not resolved by the deadline is declared
  **ambiguous while the lease is still owned**: the writer calls
  `interrupt_recovery_attempt_grant`, which terminally closes the grant under
  the lease token. A second submission — same or different password — can no
  longer claim an attempt, so it can neither reach the provider nor race the
  possibly-in-flight first mutation. The user-facing message honestly says the
  password MAY have changed and to test it.
- A RESOLVED failure (SDK error, 422/5xx, finished transport) still releases
  the lease for a bounded retry; the metadata marker written atomically with
  the password arbitrates the provider-committed/response-lost case on the next
  claim, exactly as the fourth pass shipped it.

The delayed-writer test advances a fake provider beyond lease expiry and proves
the grant is `interrupted`, the late resolution is discarded, no
success/flag-clearing step runs after the deadline, and a competing writer with
a second password obtains nothing. pgTAP proves `interrupt` requires the owned
lease token and that an interrupted grant refuses every later claim.

### 3.4 The contents of approved modules are enforced (finding 4)

`APPROVED_MODULE_CONTRACTS` (scripts/ci/check-browser-boundaries.mjs) pins, per
approved module, WHAT its primitives may look like — not another filename list:

- inside an approved module a raw primitive may appear only as a direct call
  (aliasing/destructuring/handle-taking is refused);
- its attributes argument must be an inline object literal — variables, call
  results, spreads, computed keys, accessors and methods are refused;
- the literal may carry ONLY the pinned keys: `password`+`user_metadata` for
  the private completion writer; `email`+`user_metadata` for maintenance;
  `email`/`password`/`email_confirm`/`user_metadata`/`app_metadata` for
  creation — so a `password` added to `updateAuthUserEmail` or
  `clearAdministrativeResetMarker`, or any arbitrary attribute, fails CI
  structurally;
- `requiredCallees` enforces structure that MUST exist: account creation and
  the private writer must call `firstPasswordPolicyError`, so deleting the
  policy is a guard failure, not a review catch.

`__tests__/security/approved-module-contracts.test.ts` feeds the checker
**in-memory mutated copies of the real module source** (via the exported
`scanSource`, which `scanFile` itself wraps): password added to each
maintenance operation, arbitrary attributes, spreads, detached payloads,
computed keys, primitive aliases, a `createUser` appearing in a module whose
purpose excludes it, and the policy call deleted from creation and from the
writer. Each mutation asserts it really changed the source before asserting
the guard refuses it.

`provisionAuthAccount` now enforces the shared password policy at the boundary
itself, returning a provider-shaped `weak_password` refusal, so every caller —
present and future — inherits it; caller-side checks remain only as earlier UX.

### 3.5 Delivery evidence survives ordering races (finding 5)

`auth_security.password_recovery_delivery_events` persists every
signature-verified delivered/bounced event, keyed by provider message id and
outcome (idempotent by provider event identity; no recipient, subject, body, or
URL is stored):

- **event before acceptance**: the event is stored `pending`; when
  `finish_password_recovery_outbox` later commits provider acceptance it
  reconciles the pending evidence **in the same transaction** and applies the
  transition;
- **acceptance before event**: the webhook matches the outbox row directly, as
  before, and the applied event is recorded so a duplicate is a no-op;
- precedence is unchanged: bounce may supersede accepted/delivered; delivered
  may not overwrite bounced;
- a database failure returns HTTP 500 to Svix so the provider retries — a
  webhook that could not be persisted is never acknowledged;
- a Resend acceptance **without a usable message id is no longer terminal**:
  the worker logs it, releases the row for a bounded retry under the SAME
  idempotency key (the provider returns the original message id instead of
  sending twice), and writes a `failure` audit row naming the state;
- unmatched pending events have bounded retention (§3.6).

Tests cover webhook-before-finish, finish failure followed by webhook,
duplicates, bounce-after-delivery, unrelated provider messages, and missing
provider ids — in Vitest against the route/worker and in pgTAP against the SQL.

### 3.6 Retention and scrubbing exist (finding 6)

`run_auth_security_retention` + `/api/cron/auth-retention` (Vercel cron,
`30 3 * * *`, `CRON_SECRET`-authorized) implement the retention table now
normative in `docs/runbooks/auth-security.md` §7: envelopes scrubbed at
terminal transition (with a sweep-side belt), terminal outbox rows deleted at
30 days, closed grants at 7 days (stuck-active at TTL+1 day), IP buckets at
1 day, applied webhook evidence at 7 days / unmatched at 30, and
`security_audit_events` at the documented compliance period of **730 days**.
Every delete is `LIMIT`-bounded (5,000/table/run), each predicate has a partial
index, the function returns per-table counts, and nothing on the public request
path deletes anything. The SQL refuses out-of-range bounds.

### 3.7 The proofs pass on a dirty database (finding 7)

`scripts/ci/recovery-concurrency-proof.mjs` and pgTAP suite 054 scope every
count and assertion to their own synthetic candidate fingerprints, grant
hashes, and fixture accounts; outbox claims pass a candidate scope to
`claim_password_recovery_outbox`. The proof additionally **seeds an unrelated
queued recovery job itself** and asserts it is never claimed or mutated. The
exactly-once assertions were not weakened, and nothing truncates or resets
developer data. §5 shows both commands passing twice without a reset and again
with an unrelated synthetic job queued.

### 3.8 A defect found during this pass, fixed in the same commit

`ALWAYS_ALLOWED_EXACT` (lib/auth/forced-password-change.ts) still named the
REMOVED `/api/auth/recovery-complete` route. Because the middleware gates every
`/api/:path*` for flagged sessions, a flagged user completing recovery in a tab
that still held their old session would have been gated out of the new ceremony
— exactly the population the exemption exists for. The list now names the four
`/api/auth/recovery/*` endpoints; the middleware predicate tests were extended
to all four.

## 4. Files changed, grouped by risk

The authoritative complete inventory is:

```bash
git diff --name-status 4399949942bfcf49dfa8de40cbf7edbf40f0490e..fix/auth-sec2
```

Risk grouping for all 149 branch files — the fifth pass touched these:

### Critical — schema, RLS, durable state, and server trust boundaries

- `supabase/migrations/20260819120300_recovery_security_ceremonies.sql`
  (candidate fingerprints, delivery-evidence ledger, resolve/interrupt/
  invalidate/peek/retention functions — this migration was never applied
  anywhere, so it was amended in place rather than stacked);
- `lib/auth/{recovery-crypto,recovery-request-queue,recovery-grant,password-completion,account-provisioning,recovery-cookie,forced-password-change}.ts`;
- `pages/api/auth/recovery/{exchange,complete,context,invalidate}.ts`
  (replacing the deleted `recovery-exchange.ts`/`recovery-complete.ts`);
- `pages/api/cron/auth-retention.ts`, `pages/api/webhooks/resend.ts`,
  `vercel.json`.

### High — browser behavior and CI controls

- `pages/reset-password.tsx` (no grant in page JavaScript; context probe on
  bare visits; explicit invalidation on abandonment);
- `scripts/ci/check-browser-boundaries.mjs` (approved-module contracts,
  `scanSource` seam);
- `scripts/ci/recovery-concurrency-proof.mjs` (scoped, dirty-database, anti-
  enumeration shapes).

### Verification

- `__tests__/api/auth/recovery/*` (four endpoint suites),
  `__tests__/api/cron/auth-retention.test.ts`,
  `__tests__/lib/auth/{account-provisioning,password-completion,recovery-grant,recovery-request-queue}.test.ts`,
  `__tests__/security/approved-module-contracts.test.ts` and the updated
  security/middleware/webhook/component suites;
- `supabase/tests/054-recovery-security-ceremonies.sql` (now 125 assertions);
- `tests/e2e/auth-lifecycle.spec.ts` (refresh-survival of the exchanged
  context).

### Documentation

- `docs/runbooks/auth-security.md` (§7 retention, cookie ceremony, updated
  verification SQL and checklist), `docs/ci-setup.md`, this review request,
  and `PROJECT_STATE.md`.

Everything else in the 149 is unchanged since the fourth pass.

## 5. Final command evidence

All commands ran from `/Users/brentcurtis/dev/fne-lms` on 2026-08-19, on the
implementation head. The database/concurrency evidence was captured in the
exact sequence listed — the double runs share one database state and were NOT
separated by a reset.

| Command | Exit | Exact result |
| --- | ---: | --- |
| `npm run type-check` | 0 | clean |
| `npm run lint` | 0 | clean, zero warnings |
| `npm test` | 0 | **343 files; 7,913 passed, 11 skipped, 0 failed; 7,924 total** |
| local-env `npm run build` | 0 | Next 14.2.35; compiled; **149 static pages**; all four `/api/auth/recovery/*` routes and `/api/cron/auth-retention` present |
| `npm run guard:migrations` | 0 | **23 migrations** scanned; no RLS disable or destructive statement |
| `npm run guard:browser` | 0 | **1,133 files; 682 browser modules; 513 entrypoints** |
| `npm run test:db` (run 1, after clean reset) | 0 | **16 files; 886 tests; 0 failed** |
| `npm run test:db` (run 2, **no reset**) | 0 | 16 files; 886 tests; 0 failed |
| `npm run test:recovery-concurrency` (runs 1 and 2, **no reset between**) | 0 | one durable job for two racing instances/IPs; known+unknown candidates both `queued`; held candidate lock delays only its own candidate; canonical resolution resolves the mixed-case profile and discards the unknown; one outbox claim; one grant lease |
| seed one unrelated synthetic queued recovery job, then `npm run test:db` (run 3) | 0 | 16 files; 886 tests; 0 failed |
| `npm run test:recovery-concurrency` (run 3, unrelated job queued) | 0 | all assertions again; the bystander job finished the sequence still `queued`, 0 attempts, no lease |
| `npm run test:queue` | 0 | **40/40 exactly once** across two workers (20/20), all done |
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
`zoom-managed-join`, and `zoom-mock-mode`. The run used a production build and
production server (`CI=1`), the ephemeral local Supabase stack, synthetic
identities, and `RESEND_API_KEY`/`RESEND_WEBHOOK_SECRET` explicitly empty. It
proved request → durable outbox → cron worker → captured application message →
proof exchange → cookie-held bounded grant **surviving a page reload** →
password change. It did **not** contact Resend and is not evidence of provider
acceptance or delivery.

The 11 Vitest skips are the pre-existing, explicitly parked `[Z3b, PARKED]`
tests. pgTAP and mandatory Playwright had no skips or failures.

## 6. Areas the reviewer should scrutinize hardest

1. **Structural equivalence of the public request.** Read
   `enqueue_password_recovery` end to end and try to find ANY expression whose
   cost or lock behavior depends on account existence. Also judge the residual
   channel: per-candidate advisory locks serialize only the same candidate —
   confirm cross-candidate probing really learns nothing.
2. **The cookie ceremony.** `Path`-scoping vs. Next's route layout,
   `isSecureRequest`'s `x-forwarded-proto` trust (who controls that header on
   Vercel vs. locally), fixation (attacker sets a victim's browser cookie to
   the attacker's grant before the victim resets), and whether `context`'s
   read-only peek can be abused as an oracle.
3. **The ambiguity fence.** `raceProviderDeadline` abandons the losing promise:
   confirm a LATE provider success cannot run any post-mutation step (flag
   clear, success audit, marker-dependent logic) in the abandoned continuation,
   and that `interrupt` under a still-owned lease cannot race
   `finishRecoveryGrantAttempt` from the same request.
4. **Contract-guard fidelity.** `scanSource` is exported for the mutation
   suite; confirm `scanFile` and `scanSource` cannot diverge, that
   `requiredCallees` (module-level, not per-function) cannot be satisfied by a
   policy call in dead code, and that the contract table cannot be widened
   without `approved-module-contracts.test.ts` noticing.
5. **Delivery-evidence reconciliation.** The pending-event reconcile happens
   inside `finish_password_recovery_outbox`: check transactional atomicity,
   idempotency-key reuse after a worker outage longer than Resend's window,
   and whether a pending `bounced` reconciles with correct precedence.
6. **Retention windows vs. evidence.** A webhook arriving after the 30-day
   outbox deletion has nothing to match — confirm the pending ledger's own
   30-day bound makes this loss explicit and acceptable, and that no retention
   path can delete a row another transaction is mid-flight on.

## 7. Known limitations and pending actions

- **PENDING EXTERNAL:** independent review; live `main` branch-protection
  verification for the seven exact contexts (`docs/ci-setup.md`).
- **PENDING PRODUCTION:** apply the five migrations in order and perform the
  runbook's read-only checks (§2), now including the fourteen-function privilege
  matrix. Until then none of the new database controls exists in production,
  and the retention sweep runs nowhere.
- **PENDING PROVIDER/VERCEL:** canonical origin, `RESEND_API_KEY`,
  `EMAIL_FROM_ADDRESS`, `RESEND_WEBHOOK_SECRET`, the delivered/bounced webhook
  subscription, and `CRON_SECRET` for the new retention cron.
- **PENDING LIVE EVIDENCE:** one controlled synthetic send with separately
  recorded outbox commit, provider acceptance, and verified delivery/bounce.
- **PENDING INCIDENT OPERATIONS:** rotate the exposed administrator credential,
  invalidate sessions, decide CDN purge/history cleanup, verify removed routes.
- The exchange boundary is irreducible: a proof burned at the provider followed
  by a grant-store failure costs the user one link, honestly reported. No
  design without a cross-system transaction can do better.
- `RECOVERY_PROVIDER_BUDGET_MS` (30 s) is a judgment call: long enough for a
  slow provider round trip, strictly inside the 45 s lease. An operator who
  changes either must preserve `budget < lease`.
- Resend idempotency is provider-window bounded; a worker outage longer than
  that window after an accepted-but-unacknowledged call still deserves
  scrutiny (unchanged from the fourth pass, now with the no-id acceptance
  retried under the same key).
- The process-local endpoint limiters remain defense-in-depth only.
- The broader pre-existing auth/RLS/advisor debt in `PROJECT_STATE.md` remains
  out of scope.

## 8. Questions for the independent reviewer

1. Is there any observable difference — timing, locking, error shape, audit
   row, retry behavior — between a known and an unknown candidate on the public
   path, including under concurrency with a held candidate lock?
2. Can any sequence — refresh, remount, expiry, tampering, substitution,
   fixation, storage failure — leave a browser able to complete a password
   change without a grant its own exchange minted, or unable to complete one
   the design says should survive?
3. Can two different passwords both reach the provider under one grant, in any
   interleaving of lease expiry, provider latency, and resubmission?
4. Does the approved-module contract have a syntactic or resolution bypass the
   mutation suite does not represent — including satisfying `requiredCallees`
   vacuously?
5. Do the delivery-evidence ledger and its retention bounds record provider
   truth faithfully across every ordering, duplication, and outage case, with
   no recovery material stored?
6. Are the retention periods, batch bounds, and indexes operationally sound for
   the fifth migration's tables at this platform's scale?
