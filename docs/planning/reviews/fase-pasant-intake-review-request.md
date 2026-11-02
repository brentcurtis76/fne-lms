# Review request — PASANT-PARTICIPANT-INTAKE (DB-01 + APP-01)

## Current release status (2026-10-30) — read this first

The sections below are the historical record. Where they say otherwise, this section is current.

- **Corrections F01–F04: accepted locally** on corrections source freeze r2 (PM: `LOCAL_CORRECTIONS_ACCEPTED`). The independent FINAL evidence review **APPROVED** local acceptance, and its condition E-1 (record of the scoped `lint:testid` command) is closed.
- **Not whole-unit accepted, not release-ready.** The corrections are not committed and nothing is published. HEAD `ca27b542` is the earlier local commit of the original unit.
- **Release authority (Brent, 2026-10-30, "let's get it into production"):** prepare a reviewed local commit, publish the feature branch and a draft PR with previews disabled, run the required CI, and prepare the supported Publish release. Production database changes go only through Publish. Brent controls the final Publish and merge. None of these steps has been performed yet.
- **Local evidence (r2):**
  - focused Vitest 287/287;
  - full Vitest 17 950/17 950 across 8 shards;
  - type-check, zero-warning lint plus guards, and build plus the price guard all PASS;
  - scoped `lint:testid` PASS; the repo-wide baseline of 47 errors and 2 540 warnings stays FAIL_BASELINE;
  - real-stack browser/API 104/104, with 0 unexpected, skipped or flaky;
  - pgTAP 115 140/140 and 114 176/176, with 0 assertion failures in 8 115. The aggregate still **FAILS** because 002 ran 113 of 137 without Supabase CLI migration history; that is not a pass;
  - manual UI by PM on the r2 build: F01–F04 PASS on desktop and in 322×728 mobile emulation. Screenshots were not saved as files, and the manual pass had no admin journey, mobile submission or finalize; the 104-test suite covers those.
- **Migrations (both additive, Publish only):** `20261028020000_pasantias_participant_intake.sql` and `20261030120000_pasantias_nomina_school_funding_focus.sql`.
- **C8 release prerequisite (not executed):** the query in `db-contract-corrections-01.md` §7 (participants whose roster has no school-funding row) must return 0 before any non-local release. Otherwise the release stops and PM asks Brent. No production reads or writes have been done.
- **Notice (N5): settled.** Brent approved the purpose text on 2026-10-28 (notice version `pasant-intake-2026-10-v2`). It is a content approval, not a claim of legal sufficiency.
- **Pending:**
  - CI on the PR, including the normal CLI `supabase test db`;
  - the reviewed local commit, the branch and draft PR, and Publish preparation;
  - C8;
  - Brent's final Publish and merge;
  - Brent's brand judgement on F02 at preview (non-blocking).
- **Non-blocking backlog:** DB T1 and T2; review items T-a, T-b, R-1, FX-4 and FX-5. D-1 is corrected below.

## Branch and base

- **Worktree:** `/home/brent/Projects/pm-workflow/worktrees/genera-pasant-intake`.
- **Branch:** owned by the PM; the app author ran no Git.
- **Base:** `bd19809c29bb01f54f757c605f811d778342c915`, as stated in the order and not verified by the author.
- **Commits:** 0, and none claimed. A local commit is pending the cumulative FINAL review. *(Superseded: HEAD `ca27b542` is the local commit of the original unit; the F01–F04 corrections are not yet committed — see "Current release status".)*
- **Source freeze:** r5, with identical identity before and after the runtime.
- **State:** *(historical, original unit on r5 — see "Current release status")*
  - local runtime PASS, except the retained pgTAP 002 CLI-history gap;
  - UI acceptance is `UI_BLOCKED_TOOL_DISABLED`; *(superseded 2026-10-30: done locally for the corrected r2 build)*
  - the cumulative FINAL review is pending;
  - no CI run, not deployed, not ready for human acceptance.

## Objective and scope

**Objective:** a private, link-based roster intake for the January 2027 pasantía. FNE creates a link per school and
program. The school coordinator enters one ficha per traveller, edits, and sends. Nothing is mailed: "sent" means
available to the FNE admin.

**In scope:**
- the frozen DB contract (DB-01, a separate author);
- the coordinator page, the API and the admin page, plus the Sidebar entry;
- unit, API and page tests;
- the real-stack Playwright spec, added to the mandatory e2e list;
- docs.

**Out of scope:**
- participant deletion (N4);
- legal sign-off of the notice wording (N5); *(the wording itself is now settled: Brent approved v2 on 2026-10-28; no legal-sufficiency claim)*
- production, Publish and mail;
- middleware, auth or config changes;
- new dependencies.

## Files by risk (APP-01, all new unless marked)

