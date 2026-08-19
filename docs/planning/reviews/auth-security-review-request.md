# Review request — authentication security remediation, second pass (S1–S14, F1–F6)

> **This is not a numbered phase.** `PROJECT_STATE.md` records *Fase en curso:
> NINGUNA*, and this work appears nowhere in
> `docs/planning/GENERA-itinerario-construccion.md`. Like `Z1a` (`fix/sess-leak`)
> and `Z0B` (`feat/zoom-spike`) it is out-of-itinerary remediation, so there is
> deliberately **no `fase-<N>-review-request.md`** — inventing a phase number
> would put a fiction into the ledger. The reviewer protocol
> (`docs/planning/review-protocol.md`) otherwise applies unchanged.
>
> **This is the SECOND pass.** The first (`fix/auth-sec`, head `cc9d3aaf`) was
> rejected. Six findings came back, F1–F6 below; §3 answers each one, and §9 is
> honest about what is still not closed. `fix/auth-sec` is untouched and
> `backup/auth-sec` pins its reviewed tip.

---

## 1. Branch and base

| | |
| --- | --- |
| Branch | `fix/auth-sec2` |
| Base SHA | `4399949942bfcf49dfa8de40cbf7edbf40f0490e` — **`main`**, exactly |
| Head SHA | `git rev-parse fix/auth-sec2` — a document cannot name the commit that contains it, so the tip is not quoted here (the convention `PROJECT_STATE.md` uses) |
| Commits | 10: one port, six fixes, one e2e, two documentation |
| Diff | 86 files, +15167 / −3361 |

### Commits

```
115801ec  fix(auth): port the authentication remediation onto a clean base
8373c22d  fix(auth): make the forced-password-change flag a database boundary (F1)
3e48581e  fix(auth): recovery proof must survive the link we actually send (F2)
60b88f21  fix(auth): password completion belongs to the server (F3)
e9a9f9b4  fix(audit): the browser cannot write the meeting-deletion audit row (F4)
ac2696a0  fix(auth): make the invitation-resend cooldown atomic (F5)
b40d6d89  test(e2e): open the link that was actually sent, and prove the database gate
9308cadc  docs(auth): make the operations runbook exact about what is not done (F6)
c9fb544d  fix(auth): two defects the extended e2e lifecycle found on its first real run
<this commit>  docs(auth): review request and state update
```

### 1.1 Branch-hygiene proof

The rejected branch was cut from `process/lean-pilot`, and its commit `6795d7ca`
used `git add -A`, so an authentication commit also carried five pre-existing
working-tree modifications and three untracked B3 evidence files.

This branch is cut from `main` and the contaminated paths are **absent**:

```
$ git merge-base main fix/auth-sec2
4399949942bfcf49dfa8de40cbf7edbf40f0490e          # == main

$ git merge-base --is-ancestor main fix/auth-sec2 && echo "descends from main"
descends from main

$ git diff --name-only main...fix/auth-sec2 -- \
    docs/plan/LEDGER.md docs/plan/zoom/LEDGER.md docs/plan/SOP-PILOT.md \
    docs/plan/evidence/b3 package.json package-lock.json
(no output)
```

**Expected result: none. Actual result: none.** No dependency change was needed,
so `package.json` and `package-lock.json` are untouched — in particular the
`canvas` optional dependency the rejected branch removed is still declared.

`PROJECT_STATE.md` carries only the authentication section (§8 of that file's
*Deudas*), rewritten for this branch. The unrelated INSPIRA/B3 reconciliation
edit the rejected branch swept in is **not** here; it stays on `fix/auth-sec`
for whoever owns it.

The port commit `115801ec` is byte-identical to `fix/auth-sec` for all 63
authentication files; `git diff fix/auth-sec` at that commit reported exactly the
nine contaminated paths and nothing else. Everything after it is new work.

**Nothing was rewritten or destroyed.** `fix/auth-sec` still exists at
`cc9d3aaf`, and `backup/auth-sec` is a second ref pinned to the same commit.

---

## 2. Objective and scope

**Objective.** Make the authentication lifecycle — registration → approval →
invitation → first password → login → voluntary change → administrative reset →
forced change → self-service recovery — enforced at the server and database
boundary rather than in React pages and Next middleware, and covered by tests
that would fail if any link broke again.

**In scope.** F1–F6 as dispatched, on top of the S1–S14 work the port carries.

**Out of scope, deliberately** (unchanged from the first pass, and all of it
reported rather than silently skipped):

- Enabling RLS on the 22 legacy allowlisted tables; `public.modules`, which has
  three policies and RLS off; the 9 `SECURITY DEFINER` views and 178
  `SECURITY DEFINER` functions callable by `anon`/`authenticated`.
- The remaining diagnostic pages beyond the seven removed (`/test`, `/test-rbac`,
  `/test-logout`, `/test-sentry`, `/test-user-role`, `/test-sidebar-role`,
  `/test-toast`, `/debug-feedback-permissions`, `pages/api/debug/*`,
  `pages/api/test/*`). None carries a credential or a privileged action; all are
  still routable.
- Any production mutation, deployment, credential rotation, e-mail send or
  history rewrite. See §6.

---

## 3. Finding-by-finding disposition

