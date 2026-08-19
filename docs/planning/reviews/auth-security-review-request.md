# Review request — authentication security remediation, third pass (S1–S14, F1–F6, R1–R5)

> **This is not a numbered phase.** `PROJECT_STATE.md` records *Fase en curso:
> NINGUNA*, and this work appears nowhere in
> `docs/planning/GENERA-itinerario-construccion.md`. Like `Z1a` (`fix/sess-leak`)
> and `Z0B` (`feat/zoom-spike`) it is out-of-itinerary remediation, so there is
> deliberately **no `fase-<N>-review-request.md`** — inventing a phase number
> would put a fiction into the ledger. The reviewer protocol
> (`docs/planning/review-protocol.md`) otherwise applies unchanged.
>
> **This is the THIRD pass.** The first (`fix/auth-sec`, head `cc9d3aaf`) was
> rejected with six findings, F1–F6. The second (this branch, up to `a0b6dad3`)
> was rejected with three MAJOR findings and two supporting ones, called R1–R5
> below. §3 answers each; §9 is honest about what is still not closed.
> `fix/auth-sec` is untouched and `backup/auth-sec` pins its reviewed tip.

---

## 1. Branch and base

| | |
| --- | --- |
| Branch | `fix/auth-sec2` |
| Base SHA | `4399949942bfcf49dfa8de40cbf7edbf40f0490e` — **`main`**, exactly |
| Previously reviewed head | `a0b6dad3539eec31e9380abf6e3942f704c9a827` |
| Head SHA | `git rev-parse fix/auth-sec2` — a document cannot name the commit that contains it (the convention `PROJECT_STATE.md` uses) |
| Commits | 17 total; **6 new** since the reviewed head |
| Diff vs `main` | 113 files, +20884 / −3561 |
| Diff vs `a0b6dad3` | 54 files, +6738 / −1683 |

### The six new commits

```
131bec21  fix(db): no migration in this repository may DROP, and CI now proves it (MAJOR 3)
f9686a29  fix(auth): the forced-password boundary is a data-layer invariant now (MAJOR 2)
6f542bc3  fix(auth): recovery consumes purpose-bound proof, and the ceremony is the API (MAJOR 1)
35b96b9e  test(security): the browser boundary is an AST rule with negative controls (SUPPORTING 1)
9a7d0fe3  fix(email): "the provider accepted it" is not "it was delivered"
5d513337  test(e2e): open the link that was really sent, and drive all three services
(plus whatever commit carries the edit you are reading)
```

**Nothing was rewritten or destroyed.** `fix/auth-sec` still exists at
`cc9d3aaf`, `backup/auth-sec` is a second ref pinned to the same commit, and
every commit up to `a0b6dad3` is untouched and still an ancestor of the tip.

---

## 2. What this pass corrects in the PREVIOUS review request

The document you are replacing overstated three things. They are corrected here
rather than quietly dropped, because the reviewer found all three:

| The previous claim | The truth |
| ------------------ | --------- |
| "F1–F6 are closed" | F1's control covered **PostgREST only**. F3's trusted boundary accepted an **ordinary access token** as recovery proof. Both are reopened and answered below. |
| "The pre-request gate covers every table, view and RPC, present and future" | It covers everything **PostgREST serves**. Storage and Realtime reach the same rows without ever calling it, and this application uses both from the browser. |
| "Three migrations, all additive" | One of them executed `DROP TRIGGER IF EXISTS`. |
| "No test proves mail leaves the building" (§9) | Correct as far as it went — but the code then reported provider acceptance as `sent` and the UI said "Correo enviado correctamente." |

---

## 3. Finding-by-finding disposition

### R1 — MAJOR: recovery accepted an ordinary access token

**The defect.** `/api/auth/recovery-complete` took `Authorization: Bearer <access
token>`, called `auth.getUser(token)`, and changed that account's password.
`getUser` proves a token is valid and says whose it is. It does **not** say what
ceremony minted it — and an ordinary password login mints an indistinguishable
one. So any signed-in account could post its own access token to the recovery
endpoint and set a new password with no current password and no recovery link.
That is S12 — *"any session satisfies the recovery form"* — reopened at the API
boundary after being closed in the page.

The old unit suite could not see it. It mocked `getUser` to return a user and
never distinguished a login token from recovery material.

**The implementation.**

`lib/auth/recovery-proof.ts` is the only thing that establishes identity for a
recovery. It calls `verifyOtp({ token_hash, type: 'recovery' })` on a fresh anon
client with no persisted session:

| Property | How this call provides it |
| -------- | ------------------------- |
| Purpose-bound | The literal `'recovery'` is passed by the module and is **never** taken from the request. A magic-link or confirmation hash is refused by GoTrue; a link *declaring* another type is refused before the provider is contacted at all. |
| One-time | GoTrue burns the hash. A replay of the same string fails. |
| Expiring | On the auth server's clock, not ours. |
| Identity-bearing | The account is what GoTrue **returns**. There is no user id in the request for anything to redirect. |
| Not a session | An access token is not a `token_hash` and does not verify as one. |

`/reset-password` **verifies nothing**. There is no `verifyOtp`, no
`exchangeCodeForSession`, no `setSession`, no `getUser` and no `getSession`
anywhere on the page, on any path — asserted by
`__tests__/lib/supabaseWrapper.detectSessionInUrl.test.ts` against the source and
by counters in the component suite. The page reads the material at first render,
signs out any pre-existing session (checking the `{ error }` return), and
forwards the material. The endpoint reads no `Authorization` header and no
cookie.

**The trade this makes, stated plainly.** The material is one-time, so it cannot
be both validated on arrival and used on submit. The form now opens on the
*shape* of the link and the link is spent at submit — so an expired link reports
itself after the password is typed rather than before. That is a real UX cost and
it buys the property that nothing but the server ever touches the credential.

**Two formats are refused BY NAME, and this is deliberate:**

- an implicit `#access_token=…` fragment carries an ordinary session credential,
  and no server-side check can distinguish it from a login;
- a PKCE `?code=` can only be exchanged with a verifier held in that browser, so
  there is nothing the server could verify.

Both get a plain es-CL "solicita un enlace nuevo" rather than a fall-through.

