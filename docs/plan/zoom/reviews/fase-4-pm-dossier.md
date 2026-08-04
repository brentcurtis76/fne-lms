# Fase 4 (Zoom Z1c) — PM dossier for independent review

**Phase:** Z1c — Synthetic tenant + CI e2e (Zoom plan §15)
**Branch:** `feat/e2e-tenant` · **Head:** `88094a7` · **26 own (non-merge) commits**
**PR:** [#42](https://github.com/brentcurtis76/fne-lms/pull/42) (draft, not merged).
**CI green at the exact final head:** [run 30944197577](https://github.com/brentcurtis76/fne-lms/actions/runs/30944197577) — all 6 jobs, at `88094a7`. (Prior head `68adc80`: [run 30940946644](https://github.com/brentcurtis76/fne-lms/actions/runs/30940946644), also green.)

**Reviewer entry points:** this file + `docs/planning/reviews/fase-4-review-request.md` (executor-authored). Both are leads, never the boundary.

**⚠️ Use this diff command, not the obvious one:**

```
git diff origin/main...feat/e2e-tenant     # 29 files, +4003/−91 — Z1c's actual work
```

The branch absorbed `origin/main` twice mid-phase, so a diff from the phase base (`a1712f5..`) spans **95 commits** and drags in the entire parallel INSPIRA/pasantías track — several hundred files this phase never touched. The three-dot diff against current `origin/main` isolates Z1c. **Application source touched by the whole phase is exactly seven files**: `lib/utils/session-denials.ts` plus the six session GETs (`[id]/index.ts`, `reports.ts`, `materials.ts`, `attendees.ts`, `ical.ts`, `reports/[rid].ts`). Anything else in a wider diff is not this phase's.

---

## 1. Scope — authoritative

The GENERA itinerary does not carry Zoom phases, so this section is the scope authority, together with the §15 row.

**§15 Z1c row, verbatim:** `scripts/seed-e2e-zoom.js` (local-only guard); e2e CI job wired to local Supabase (db start + seed + env); blocking mock-mode specs: join-authz persona matrix, disclosure regressions, iCal content. **DoD:** Zoom e2e specs in the blocking gate.

**Critical scope note — the plan-era row was substantially obsolete before the phase began.** While Z1b was in review, the parallel INSPIRA/T2 track shipped an e2e seeding topology on `main`: a local-guarded seeder (`scripts/ci/seed-e2e.mjs`), a shared fixture file consumed by both seeder and specs, a mandatory-spec no-skip guard (`scripts/ci/e2e-mandatory.mjs`), and a fully wired Gate 4 job. Z1c-1 was therefore dispatched as a **reconciliation-first** chunk. The reconciliation (§1–5 of the review-request, commit `5e9d935`) classified every plan-era scope item as ALREADY EXISTS / EXTEND / STILL TO BUILD / OBSOLETE. **`scripts/seed-e2e-zoom.js` as a standalone seeder was ruled OBSOLETE** and survives as a module (`scripts/ci/seed-e2e-zoom.mjs`) invoked by the shared seeder. A reviewer checking scope fidelity against the §15 row alone will find divergence; that divergence is deliberate, PM-ruled, and recorded here.

### Per-chunk scope

| Chunk | Commits | Scope |
|---|---|---|
| **Z1c-1** | `5e9d935`…`566fa5b` (4) | Reconciliation; fixture personas for the join-authz matrix; `seed-e2e-zoom.mjs` (growth community, provisionable session, facilitator); login proof for every persona |
| **Z1c-1 r1** | `88dc0f9` (1) | PM finding: a false anti-drift claim in `tests/e2e/helpers/auth.ts` (comment-only fix) |
| **Z1c-2** | `2b18a8a`…`18b32ef` (9) | `FIXTURE_KEYS` completeness assertion; `ZOOM_MODE=mock` + `NEXT_PUBLIC_BASE_URL` into the CI heredoc; linked session + both report visibilities + attendees; the three blocking spec families |
| **Z1c-3** | `b8e9e30`…`42d7192` (6) | F1 (ambiguous PostgREST embed, application fix); `/attendees` into the disclosure consumer set; the unit blind-spot answer; F2 (ESLint ignorePatterns) |
| **Z1c-4** | `eb32e3e`…`68adc80` (5) | **Sol remediation.** Existence oracle closed on five session GETs via a shared denial; blocking server-side mock-mode proof (`host_sync` driven through a real `next start`, two negative controls); PR opened, CI green |
| **Z1c-4 r1** | `6e18ed3`…`88094a7` (4) | PM finding: a **sixth** consumer (`reports/[rid].ts`) carried the same oracle twice. Both collapsed; the report fetch reordered below `canViewSession`; helper renamed `session-not-found.ts` → `session-denials.ts` |

**Out of scope, deliberately:** Q1 meeting rows (`zoom_meetings` / `session_meetings_public`) — the PM verified nothing in this phase needs them, since `has_meeting`/`join_path` derive from the legacy `meeting_link` column and no API route reads the projection; that surface is Z2's. Also out: the 403/404 question (§6 below), any `lib/zoom/**` change, any migration, tsconfig/ESLint coverage widening.

---

## 2. Chunk → commit map

Base `a1712f5` → head `42d7192`, 25 commits. Two merges of `origin/main` (`2b18a8a`, `b8e9e30`), both verified docs-only at review time.

Key commits: `5e9d935` reconciliation · `3034c28` personas + two-pass seeder · `e4e4b93` login proof · `88dc0f9` r1 comment fix · `812ee74` completeness assertion · `97e787b` ZOOM_MODE · `6414c93` linked session/reports/attendees · `1459530` NEXT_PUBLIC_BASE_URL · `5b452ca` join-authz · `763dfaa` disclosure · `34167cc` iCal · `29fc036` **F1 application fix** · `5488087` `/attendees` coverage · `167bbd7` unit blind-spot · `a8cd363` F2 · `18b32ef`/`42d7192` review-request.

---

## 3. File inventory by risk

**HIGHEST — application source (one file, one line).**
`pages/api/sessions/[id]/attendees.ts` — the embed at `:118`→`:126` changed from `profiles(...)` to `profiles:user_id(...)`. This is the only application-source change in the entire phase.

**HIGH — what CI seeds and how the gate is configured.**
`scripts/ci/e2e-fixtures.json` — 7 personas, 2 schools, the `zoom` domain block (community, 2 sessions, facilitators, attendees, 2 reports).
`scripts/ci/seed-e2e.mjs` — two-pass ordering (users → zoom domain → roles, forced by FK direction); `ensureRole` converges an existing row onto the fixture spec instead of only reactivating it.
`scripts/ci/seed-e2e-zoom.mjs` — the zoom domain graph. No local-only guard of its own (PM-accepted, §5 dev 3).
`.github/workflows/ci.yml` — two env lines in the existing heredoc (`ZOOM_MODE=mock`, `NEXT_PUBLIC_BASE_URL`).
`scripts/ci/e2e-mandatory.mjs` — three append-only spec registrations.

**MEDIUM — the test surface.**
`tests/e2e/helpers/auth.ts` — `FixtureKey`, `FIXTURE_KEYS`, the module-load completeness assertion, `apiContextFor`.
`tests/e2e/helpers/session-personas.ts` — the three tiers + `assertTierPartitionIsTotal()`.
`tests/e2e/{zoom-join-authz,session-disclosure,session-ical}.spec.ts` — 19/18/8 tests.
`tests/e2e/ci-fixture.spec.ts` — login block iterates `FIXTURE_KEYS`.
`__tests__/api/sessions/attendees.test.ts` — recording double + query-shape assertions.

**LOW.** `.eslintrc.json` (2 lines), the review-request, the plan ledger.

---

## 4. Invariants, with entry points for verifying each

1. **Authorization is `canViewSession`** — `lib/utils/session-policy.ts:92-123`. Defended by `zoom-join-authz.spec.ts`. Bite-proven (probe A).
2. **Disclosure is strictly narrower than access** — `lib/utils/session-disclosure.ts:25` (`canViewRestrictedReports` = admin ∪ facilitator), `:52` (`canViewParticipantEmails`), `:164-165` (`has_meeting`/`join_path`), `:175`/`:206` (`PROFILE_EMBED_KEY` redaction). Defended by `session-disclosure.spec.ts`. Bite-proven (probes B, C).
3. **Denial carries no existence oracle at the interstitial** — `lib/utils/session-meet-access.ts:39` (`NOT_FOUND` shared constant), `pages/meet/session/[id].tsx:133-135`. Defended by the masked-body comparison in `zoom-join-authz.spec.ts:118-120`. **Note the API layer does NOT share this property — see §6.**
4. **Artifacts leaving the platform carry platform links, not raw meeting links, and gate ATTENDEE e-mails** — `pages/api/sessions/[id]/ical.ts:91,95`, `pages/api/sessions/ical.ts:182`. Defended by `session-ical.spec.ts`. Bite-proven (probe D).
5. **A deactivated role grants nothing** — `is_active` filtering in `getUserRoles`/`getHighestRole`. Defended by the `inactiveConsultor` persona.
6. **Fixture roster cannot drift from the specs** — `tests/e2e/helpers/auth.ts` module-load assertion, both directions.
7. **Persona tiers must partition the roster** — `session-personas.ts:88-107`, enforced at module load.
8. **A green e2e gate means specs ran** — `scripts/ci/e2e-mandatory.mjs` no-skip guard.

---

## 5. Accepted deviations — challenge these rulings

Z1c-1 deviations 1–9, Z1c-2 deviations 1–5, Z1c-3 none. The ones a reviewer should press hardest:

- **`ensureRole` convergence (Z1c-1 dev 1)** — changes another track's helper so an existing role row is converged onto the fixture spec. PM re-executed the fail-on-old: the pre-Z1c seeder leaves a drifted `is_active` at `true`, silently granting the access the fixture exists to deny. **Accepted.**
- **No local-only guard inside `seed-e2e-zoom.mjs` (Z1c-1 dev 3)** — it never reads env, never builds a client, never chooses a host, has no `main()`/shebang; the caller is the guard. **Accepted** — a reviewer may reasonably argue a second guard is cheap insurance.
- **Global consultor seeded with `school_id` NULL (Z1c-1 dev 5)** — justified against `create-user.ts:146-159` and `assign-role.ts:440-457`, which preserve `school_id` verbatim precisely so scoped and global consultors stay distinguishable. **Accepted.**
- **GC member is `lider_comunidad`, not a plain member (Z1c-1 dev 4)** — `assign-role.ts:101-102` nulls `community_id` for every other role, so a non-leader member carrying a community is not an app-produced shape. **Accepted, with the gap declared.**
- **`NEXT_PUBLIC_BASE_URL` added beyond the prompt's scope (Z1c-2 dev 2)** — `getAppBaseUrl` (`lib/utils/app-url.ts:91-102`) throws in production rather than trusting the Host header, and the gate serves a production build. **Accepted; this is the first concrete demonstration of the failure mode behind standing open item ①.**
- **Only two of three named session consumers driven (Z1c-2 dev 3)** — the third was F1-broken; encoding a 500 as expected behavior would have been wrong. **Accepted, and closed in Z1c-3.**
- **PM ruling, deviation-1 of Z1c-2: the PM's own tier table was WRONG.** The Z1c-2 prompt placed `consultorGlobal` in a tier receiving `facilitators_only` reports. `canViewRestrictedReports` is `admin || isFacilitator`. The executor asserted the PM's model, went red against the application, and followed the code. **PM conceded in full**; the resulting `PRIVILEGED` / `REPORT_PRIVILEGED` split is better than what was specified.

---

## 6. Open items and residual risks

- **F1 is fixed; §24 is NOT.** `pages/api/admin/networks/schools.ts:278` has the same ambiguous-embed class over `user_roles` (2 FKs into `profiles`), but destructures only `{ data }` and never checks `error`. PM reproduced with a negative control: exact embed → HTTP 300 `PGRST201`; disambiguated → 200. So `data` is null, `if (activeSupervisors && …)` is falsy, and the handler proceeds to DELETE the `red_escuelas` assignment. **The active-supervisor protection has never fired.** This fails *open* where F1 failed closed. Reported, deliberately not fixed (out of scope). `schools-broken.ts:279` is a byte-identical copy. **Escalated to Brent.**
- **403/404 existence oracle — RESOLVED in Z1c-4/r1, not carried.** It was PM-ruled out of scope; the independent review overturned that and the owner directed the fix. All six session GET consumers now answer a shared `sendSessionNotFound()`, and `reports/[rid].ts` additionally answers a shared `sendReportNotFound()`. **Two things a reviewer should press:** (a) the report fetch had to move *below* `canViewSession` — previously a session-denied caller still learned whether a report existed, so the report id was the oracle the session id no longer was; that ordering is now an invariant stated in the helper's header and is the subtlest part of the change; (b) the two denials are deliberately **not** collapsed into each other (session denial says `'Sesión no encontrada'`, report denial says `'Informe no encontrado'`, both 404) on the argument that a caller reaching the report check has already been told the session exists. Judge that argument.
- **One user-visible product change, intended.** A user denied a specific session now sees "Sesión no encontrada" rather than "Acceso denegado" (`pages/consultor/sessions/[id].tsx:162,167` — the only session-GET consumer in the app that branches on status, PM-verified by independent sweep). Its `forbidden` branch stays reachable via the roleless 403.
- **The unit layer cannot catch a PGRST embed-shape error behaviourally** — argued at length in `attendees.test.ts`; caught instead as a property of the query string the handler builds. A reviewer may judge that regex as encoding a DB fact it cannot verify.
- **Scrutiny carried from the executors:** UUID masking in the denial comparison could mask a UUID-shaped leak; `.ics` assertions only ever see one origin; a persona placed in the *wrong* tier partitions cleanly and only the bite proofs would catch it; `toBe(ATTENDEE_EMAILS.length)` couples the spec to fixture count.
- **Shared local Supabase stack** — one stack per project id across all worktrees. A concurrent session's `db reset` zeroed every table during PM verification (third occurrence this phase, first to hit the PM). Concurrent `next build` runs across tracks also make gate timings unreliable. Recommendation: isolate the stack for Z2.

---

## 7. What the PM verified — and what it did NOT

**Independently re-executed by the PM** (not read from reports):
- All gates at every chunk head: type-check, lint, `npm test`, build, `test:db`, and the full mandatory e2e set as CI invokes it, plus the no-skip `--check`.
- Final head `42d7192`: type-check 0 · lint 0 · **3994/3994 in 253 files** · build 0 · **pgTAP 171/171 across 7 files** on a from-scratch reset · **e2e 58 passed across 5 mandatory specs, no skips**.
- **Bite proofs A and C re-executed and reproduced exactly** (probe C: 3 failed/11 passed; probe A: 13 failed/28 passed), with the mutation asserted applied before trusting either result.
- **F1 fail-on-old re-executed** — see §8.
- Seeder idempotency: double-run row-level snapshots identical, twice (Z1c-1 and Z1c-2), with the backing unique constraints inspected.
- Both directions of the `FixtureKey` completeness proof; the JSON-only-persona probe that produced the r1 finding; the confirmation that `tsc` also passes in that state.
- F1 reproduced against live PostgREST with a negative control; the embed-key preservation proven empirically; §24 reproduced with a negative control; F1's origin traced to `08bde65` via `git log -S`.
- Blast-radius enumeration: every `profiles(` embed under `pages/api/sessions/` and all 24 multi-FK tables.

**Added in Z1c-4 and r1, all re-executed by the PM:** the oracle fail-on-old on the five GETs (endpoints reverted, revert asserted applied first ⇒ **6 failed / 17 passed**); the sixth consumer's fail-on-old in both layers (**e2e 13 failed / 18 passed**, **unit 8 failed / 11 passed**); the frontend 403/404 sweep re-run independently rather than accepted; CI verified green at both heads via `gh` at job level.

**NOT independently verified by the PM — highest-yield hunting ground:**
- **Bite proofs B and D** (participant-email gate; iCal `join_url`) — accepted as reported in Z1c-2, never re-executed by the PM. **Nor were A–D re-executed by the PM in Z1c-4**, where the executor re-ran them against a changed baseline (A 16F/34P, B 7F/43P, C 3F/47P, D 4F/46P) — those four figures are reported, not verified.
- **The mock-mode proof's internals.** The PM read the spec and verified its negative controls assert config-shaped *and* not-network-shaped failure, and confirmed the `resolveZoomMode`/`readCredentials` claim structurally — but did **not** re-execute the three-server matrix (`mock` / `bogus` / `''`) itself. That table is the executor's.
- **The two denial messages differ** (`'Sesión no encontrada'` vs `'Informe no encontrado'`). The PM accepts the argument that reaching the report check implies the session is already known to exist — but this is a reasoning acceptance, not a proof, and it is the natural place for a residual oracle to hide.
- **Port fragility.** The mock-mode negative controls spawn real servers on ports 3101/3102. A collision on a busy runner fails the gate for an unrelated reason. Not exercised under contention.
- **The mock-mode proof depends on `zoom_hosts` being empty.** A future fixture seeding an active host flips `host_sync` to "refuses" (`host-sync.ts:216`) and fails the spec — correctly, but confusingly. Documented in the spec header; nothing enforces it.
- **`ABSENT_SESSION_ID` / `ABSENT_REPORT_ID`** are guarded at module load against the fixture file only, not against rows a future spec creates at runtime.
- Playwright specs are outside `tsc` (they are linted); `scripts/ci/*.mjs` is outside **both**.
- Other consumers of the disclosure helper (`cron/session-reminders`, the batch and series iCal routes) are not driven end-to-end.
- Production behaviour of any of it — verified locally and in CI only.
- The iCal assertions only ever observed `http://localhost:3000` as the origin.
- Playwright specs are outside `tsc` (they are linted); `scripts/ci/*.mjs` is outside **both**.
- The seeded tenant is exercised only through the surfaces these specs drive; other consumers of the disclosure helper (`materials`, `reports/[rid]`, `cron/session-reminders`) are not driven end-to-end.
- Production behavior of the F1 fix — verified locally only.

---

## 8. F1 fail-on-old (PM re-execution)

`attendees.ts` reverted to the pre-fix source (bare `profiles(` re-confirmed at `:118` before trusting the run), rebuilt, `session-disclosure.spec.ts` run: **5 failed / 13 passed** — matching the executor's reported figures exactly, and the five failures are precisely the `/attendees` assertions. Restoration green was established by the PM's full-suite run at head `42d7192` earlier in the same session: **58 passed across 5 mandatory specs**, of which `session-disclosure.spec.ts` contributes 18. `attendees.ts` restored; `git status` clean apart from this dossier.

**F2 verified empirically in the same pass**, which is the only way to verify it: the failing run above wrote **5 trace `.js` files** into `playwright-report/`, and `npm run lint` then exited **0**. Before the `ignorePatterns` fix those same artifacts produced 77 `rules-of-hooks` errors. Note that F2 does **not** reproduce after a green run — a passing run writes no `.js` at all — which is why it survived three chunks undetected and why it will now hit every executor that runs the bite proofs this phase made mandatory.

---

## 9. Exact local gate commands

```
npm run type-check
npm run lint
npm test
npm run build
npm run test:db                      # requires: supabase start && supabase db reset
node scripts/ci/seed-e2e.mjs         # requires local .env.local pointing at 127.0.0.1:54321
CI=true npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium
node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json
```

Baselines to reproduce at head `88094a7`: **4212/4212 in 257 files** · **pgTAP 335/335 across 8 files** · **e2e 75 passed, 6 mandatory specs, no skips**. CI reports the same figures independently.

**Delta accounting** (the earlier baselines were 3994/253, 171/7, 58/5 — most of the growth is not this phase's): unit +216 of +218 arrived with the two `origin/main` merges (four pasantías suites), only +2 are Z1c's; pgTAP 171→335 is **entirely** the merged `040-email-marketing-rls.sql` — the phase touched no SQL, verifiable with `git diff --name-only 6e18ed3..88094a7 | grep -E '\.sql$'` returning nothing; e2e 58→75 is all Z1c (+4 mock-mode, +4 five-GET comparisons, +8 sixth-consumer, +1 net from earlier rounds).

**Local-run caveat.** `zoom-mock-mode.spec.ts` spawns `next start`, which needs a production `.next`. Playwright's local `webServer` is `npm run dev:unsafe`, and `next dev` overwrites `.next` — so running that spec after a dev server has touched the build fails with "server on port 3101 never became ready". Run it as CI does (`CI=true`, after `npm run build`). This cannot occur in CI, which uses `npm run start`.
