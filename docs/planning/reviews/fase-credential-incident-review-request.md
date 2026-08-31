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
| `__tests__/security/committed-secrets-guard.test.ts` | New, **54** tests (35 at round 0; +8 round 1; +11 round 2). |
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
| `UNREADABLE_FILE` | a tracked regular file that cannot be read — **fails closed** (round 1) |
| `UNSUPPORTED_TRACKED_ENTRY` | a gitlink/submodule or unknown index mode — **fails closed**, not accessed (round 2) |

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
- **Selection is the Git index** (round 2): every tracked entry is inspected,
  dispatched on its recorded mode. No filename rule and no content heuristic
  decides scope. **2,455 tracked entries** currently in scope.

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

### `__tests__/security/committed-secrets-guard.test.ts` — 54 passed

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
| Unit | `npm test` | **0** | **371 files, 8493 passed, 11 skipped, 0 failed** (8474 round 0; +8 round 1; +11 round 2) |
| Build | `npm run build` | **0** | production build, middleware 74.5 kB |
| Whitespace | `git diff --check` | **0** | clean |
| Secrets guard | `npm run guard:secrets` | **0** | **2,455** tracked entries scanned, 0 findings |
| Actions guard | `npm run guard:actions` | **0** | 17 uses across 1 workflow file |
| Focused suites | `vitest run` guard + recovery-crypto | **0** | 70 passed (54 guard + 16 recovery-crypto) |
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

**Corrected counts.** At the time round 1 was written, every *current-head*
committed-secret scan count in this document read **2,178**. That figure was
correct for the round-1 head and is retained below as the round-1 row; it is
**not** the current figure. Round 2 changed what is counted — see §12.

| Point in history | Selected files | Note |
| --- | --- | --- |
| Round-0 transcript in §6 | 2,119 | Working tree mid-development, before the review-request file was staged. Historical; preserved verbatim |
| Reviewed head `bdc29012` | 2,120 | What the round-0 reviewer's checkout would report |
| Round-1 head `8117dfc7` | **2,178** | Denylist selection; +58 files vs round 0. Superseded by §12 |

### Re-run of the guard mutation proof at the round-1 head `8117dfc7`

> **HISTORICAL EVIDENCE — round 1, preserved verbatim.** Captured at the
> round-1 head, where selection was the binary denylist and 2,178 entries were
> in scope. Kept unchanged as the evidence the round-1 reviewer saw. Its counts
> are **superseded** by §12.

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

---

## 12. Independent review — round 2

One **additive** commit whose parent is `8117dfc7`. Neither `bdc29012` nor
`8117dfc7` is amended, rewritten, squashed or replaced, so the round-0 and
round-1 evidence above stands exactly as reviewed.

### Why the round-1 denylist was rejected

Round 1 replaced an extension allow-list with an extension **denylist**. That was
still a filename rule, and this repository defeats it with its own contents:
**eight tracked `.png` / `.ico` paths are plain ASCII text.**

| Path | What it actually contains |
| --- | --- |
| `lib/propuestas/assets/logos/fne-logo.png` | the literal text `404: Not Found` |
| `public/images/fne-logo.png` | the literal text `404: Not Found` |
| `public/children-collaboration-steam.png` | an ASCII error sentence |
| `public/favicon-32x32.png` | `data:image/svg+xml;base64,…` |
| `public/students-steam-collaboration.png` | `data:image/png;base64,…` |
| `public/favicon.ico` | base64 text |
| `public/favicon-fne.ico` | base64 text |
| `public/images/course-placeholder.png` | near-empty, no magic bytes |

Every one was skipped by extension at the round-1 head. A credential pasted into
any of them — or appended to one of those `data:` blobs — would have been
invisible to CI while sitting in `public/`, which is **served**. The bypass was
reproduced directly: a text file named `.png` containing a synthetic
`service_role` value passed the round-1 guard and fails the round-2 guard.

A content-sniffing heuristic ("does this look like text?") was rejected for the
same reason: it is a third filename-shaped rule, it can be dressed around, and it
makes coverage depend on a judgement made at scan time.

