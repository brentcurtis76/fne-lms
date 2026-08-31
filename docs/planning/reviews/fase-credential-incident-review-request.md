# Review request — CRED-01 credential incident, repository-only correction

| Field | Value |
| --- | --- |
| Branch | `fix/cred-guard` |
| Base | `49814091a2df69cc8e4c02beba8014bb5aa0694c` (live `origin/main` at the time of work, re-locked read-only) |
| Commit count | 1 |
| Worktree | `/Users/brentcurtis/dev/wt/cred-guard` |
| Date | 2026-08-31 |
| Reviewer protocol | `docs/planning/review-protocol.md` |

> **This branch is repository hygiene plus a guard. Nothing else.** No key was
> rotated. No provider was contacted. No environment variable was changed. No
> deployment was triggered. No credential value was read, printed, copied or
> tested. Nothing was pushed. The substantive remedy — rotation — is entirely
> pending human action and is sequenced in §9 below.

---

## 1. Scope

### In scope

1. Delete ten orphaned, credential-bearing helper scripts.
2. Add a fail-closed CI guard against committed credentials, with negative controls.
3. Decouple recovery encryption from the Supabase service-role API key, fallback retained.
4. Correct `docs/runbooks/auth-security.md` and `PROJECT_STATE.md`.
5. This review request.

### Explicitly out of scope

- Rotating any key or password.
- Any Supabase, Vercel, GitHub-settings, Resend, DNS or other provider action.
- Any environment-variable change in any environment.
- Any deployment, push, pull request or merge.
- Any Git history rewrite.
- The unrelated untracked files in the canonical checkout.
- The administrator-password incident (runbook §1), the database-password
  rotation (§8.4), and the seeded-simulation plan — three separately governed
  workstreams that this branch deliberately does not touch.

---

## 2. Files changed, grouped by risk

### HIGHEST — changes behaviour of a live security path

| File | Change |
| --- | --- |
| `lib/auth/recovery-crypto.ts` | `configuredSecret()` now selects explicit argument → `RECOVERY_CRYPTO_SECRET` → `SUPABASE_SERVICE_ROLE_KEY`. Header comment rewritten. **The legacy fallback is retained, so with `RECOVERY_CRYPTO_SECRET` unset the derived key is byte-identical to before and production behaviour does not change on merge.** |

### HIGH — changes what CI enforces

| File | Change |
| --- | --- |
| `scripts/ci/check-committed-secrets.mjs` | New. Fail-closed credential guard, Node builtins only. |
| `.github/workflows/ci.yml` | **+8 lines, −0.** One step appended to the existing `Migration safety guard` job. No job name, trigger, timeout, concurrency setting or substantive gate touched. |
| `package.json` | **+1 line.** Adds `guard:secrets`. |

### MEDIUM — deletions of credential-bearing files

All ten were orphaned: a single `git grep` over the tracked tree found **zero
inbound references** to any of them.

| File | Carried |
| --- | --- |
| `scripts/fix-qa-workspace.js` | **`service_role` key** + production project URL |
| `scripts/seed-hour-tracking-qa-scenarios.mjs` | **`service_role` key** + production project URL |
| `src/tests/check-role.ts` | production URL + legacy anon key |
| `src/tests/delete-lesson.ts` | production URL + legacy anon key |
| `src/tests/fetch-instructor-by-id.ts` | production URL + legacy anon key |
| `src/tests/fetch-instructors.ts` | production URL + legacy anon key |
| `src/tests/insert-course.ts` | production URL + legacy anon key |
| `src/tests/insert-lesson.ts` | production URL + legacy anon key |
| `src/tests/update-lesson.ts` | production URL + legacy anon key |
| `lib/supabase-debug.ts` | production URL + legacy anon key, **and logged request headers** |