### F1 — HIGH: forced password change is now a system boundary

**The defect.** `must_change_password` was enforced in exactly one place,
`middleware.ts`. Two consequences, both reachable from an ordinary browser with a
valid session: the baseline policy *"Allow users to update their own profile"* is
`FOR UPDATE` over the **whole row**, so the account the flag restrains could clear
it with one `PATCH /rest/v1/profiles`; and Next middleware is only on the path of
requests to the Next server, so `<project>.supabase.co/rest/v1/*` bypassed it
entirely. The first pass wrote that second one down as an accepted limitation.

**The implementation** (`supabase/migrations/20260819120000_...`, additive):

| Piece | What it does |
| ----- | ------------ |
| `protect_must_change_password` — `BEFORE UPDATE` trigger on `public.profiles` | Refuses any change to the flag when `current_user` is `authenticated` or `anon`. Every other column keeps exactly the permissions it had. A whole-row write that leaves the flag unchanged is allowed, so ordinary profile upserts keep working. |
| `gate_password_change()` on `pgrst.db_pre_request` | PostgREST calls it before **every** request. Raises 42501 → HTTP 403 for any request made as `authenticated` by a flagged account. One control covers every table, view and RPC, present and future. |
| `current_password_change_state()` | The single allowance. Takes **no argument**, reads `auth.uid()`, returns a boolean. The middleware must be able to ask whether the flag is set, and the flagged account's own `profiles` read is exactly what the gate refuses. |
| `set_password_change_required(uuid, boolean)` | The trusted write path. `service_role` only. Returns whether a row was actually updated. |

**Why it covers all nine roles without a per-role list:** the gate keys on the
flag, not the role. There is nothing to forget to update when a role is added.

**One subtlety worth your attention.** The gate's role test is
`request.jwt.claims ->> 'role'`, **not** `current_user`. The function is
`SECURITY DEFINER`, so inside it `current_user` is the owner (`postgres`) and a
gate written the obvious way silently never fires. That is exactly the failure
mode it exists to prevent, and it is what the pgTAP suite caught — which is why
the suite asserts refusals per role rather than only asserting the function
exists. The claim role is set by PostgREST from the verified token and is the
same claim it used to choose the role to switch to, so trusting it is no weaker
than trusting the switch.

**Not stranding anyone.** Everything a flagged account needs in order to finish —
GoTrue's `/auth/v1/*` and this application's service-role endpoints — is outside
PostgREST. No profile row means not flagged (a successful query is authoritative;
the Z1a rule, and the same rule `verdictFromProfile` applies). A stuck flag is
cleared with one `set_password_change_required()` call, documented in runbook §2.

**Consequential code changes:** `middleware.ts` and `pages/login.tsx` read the
flag through the RPC; `/change-password` reads its state from the new
`/api/auth/password-change-state` (service-role) rather than from a browser
`profiles` SELECT and `user_metadata`, the latter being a cookie the caller owns.

**Tests.** `supabase/tests/051-...` — 70 assertions: nine roles × {flagged, clear}
for the gate, nine roles for the protected column plus an ordinary-edit control
each, both write directions, admin included, the trusted paths, the wiring read
back out of `pg_db_role_setting`, the allowance and three of its edges (a
different RPC, a table path, a missing path), anon/service_role/no-sub/malformed
claims, and the pair that makes the claim meaningful — *RLS alone WOULD hand the
flagged account its own row, and the gate is what stops the request carrying it*.
`__tests__/middleware.forced-password-change.test.ts` — 158, including that the
middleware never calls `.from('profiles')` and that the RPC name in TypeScript
matches the one the migration creates **and** allow-lists. The e2e drives a
flagged token against `/rest/v1/*` with no browser and no middleware.

---

### F2 — HIGH: recovery proof, and the link we actually send

**The defects, all four.**

1. The legacy fragment branch never signed out and never verified. Its admission
   ticket was that the fragment *contained* `type=recovery` and `access_token`;
   it then polled `getSession()`, which for a signed-in visitor answers with
   their own live session. `#access_token=x&type=recovery` typed into the address
   bar opened the form. Supabase compounds it: failed implicit processing leaves
   the pre-existing session in place.
2. `signOut()`'s return was ignored — supabase-js reports failure as `{ error }`,
   so the `try/catch` caught nothing.
3. The singleton client's `detectSessionInUrl` raced the page for the fragment.
4. The e2e opened a hand-built `?token_hash=…` URL while the product e-mailed the
   provider's `action_link` — a different format.

**The implementation.**

- `detectSessionInUrl: false` on the shared browser client
  (`lib/supabase-wrapper.ts`). Nothing else consumes the URL, so the race is
  removed rather than narrowed. There is no `signInWithOAuth` anywhere in the
  codebase, and a guard test fails if one appears.
- `/reset-password` reads the URL during the **first render** via a lazy state
  initialiser — before any effect of any component.
- **Every** branch signs out first with `scope: 'local'` and checks the returned
  `{ error }`; the thrown case is handled too.
- **Every** branch then verifies with `getUser(accessToken)` — a round trip to
  the auth server. `getSession()` is consulted nowhere on the page, on any path.