**High — security boundary / data access**
- `pages/api/pasantias/participants/index.ts`, `[id].ts`, `finalize.ts`: the coordinator API, authenticated by link.
- `pages/api/admin/pasantia-participants/index.ts`, `[rosterId].ts`: the admin API (create, rotate, revoke, read).
- `lib/pasantias/participants/server.ts`: the shared preamble (method, rate limit, `Intake` header, size), roster and
  participant reads, RPC calls, and the exact refusal mapping.
- `lib/pasantias/participants/admin.ts`: the admin guard (checkIsAdmin, then the forced-password verdict) and the
  token-writing helper.
- `lib/pasantias/participants/token.ts`: token generation, SHA-256 and the strict header parser.

**Medium — validation and UI state**
- `lib/pasantias/participants/validation.ts`, `rut.ts`, `dates.ts`, `form.ts`, `client.ts`, `types.ts`, `notice.ts`.
- `pages/pasantias/nomina.tsx`: the coordinator page (save, retry, replay and stale handling, send, reopen).
- `pages/admin/pasantia-participants.tsx`: the admin page.
- `components/pasantias-intake/*.tsx`: ParticipantForm, ParticipantList, IntakeShell, RosterStatusBadge,
  AdminRosterParts.

**Low — shared files, one edit each**
- `components/layout/Sidebar.tsx` (modified): one child under "Personas".
- `scripts/ci/e2e-mandatory.mjs` (modified): one spec appended.
- `PROJECT_STATE.md` (modified): one entry prepended.
- `vercel.json` (modified): one key, `"feat/pasant-intake": false`, in `git.deploymentEnabled`.

**Tests and docs**
- `__tests__/lib/pasantias/participants/{rut,dates,validation,token,client-form}.test.ts`, plus the
  `fake-supabase.ts` helper (not a test file).
- `__tests__/api/pasantias-participants.test.ts` and `__tests__/api/admin/pasantia-participants.test.ts`.
- `__tests__/pages/pasantias-nomina.test.tsx` and `__tests__/pages/admin/pasantia-participants.test.tsx`.
- `tests/e2e/pasantias-participant-intake.spec.ts`.
- `docs/plan/pasantias-participant-intake-20261027.md` and this file.

## Test evidence

The PM ran this locally on 2026-10-28 against source freeze r5, on a synthetic, isolated local stack. The authors ran
nothing. The evidence lives in the management packet outside the repo: `evidence-index.json`, `full-unit-summary.json`,
`real-runtime-summary.json` and `run/20261028T034015Z/pgtap-pm-reconciliation.json`.

| Gate | Result |
|---|---|
| Focused unit set | 1 200 / 1 200 PASS |
| Full Vitest (`npm test`, 8 shards) | 17 869 passed, 0 failed, 0 pending, 536 files. Zero skips |
| `type-check` | PASS |
| `lint` (zero warnings) | PASS |
| `lint:testid`, the 7 new UI files | zero-warning PASS |
| `lint:testid`, full repo | **retained FAIL baseline**: 47 errors, 2 540 warnings, pre-existing; disposition in the packet's `review-testid-baseline.md`. Not a pass |
| `guard:browser` · `guard:migrations` · `guard:secrets` | PASS |
| `build` plus the price guard | PASS |
| Stubbed browser | 33 PASS |
| Real local API/DB browser | 96 expected, 0 skipped, 0 flaky, 0 failed |
| — `pasantias-participant-intake.spec.ts` | 18 (journey, revoke/rotate, isolation, 4 races, roles plus forced password plus PostgREST denial, leaks ×2, keyboard 1366/390, time zones, 8 kB plus no-store, 429) |
| — regressions | `pasantias-flow` 22, `pasantias-page` 19, `pasantias-form` 14, `pasantias-leads-admin` 3, `ci-fixture` 20 |
| pgTAP 114 (DB-01) | 176 / 176 |
| pgTAP, all 77 files | **76 complete; not a full pass.** 002 stops at 113 of 137 because it needs migration history from the normal Supabase CLI flow. No history was fabricated. Aggregate exit 1. The full CI gate is still required |
| Migration apply on a synthetic clone | PASS |
| Network audit | PASS |
| Teardown | own containers stopped, network removed, no listeners, old stack unchanged |
| CI · cumulative FINAL · UI acceptance | NOT_RUN · pending · `UI_BLOCKED_TOOL_DISABLED` *(historical, r5; superseded 2026-10-30: FINAL approved local acceptance and manual UI done on the corrected r2 build; CI still not run — see "Current release status")* |

**First failures, preserved and fixed after review (product behaviour unchanged by each)**
1. **Focused r1: 41 failures out of 1 197.** Two test files used a 45-character synthetic token, while a real token is
   43 characters. The product correctly answered 401 or "missing link". The fixtures were corrected and guarded.
   Focused r2 then passed 1 200 / 1 200.