`lib/supabase-test.ts` is **deliberately retained** per the task instruction: its
key is the published Supabase localhost demo anon key, selected only when
`NODE_ENV === 'test'` alongside `http://127.0.0.1:54321`. It is allowlisted in
the guard by fingerprint, with the reason recorded in the allowlist entry.

### LOW — tests and documentation

| File | Change |
| --- | --- |
| `__tests__/security/committed-secrets-guard.test.ts` | New, **43** tests (35 at round 0; +8 in round 1). |
| `__tests__/lib/auth/recovery-crypto-secret.test.ts` | New, 16 tests. |
| `docs/runbooks/auth-security.md` | New §8; four rows (0.16–0.19) added to the §0 state-of-play table. |
| `PROJECT_STATE.md` | **+1 line, −0.** New `CRED-01` Meta entry. |

---

## 3. The guard

`scripts/ci/check-committed-secrets.mjs` classifies credential-**shaped** text
rather than grepping for one known string, and fails closed on anything it cannot
classify safely.

**Fails on:**

| Category | Trigger |
| --- | --- |
| `SERVICE_ROLE_JWT` | JWT whose base64 payload decodes to `role: service_role` |
| `SUPABASE_SECRET_KEY` | `sb_secret_` literal that is not fingerprint-allowlisted |
| `DATABASE_URL_PASSWORD` | password-bearing `postgres://` / `postgresql://` URL |
| `DATABASE_PASSWORD_ASSIGNMENT` | `PGPASSWORD` / `POSTGRES_PASSWORD` / `DB_PASSWORD` / `DATABASE_PASSWORD` / `SUPABASE_DB_PASSWORD` / `POSTGRESQL_PASSWORD` assigned a literal |
| `UNREVIEWED_JWT` | decodable JWT that is not an allowlisted fixture |
| `UNCLASSIFIABLE_CREDENTIAL` | credential-shaped text that will not decode — **fails closed** |
| `UNREADABLE_FILE` | a selected tracked file that cannot be read — **fails closed** (round 1) |

**Properties:**

- **Never prints a matched value.** Findings carry file, line, category and a
  truncated SHA-256 fingerprint only. Asserted by test, including that no
  distinctive slice of the value appears in a serialised finding.
- **`service_role` has no allowlist path at all.** The classifier returns before
  the allowlist is consulted; a test proves that adding its fingerprint to the
  allowlist does not suppress the finding.
- **Allows** `sb_publishable_` keys, and five fingerprint-allowlisted synthetic
  fixtures, each with a written reason.
- **Dependency-free.** The `Migration safety guard` job runs before `npm ci`.
- **Selection is a binary denylist** (round 1): every tracked file is scanned
  except known-binary asset types, so a new text format is covered the day it
  appears. 2,178 files currently in scope.

### Why the allowlist has five entries, not the three named in the task

The task named three allowances (localhost demo anon key, fabricated Zoom JWT,
synthetic `sb_secret_`). Running the guard surfaced **two more** pre-existing
synthetic fixtures that the fail-closed rule correctly caught:

| Fingerprint | Site | What it is |
| --- | --- | --- |
| `6a580c6113e6` | `__tests__/lib/auth/recovery-grant.test.ts:222` | fabricated session token, passed to `peekRecoveryGrant` to prove it is rejected as `invalid` before any database access |
| `9e80e5552996` | `__tests__/lib/security/audit.test.ts:256` | JWT-shaped value fed to `sanitiseAuditMetadata` to prove it becomes `[redacted-token]` |

Both are negative-control inputs to redaction/rejection proofs. **This is a
judgment call the reviewer should check** — see §7.

---

## 4. Focused test results

### `__tests__/security/committed-secrets-guard.test.ts` — 43 passed

Every rule is proved against input built for the suite, and every allowlist
exception is proved **twice**: the real tracked file passes with the allowlist
intact, then the same file **fails** once its fingerprint is removed. That second
half is the non-vacuity evidence; without it an exception is an assumption.