- The legacy fragment requires `access_token` **and** `refresh_token` **and**
  `type=recovery`, is established with an explicit `setSession()` whose error is
  checked, and is verified like the others. An incomplete fragment is a hard
  refusal, not a fall-through. A non-recovery `type` is refused without calling
  `verifyOtp`.
- `lib/auth/recovery-link.ts` builds
  `{origin}/reset-password?token_hash={hashed_token}&type=recovery` from
  `generateLink().properties.hashed_token`, and both `grant.ts` and
  `resend-invite.ts` use it. The provider's `action_link` is not sent any more,
  so the landing shape no longer depends on a dashboard setting.
- `lib/email/outbox.ts` records outbound messages when `E2E_MAIL_OUTBOX` names a
  file, so the e2e can open the exact URL from the message body. It refuses to
  capture on any Vercel deployment whatever the variable says.

**Opening another account's link while signed in** now operates only on the
verified owner: the visitor's session is signed out before consumption, and the
bearer token the submit carries is the one the link produced.

**Tests.** `__tests__/components/ResetPasswordPage.recoveryProof.test.tsx` — 37,
written from the attacker's side (forged fragment, incomplete fragment, failed /
expired / reused link, wrong type, both sign-out failure shapes, another
account's link, Strict-Mode double-invoke, and that `getSession` is called
**zero** times on every path). Plus 8 on the link format, 7 on the outbox
refusals, 5 pinning the `detectSessionInUrl` decision.

---

### F3 — HIGH: password completion belongs to the server

**The defects.** `/reset-password` called `auth.updateUser({password})` in the
browser, cleared the flag with a browser PATCH, and reported success whether or
not that write landed — with no server-side policy check and no audit row, for
the single most security-relevant event an account has.
`/change-password` did the same and reached the audited endpoint only on a 422
that this project's configuration never produces, so the ordinary forced change
emitted no `password_change_forced` at all.

**The implementation.** `lib/auth/password-completion.ts` is the one place a
password is written. Every caller arrives with a **proved** identity and it never
takes a user id from a body. Order is password → flag → audit (the reverse would
release the account from the gate while it still holds the issued credential).

| Endpoint | Identity | Flag | Audit |
| -------- | -------- | ---- | ----- |
| `POST /api/auth/recovery-complete` (new) | `auth.getUser(bearer)` — a GoTrue round trip on the token the verified recovery material produced | cleared via RPC | `password_change_recovery` (new typed action, added to the TS union **and** the migration CHECK) |
| `POST /api/auth/force-password-change` | `auth.getUser()` (was `getSession()`) | cleared via RPC | `password_change_forced`, now on the only path |
| `POST /api/auth/change-password` | `auth.getUser()`; still requires the current password | **not** cleared — a voluntary change must not release a held account | `password_change_voluntary` |

Partial failure is reported: `ok:false`, `passwordChanged:true`, HTTP 500,
`FLAG_NOT_CLEARED`. Provider errors are mapped to our own es-CL sentences and
logged, never returned — GoTrue distinguishes "in a breach corpus" from "too
short", and a response should not confirm either about the password just typed.

**Provider-level rules.** The application policy is enforced server-side; GoTrue's
own minimum length and (when enabled) leaked-password check sit on top and their
refusals are surfaced as one message. Aligning the dashboard settings is runbook
§4.1–§4.2, and both are recorded as NOT DONE.

**Tests.** 24 on the shared module, 19 on recovery-complete, 15 on forced
completion, 9 on the page — covering weak passwords rejected server-side,
another user's id being ignored, `password_change_forced` always emitted,
the flag cleared, a flag-clear failure not returning success, retry-after-partial
reaching success, and nothing sensitive in responses or metadata. Plus a
source-level guard that walks every browser file and fails if one calls
`auth.updateUser({password})`, writes `must_change_password`, or touches the
audit table.

---

### F4 — MEDIUM: the browser audit writer

**The defect.** `utils/meetingDeletion.ts` called `recordSecurityAudit` with a
browser client. `security_audit_events` grants `authenticated` SELECT only, so
the insert failed with 42501 every time; `recordSecurityAudit` does not throw, so
the deletion reported success. `meeting_deleted` had never been written.

**The implementation.** The operation moved, not the privilege — an audit row a
browser can write is an audit row a browser can forge. `POST /api/meetings/delete`
authenticates with `auth.getUser()` (the old function took `userId` as an
argument and put it straight into the metadata), re-checks authorization
server-side, deletes on a **user-scoped** client so every RLS policy still
governs it, and writes the row with a service-role client after the outcome is
known. A refused attempt is audited as `denied`. `delete({count:'exact'})` keeps
"RLS refused" distinguishable from "done".

**Tests.** 17: success, each failure code, authorization refusal and its audit
row, the actor coming from the auth server rather than the body, the deletion
running on the user-scoped client, and the meeting title never reaching the trail.

---

### F5 — MEDIUM: the resend cooldown is atomic

**The defect.** Read ledger → insert reservation → send, with nothing holding a
lock. Two requests for one recipient both read "no recent resend" and both sent.