**All four link sources now agree.** Self-service recovery used to call
`supabase.auth.resetPasswordForEmail()` from the browser — Supabase's template,
Supabase's link, landing in whatever shape a dashboard setting produced. `POST
/api/auth/recovery-request` mints the same `?token_hash=` URL with the same
helper and sends it through the same server-side mailer as the invitation. Its
answer is byte-identical on every path (unknown address, known address, provider
down, link generation failed, internal error), and it audits
`password_recovery_requested` with the delivery status **as observed**.

**Tests.** 19 on the proof module, 22 on the endpoint (written from the
attacker's side: a bearer token alone, a bearer token presented as the hash, a
session cookie, a replay, an expired hash, a malformed hash, a wrong type, a body
`userId`, a signed-in visitor opening someone else's link), 33 on the page, 20 on
the request endpoint, and the e2e opens the message that was actually sent.

---

### R2 — MAJOR: the boundary covered PostgREST only

**The defect.** `gate_password_change()` was installed on
`pgrst.db_pre_request`. PostgREST calls it before every request **it** serves.
Storage and Realtime speak to Postgres through their own services and never call
it — and this application uses both directly from the browser:

| Service | Browser call sites |
| ------- | ------------------ |
| Storage | `lib/supabaseEnhanced.ts` (upload), `components/meetings/persistMeeting.ts` (remove), `utils/storage.js` (list), `pages/admin/bucket-test.tsx` (list), `components/assignments/CollaborativeSubmissionModal.tsx` (public URL) |
| Realtime | `contexts/AvatarContext.tsx`, `utils/activityUtils.ts`, `utils/messagingUtils-simple.ts`, `lib/realtimeNotifications.js`, `pages/noticias.tsx` |

A flagged account holds an ordinary access token and could keep uploading files,
deleting meeting documents and receiving live rows.

**The implementation** —
`supabase/migrations/20260819120200_forced_password_change_data_layer.sql`:

| Piece | What it does |
| ----- | ------------ |
| `public.password_change_gate_ok()` | The **one** predicate. No arguments, reads `auth.uid()`, TRUE means permitted. `SECURITY DEFINER` so the read is reliable **and** so a policy on `public.profiles` does not re-enter policy evaluation (the owner holds `BYPASSRLS`). |
| `forced_password_change_guard` | A **RESTRICTIVE** policy `FOR ALL TO authenticated` on every row-secured table in `public` (232) and on `storage.objects`, `storage.buckets` and the two multipart tables. Restrictive policies are ANDed with what is already there: it can only narrow, never grant. |
| `public.apply_forced_password_change_guard(schema, table)` | The one line a future migration calls. Raises rather than returning quietly when the table does not exist or has row security off — a guard that enforces nothing is worse than no guard. |

The table list comes from `pg_class`, not from anyone's memory. Realtime needs no
separate object: `postgres_changes` delivers a row only to a subscriber that
could `SELECT` it, checked as `authenticated` with that subscriber's own claims,
so the restrictive policy **is** the delivery control. The migration asserts that
rather than assuming it — it fails if a table published to `supabase_realtime`
lacks the guard.

**Why the predicate fails CLOSED on a malformed claims blob**, unlike the
request-layer gate: there, raising takes the whole API down for everyone; here
the blast radius is one query, and a predicate that cannot identify the caller
must deny. Asserted in 053.

**The catalog invariant.** `supabase/tests/053-...` enumerates every row-secured
table in `public`, every browser-reachable table in `storage`, and every table in
the `supabase_realtime` publication, and FAILS if one does not carry the guard.
It is shown to bite: a fixture table is created with row security and no guard,
and the invariant then names exactly that table. A future migration adding a
table fails CI until the table joins the boundary.

**Behaviour, not just catalog.** 053 asserts nine roles × {flagged, clear} ×
{SELECT, INSERT, UPDATE, DELETE} against a fixture whose permissive policy would
allow every one of them — plus a **second, identical, unguarded fixture that the
same flagged account CAN reach**, which is what makes the refusals evidence about
the guard rather than about the fixture. Storage gets the same treatment. The
e2e closes the last inch with real tokens over real HTTP and a real Realtime
channel (§7.4).

**What is still covered by the pre-request gate ALONE, said out loud.** A
`SECURITY DEFINER` RPC bypasses row security by definition — no policy can gate
one. The same is true of the 22 legacy tables in `public` with row security off
(pinned by `001-rls-enabled.sql`). The gate stays for both, and §9 records it.

**051 changes shape as a consequence**, and the change is the honest one. Its
nine `throws_ok(42501)` assertions were catching the trigger; with the guard in
place the row is filtered first, so the UPDATE raises nothing and touches
nothing. Each role is now asserted **per layer**: the flagged account reaches no
row and its flag survives (layer 1), and the *unflagged* account of the same role
still meets the trigger (layer 2 — the half that would silently vanish if the
trigger were dropped). The pair that asserted "RLS alone WOULD hand a flagged
account its own row" is rewritten, because it is no longer true.

---

### R3 — MAJOR: the forbidden DROP

**The defect.** `20260819120000` executed
`DROP TRIGGER IF EXISTS protect_must_change_password ON public.profiles;`.
CLAUDE.md has no exception for a `DROP` that is immediately replaced, and it was
not even necessary — the trigger does not exist on the clean base this branch is
cut from.

**The implementation.** The statement is gone, replaced by a `pg_trigger`
existence check. The trigger's *behaviour* still upgrades through
`CREATE OR REPLACE` on its function, which is where the logic lives.

**Why it shipped, which is the more interesting question.** The only guard was
`scripts/ci/check-rls-migrations.sh`, a `grep` for one string. DROP, TRUNCATE and
destructive ALTER were unguarded entirely.
`scripts/ci/check-destructive-migrations.mjs` closes that:

- **comments are not code** — this repository writes long prose headers, and
  several `COMMENT ON` bodies contain the word TRUNCATE while explaining why
  TRUNCATE cannot bypass a policy. A grep fails all of them;
- **string literals are not code except when they are** — `EXECUTE 'DROP TABLE x'`
  inside a `DO` block is executable SQL wearing a literal's clothes, and a guard
  that blindly strips literals hands the author that bypass for free. A literal
  whose first token is a statement keyword is scanned as code;
- **dollar-quoted bodies are code** and are scanned as such;
- **additive `ALTER` is permitted by name**, so the guard does not push authors
  into working around it.

`__tests__/security/destructive-migration-guard.test.ts` is what makes it
evidence: **15 forbidden forms** each caught on a synthetic migration written for
the purpose (including the exact statement the reviewer found, and the `EXECUTE`
bypass), **18 additive forms** each left alone, the nested-block-comment and
quoted-`--` cases, and the real migration directory scanned with a floor on how
many files were opened.

---

### R4 — SUPPORTING: the browser scan had blind spots

**The defect.** `__tests__/security/no-browser-password-mutation.test.ts` walked
six directories, matched `.ts`/`.tsx`, and ran regexes. It never opened `lib/`;
it never opened `.js`/`.jsx`; and a regex over text is defeated by whitespace, an
alias, or a member expression built at runtime.

**The implementation.** `scripts/ci/check-browser-boundaries.mjs` computes what
"browser" *means* rather than listing directories:

1. the transitive closure of relative imports from every page (excluding
   `pages/api`) and every client root;
2. plus **default-deny**: anything reachable from neither a page nor a server
   entrypoint counts as browser code.

Point 2 is not hypothetical. `lib/supabaseEnhanced.ts` (browser Storage uploads)
and `contexts/AvatarContext.tsx` (a browser Realtime subscription) are both named
in the review as browser paths and **nothing imports either of them today** — a
graph rooted only at pages goes green on both and turns red the day somebody
wires one in, which is the same class of blind spot the regex was failed for.

Files are parsed with the TypeScript compiler's own parser, so a match is a real
call expression or a real object property. The rule also polices the **server**
side: `auth.admin.updateUserById({password})` and
`auth.admin.createUser({password})` are allow-listed by path across the whole
repository, and the raw writer has exactly one permitted importer. Every
allow-list entry carries a written justification, and a test asserts it does.

**Negative controls.** Nine synthetic fixtures, one per forbidden shape,
deliberately including a `.js` and a `.jsx` file — plus a positive control that
mentions every forbidden shape in prose and in string literals and must **not**
be flagged, which is precisely what a regex gets wrong. 24 assertions.

The old regex scan stays as defence in depth, with its limits written into its
header.

---

### R5 — SUPPORTING: English copy in authentication responses

**The defect.** "Unauthorized", "New password is required", "Password change not
required for this user", "Failed to update password", "Method not allowed",
"Authentication required", "Internal server error", "Missing required fields",
"School context missing for equipo_directivo" — all user-visible, and
`/change-password` renders `result.error` straight into a toast.

**The implementation.** Every one is es-CL, and the shared message tables
(`COMPLETION_MESSAGES`, `ADMIN_RESET_MESSAGES`, `DELIVERY_MESSAGES`,
`RECOVERY_MESSAGES`) are the single source.

`__tests__/security/auth-endpoint-localization.test.ts` walks the **source** of
all six authentication endpoints rather than only the paths a test happens to
drive, and is explicit about its limits: *"does this contain English"* is
decidable from a word list; *"is this good Chilean Spanish"* is not, and the test
does not claim to decide it.

---

### R-extra — the trusted boundary required nothing of its callers

Not one of the five. Recording it because it is the root cause underneath R1.

The second pass exported

```ts
completePasswordChange(admin, { userId, newPassword, auditAction, ... })
```

A generic primitive: any route could import it, pass any user id, and name its
own audit action. The boundary existed; it simply did not require a ceremony.
`/api/auth/recovery-complete` demonstrated exactly that — it "proved" identity
with a bearer token, handed the id in, and labelled the result
`password_change_recovery`, so a login token could change a password and the
trail would call it a recovery.

There is now **no exported function that takes a user id and a password**. There
are four ceremonies, each establishing the identity it acts on, and
`CEREMONY_AUDIT_ACTION` is frozen and *consulted* rather than accepted — a route
cannot mislabel what it did. §4 is the full inventory.

---

## 4. The complete password-path inventory

Every call site in the repository that can create an account with a password,
change one, generate one, or move `must_change_password`. Produced by AST scan
(`scripts/ci/check-browser-boundaries.mjs --json`) plus a manual sweep, not from
the file list the brief named.

### 4.1 Password WRITES on an existing account

| Call site | Ceremony | Why it is trusted |
| --------- | -------- | ----------------- |
| `lib/auth/password-completion.ts` → `__writePasswordThroughTrustedBoundary` | all four | **The only `auth.admin.updateUserById({password})` in the platform.** Not reachable by a route: the four ceremonies are the surface, and each derives its own subject. |
| `pages/api/admin/update-user.ts` | *none — email only* | Calls `updateUserById` to change an **e-mail**. Allow-listed explicitly so that adding a `password` property there becomes a deliberate act rather than a silent one; the checker fires on the property, not the method. |

### 4.2 The four ceremonies

| Ceremony | Entry point | Identity | Flag | Audit action |
| -------- | ----------- | -------- | ---- | ------------ |
| Recovery | `POST /api/auth/recovery-complete` | `verifyOtp({type:'recovery'})` on the one-time `token_hash`. No header, no cookie, no body id is read. | cleared | `password_change_recovery` |
| Forced | `POST /api/auth/force-password-change` | `auth.getUser()` **and** `must_change_password = true` re-read with the service role | cleared | `password_change_forced` |
| Voluntary | `POST /api/auth/change-password` | `auth.getUser()` **and** reauthentication with the current password on a throwaway client | **not** cleared — must not release a held account | `password_change_voluntary` |
| Administrative reset | `POST /api/admin/reset-password` → `lib/auth/admin-password-reset.ts` | actor from `checkIsAdminOrEquipoDirectivo` (token validated with the auth server, roles read from the database), re-validated for shape; target scope re-derived from `profiles` + `user_roles` | **set**, before the password, with compensation | `password_reset_admin` |

**The one deliberate seam**, so the reviewer does not have to find it: the
administrative-reset ceremony owns every authorization *decision* (the ED school
scope, the forbidden-role gate, the cross-school gate) and re-reads the target
facts itself — but it takes the ACTOR from `checkIsAdminOrEquipoDirectivo`
rather than repeating that lookup. That helper is the shared one CLAUDE.md's API
pattern prescribes and it is a server-side read, not a caller-supplied value; the
module re-checks its shape (role ∈ {admin, equipo_directivo}, and an ED must
carry a numeric school id) and refuses anything else. Worth your judgement.

### 4.3 Account PROVISIONING (a different ceremony)

| Call site | Authorization | Password source | Flag | Audit |
| --------- | ------------- | --------------- | ---- | ----- |
| `pages/api/admin/create-user.ts` | admin / equipo_directivo | `lib/auth/password-generator.ts` (CSPRNG) | `true` at insert | `user_created_manual` |
| `pages/api/admin/bulk-create-users.ts` | admin / equipo_directivo | same generator | `true` at insert | `user_created_bulk` |
| `pages/api/admin/tractor-signups/grant.ts` | admin | same generator | `true` at insert | `access_granted_new_user` |

All three are allow-listed by path in the boundary checker; anything else calling
`auth.admin.createUser({password})` fails CI. The account never learns the
generated password in the grant path — it is replaced through the recovery link
the grant e-mails.

### 4.4 Recovery MATERIAL

| Call site | What it does |
| --------- | ------------ |
| `lib/auth/recovery-link.ts` → `generateRecoveryLink` | Mints `hashed_token` and builds `/reset-password?token_hash=…&type=recovery`. Used by grant, resend and the new self-service request. The URL is never returned to any HTTP response, never logged, never audited. |
| `lib/auth/recovery-proof.ts` → `consumeRecoveryProof` | The only consumer. Server-only. |

### 4.5 `must_change_password` WRITES

| Call site | Role |
| --------- | ---- |
| `public.set_password_change_required(uuid, boolean)` | The trusted RPC. `service_role` only. Used by every ceremony that clears the flag. |
| `pages/api/admin/reset-password.ts` (via the ceremony module) | Sets it, and restores the prior value if the password write fails. |
| `create-user.ts`, `bulk-create-users.ts`, `grant.ts` | `true` at profile-insert time, service role. |
| **The browser** | **Nothing.** The trigger refuses it, the restrictive guard filters the row, and the AST rule fails the build on a call site that tries. |

---

## 5. The complete data-service inventory

| Service | Surface | Control |
| ------- | ------- | ------- |
| **PostgREST** — every row-secured table in `public` (232) | REST + RPC | Restrictive `forced_password_change_guard` **and** the pre-request gate |
| **PostgREST** — the 22 legacy tables with row security OFF | REST | Pre-request gate **only**. A restrictive policy on a table without row security enforces nothing; `apply_forced_password_change_guard` raises rather than pretending. Allowlist pinned by `001-rls-enabled.sql`; 053 asserts it has not grown. |
| **PostgREST** — `SECURITY DEFINER` RPCs | RPC | Pre-request gate **only**. `SECURITY DEFINER` bypasses row security by definition. The two sensitive ones this branch adds (`set_password_change_required`, `claim_invitation_resend`) additionally `REVOKE EXECUTE` from `authenticated`. |
| **Storage** — `storage.objects` | list, download, upload, update, delete | Restrictive guard. Behavioural proof in 053 (SELECT/INSERT/UPDATE) and in the e2e against the real storage-api (upload + list). Direct SQL DELETE is blocked on this stack by `storage.protect_delete`, so deletion is proved structurally in 053 (the guard is `FOR ALL`, so its `USING` governs DELETE) and behaviourally through the API in the e2e. |
| **Storage** — `storage.buckets` | `listBuckets()` | Restrictive guard, asserted in 053 |
| **Storage** — `storage.s3_multipart_uploads(_parts)` | resumable upload | Restrictive guard |
| **Realtime** — the 6 tables in `supabase_realtime` | `postgres_changes` row delivery | Restrictive guard on the source tables — Realtime delivers only what the subscriber could SELECT. The migration FAILS if a published table lacks it. Behavioural proof: a real channel in the e2e, both ways. |
| **GoTrue** (`/auth/v1/*`) | sign-in, `verifyOtp` | **Deliberately not gated.** It is the way OUT: a flagged account must be able to sign in and complete the change. |
| **Edge Functions** | — | None exist in this repository (`supabase/functions` is absent). |

---

## 6. Migrations, and the exact authorization consequences

**Four**, all additive, all forward-only, none disabling row-level security, and
now proved so mechanically by `scripts/ci/check-destructive-migrations.mjs`.

### 6.1 `20260818120000_security_audit_events.sql`
Unchanged except for one added `action` value — `password_recovery_requested`.
The migration is unapplied anywhere, so editing it in place is correct and avoids
an `ALTER … DROP CONSTRAINT` the DB-safety rule forbids.

### 6.2 `20260819120000_forced_password_change_boundary.sql`
Unchanged except that the `DROP TRIGGER` is gone (R3). Still: the protected-column
trigger, `gate_password_change()` on `pgrst.db_pre_request`,
`current_password_change_state()`, `set_password_change_required()`.

### 6.3 `20260819120100_invitation_resend_claim.sql`
Unchanged.

### 6.4 `20260819120200_forced_password_change_data_layer.sql` — **new**

| Object | Grants / revokes | Role-by-operation consequence |
| ------ | ---------------- | ----------------------------- |
| `public.password_change_gate_ok()` | `REVOKE` from PUBLIC; `GRANT EXECUTE` to `anon`, `authenticated`, `service_role`, `authenticator` | Needed by every role that can be the invoker of a policy check. Takes no argument; discloses nothing. |
| `public.apply_forced_password_change_guard(text,text)` | `REVOKE ALL` from PUBLIC, `anon`, `authenticated`, **and `service_role`** | Performs DDL. Only the schema owner can run it. |
| `forced_password_change_guard` on 232 `public` tables + 4 `storage` tables | — | `authenticated`: unchanged when unflagged; **all four operations denied** when flagged. `anon`: unaffected (the policy names `authenticated`). `service_role`: unaffected — it holds `BYPASSRLS`, which is what keeps the endpoints that CLEAR the flag working. |

**Why every change is additive:** two `CREATE OR REPLACE FUNCTION`s and one
`CREATE POLICY` per table. No existing policy is modified, no object is dropped,
no data is touched, and no statement turns row security off. The `DO` blocks
raise rather than skip when they cannot do their job — an unguarded Storage or an
empty `public` sweep fails the migration rather than reporting success.

**Ordering.** `20260818120000` → `20260819120100` (the function references the
table). `20260819120000` → `20260819120200` (two layers of one control).
Runbook §2 states it.

**Privacy (Ley 21.719).** No new table, no student or minor data, no new column.

---

## 7. Test evidence

### 7.1 Gates — every one run, on this head

| Gate | Command | Result |
| ---- | ------- | ------ |
| Type-check | `npm run type-check` | **pass**, clean |
| Lint | `npm run lint` | **pass**, zero warnings |
| Unit | `npm test` | **332 files, 7801 passed, 11 skipped** (the documented `[Z3b, PARKED]` skips), 0 failed |
| Build | `npm run build` | **pass**; middleware bundle emitted |
| pgTAP | `npm run test:db` | **15 files, 742 assertions, 1 failure — pre-existing local drift, verified again this round.** See §7.3 |
| E2E | `npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list)` | **121/121 passed, 12 spec files, 0 skipped**, against a production build on the seeded local stack |
| E2E skip guard | `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | `OK — 12 mandatory spec(s) ran with no skips` |
| Whitespace | `git diff --check` | **clean** (exit 0) |
| RLS-disable guard | `bash scripts/ci/check-rls-migrations.sh` | **clean** |
| Destructive-migration guard | `node scripts/ci/check-destructive-migrations.mjs` | **clean** — 22 files scanned |
| Browser-boundary guard | `node scripts/ci/check-browser-boundaries.mjs` | **clean** — 1121 files, 682 browser modules from 513 entrypoints |
| `lint:testid` (advisory) | `npm run lint:testid` | **2635 findings — unchanged from the previous head.** No file newly carries one |

### 7.2 New and changed suites

| Suite | Tests | Note |
| ----- | ----- | ---- |
| `supabase/tests/053-forced-password-change-data-layer.sql` | **124 pgTAP** (new) | catalog invariant + behaviour + negative controls |
| `supabase/tests/051-forced-password-change-boundary.sql` | **89** (was 70) | reworked for two layers |
| `__tests__/lib/auth/password-completion.test.ts` | **38** (was 24, rewritten) | the four ceremonies |
| `__tests__/security/destructive-migration-guard.test.ts` | **40** (new) | 15 forbidden + 18 additive + stripper |
| `__tests__/components/ResetPasswordPage.recoveryProof.test.tsx` | **33** (rewritten) | the page consumes nothing |
| `__tests__/security/browser-boundary.test.ts` | **24** (new) | 9 fixtures + positive control |
| `__tests__/api/auth/recovery-complete.test.ts` | **22** (was 19, rewritten) | attacker-side |
| `__tests__/security/auth-endpoint-localization.test.ts` | **22** (new) | |
| `__tests__/api/auth/recovery-request.test.ts` | **20** (new) | anti-enumeration × 9 paths |
| `__tests__/lib/auth/recovery-proof.test.ts` | **19** (new) | |
| `__tests__/lib/email/deliveryStatus.test.ts` | **14** (new) | accepted ≠ delivered |
| `__tests__/components/LoginPage.passwordRecovery.test.tsx` | **12** (rewritten) | S9 re-asserted against the new transport |
| `__tests__/api/admin/reset-password.test.ts` | **33** | audit rows updated for the ceremony |

### 7.3 The one failing pgTAP test — pre-existing, re-verified this round

`supabase/tests/002-zoom-internal-isolation.sql` test 8:
`zoom_internal holds exactly the 7 Z1b tables + zoom_zak_issuances — have: 10, want: 8`.

Re-checked rather than taken on trust: the two extras are
`zoom_attendance_observations` and `zoom_attendance_report_batches`, created by
`20260813120000_…` and `20260813120100_…`, which exist **only** in the unmerged
`feat/zoom-hours` worktree and have been applied to the shared local database.
`grep -rl` over `supabase/migrations` on this branch finds neither name. Nothing
in this branch touches `zoom_internal`. CI builds the database from
`supabase/migrations` on a clean stack, where it passes.

### 7.4 E2E — what stage 8 now does

| # | Stage | What is asserted |
| - | ----- | ---------------- |
| 8 | **PostgREST** | flagged token → `GET /rest/v1/profiles` **403** with `PASSWORD_CHANGE_REQUIRED`; `PATCH` of its own flag refused and the flag still reads `true`; the state RPC **200** |
| 8b | **Storage** | a synthetic bucket with a permissive policy created for the test. **Control first**: an unflagged token uploads and lists successfully — without that, the refusals below prove nothing. Then the flagged token: upload refused, listing empty, and the object count read **at the storage layer** afterwards confirms only the control object exists. Torn down in `finally`. |
| 8c | **Realtime** | a real `postgres_changes` channel with the flagged token receives **nothing** when the service role inserts a row for that account; the same probe with the control token **does** receive its row |
| 11 | **Self-service recovery** | the message is read from the outbox — subject *"Restablece tu contraseña de Genera"*, link on this origin, `token_hash` present, `type=recovery`, **not** `/auth/v1/verify`, and **a different credential from the invitation's** |
| 5 | **Refusals** | a bare visit, a hand-typed partial fragment, a **complete** implicit fragment, and a PKCE `?code=` all show the invalid screen; only the e-mailed URL opens the form |
| 13 | **Audit** | `access_granted_new_user`, `password_change_recovery` (≥2), `password_recovery_requested`, `password_reset_admin`, `password_change_forced` all read back; none of the four passwords and not the address appear in any metadata |

The e2e job stops excluding `realtime` — a stack with no Realtime in it cannot
prove a claim about Realtime. `mailpit` stays excluded and is not needed: nothing
goes out over Supabase SMTP any more.

### 7.5 Adversarial cases added, by finding

**R1** — a bearer access token alone; an access token presented AS the token
hash; a session cookie; a body `userId`; a replay of consumed material; expired;
malformed; non-string; a wrong declared type (never reaching the provider); a
weak password that does **not** burn the link; a signed-in visitor opening
another account's link; `getUser` asserted to be called **zero** times.

**R2** — nine roles × two flag states × four operations on a guarded table; the
same nine on an **unguarded** twin that they CAN reach; storage list/upload/
update per flag state with an unflagged positive control; a published-table read
per flag state; the catalog invariant shown to NAME a table that skipped the
guard; `service_role` shown to still read a flagged profile and clear the flag.

**R3** — 15 forbidden statements each on its own synthetic migration, including
`EXECUTE 'DROP …'` inside a `DO` block; 18 additive statements that must pass,
including three that mention the forbidden words in prose.

**R4** — nine injected violations across `.ts`, `.tsx`, `.js` and `.jsx`; a clean
module that mentions every forbidden shape in comments and strings and must not
be flagged; assertions that `lib/`, `.js`, and the two unreferenced browser
modules are all inside the scanned set.

**R5** — the source of six endpoints walked for English; four named strings
asserted individually.

---

## 8. The five things to scrutinise hardest

1. **A restrictive policy on 232 tables is the widest change this branch has
   ever made.** It is wider than the `db_pre_request` hook it supplements. I
   believe it is safe — restrictive policies can only narrow, the predicate is
   wrapped in a scalar sub-select so the planner runs it once per query as an
   InitPlan, and `service_role` holds `BYPASSRLS` — but I have not profiled it
   under load, and "one extra indexed lookup per query on every table in the
   platform" is a claim worth a second opinion. Check especially whether any hot
   path issues many small queries where a per-query InitPlan is not amortised.

2. **The predicate is `SECURITY DEFINER` and is referenced from a policy ON
   `public.profiles`.** That is safe only because the owner (`postgres`) holds
   `BYPASSRLS`, so evaluating the policy does not re-enter policy evaluation. If
   that assumption is wrong on the production instance — a different owner, or
   `BYPASSRLS` revoked — the result is infinite recursion on the most-read table
   in the schema. I verified `rolbypassrls` on the local stack and **not** on
   production, because this pass touched production not at all. **Verify it
   before applying migration four.**

3. **Refusing the implicit fragment and PKCE outright.** Every link this platform
   sends is `token_hash`, so nothing should break — but if any Supabase-hosted
   template is still configured to send `{{ .ConfirmationURL }}`, or if anyone
   triggers a recovery from the dashboard, the recipient gets a refusal instead
   of a form. I judged an honest refusal better than accepting a credential that
   cannot be verified for purpose. Runbook §4.3 records the template change that
   makes even that path work. Disagree if you think the compatibility matters
   more.

4. **The administrative-reset seam** (§4.2). The ceremony owns every
   authorization decision and re-reads the target facts, but takes the ACTOR from
   `checkIsAdminOrEquipoDirectivo` instead of repeating the role lookup. I chose
   that over a second lookup because the helper is the shared, server-side one
   the API pattern prescribes — but it does mean the module trusts one value it
   did not fetch itself, and the module re-checks only its shape.

5. **The e2e Storage fixture creates a permissive policy and drops it in
   `finally`.** Without a permissive policy both accounts are refused and the
   comparison proves nothing, so the fixture is necessary — but it means a test
   run that dies between creation and teardown leaves a policy behind on the
   stack, and it means the e2e now needs `SUPABASE_DB_URL`. On the ephemeral CI
   stack that is harmless. Confirm you agree it should not be a shipped policy
   instead.

---

## 9. Known limitations and deferred items

- **`SECURITY DEFINER` RPCs and the 22 row-security-off legacy tables are covered
  by the pre-request gate ALONE.** No policy can reach either. Emptying that
  allowlist remains out of scope.
- **A future path that reaches Postgres without PostgREST, Storage or Realtime**
  — a direct connection, or an Edge Function with the service key — is not gated.
  Neither exists today; `supabase/functions` is absent from this repository.
- **pgTAP cannot send an HTTP request or open a WebSocket.** 053 proves the
  control both services consult; the e2e proves they consult it.
- **The recovery form opens before the link is validated.** A one-time credential
  cannot be both checked on arrival and used on submit. An expired link now
  reports itself after the password is typed.
- **No test proves mail leaves the building, and none claims to.** The furthest
  this repository reaches is `provider_accepted`. `delivered` and `bounced` are
  declared and never produced. Runbook §3.6 and §6 are the only things that can
  settle it, and they are human operations against production.
- **The concurrency proof for F5 is still a simulation plus a negative control.**
- **`invitation_resent` still writes two rows per resend**, and the administrative
  reset now writes two on the failure path (the password-stage refusal and the
  compensation outcome). Each row is true about a different thing; collapsing
  them would lose whether the account was left flagged.
- **The resend cooldown is per target, not per admin.**
- **The audit table has no retention policy.**
- **Bulk import will time out at scale.** Pre-existing and unchanged.
- **Diagnostic surface remains** beyond the seven removed routes.
- **`getAppBaseUrl` throws in production when no origin is configured**, and is
  now load-bearing for three e-mail paths rather than two.
- **`/change-password` still renders inside `AuthProvider` and
  `PermissionProvider`**, both of which make browser calls the boundary now
  refuses for exactly the users on that page. Both fall back to empty state, so
  the page works — but a flagged user generates console noise. Worth a follow-up.
- **The local shared database needed one hand operation** to run the gates: the
  `security_audit_events` action CHECK predates the two values this branch adds,
  and `CREATE TABLE IF NOT EXISTS` does not update a constraint. It was swapped
  by hand **on the local dev database only**. CI runs `supabase db reset` and
  builds the schema from `supabase/migrations`, where the file declares the full
  list.

---

## 10. Questions for the reviewer

1. Is `rolbypassrls` on the production `postgres` role something you can confirm
   before migration four is applied (§8.2)?
2. Is a restrictive policy on every row-secured table an acceptable cost, or
   would you rather the boundary stayed at the request layer and accepted the
   Storage/Realtime gap explicitly (§8.1)?
3. Is refusing implicit and PKCE recovery links outright the right call (§8.3)?
4. Is the administrative-reset actor seam acceptable (§8.4)?
5. Should the e2e's Storage policy be a shipped, permanently-scoped policy rather
   than a fixture (§8.5)?