2. **Type r1: 23 TS diagnostics.** With `strict: false`, `!x.ok` doesn't narrow the boolean-discriminant result
   types. The five routes now use explicit `=== false` / `=== true` guards. Type r2 and r3 PASSED.
3. **Unit-4 r1: 1 678 / 1 680.** The existing ledger-inventory guard refuses `.from(<imported constant>)`. The two
   admin routes now use the literal `'pasantias_intake_rosters'`. Unit-4 r2 then passed 1 680. Shards 1–3 ran before
   this change; their equivalence rests on the packet's `review-app-inventory-repair-r1.md` §5 plus focused-r4 and
   source-scanners.

**Earlier source-review rounds:**
- **NB2:** dietary control characters are refused, and lengths are counted in code points.
- **NB3:** a replay or no-op is never reported as a new save.
- **NB4:** a pinned assertion that rotate and revoke touch only link fields.
- **F-1:** labels match Brent's wording exactly.

**Portable commands**

```bash
npm run type-check && npm run lint && npm run lint:testid
npx vitest run __tests__/lib/pasantias/participants __tests__/api/pasantias-participants.test.ts \
  __tests__/api/admin/pasantia-participants.test.ts __tests__/pages/pasantias-nomina.test.tsx \
  __tests__/pages/admin/pasantia-participants.test.tsx
npm test
npm run build && npm run guard:browser && npm run guard:migrations && npm run guard:secrets
npm run test:db          # Supabase CLI + Docker; 114-pasantias-participant-intake.sql
npx playwright test tests/e2e/pasantias-participant-intake.spec.ts   # seeded local stack, next start
node scripts/ci/e2e-mandatory.mjs --list
```

## Scrutinize hardest

1. **Replay and STALE semantics in `pages/pasantias/nomina.tsx`.** After a replayed create, or a STALE edit, whose
   stored values differ from the draft, the page converts the editor into an edit of the stored row and keeps the typed
   values. Check that intent is never silently lost and never silently applied.
2. **The roster lookup versus the RPC lock.** The API resolves the roster on the app clock to learn the program. The
   write is still decided by the RPC under its lock on the DB clock. The post-write read uses `findRosterByHash` with
   no liveness filter, so a revoke that lands just after a committed write still reports the stored state. Confirm
   that is the right trade.
3. **The admin participant count embed.** `participants:pasantias_intake_participants(count)` is PostgREST
   embedded-count syntax. A fake cannot verify it; only the e2e journey asserts `participantCount`. That journey passed
   locally, but CI hasn't run it.
4. **The keyboard e2e.** It depends on Chromium/Linux ArrowDown changing a closed `<select>`, and on an exact tab order
   (fields, then the five dietary boxes, then cancel, then save). Both viewports passed locally. It is brittle by
   nature, but deliberate.
5. **The 8 kB limit is enforced twice.** The route `config` makes Next answer a plain 413 before the handler runs; the
   in-handler check covers mocked tests and any parser bypass. Confirm Next's 413 body (not JSON with our code) is
   acceptable.

## Corrections 01 (F01–F04), 2026-10-30 — authored, NOT_RUN

**Base:** HEAD `ca27b542…`, as stated by PM; the app author ran no Git. **Scope:** F01 school-level funding, F02 neutral «Obligatorio», F03 exact travel-dates notice, F04 Todos. **Contracts:** FIRST corrections §§3–9 (C1–C9) and `db-contract-corrections-01.md` (frozen). Out of scope: participant deletion, new school fields, production.

**Files (app):**
- **High risk:**
  - `lib/pasantias/participants/server.ts`: corrections RPCs, `schoolFunding`, effective focus, no reads of the copied funding columns;
  - `pages/api/pasantias/participants/{index,[id],finalize}.ts`, plus the new `school.ts`;
  - `pages/api/admin/pasantia-participants/[rosterId].ts`;
  - `lib/pasantias/participants/admin.ts`: the funding embed.
- **Medium:**
  - `validation.ts`, `form.ts`, `types.ts`, `dates.ts`;
  - `pages/pasantias/nomina.tsx`;
  - `components/pasantias-intake/{ParticipantForm,ParticipantList,AdminRosterParts,SchoolDataForm}.tsx`;
  - `pages/admin/pasantia-participants.tsx`.
- **Tests:**
  - `__tests__/lib/pasantias/participants/{validation,client-form,dates,school-funding}.test.ts`, plus `fake-supabase.ts` (`.in()`);
  - `__tests__/api/{pasantias-participants,admin/pasantia-participants}.test.ts`;
  - `__tests__/pages/{pasantias-nomina,admin/pasantia-participants}.test.tsx`;
  - `tests/e2e/pasantias-participant-intake.spec.ts`.