**The implementation.** `claim_invitation_resend()` takes a transaction-scoped
advisory lock keyed on the target id, then checks and reserves inside it. A
partial unique index cannot express a moving window; a serializable transaction
would push a retry onto the caller. Different recipients hash to different keys
and never block each other. The reservation is still written **before** the send
and still as `failure`, so a failed provider attempt consumes the cooldown.
`service_role` only. Fail-closed is widened: an errored claim, a missing claim,
or an unrecognised shape is a 503 with nothing sent.

**Tests.** 23 pgTAP assertions, including reading the advisory lock back out of
`pg_locks`. Plus a Vitest pair that drives **two concurrent handler invocations
against one shared ledger** — with a **negative control** that runs the same pair
against a read-then-insert claim and asserts both get through, so the suite
demonstrably distinguishes the fix from the defect.

---

### F6 — the operational contract

`docs/runbooks/auth-security.md` gains a §0 that separates the columns
explicitly, one row per item, using the words the brief asked for: code complete;
migrations **PENDING**; production e-mail variables **UNVERIFIED**; controlled
send **NOT RUN**; SMTP/templates/redirect allowlist **NOT VERIFIED**;
leaked-password protection **STILL OFF**; OTP expiry **STILL** over an hour;
credential rotation and session invalidation **STILL URGENT**; CDN purge and
history rewrite still external decisions.

Corrections of substance: §3.1a documents **all four** origin names
`lib/utils/app-url.ts` accepts, in precedence order — `NEXT_PUBLIC_BASE_URL`,
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, then
`VERCEL_PROJECT_PRODUCTION_URL` — and says plainly that `NEXT_PUBLIC_APP_URL` is
intentionally supported, because an earlier helper ignoring it was the bug. §2
now lists three migrations in a required order, warns what the pre-request hook
changes at the request layer before you apply it, and explains how to unstick a
flagged account. §4.3 records that the Supabase reset-password template now
governs the self-service flow only.

---

### F-extra — a defect this pass found, which the first pass shipped

Not one of the six findings. Recording it here because it is the most
instructive thing that happened in this round.

`pages/api/admin/reset-password.ts` — the handler S2 rewrote *specifically* to
stop writing a column that does not exist — wrote

```js
.update({ must_change_password: true, updated_at: new Date().toISOString() })
```

and `public.profiles` has **no `updated_at` column**. PostgREST answers
`PGRST204 Could not find the 'updated_at' column of 'profiles' in the schema
cache`. Because S2 also made this handler **fail closed**, the result was that
**every administrative reset returned `RESET_NOT_STARTED` and changed nothing** —
the exact operation the finding was raised about, still broken, one line below
the fix.

Why nothing caught it:

- The 32-test unit suite stubs the Supabase client, so a nonexistent column is
  indistinguishable from an existing one. Its strongest assertion was
  `expect(flagUpdate).toMatchObject({ must_change_password: true })` — and
  `toMatchObject` is satisfied by a payload carrying extra keys.
- The first pass's e2e never performed an administrative reset. Its lifecycle
  stopped at "login".

What fixed it: **this pass's e2e, on its first run against a real database**,
because the lifecycle now continues through administrative reset → forced change
→ ordinary access → recovery, which is what the brief asked for.

The repair is one line, plus a test that pins the payload's **key set** rather
than its contents:

```js
for (const update of call.updates) {
  expect(Object.keys(update)).toEqual(['must_change_password']);
}
```

**What a reviewer should take from this:** stubbed-client tests cannot see schema
mismatches at all, and this repository has now shipped that class of defect three
times (`audit_logs`, `password_change_required`, `updated_at`). The e2e reaching
a real database is the only gate that sees them, which is an argument for
extending the lifecycle rather than trimming it.

---

## 4. Files by risk

### Tier 1 — read these first

| File | Why |
| ---- | --- |
| `supabase/migrations/20260819120000_forced_password_change_boundary.sql` | A pre-request hook on `authenticator` affects **every** Data API request in the project. The blast radius of a mistake here is the whole API. |
| `middleware.ts` | AGENTS.md names it the most bug-prone file in the codebase. The read moved from a table to an RPC. |
| `pages/reset-password.tsx` | Rewritten. Identity correctness for recovery. |
| `lib/auth/password-completion.ts` | Every password in the platform is written here. |
| `pages/api/auth/recovery-complete.ts` | New. Bearer-token identity. |
| `supabase/migrations/20260819120100_invitation_resend_claim.sql` | Advisory locking on a hot path. |

### Tier 2 — security-relevant

`lib/auth/forced-password-change.ts` · `lib/auth/recovery-link.ts` ·
`pages/api/auth/force-password-change.ts` · `pages/api/auth/change-password.ts` ·
`pages/api/auth/password-change-state.ts` · `pages/api/meetings/delete.ts` ·
`lib/meetings/deletion.ts` · `pages/api/admin/tractor-signups/resend-invite.ts` ·
`pages/api/admin/tractor-signups/grant.ts` · `pages/api/admin/reset-password.ts` ·
`pages/api/admin/bulk-create-users.ts` · `pages/api/admin/create-user.ts` ·
`lib/security/audit.ts` · `lib/auth/password-policy.ts` ·
`lib/auth/password-generator.ts` · `lib/email/invitations.ts` ·
`supabase/migrations/20260818120000_security_audit_events.sql`