Also asserted: findings never contain the value; fingerprints are stable,
value-specific and not the value; correct line numbers; the live tracked tree has
zero findings; and **neither the guard nor its own test file trips the guard** —
every fixture in the suite is assembled at runtime for exactly that reason.

### `__tests__/lib/auth/recovery-crypto-secret.test.ts` — 16 passed

Selection order (explicit → `RECOVERY_CRYPTO_SECRET` → legacy), blank-secret
fall-through, missing-secret failure, too-short legacy key, and too-short
dedicated secret failing closed rather than silently falling back.

The decisive pair:

| Test | Result |
| --- | --- |
| `LEGACY: invalidates envelopes when the API key is the crypto root` | passes — seal under key A, rotate to key B, envelope no longer opens |
| `DECOUPLED: preserves envelopes when RECOVERY_CRYPTO_SECRET is configured` | passes — same sequence, envelope still opens |

The legacy half proves the coupling was real; the decoupled half proves it is
gone. Neither is evidence without the other. Grants and candidate/IP fingerprints
are also proved stable across an API-key rotation, and rotating the *dedicated*
secret **is** shown to invalidate envelopes — which is why cutover requires a
drained queue.

### Regression

`__tests__/lib/auth` + `__tests__/security`: **18 files, 355 tests, all passed.**

---

## 5. Full gate results

Run locally in `/Users/brentcurtis/dev/wt/cred-guard` against the exact tree at
the **final correction head** (round 0 + round 1). Round-0 figures are recorded
in §11 where they differ. Exit codes captured with `$?` directly (no pipeline), because this
shell is zsh and `PIPESTATUS` is a bash-ism that silently yields an empty string.

| Gate | Command | Exit | Result |
| --- | --- | --- | --- |
| Typecheck | `npm run type-check` | **0** | clean |
| Lint | `npm run lint -- --max-warnings=0` | **0** | zero warnings |
| Unit | `npm test` | **0** | **371 files, 8482 passed, 11 skipped, 0 failed** (8474 at round 0; +8 round-1 tests) |
| Build | `npm run build` | **0** | production build, middleware 74.5 kB |
| Whitespace | `git diff --check` | **0** | clean |
| Secrets guard | `npm run guard:secrets` | **0** | **2178** files scanned, 0 findings |
| Actions guard | `npm run guard:actions` | **0** | 17 uses across 1 workflow file |
| Focused suites | `vitest run` guard + recovery-crypto | **0** | 59 passed (43 guard + 16 recovery-crypto) |
| Migration guards | `npm run guard:migrations` | **0** | 40 migrations, no RLS-disable, no destructive statement |

The 11 skips are the pre-existing `[Z3b, PARKED]` skips already recorded in
runbook §0.1; this branch adds none.

**Build environment.** The build was run with command-scoped **synthetic
localhost** values for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_BASE_URL`. No `.env` file was
written into the worktree and no production credential was referenced.

**One honest note on sequencing.** An earlier gate run reported
`UNIT_EXIT=1` — a single failure in this branch's own new test,
`server-only exposure > is read only inside the server-only crypto module`. It
excluded documentation by directory (`docs/`), and `PROJECT_STATE.md` lives at the
repository root, so naming the variable in that entry tripped it. The filter now
excludes by file **type** (`.md`), which is the property that actually matters:
only executable source can read an environment variable. The assertion was then
proved still load-bearing by mutation (§6). **Every gate above was re-run from
scratch on the post-fix tree**; none of the numbers are carried over from the run
that failed.

`npm run test:db` and `npm run e2e` were **not** run — see §8.

---

## 6. Guard mutation evidence

A guard never observed to fail proves nothing. Run end-to-end against the real
tracked tree, with a **synthetic** `service_role` JWT built from a JSON payload
(never a real credential).

> **HISTORICAL EVIDENCE — round 0, preserved verbatim.** The transcript below was
> captured during development of commit `bdc29012`, when the working tree held
> **2,119** selected files: the review-request file itself had not yet been
> staged, and file selection was still the extension allow-list that round-1
> finding 1 replaced. It is kept unchanged because it is the evidence the round-0
> reviewer saw. Its counts are **superseded** — see §11 for the corrected figures
> and the re-run at the final head.

```
=== BASELINE ===
Committed-secret guard OK — 2119 tracked file(s) scanned, 0 findings
exit=0