### The fixed boundary

Scope is now the **Git index**, and nothing else. `git ls-files -s -z` enumerates
every tracked entry NUL-safely, and each is dispatched on its recorded mode:

| Mode | Handling |
| --- | --- |
| `100644`, `100755` | Read as **bytes** and scan the complete content, decoded `latin1` (a byte-preserving 1:1 map, so a contiguous ASCII credential survives inside a real binary asset). Binary assets are read, not skipped. |
| `120000` symlink | Scan the **link-target text** via `readlinkSync`. The link is never followed, so nothing outside the repository is opened and a dangling target is irrelevant — the committed content *is* the target string. |
| `160000` gitlink, and any unknown mode | **Fail closed** with `UNSUPPORTED_TRACKED_ENTRY`, reporting only repository-relative path, mode, and a fingerprint of the path. The submodule is not accessed. |
| regular file missing/unreadable | `UNREADABLE_FILE` fail-closed, unchanged from round 1. Only the errno code, the repository-relative path and a path fingerprint — never the message, the absolute path, contents, or a value. |

`BINARY_EXTENSIONS` and `isScannableFile` are deleted. No allowlist, denylist,
MIME test, magic-number table or "probably text" heuristic replaces them.

**Unchanged documented limits.** This phase still does not detect credentials
that exist only in Git history, deliberately split or double-encoded values,
secrets compressed or encrypted inside a binary container, or provider-side
state. These are stated boundaries — none of them is a reason to skip a tracked
entry, and none is now used as one.

### Final tracked-entry count

**2,455**, recomputed at the round-2 correction head.

The number counts **entries in the Git index**, not "text files". It includes
every regular file at any mode, every symlink, and every gitlink — 222 PNGs, the
fonts, and the PDFs among them, all of which are now read rather than skipped.
It is therefore not comparable to the earlier figures, which counted a filtered
subset. The full-tree scan takes **≈1 second**.

| Point in history | Count | What it counted |
| --- | --- | --- |
| Round-0 transcript (§6) | 2,119 | Allow-listed extensions, working tree before the review request was staged |
| Reviewed head `bdc29012` | 2,120 | Allow-listed extensions |
| Round-1 head `8117dfc7` | 2,178 | Denylisted binary extensions |
| **Round-2 head (current)** | **2,455** | **Every tracked Git entry** |

### Round-2 mutation proofs

Applied to disposable copies, with the pristine guard restored after each (and
on interrupt, via an `EXIT` trap):

| Mutation | Result |
| --- | --- |
| Reintroduce a `.png` filename skip | **3 fail** — disguised-filename, real-binary-PNG, and the missing-file case (whose fixture is a `.png`) |
| Restore the old `catch { continue }` | **4 fail** — exactly the fail-closed cases (3 from round 1 + the round-2 one) |
| Make symlink handling follow the target | **3 fail** — exactly the three symlink cases |
| Real implementation restored | **54 / 54 pass**, guard OK over 2,455 entries |

### Tests

Guard suite **43 → 54**. New coverage proves a synthetic `service_role` value is
found in a `.py`, a plain-text `.png`, **real binary PNG bytes**, an extensionless
file, a dotfile, an unusual extension and a double extension; that a
credential-free binary PNG is *inspected* and reports nothing rather than being
skipped; that a tracked symlink is read as link text and **not followed** (proved
with an untracked target full of a synthetic value, which must not become a
finding); that a credential in the link target *name* is caught; that a broken
symlink is handled from its link text; that a gitlink fails closed without being
read; and that the eight text-disguised image files are in scope and scan clean.

Two contract tests pin what round 2 must not disturb: the five allowlist entries
are asserted **byte-identical** to `8117dfc7` by extracting the block from
`git show`, and `service_role` is re-proved to have no allowlist path.

### Unchanged surfaces

`.github/workflows/ci.yml`, `PROJECT_STATE.md`, `package.json` scripts, the five
allowlist entries, recovery-crypto selection and fallback, the ten deletions, and
every application, API, database, migration, RLS, provider and deployment surface
are untouched. `test:db` and `e2e` were not required and were not run.