### Tier 3 — infrastructure and mechanical

`lib/supabase-wrapper.ts` (one option, wide reach) · `lib/email/outbox.ts` ·
`playwright.config.ts` · `.gitignore` · `pages/api/admin/assign-role.ts` ·
`pages/api/admin/update-user.ts` · `pages/api/admin/update-qa-tester-status.ts` ·
`utils/meetingDeletion.ts` · `utils/passwordGenerator.ts` · `utils/bulkUserParser.ts` ·
`types/bulk.ts` · `scripts/ci/e2e-mandatory.mjs`

### Tier 4 — UI and copy

`pages/login.tsx` · `pages/change-password.tsx` · `pages/admin/tractor-signups.tsx` ·
`pages/admin/school-users.tsx` · `pages/admin/user-management.tsx` ·
`components/PasswordResetModal.tsx` · `components/admin/BulkUserImportModal.tsx`

### Deleted

`pages/{test-auth-simple,test-auth,debug-auth,debug-auth-enhanced,test-login-flow,login-helper,auth-status}.tsx`
· `lib/temporaryPasswordStore.ts` · `pages/api/admin/retrieve-import-passwords.ts`

---

## 5. Migrations, and the exact RLS/ACL consequences

Three, all additive, all forward-only, none disabling row-level security.

### 5.1 `20260818120000_security_audit_events.sql`

One table. Unchanged from the first pass except for one added value in the
`action` CHECK (`password_change_recovery`) — the migration is unapplied
anywhere, so editing it in place is correct and avoids an `ALTER … DROP
CONSTRAINT` that the DB-safety rule forbids.

| role | SELECT | INSERT | UPDATE | DELETE | TRUNCATE |
| ---- | ------ | ------ | ------ | ------ | -------- |
| `anon` | no | no | no | no | no |
| `authenticated` (admin) | YES (policy) | no | no | no | no |
| `authenticated` (other) | policy returns 0 rows | no | no | no | no |
| `service_role` | YES | YES | YES | YES | YES |

### 5.2 `20260819120000_forced_password_change_boundary.sql`

**No table, no policy, no RLS change.** What it changes is the request layer and
one column's writability.

| Object | Effect |
| ------ | ------ |
| `protect_must_change_password()` + trigger on `public.profiles` | `authenticated`/`anon` can no longer move `must_change_password`. **No RLS policy changed**, so every other column keeps the permissions it had — this narrows one column, not the row. |
| `ALTER ROLE authenticator SET pgrst.db_pre_request` | **This is the widest change in the branch.** PostgREST runs the gate before every request from every role. Non-flagged traffic is unaffected (one indexed lookup, then return). Flagged `authenticated` traffic gets 403 everywhere except the one RPC. |
| `gate_password_change()` | EXECUTE to `authenticator`, `authenticated`, `anon`, `service_role` — necessarily, since PostgREST invokes it as the request's own role. Takes no argument, discloses nothing. |
| `current_password_change_state()` | EXECUTE **revoked** from PUBLIC and `anon`; granted to `authenticated` and `service_role`. Reads `auth.uid()` only. |
| `set_password_change_required(uuid, boolean)` | EXECUTE revoked from PUBLIC/`anon`/`authenticated`; granted to `service_role` only. |

### 5.3 `20260819120100_invitation_resend_claim.sql`

| Object | Effect |
| ------ | ------ |
| `claim_invitation_resend(uuid, uuid, integer, jsonb)` | `SECURITY DEFINER`, writes `security_audit_events`. EXECUTE revoked from PUBLIC/`anon`/`authenticated`, granted to `service_role` only — so it opens no new browser path into the append-only table. |

**Privacy (Ley 21.719).** No new table, no student or minor data. The audit
table's posture and its `metadata_no_secrets` CHECK are unchanged.

**Ordering.** 20260818120000 must precede 20260819120100 (the function references
the table). 20260819120000 is independent. Runbook §2 states this.

---

## 6. Operational work — none of it performed

Runbook §0 is the authoritative ledger. Summary of the state, unchanged where the
first pass left it:

| Action | State |
| ------ | ----- |
| Rotate the exposed administrator password | **NOT DONE — still urgent** |
| Invalidate that account's sessions | **NOT DONE** |
| Purge CDN/edge caches of the removed routes | **NOT DONE** |
| Rewrite Git history to expunge the credential | **NOT DONE — needs separate explicit approval** |
| Apply the **three** migrations to production | **NOT DONE.** Until then: audit writes fail, the forced-change gate does not exist in production, the resend cooldown is not atomic |
| `RESEND_API_KEY` / `EMAIL_FROM_ADDRESS` in Vercel Production | **UNVERIFIED.** Vercel was neither queried nor modified this round |
| Confirm the canonical origin in Production | **UNVERIFIED** |
| Controlled invitation + recovery send | **NOT DONE** — no e-mail was sent by anyone at any point |
| Verify Supabase SMTP, templates, redirect allowlist | **NOT DONE** |
| Enable leaked-password protection | **NOT DONE — still off** |
| Reduce OTP/recovery expiry below one hour | **NOT DONE — still over** |
| Apply Postgres security patches | **NOT DONE** |
| RLS advisor remediation | **REPORTED, NOT FIXED** |