=== MUTATION: reintroduce a SYNTHETIC service_role JWT ===
Committed-secret guard FAILED (1 finding(s)).
Values are never printed. Each finding shows a truncated SHA-256 fingerprint.
- [SERVICE_ROLE_JWT] scripts/__mutation-probe.js:1 fp=84d33805996a — JWT decodes
  to role=service_role; this bypasses RLS and is never allowlistable
exit=1

=== CLEANUP ===
Committed-secret guard OK — 2119 tracked file(s) scanned, 0 findings
exit=0
```

The probe was removed; `git status` reports no trace of it. Note the finding
names the category and a fingerprint and **never the token**.

The same technique was applied to the server-only assertion in the
recovery-crypto suite: adding `lib/__leak-probe.ts` containing
`process.env.RECOVERY_CRYPTO_SECRET` made
`server-only exposure > is read only inside the server-only crypto module` fail
with `expected [ 'lib/__leak-probe.ts', …(1) ]`, and removing the probe restored
it. That assertion is therefore load-bearing, not decorative.

---

## 7. Where a reviewer should push hardest

1. **The two extra allowlist entries (§3).** I judged `6a580c6113e6` and
   `9e80e5552996` to be synthetic negative-control fixtures from their
   surrounding code, with values redacted. If either is actually a real
   credential, the guard is now configured to ignore it. This is the single
   highest-consequence judgment call on the branch.

2. **Guard evasion.** The rules are regex-and-decode over line-oriented text. A
   credential split across lines, base64-wrapped a second time, or stored in a
   file type outside `SCANNED_EXTENSIONS` would not be caught. Try to get a
   `service_role` key past it. Note also that the guard reads the **working
   tree**, not history — it cannot detect a credential that only exists in an
   older commit.

3. **The recovery-crypto fallback.** The claim "merging changes no production
   behaviour" rests on `RECOVERY_CRYPTO_SECRET` being unset in production and on
   `??` semantics. Check the blank-string and too-short paths specifically: a
   non-blank but too-short dedicated secret deliberately fails closed instead of
   falling back, which is a **behaviour change** for anyone who configures it
   badly. Confirm that is the right call.

4. **CI additivity.** Verify `git diff 49814091 -- .github/workflows/ci.yml` is
   +8/−0 and that all seven protected job names, the triggers, the timeouts and
   the concurrency block are untouched. Branch protection depends on those exact
   names.

5. **Documentation truthfulness.** Check every claim in runbook §8 and the
   `CRED-01` entry against this diff — especially that removal is not described
   as rotation, that local fingerprint equality is not described as provider
   confirmation, and that `CI-MAINT-01` is superseded (+1/−0 in
   `PROJECT_STATE.md`) rather than rewritten.

---

## 8. Known limitations

- **Removal is not rotation.** The `service_role` key remains valid until
  disabled in the Supabase Dashboard, and it remains in Git history, which was
  deliberately not rewritten. This branch reduces future exposure; it does not
  end the current one.
- **Two local carriers still hold the key**: `.env.local:11` and
  `.claude/settings.local.json:11`, both `fp=0ead88ebeff2`. Untracked and
  ignored, so out of scope for a repository correction — but they are why
  rotation cannot wait for this merge.
- **The guard cannot see history**, gitignored files, or any provider-side state.
- **`RECOVERY_CRYPTO_SECRET` is not yet configured anywhere.** The code path
  exists and is tested; the cutover has not happened.
- **`npm run test:db` and `npm run e2e` were not run.** No migration, RLS policy,
  API route or UI surface changed. If the reviewer disagrees, they are the two
  gates to demand.
- **The evidence in §5 is local.** It is not a CI run, and it says nothing about
  provider state.

---

## 9. Corrected future manual sequence

Every step is a human action. Nothing here is authorized by this branch, and the
order matters: **(g) must precede (h), and (h) must precede any claim that the
old key is dead.**

| # | Step | Notes |
| --- | --- | --- |
| a | Independently review and merge this repository correction | Normal PR path; `main` auto-deploys |
| b | Inventory every external direct-database consumer | Written, with an owner and update path each. Blocks (j) |
| c | Confirm the recovery outbox can be drained | Prerequisite for the `RECOVERY_CRYPTO_SECRET` cutover |
| d | Put the new `sb_secret`, new `sb_publishable`, and a **newly generated** independent `RECOVERY_CRYPTO_SECRET` in **Vercel Production only** | The crypto secret is generated, never a copy of any API key. Server-only: never `NEXT_PUBLIC_*`, never in `next.config.js` |
| e | Remove production credentials from Preview and Development; use non-production values there | Isolated non-production Supabase projects, not scoped keys on the production project |
| f | Trigger production only through the controlled `main` merge path | No manual Vercel deployment |
| g | Verify with **synthetic adult accounts** while legacy keys remain enabled | Proves the new keys work *before* the old ones are withdrawn. Never student or other minor data (Ley 21.719) |
| h | Disable the legacy anon and `service_role` keys in the Supabase Dashboard | The actual remediation |
| i | Verify dashboard state and repeat normal synthetic application checks. **Never submit the old key** | Dashboard state is the verification. An authentication attempt with a suspect credential is a *use* of it, not a diagnostic |
| j | Rotate the historical database password **only after (b) is complete** | Rotating first converts a contained exposure into an outage |
| k | Review provider, database and Auth logs; preserve evidence | Determines whether the exposure was ever exercised |
| l | Correct the seeded-simulation plan **only after credential containment** | Separately governed. `docs/reviews/santa-marta-seeded-simulation-plan-2026-08-31.md` is **untracked** in the canonical checkout and absent from `main`, so it is not visible from this worktree |

Also pending, from the independent review of the agentic-control plan and
unrelated to this branch: `main` currently has **no branch protection or
rulesets**, so the merge in (a) is not yet a server-enforced gate.

---

## 10. Verification commands

```bash
git -C /Users/brentcurtis/dev/wt/cred-guard log --oneline 49814091..fix/cred-guard
git -C /Users/brentcurtis/dev/wt/cred-guard diff 49814091 --stat
git -C /Users/brentcurtis/dev/wt/cred-guard diff 49814091 -- .github/workflows/ci.yml
npm run guard:secrets
npx vitest run __tests__/security/committed-secrets-guard.test.ts __tests__/lib/auth/recovery-crypto-secret.test.ts
```

---

## 11. Independent review — round 1

Three findings were raised against `bdc29012dc06ce0a055018ba35caf1e11089020b` and
are closed by one **additive** commit on top of it. The reviewed commit was **not
amended or rewritten**, so its history and the round-0 evidence above remain
exactly as reviewed.

### R1-1 (MAJOR) — file selection omitted `.py`

**Finding.** `scripts/ci/check-committed-secrets.mjs` did not scan `.py`, and the
repository has six tracked Python scripts. A credential in any of them would have
passed CI.

**Root cause, and why the fix is wider than the finding.** The defect was not the
missing entry, it was the **allow-list**: it fails open for every type nobody
remembered, so the same review would find the same bug again for the next one.
Auditing the tree for the same class turned up more uncovered text, including
three that matter more than Python:

| Uncovered file | Why it matters |
| --- | --- |
| `lib/supabaseClient` | Extensionless, in the directory where a Supabase key would actually live |
| `public/public-website-fne.html`, `public/meet/zoom-client-view.html` | **Publicly served.** A credential here is delivered to every visitor — the exact shape of the original incident |
| `pages/admin/course-builder/[id].tsx.broken` | A page kept under a non-code extension |
| `lib/tiptap/__tests__/__snapshots__/render.test.ts.snap` | A snapshot captures whatever a test rendered |
| `.tap`, `.csv`, `.css` | Evidence and ledger files |

**Fix.** Selection is inverted to a **binary denylist** (`BINARY_EXTENSIONS`):
scan every tracked file except known-binary asset types. A new text format is
covered the day it appears, with no edit to the guard. Reported scope went from
**2,120 → 2,178** selected files (+58).

Closing only `.py` would have left `public/*.html` and `lib/supabaseClient`
unscanned in a credential guard, after being told the selection logic was wrong.
**This is wider than the finding asked for and the reviewer should confirm the
call.** Binary key containers (`.p12`, `.pfx`, `.jks`, `.der`) are on the denylist
because they are binary, not because they are safe; a committed keystore is a
different check and is not claimed here.

### R1-2 (MINOR) — `scanRepository` skipped unreadable files silently

**Finding.** An unreadable selected file hit `catch { continue }`, so it dropped
out of the scan and the run still reported success over a quietly smaller set.

**Fix.** Fails closed with an `UNREADABLE_FILE` finding. It discloses **only the
errno code** — never the error message, the file contents, or any value — and
fingerprints the *path* (not a secret) so the finding keeps the same shape as
every other one. A test asserts the absolute temp path does not appear either,
so operator directory layout cannot leak into CI logs.

### R1-3 (MINOR) — stale scan counts

**Finding.** The review request cited 2,119; the reviewed head scans 2,120.

**Corrected counts.** Every committed-secret scan count in this document now
reads **2,178**, recomputed at the final correction head.

| Point in history | Selected files | Note |
| --- | --- | --- |
| Round-0 transcript in §6 | 2,119 | Working tree mid-development, before the review-request file was staged. Historical; preserved verbatim |
| Reviewed head `bdc29012` | 2,120 | What the round-0 reviewer's checkout would report |
| **Final correction head** | **2,178** | Denylist selection; +58 files newly in scope |

### Re-run of the guard mutation proof at the final head

```
=== BASELINE ===
Committed-secret guard OK — 2178 tracked file(s) scanned, 0 findings
exit=0

=== MUTATION: synthetic service_role JWT in a tracked .py file ===
Committed-secret guard FAILED (1 finding(s)).
- [SERVICE_ROLE_JWT] scripts/__r1-probe.py:1 fp=84d33805996a — JWT decodes to
  role=service_role; this bypasses RLS and is never allowlistable
exit=1

=== CLEANUP ===
Committed-secret guard OK — 2178 tracked file(s) scanned, 0 findings
exit=0
```

The probe was a `.py` file specifically, so this transcript is also the
end-to-end proof for R1-1.

### Both fixes proved non-vacuous by mutation

| Mutation | Result |
| --- | --- |
| Add `.py` back to the binary denylist (undo R1-1) | **5 tests fail** |
| Restore `catch { continue }` (undo R1-2) | **3 tests fail**, exactly the fail-closed ones |
| Neither mutation applied | **43 / 43 pass** |

Guard suite grew from 35 to **43** tests. The six real tracked Python files are
asserted by name to be in scope **and** to scan clean, so the fix is pinned to
this repository's actual contents rather than to a synthetic case only.

### What round 1 did not change

The five allowlist entries, the recovery-crypto selection order and its fallback,
the CI wiring (still +8/−0 on `ci.yml`), the ten deletions, and every claim in
§7–§9 are untouched. Round 1 is confined to guard file-selection, guard read
failure, and count accuracy.