**Test evidence:** none; every suite is NOT_RUN. PM runs the capped validators. FIRST §8 lists the required gates; 114 must stay 176/176, and 115 is new.

**Scrutinize hardest:**
1. **School-draft sync in `nomina.tsx`.** The effect follows the saved funding unless the coordinator has unsaved choices. Check that a STALE conflict keeps what was typed, and that a reply carrying a newer roster never overwrites it.
2. **Finalize gate ordering** (live lookup, then the funding read, then the RPC). Race-freedom rests on the DB contract: a funding row can't be deleted, and every funding change bumps the roster version.
3. **The A1/A2 static scans.** They are text scans over the intake app roots only. They prove the absence of mentions and direct writes, but can't see a dynamic table name.
4. **The admin embed shape.** `school_funding:` may come back as an object or an array depending on PostgREST. The mapper handles both, but only the real-stack journey proves it.
5. **Keyboard e2e.** It now relies on ArrowDown ×5 reaching "Todos" on a closed `<select>`.

### Corrections remediation round 1 (FINAL r1: FX-1, FX-2, FX-3) — authored, NOT_RUN

Files: `pages/pasantias/nomina.tsx` and `__tests__/pages/pasantias-nomina.test.tsx` only.

- **FX-1 (test defect).** The "first save … unlocks Pasantes" test asserted `intake-add` enabled while also expecting the automatically opened create ficha, which disables that button by design. It now asserts that:
  - the ficha opens by itself;
  - the school gate and the hint are lifted;
  - "Agregar persona" is disabled only because of the open ficha, and is enabled after cancelling the clean ficha.

  The automatic first ficha is unchanged, and the e2e journey depends on it.
- **FX-2 (PM option (b)).** School save, participant save and finalize are now mutually serialized.
  - **Handler guard:** each handler first checks `anyWriteInFlight()` (`savingRef || schoolSavingRef || finalizingRef`). Each ref is set synchronously before the first await, so a second action in the same event turn is stopped too.
  - **Matching disabled UI:** a native `<fieldset disabled>` around the school section (while a ficha save or send is in flight) and around the ficha (while a school save or send is in flight). "Agregar persona", "Editar" and "Enviar" are disabled for any write in flight.
  - **Unchanged:** cross-tab optimistic versions (STALE), and the two independent draft contents.
  - **New page tests, with gated replies:**
    - a participant save pending blocks the school save;
    - a school save pending blocks the participant save and finalize;
    - a finalize pending blocks the school save;
    - two different writes in one event turn send exactly one request;
    - a double click on the school save sends one request.

    Each test asserts the disabled UI, that no request is dispatched, and that the blocked action works after the first settles. The participant-save-pending and school-save-pending tests also force a form submit; the other three do not. *(D-1 corrected 2026-10-30: this line previously said every test included a forced submit.)*
- **FX-3.** New page tests for the draft-follow effect: a clean draft follows newer `schoolFunding` from a participant-save reply and from a finalize reply (state `stored`); a dirty draft is kept (state `unsaved`).

FX-4 and FX-5 are kept as optional UI observations; no change was made.

## Known limitations

- The notice wording needs human or legal review (N5) and makes no claim of legal sufficiency. *(Settled: Brent approved the v2 purpose text on 2026-10-28; still no legal-sufficiency claim.)*
- No participant removal (N4).
- `X-Forwarded-For` is honoured by the existing limiter. The e2e uses that to model distinct clients, which also shows
  the limiter can be bypassed by spoofing the header. That weakness already existed and isn't changed here.
- `\s` in the admin's ROSTER_EXISTS lookup can differ from Postgres `[[:space:]]` for exotic whitespace. The 409 is
  still returned, without an id.
- Name validation uses explicit Latin ranges, not `\p{L}`, so older browsers work. Non-Latin scripts are refused.
- **pgTAP 002** isn't a local pass: it needs migration history from the normal Supabase CLI. The full CI gate (gate 3)
  is still required.
- **Full-repo `lint:testid`** keeps its pre-existing baseline of 47 errors and 2 540 warnings. Only the 7 new UI files
  were held to zero.
- **UI acceptance** at 390 and 1366 px hasn't been done (`UI_BLOCKED_TOOL_DISABLED`). Passing Playwright doesn't count
  as UI acceptance. *(Superseded 2026-10-30: PM's manual UI pass on the corrected r2 build covered F01–F04 on desktop
  and in 322×728 mobile emulation — see "Current release status" for its limits.)*
- **Optional review notes left as is:** F-2 (Next's own 413 has no `no-store`) and F-3 (admin client creation outside
  `try`). Both are Low and optional.