**Production was not read or written at all in this pass.** The advisor findings
quoted in the runbook are carried forward from the first pass and are stated as
such; nobody re-checked them.

---

## 7. Test evidence

### 7.1 Gates

| Gate | Command | Result |
| ---- | ------- | ------ |
| Type-check | `npm run type-check` | **pass**, clean |
| Lint | `npm run lint` | **pass**, zero warnings |
| Unit | `npm test` | **326 files, 7649 passed, 11 skipped** (the documented `[Z3b, PARKED]` skips), 0 failed |
| Build | `npm run build` | **pass**; middleware bundle emitted (74.7 kB) |
| pgTAP | `npm run test:db` | **14 files, 618 assertions, 1 failure — pre-existing, not from this branch.** See §7.3 |
| E2E | `npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list)` | **121/121 passed, 12 spec files, 0 skipped**, against a production build on the seeded local stack. See §7.4 |
| E2E skip guard | `node scripts/ci/e2e-mandatory.mjs --check` | `OK — 12 mandatory spec(s) ran with no skips` |
| Whitespace | `git diff --check main...HEAD` | **clean** (exit 0) |
| Migration guard | no migration contains the RLS-disable statement | **clean** — verified by scanning all 21 migration files |
| `lint:testid` (advisory) | `npm run lint:testid` | **2669 → 2635 findings (−34).** See §7.2 |

### 7.2 `lint:testid` — advisory, and it improves

Whole-repo findings drop from **2669 to 2635**. `342 → 335` files carry findings.
**No file newly carries one.** The seven that stopped are the deleted diagnostic
pages. Every file this branch touches is flat or better:

| file | main | this branch |
| ---- | ---- | ----------- |
| `components/PasswordResetModal.tsx` | 7 | 6 |
| `components/admin/BulkUserImportModal.tsx` | 19 | 14 |
| `pages/login.tsx` | 6 | 2 |
| `pages/reset-password.tsx` | 4 | 1 |
| `pages/change-password.tsx` | 5 | 5 |
| `pages/admin/{school-users,tractor-signups,user-management}.tsx` | 14 / 15 / 11 | 14 / 15 / 11 |

The 2635 remaining are the pre-existing baseline the rule was introduced against;
it is advisory until that baseline is clean.

### 7.3 The one failing pgTAP test — pre-existing, verified independently

`supabase/tests/002-zoom-internal-isolation.sql` test 8:

```
# Failed test 8: "zoom_internal holds exactly the 7 Z1b tables + zoom_zak_issuances"
#         have: 10
#         want: 8
```

Verified this pass rather than taken on trust:

- **This repository's migrations create exactly 8 tables in `zoom_internal`**
  (`zoom_hosts, zoom_jobs, zoom_meetings, zoom_recording_files, zoom_token_cache,
  zoom_transcripts, zoom_webhook_events, zoom_zak_issuances`).
- The local database holds 10. The two extras are
  `zoom_attendance_observations` and `zoom_attendance_report_batches`, created by
  `20260813120000_...` and `20260813120100_...` — which exist **only** in the
  unmerged `feat/zoom-hours` branch (`/Users/brentcurtis/dev/wt/zoom-hours`) and
  have been applied to the shared local database.
- **Nothing in this branch touches `zoom_internal`** — the only file mentioning
  it is this document.
- CI builds the database from `supabase/migrations` alone on a clean stack, where
  it passes.

It remains a real schema-drift signal (production ahead of `main`) and a decision
for the owner. Not mine, and not this branch's.

### 7.4 E2E

**121/121 passed, 12 spec files, 0 skipped**, run with `CI=1` against a
production build (`npm run build` + `npm run start`) on the seeded local Supabase
stack. `e2e-mandatory.mjs --check` on the JSON report:
`OK — 12 mandatory spec(s) ran with no skips`.

`tests/e2e/auth-lifecycle.spec.ts` is 4 tests. The stages the lifecycle test
actually exercises, in order:

| # | Stage | What is asserted |
| - | ----- | ---------------- |
| 1 | Public registration | Anonymous POST to the real `/api/registro-signup`; the signup row exists and is `pending` |
| 2 | Admin approval | Real `/api/admin/tractor-signups/grant` as the seeded admin; account created, profile `approved`, flag set, delivery reported `not_configured`, no token in the response |
| 3 | **The invitation message** | Read from the outbox the app server wrote. Subject correct; the href is this application's origin, `/reset-password`, `type=recovery`, a `token_hash` present, **not** `/auth/v1/verify`; the visible fallback URL equals the button's |
| 4 | No usable credential yet | A direct GoTrue sign-in with the not-yet-set password is refused |
| 5 | First password | A bare `/reset-password` shows the invalid screen; `#access_token=forjado&type=recovery` shows the invalid screen; **the e-mailed URL** opens the form; the URL is stripped; a weak password is refused; the strong one succeeds and the flag clears |
| 6 | Login | Through the real form, lands on `/dashboard` |
| 7 | Administrative reset | Real `/api/admin/reset-password`; returns 200, flags the account, and the temporary password is not echoed |
| 8 | **The database gate, through PostgREST** | With the flagged account's own token and **no browser and no middleware**: `GET /rest/v1/profiles` → **403** carrying `PASSWORD_CHANGE_REQUIRED`; `PATCH` of its own `must_change_password` → refused, and the flag still reads `true`; the state RPC → **200** |
| 9 | Forced change | Sign-in routes to `/change-password`; direct navigation to `/dashboard` bounces back; the form completes and the page sends the user to `/login` (the session is revoked by the password change) |
| 10 | Ordinary access | Sign in with the new password and reach an authenticated page; the same account's `GET /rest/v1/profiles` is **200** again |
| 11 | Self-service recovery | The real form request, with the anti-enumeration answer asserted; the link (see §8.5) opens the form; a third password is set |
| 12 | Login again | Through the real form, lands on `/dashboard` |
| 13 | The audit trail | `access_granted_new_user`, `password_change_recovery` (**≥2**), `password_reset_admin` and `password_change_forced` all read back out of the table; none of the four passwords and not the address appear in any metadata |

The other three tests: the resend (a second, **different** link in the outbox;
the cooldown refusing the third attempt with a retry hint; exactly two messages
sent; the second link still opening the form), the seven removed routes
answering 404 from the running server, and the forced-change gate through the
real middleware.

**Independent confirmation of F1 outside Playwright.** The same properties were
checked directly against the running stack with `fetch`, so the result does not
depend on the spec being right:

```
sign-in                -> ok
FLAGGED table read     -> 403 {"code":"42501","details":"Debes cambiar tu contraseña antes de continuar."}
FLAGGED flag write     -> 403 {"code":"42501", …}
FLAGGED probe rpc      -> 200 true
UNFLAGGED table read   -> 200
```

**Local-environment note, for reproducibility.** The shared local database
already held `security_audit_events` from an earlier form of migration
`20260818120000`, and `CREATE TABLE IF NOT EXISTS` does not update a CHECK — so
the newly added `password_change_recovery` action was rejected there until the
constraint was swapped by hand on the **local** database. CI is unaffected: it
runs `supabase db reset` and builds the schema from `supabase/migrations`, where
the file already declares the full list. The first symptom was the audit writer
failing **open and visibly** exactly as designed (`[security-audit] write
failed`, the password change still completing), which is the behaviour the
fail-open decision was written for.

### 7.5 New and changed suites

| Suite | Tests |
| ----- | ----- |
| `__tests__/middleware.forced-password-change.test.ts` | 158 (was 149) |
| `__tests__/components/ResetPasswordPage.recoveryProof.test.tsx` | 37 (rewritten, was 33) |
| `__tests__/api/admin/resend-invite.test.ts` | 35 (was 28) |
| `__tests__/lib/auth/password-completion.test.ts` | 24 (new) |
| `__tests__/api/auth/recovery-complete.test.ts` | 19 (new) |
| `__tests__/api/meetings/delete.test.ts` | 17 (new) |
| `__tests__/api/auth/force-password-change.test.ts` | 15 (new) |
| `__tests__/components/ChangePasswordPage.forcedCompletion.test.tsx` | 9 (new) |
| `__tests__/lib/auth/recovery-link.test.ts` | 8 (new) |
| `__tests__/lib/email/outbox.test.ts` | 7 (new) |
| `__tests__/lib/supabaseWrapper.detectSessionInUrl.test.ts` | 5 (new) |
| `__tests__/security/no-browser-password-mutation.test.ts` | 5 (new) |
| `supabase/tests/051-forced-password-change-boundary.sql` | 70 pgTAP (new) |
| `supabase/tests/052-invitation-resend-claim.sql` | 23 pgTAP (new) |
| `tests/e2e/auth-lifecycle.spec.ts` | 4 (was 3) |

### 7.6 Adversarial cases added, by finding

**F1** — a flagged account of each of the nine roles refused by the gate; the
same nine clearing their own flag refused by the trigger; an authenticated
**admin** refused from writing another user's flag; an unflagged user refused
from *setting* the flag; a different RPC still refused; `/profiles` still
refused; the state probe reachable; malformed claims not turning the gate into an
outage; and, through the e2e, a flagged token refused by PostgREST with no
browser in the path and the same read succeeding once cleared.

**F2** — hand-typed `#access_token=forjado&type=recovery` while signed in;
a complete-looking fragment whose `setSession` fails; a fragment that establishes
a session the auth server then rejects; `signOut` failing as `{error}` **and** as
a throw; an expired `token_hash` while signed in; a reused token that verifies
but yields no session; a wrong `type`; a bare visit with a live session; and
`getSession` asserted to be called zero times on every path.

**F3** — weak passwords at each endpoint; another user's id in the body ignored;
the flag clear failing and the response not claiming success; retry after a
partial failure reaching success; four provider-error shapes mapped without
leaking their wording; and a source walk proving no browser file writes a
password, the flag, or an audit row.

**F4** — an unauthorized caller, whose refusal is itself audited; a body-supplied
`userId` ignored; the meeting title kept out of the trail.

**F5** — two concurrent handler invocations against one shared ledger, **with a
negative control** proving read-then-insert lets both through; four unusable
claim shapes all failing closed; the advisory lock read out of `pg_locks`.

---

## 8. The five things to scrutinise hardest

1. **`ALTER ROLE authenticator SET pgrst.db_pre_request` — the blast radius.**
   This is the single widest change in the branch: a function that runs before
   **every** Data API request in the project, for every role. I believe the early
   returns make it free for non-flagged traffic (a claims parse, a role compare,
   one indexed lookup) but I have not profiled it under load, and I have not
   proven it composes with any other `db_pre_request` the project might later
   want — there is exactly one such setting per role, so a second consumer would
   have to be merged into this function rather than added alongside it. Check
   whether that constraint is acceptable.

2. **The gate's role test is a JWT claim, not `current_user`.** I reasoned that
   trusting `request.jwt.claims ->> 'role'` is no weaker than trusting the role
   switch PostgREST derived from the same claim. If that reasoning is wrong, the
   gate is bypassable by anyone who can influence the claims blob. This is the
   argument I would most like a second opinion on, and it is the one place where
   getting it wrong is silent.

3. **`detectSessionInUrl: false` on the shared client.** It closes the race, and
   it is a global change to a client every page uses. I verified no
   `signInWithOAuth` exists today and pinned that with a test — but if anyone adds
   an OAuth provider, magic-link sign-in, or a Supabase-hosted invite flow, the
   redirect will land as a URL nothing consumes and the symptom will be "login
   silently does nothing". Confirm that trade, or ask for the narrower fix
   (a per-page client).

4. **The one PostgREST allowance, and whether the path match is tight enough.**
   `request.path LIKE '%/rpc/current_password_change_state'` is a suffix match. I
   believe nothing else can end in that string, and the function is argument-free
   and self-scoped so a false allow leaks nothing — but a suffix match on an
   attacker-influenced-ish value is the kind of thing that reads fine and is
   wrong. Also worth checking: if `request.path` is ever unavailable, flagged
   users are refused *everywhere including the probe*, the middleware reads
   `unavailable`, and everyone flagged lands on the retry panel. I judged that
   acceptable because the forced change still completes; disagree if you think
   otherwise.

5. **The self-service recovery stage of the e2e is the weakest link in the
   chain.** The invitation link is genuinely the one that was e-mailed. The
   self-service one is not: CI runs `supabase start -x mailpit`, so there is no
   mailbox, and the spec rebuilds the link with the product's own helper from a
   fresh token. Same format, same code, not the same message. If you want that
   closed, it means keeping mailpit in the e2e job and reading its API — a real
   change to the CI job, which I did not make unilaterally.

---

## 9. Known limitations and deferred items

- **The self-service recovery e2e stage does not open the message Supabase
  sent.** §8.5. The invitation stage does.
- **pgTAP cannot send an HTTP request**, so 051 proves the gate function refuses
  correctly *and* that `pg_db_role_setting` names it — the two halves that make
  the control real — rather than proving PostgREST honours it. The e2e closes
  that last inch against the running stack.
- **The concurrency proof for F5 is a simulation plus a negative control**, not
  two real OS processes racing on one database. The pgTAP suite proves the lock
  is taken and keyed per target; the Vitest pair proves the handler is correct
  given an atomic claim and incorrect given a non-atomic one. A true two-process
  race against Postgres is not something this test rig can run.
- **`must_change_password` is enforced at the API layer, not per-table RLS.** The
  pre-request gate covers everything PostgREST serves, which is the whole Data
  API — but a future path that reaches Postgres *without* PostgREST (a direct
  connection, an Edge Function with the service key) is not gated. Neither exists
  today.
- **Bulk import will time out at scale.** Pre-existing and unchanged: the handler
  sleeps a second between users, so 500 users exceeds a serverless timeout.
- **`invitation_resent` writes two rows per resend** (reservation + outcome). The
  price of a fail-closed ledger on an append-only table.
- **The resend cooldown is per target, not per admin.** Safer direction; it will
  occasionally surprise someone.
- **The audit table has no retention policy.**
- **Diagnostic surface remains** beyond the seven removed routes — §2.
- **`getAppBaseUrl` throws in production when no origin is configured.** Now more
  load-bearing than before, because this branch builds the invitation URL itself.
  Runbook §3.1a.
- **No test proves mail actually leaves the building.** The outbox is a file, not
  a provider. Only runbook §3.3 can settle that.
- **The `/change-password` page still renders inside `AuthProvider` and
  `PermissionProvider`**, both of which make browser PostgREST calls that the
  gate now refuses for exactly the users on that page. Both handle the error by
  logging and falling back to empty state, so the page works — but a flagged user
  generates console noise, and a future provider that throws instead would break
  the page. Worth a follow-up.

---

## 10. Questions for the reviewer

1. Is the JWT-claim role test in `gate_password_change()` sound (§8.2)?
2. Is a single project-wide `db_pre_request` an acceptable thing for this feature
   to consume (§8.1)?
3. Is `detectSessionInUrl: false` on the shared client the right scope, or should
   it be a per-page client (§8.3)?
4. Should the e2e job stop excluding `mailpit` so the self-service recovery stage
   can read the real message (§8.5)?
5. Is the fail-closed behaviour when `request.path` is unavailable — everybody
   flagged lands on the retry panel — the trade you want (§8.4)?
