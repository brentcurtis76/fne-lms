# W-B1b-01 — executor review request

Executor: Claude Code (`bounded-executor` 1.1.0 packet, COORDINATED). Model claude-opus-5.
PM_REVIEWER: Codex. Date 2026-09-09 America/Santiago.
Root `/Users/brentcurtis/dev/wt/b1b-current`, branch `fix/horas-rep`, base
`b17a68393dc7cd3a6ccfed9fffa3252c7e97fb46`. Continuation execution 1, remediation rounds 0.

This is the executor report at the NEW path mandated by order revision 3.
`docs/planning/reviews/fase-b1b-review-request.md` belongs to phase/b1b-relay: it was never
written by this unit and is byte-for-byte unchanged (`git diff HEAD` on that path is empty).

## 1. Defect and fix

The database column is `contratos.is_anexo` (ONE n). The service selected `is_annexo`
(two n), so PostgREST answered 42703, the contratos read threw, and
`GET /api/school-hours-report/[school_id]` plus its `/pdf` sibling 500'd for every school
with at least one active contract — `/reporte-horas` was broken for directoras and admin.

The schema oracle was verified from the dump AND from the live migrated DB, never from the
code under test:
- `supabase/migrations/00000000000000_baseline.sql:7903` — `"is_anexo" boolean DEFAULT false`
- `:13796` `idx_contratos_is_anexo`, `:15124` predicate `("is_anexo" = true)`
- live local DB: `is_anexo` present, `boolean`, `is_nullable=YES`, `default false`;
  `is_annexo` ABSENT. PostgREST's own hint: *"Perhaps you meant to reference the column
  contratos.is_anexo."*

The wire field stays `is_annexo` (two n) — `ContractSummary.is_annexo`
(`lib/types/hour-tracking.types.ts:327`), `pdf.ts:174`, `SchoolHoursReport.tsx:318`.
Only the query side moved. `__tests__/api/hour-tracking/school-report.test.ts` mocks the
service at the wire level, so its `is_annexo` usages are correct and were not touched.

## 2. Files written (exactly the two allowlisted product files)

`git diff --stat`: 2 files, +64 −6.

**`lib/services/school-hours-report.ts`** (3 sites)
- `ContratoRow.is_annexo` → `is_anexo` + comment recording the column/wire split
- `.select(...)`: `is_annexo` → `is_anexo`
- mapping: `is_annexo: contrato.is_anexo ?? false` — wire key unchanged

**`__tests__/lib/services/school-hours-report.test.ts`**
- `BASE_SCHEMA.contratos` mirror → `is_anexo`, with a comment on why a mirror copied from
  the query under test is worthless (that is exactly how the suite shipped past this)
- the per-test schema override mirror → `is_anexo` (otherwise the corrected select would
  fail validation and that test would silently change meaning from "the `estado` FILTER
  fails" to "the select is broken")
- `baseOptions()` contrato fixture → `is_anexo: false`
- NEW coverage: one test pinning the select (`toContain('is_anexo')`,
  `not.toContain('is_annexo')`, `validateSelect(...) === null`) and an `it.each`
  true/false/null triple on the mapping

Why true/false/null and not just false: the mapping is `contrato.is_anexo ?? false`, so a
`false` expectation alone also passes when the column was never read. `true` is what
separates a real read from a silent default; `null` pins the default itself and matches the
live column, which really is nullable with `DEFAULT false`.

Adapted, NOT cherry-picked. Historical correction `f6d0e908` was recovered with `git show`
(`/tmp/b1b-validation/historical-{service,test}.diff`), but both files drifted since its
base `717c2c09`: main added a `tenant_kind` gate (`schools` select gains `tenant_kind`,
`parseTenantKind`/`isClientTenant`, non-client → null; test schema/fixtures gain
`tenant_kind: 'client'`). Orthogonal to `is_anexo`, retained unchanged and re-proved below.

No other product file written. No refactoring. `package.json`/`package-lock.json` untouched
(`git status --porcelain` on both is empty). No git mutations, no commit/push/merge/deploy,
no resource deletion, no secrets printed, no provider or hosted calls.

## 3. Code gates — all green

| Gate | Command | Result |
|---|---|---|
| Focused unit | `npx vitest run __tests__/lib/services/school-hours-report.test.ts` | **23/23 pass**, exit 0 |
| Adjacent regression | same + `__tests__/api/hour-tracking/school-report.test.ts` + `lib/utils/__tests__/contract-pdf-target.test.ts` | **40/40 pass**, exit 0 |
| Type-check | `npm run type-check` | exit **0**, no diagnostics |
| Lint (changed files) | `npx eslint --max-warnings=0 <2 files>` | exit **0** |
| Lint (repo) | `npm run lint` | exit **0** |
| Full unit | `npm test` (vitest) | **430 files, 9879 passed, 12 skipped**, exit 0 |
| Build | `npm run build` | exit **0**, compiled, 149/149 static pages |

Tooling note: my first focused run used `npx jest` and failed to parse TypeScript at a
pre-existing line. That was my error — this repo's runner is **vitest**; jest is only a
leftover devDependency. Re-run under vitest, as recorded above.

`npm ci` was PM-owned and already complete; I did not install and did not touch lock files.

## 4. Negative controls — the tests fail against the old select

Not self-reported green: I temporarily reintroduced ONLY the defective select, ran, then
restored. Restoration verified byte-identical both times
(`diff` clean, sha256 `019253d3237f5f2df22336f05ba26b103448589374b37b5fc2e0a97f4d16c7ba`).

1. **Unit** — `18 failed | 5 passed (23)`. All four new tests fail. Error is the production
   symptom: `No se pudieron obtener los contratos del colegio ...`. Note the `false` case
   fails too, because the whole read throws rather than silently defaulting.
2. **Live PostgREST** — the real service against the real API returned
   `code 42703, message: column contratos.is_annexo does not exist,
   hint: Perhaps you meant to reference the column "contratos.is_anexo."`
3. **Guard self-test** — the refusal check itself was fed a hosted URL and exited 1, so its
   pass is not vacuous.

## 5. Local validation on the disposable stack

Target: project `b1b-local-20260909`, API `http://127.0.0.1:54461`, Postgres
`127.0.0.1:54462`, app `http://localhost:3107`. Harness config outside product;
`migrations`/`tests` are read-only symlinks into the worktree.

**Refusal check ran before every connection** (`/tmp/b1b-validation/assert-local-target.js`,
invoked by each script): asserts loopback host, exact ports {54461, 54462, 3107}, protocol,
`ZOOM_MODE=mock`, `E2E_MAIL_OUTBOX` set, and that no value references a hosted
`supabase.co/.in` domain. Only PM's `.env.local` and `local-runtime-env.json` were read;
values were never printed (key names only). No other secrets read.

| Validation | Result |
|---|---|
| pgTAP `supabase test db` | **42 files, 4116 tests, PASS**, exit 0 |
| Live schema oracle | PASS — `is_anexo` exists/nullable/default false, `is_annexo` absent, service select accepted, old select 42703 |
| Live service (real PostgREST) | **PASS**, 15/15 assertions |
| HTTP JSON route, authenticated admin | **200** with correct annex flags and totals |
| HTTP `/pdf` route | **500** — pre-existing baseline defect, see §6 |
| QA-tenant exclusion | preserved: service → `null`, HTTP → **404** |
| Unauthenticated | **401**, not 500 |

Live service assertions: 1 program; 2 contracts; regular `is_annexo=false`, annex
`is_annexo=true` (the true/false round-trip through a real DB); regular 50 contracted /
2 reserved / 3 consumed / 45 available; bucket allocated 50 with `annex_hours` 10 and 2
sessions; annex 10 contracted / 10 available.

### Fixtures (wholly synthetic, disposable stack only)

Seeder `/tmp/b1b-validation/seed-report-fixtures.js`, all rows tagged `[W-B1b-01]`,
idempotent (id/tag-scoped delete then insert, single transaction). IDs in
`/tmp/b1b-validation/fixture-ids.json`.

| Item | Value |
|---|---|
| Client-kind school | id **3**, `[W-B1b-01] Colegio Sintetico Los Aromos (client)` |
| QA-kind school | id **4**, `[W-B1b-01] Colegio Sintetico QA (qa)` |
| Programa | `0b1b0002-…-0002` |
| Regular contract | `0b1b0005-…-0005`, `W-B1b-01-CTR-001`, `is_anexo=false`, 50 h |
| Annex contract | `0b1b0006-…-0006`, `W-B1b-01-CTR-001-A1`, `is_anexo=true`, `anexo_numero=1`, 10 h |
| Allocations | base `0b1b0009` 40 h; annex `0b1b000a` 10 h via `adds_to_allocation_id` → base |
| Sessions | `0b1b000c` completada 2026-05-04 (180 min); `0b1b000d` programada 2026-06-08 (120 min) |
| Ledger | `0b1b000e` consumida 3 h; `0b1b000f` reservada 2 h |
| Hour type | `b1b_asesoria_sintetica` |

Expected report totals for school 3: allocated **50**, reserved **2**, consumed **3**,
available **45**, `annex_hours` **10**; annex contract 10/10; annex row renders "(Anexo)".

**App login persona for PM Computer Use:** `b1b-admin@example.invalid`, role `admin`
(`user_roles.role_type`), id `0b1b0011-…-0011`. Synthetic, local-only, no hosted counterpart;
its local login is defined by the harness seeder `/tmp/b1b-validation/seed-report-fixtures.js`
(password removed from this published report, 2026-09-10, SM-REL-B1b r1).

The tenant_kind=qa exclusion was preserved by adding a synthetic **client**-kind school.
No hosted QA school was relabelled or touched.

**Cleanup ownership:** every fixture row is `[W-B1b-01]`-tagged or has a `0b1b…` id, so
cleanup is unambiguous; the whole stack is disposable and PM may simply discard it. I
deleted nothing.

## 6. Pre-existing baseline failures — recorded, NOT repaired

1. **`/api/school-hours-report/[school_id]/pdf` returns 500:
   `doc.autoTable is not a function`.** Installed `jspdf-autotable` is **5.0.7**, which
   exports `applyPlugin` / `autoTable(doc, opts)` and no longer patches `doc.autoTable`;
   the route (untouched by me, `pages/api/.../pdf.ts:97-98,146`) still uses the v4 plugin
   API. Proof it is pre-existing and not caused by my change: with the defective select
   restored, the same route also 500s, just **earlier** — `No se pudieron obtener los
   contratos …`. The 42703 was **masking** this defect; my fix unmasks it. Fixing it needs
   the route file and probably a dependency change — both outside the allowlist and
   package files are forbidden. **The JSON route, which is what the 42703 broke, is 200.**
2. **`npm run test:api` fails to start:** `Could not resolve vitest.config.api.ts`. That
   file is not in HEAD (`git ls-tree HEAD` lists only `vitest.config.ts`), so the script is
   stale on main. Unrelated to this change, and repair would require `package.json`.
   No coverage lost: those API tests run under the default config in the green `npm test`.

Neither failure is in my allowlist and neither was repaired. No broad repairs attempted.

## 7. Truthful pending state

- **PM Computer Use / UI verification: NOT DONE by me and NOT claimed.** UI_REQUIRED=YES is
  PM-owned. Absent UI was not treated as licence to skip code/test work — §§3–5 are complete.
- **Playwright E2E for this journey: NONE EXISTS.** No spec under `e2e/` or `tests/`
  references `reporte-horas`, `school-hours-report` or `SchoolHoursReport`, so there was no
  report E2E to run. I substituted the equivalent authenticated HTTP journey (§5) rather
  than reporting an E2E pass that did not happen. I did not run unrelated Playwright suites.
- **Dev server left RUNNING** on port 3107 for PM's Computer Use: `next dev` pid **51597**
  (worker 51618). Stop with `kill 51597`. Flagging it so it is not a surprise stray process.
- No hosted target, provider call, migration, commit, push, PR or deploy occurred.

## 8. Artifacts

All logs and harness scripts in `/tmp/b1b-validation/` (temporary harness, not product):
`focused-service-suite.log`, `regression-adjacent.log`, `negative-control.log`,
`type-check.log`, `lint-focused.log`, `lint-full.log`, `full-unit.log`, `build.log`,
`pgtap.log`, `schema-verify.log`, `live-report-check.log`, `live-negative-control.log`,
`http-journey.log`, `seed.log`, `test-api.log`, `refusal-check.log`, `app-3107.log`,
`fixture-ids.json`, `historical-service.diff`, `historical-test.diff`,
`assert-local-target.js`, `seed-report-fixtures.js`, `check-report-service.ts`,
`check-report-http.js`, `verify-schema.js`.

## 8b. Validation checkpoint — role-validation preparation (r3 continuation)

Appended after delivery. **Validation-only: no product file was edited.** Same initial
execution, remediation rounds still **0**. Sections 1–8 above are unchanged and remain the
evidence of record.

**Product frozen and verified at the delivered hashes** at the start and end of this
continuation:
- `lib/services/school-hours-report.ts` sha256 `019253d3237f5f2df22336f05ba26b103448589374b37b5fc2e0a97f4d16c7ba`
- `__tests__/lib/services/school-hours-report.test.ts` sha256 `529fb5242b79fae736414b62f57f895d620573bfd11bb2b6efc831571a022e92`
- `git diff --stat` still exactly 2 files, +64 −6.

Independent results acknowledged (not mine, not re-run, not claimed as my evidence): Codex
passed 55 focused tests, pgTAP 4116/42 and the live service; PM Computer Use verified the
admin report, regular/annex rendering, session detail and mobile. PM's mandatory E2E is
running separately and was **not** duplicated here.

### equipo_directivo persona — created and verified

`/tmp/b1b-validation/setup-directivo.js`, behind the same loopback refusal guard (§5).
One wholly synthetic persona, scoped to report fixture school **3** only:

| Field | Value |
|---|---|
| user_id | `0b1b0012-0000-4000-8000-000000000012` |
| email | `b1b-directivo@example.invalid` |
| role | `equipo_directivo` (`user_roles.role_type`), `school_id=3`, `is_active=true` |
| role rows | exactly **1** (verified) |

Real HTTP results against `http://localhost:3107` (`/tmp/b1b-validation/directivo-http.log`,
exit **0**):

| Case | Expected | Actual |
|---|---|---|
| own school 3 | 200 | **200** |
| other school 990001 | 403 | **403** |
| unauthenticated | 401 | **401** |

The 200 carries the full report unchanged for this role: 2 contracts, annex `is_annexo=true`
and regular `is_annexo=false`, totals 50/2/3/45 — so the fix holds for directoras, the role
the production 500 actually locked out.

Other-school choice: **990001** is the CI seeder's *client*-kind school, so the 403 is an
unambiguous **role** denial and not the `tenant_kind='qa'` exclusion. School 4 (qa) would
have conflated the two.

### Nothing pre-existing was disturbed

Counted before and after in the same run: `b1b-admin` profiles 1 → 1, CI seeder `e2e-*`
role rows 14 → 14, CI schools {990001, 990002} 2 → 2, W-B1b-01 report contracts 2 → 2.
The script deletes only its own id. `b1b-admin` was **not** reset; the CI seeder fixtures PM
ran in this stack are intact; no product file, provider or hosted system was touched.

### Handoff

`/tmp/b1b-validation/directivo-fixture.json` — local synthetic login identity, expected
HTTP codes, expected report totals for school 3, and cleanup scope (its single id, plus an
explicit must-not-touch list). It is a disposable local-stack identity with no hosted
counterpart, not a real credential.

App **left running** for PM Computer Use: `next dev` pid **51597** (worker 51618) on
:3107. Stop with `kill 51597`.

### Status unchanged and still truthful

- **PDF `/pdf` route: still 500** (`doc.autoTable is not a function`, `jspdf-autotable`
  5.0.7 vs the route's v4 API — §6). Awaiting user decision; **not fixed, not attempted**
  in this continuation.
- **Mandatory E2E: PM-owned, running separately.** Not run or duplicated by me; no E2E pass
  is claimed on my behalf.
- **Computer Use: PM's.** I claim none of it.

## 8c. r4 — PDF correction (remediation round 1 for B1B-F01)

Appended; sections 1–8b are unchanged historical evidence. §6.1 and §8b's "PDF still 500"
described the pre-r4 state and are superseded by this section, not rewritten.

Authority: order r4, Brent "lo autorizo" 2026-09-10. Initial continuation execution 1,
remediation round **1** of cumulative cap 2. Runtime: Claude Code CLI 2.1.263,
claude-opus-5; skill packet delivered in the prompt (native loading not claimed).

### Change (2 allowlisted files only)

`pages/api/school-hours-report/[school_id]/pdf.ts` (+7 −5): `jspdf-autotable` 5.0.7 exports
`autoTable(doc, options)` and no longer patches jsPDF on import. The side-effect import is
replaced by `const autoTable = (await import('jspdf-autotable')).default;` — the idiom already
used in `lib/expenseReportExport.ts:130` — and the three `doc.autoTable({...})` calls become
`autoTable(doc, {...})` with unchanged options. `didParseCell` is typed with the library's
`CellHookData` (type-only import). jsPDF import, auth/RBAC, 400/401/403/404/500 paths,
figures, labels, headers and filename unchanged. No dependency, lock, config or auth change.

`__tests__/api/hour-tracking/school-report-pdf.test.ts`: removed the `jspdf`/`jspdf-autotable`
mocks, since they supplied the nonexistent `doc.autoTable` and let the suite pass while the
route 500'd. All 5 tests now run the installed libraries. The 401/403 tests are unchanged;
both 200 tests additionally assert real `%PDF-` bytes. New regression reads the PDF text layer
with `pdf-parse` (idiom from `lib/pasantias/__tests__/pdf.test.ts`) and asserts grand totals
60/3/2/55, `(Anexo)` on the annex only, bucket 50/2/3/45/+10 and annex bucket 10/10, and both
session rows. The mocked `sendAuthError` keeps `details` so any 500 message shows in the failure.

### Hashes (final, frozen)

| File | sha256 |
|---|---|
| `pages/api/school-hours-report/[school_id]/pdf.ts` | `c062dfe7e009416b3f2d1a919c104d6392ac5f0271cc24c0b703818100ada1d3` |
| `__tests__/api/hour-tracking/school-report-pdf.test.ts` | `8628d7f7921908a9a802fcb75dc37a5966000abcc4dd8362eb48137d469c9af8` |
| `lib/services/school-hours-report.ts` (protected, unchanged) | `019253d3237f5f2df22336f05ba26b103448589374b37b5fc2e0a97f4d16c7ba` |
| `__tests__/lib/services/school-hours-report.test.ts` (protected, unchanged) | `529fb5242b79fae736414b62f57f895d620573bfd11bb2b6efc831571a022e92` |

Cumulative product diff: 4 files, +211 −41. `package.json`/lock untouched;
`fase-b1b-review-request.md` diff 0 lines; PM-owned `PROJECT_STATE.md`, CSV and pm-review not
written by me.

### Validation on final bytes (logs `/tmp/b1b-validation/r4-*`)

| Gate | Command | Result |
|---|---|---|
| Focused PDF | `npx vitest run __tests__/api/hour-tracking/school-report-pdf.test.ts` | 5/5, exit 0 (`r4-focused-pdf-first.log`) |
| Negative control | HEAD route (old import + `doc.autoTable`) swapped in, same suite | **3 failed / 2 passed**, exit 1; `doc.autoTable is not a function`; the 2 passes are the 401/403 tests that return before PDF generation. Final bytes restored, sha `c062dfe7…`, `cmp` identical (`r4-negative-control.log`) |
| Cumulative focused | service + billable-hours + JSON + PDF suites | **56/56**, exit 0 (`r4-focused-cumulative.log`) |
| Type-check | `npm run type-check` | exit 0 (`r4-type-check-first.log`, run on the same final bytes) |
| Lint | both files `--max-warnings=0`; `npm run lint` | exit 0 / exit 0 |
| Full unit | `npm test` | **430 files, 9880 passed, 12 skipped**, exit 0 (`r4-full-unit.log`) |
| Build | `npm run build` | exit 0, 149/149 pages; input hashes recorded (`r4-build-input-hashes.txt`) |

### A2-PDF over real HTTP (production server, disposable stack)

Refusal check passed before network use. Server: `next start` (Next 14.2.35) on :3107, env
limited to `env -i` PATH/HOME plus whitelisted local runtime keys (`r4-start-app.sh`). Existing
synthetic personas only; nothing created or reset. `r4-check-pdf-http.js`, exit **0**:

- `b1b-directivo` (equipo_directivo, school 3) → **200 `application/pdf`**, attachment
  filename, 176921 bytes equal to Content-Length, `%PDF-`, readable by `pdf-parse` (1 page,
  785 chars). Text contains the school name, totals 60/3/2/55, regular contract without tag,
  `W-B1b-01-CTR-001-A1 (Anexo)`, bucket 50/2/3/45/+10, annex bucket 10/10, sessions
  `3.00 consumida` and `2.00 reservada`, no plugin error text.
- same directivo, other school 990001 → **403**; unauthenticated → **401**; `b1b-admin`, school 3 →
  **200 application/pdf**.
- Server log: 0 matches for `autoTable|is not a function|Error 500`.

Evidence: `r4-school3-directivo.pdf` (sha256
`921a63f3396701e0e4b0affb66dd3da0bde1137d513a8d31d444c4fe59fcbdf0`), `r4-school3-directivo.txt`,
`r4-school3-admin.pdf`, `r4-pdf-http.log`, `r4-app-3107.log`.

### Not done by me / pending

- **UI (PDF click from `/reporte-horas`, figures, contract/annex selection, keyboard,
  reload, desktop/mobile): PM-owned, not performed and not claimed.**
- pgTAP and mandatory E2E evidence remain on the pre-r4 state; PM decides the rerun. r4 did
  not touch DB, migrations or E2E files.
- Out-of-scope FINDINGS, not edited: identical broken `doc.autoTable` usage in
  `pages/api/consultant-earnings/[consultant_id]/pdf.ts:184,224` and `lib/exportUtils.ts:158`;
  `__tests__/api/hour-tracking/earnings-pdf.test.ts` mocks the nonexistent method; the
  `lib/jspdfWrapper.ts` type augmentation hides this class of error from `tsc`.
- Server **running** for PM UI: `next start` pid **71728** on :3107, owned by this executor
  run; stop with `kill 71728`. The r3 dev server (pid 51597) was already gone at r4 intake.
- No commit, push, PR update, merge, deploy, provider/hosted action or deletion.

## 8d. r5 — B1B-F02 unstable PDF regression (remediation round 2 of cap 2)

Appended; §§1–8c unchanged. Initial continuation execution 1; remediation round **2 of cap 2**
(no rounds remain). Claude Code CLI 2.1.263, claude-opus-5. Environment: macOS, Node v22.22.0,
vitest 0.34.6, jspdf 3.0.4, jspdf-autotable 5.0.7, pdf-parse 1.1.4 (pdf.js 1.10.100),
pdf-lib 1.17.1, TZ −03. No DB, network, E2E, reseed or server action in r5.

### Finding and preserved evidence

PM `/tmp/b1b-validation/r4-pm-focused.log` (07:14:08): 55 pass / 1 fail,
`UnknownErrorException: bad XRef entry` in the r4 regression. Preserved unmodified (sha256
`cf438840e0a4fb571a3fb8fbd5a0f02aef9910f137f4783c69bd205372394462`, copy
`r5-preserved-r4-pm-focused.log`). PM's own rerun at 07:15:11 passed 5/5 (`r4-pm-pdf-recheck.log`).

### Cause — classified, exact trigger UNPROVEN

The throw is in pdf-parse's bundled pdf.js 1.10.100 (`pdf.worker.js:12318`,
`XRef.fetchUncompressed`: no `num gen obj` at the xref offset). That reader runs via a fake
worker with deferred message delivery, sets an implicit global `PDFJS`, and does not await
`doc.destroy()`. **No product defect was found:**

| Discriminating check | Result |
|---|---|
| Real handler, exact fixture: clock sweep (07:14:00–59 + every minute of a day, ×2) and 300 renders at fixed 07:14:08 — 3300 renders | pdf-parse **0/3300** failures; independent xref/stream-length verifier **0/3300**. Bytes differ every render (random jsPDF `/ID`); lengths 16261/16262 |
| r4 test, PM's exact 4-file command, 15 runs, load 3.9–4.1 | 15/15 pass (`r5-old-regression-repeat.log`) |
| Identical valid production bytes, pdf-parse 300 sequential + 100 concurrent | 400/400 (`r5-samebytes-stress.log`) |
| Production PDFs, independent verifier | structure OK (`r5-verify-r4-http-pdfs.log`) |

The failing run's bytes were not captured, so the precise trigger cannot be demonstrated. The
evidence rules out malformed product bytes as far as it reaches and places the fault in the
reader; it does not identify the reader's internal race. Stated as a limitation.

### Correction — test only

Product route unchanged (`c062dfe7…`, same bytes r4 built and PM visually verified); no rebuild.
`__tests__/api/hour-tracking/school-report-pdf.test.ts` now reads the real PDF deterministically:
- `xrefProblems`: every in-use xref entry must point at its own `N G obj`, which is exactly the
  property pdf.js reported;
- `pdfText`: strict `PDFDocument.load` with installed pdf-lib (already used by repo tests; no
  worker, no timers) and the page content-stream strings, PDF escapes resolved.

Every r4 figure/label assertion is kept verbatim; added `xrefProblems == []` and `pages == 1`.
New self-test (6th test): a one-byte-late xref entry is reported as
`object 1 is not at offset N`, and half-truncated bytes are rejected by the strict load, so the
checks cannot pass vacuously. pdf-parse is no longer imported by this file. No mock providing a
nonexistent method, no removed assertion, no skip/retry/hardcoded success, no dependency or
config change.

### Hashes (final)

| File | sha256 |
|---|---|
| `__tests__/api/hour-tracking/school-report-pdf.test.ts` | `5edb18b5d1595179278e064bd3694c0aeb5aeb2cf6c2731e6939cbbe06d0d566` (r4 `8628d7f7…`) |
| `pages/api/school-hours-report/[school_id]/pdf.ts` | `c062dfe7e009416b3f2d1a919c104d6392ac5f0271cc24c0b703818100ada1d3` (unchanged) |
| `lib/services/school-hours-report.ts` | `019253d3237f5f2df22336f05ba26b103448589374b37b5fc2e0a97f4d16c7ba` (unchanged) |
| `__tests__/lib/services/school-hours-report.test.ts` | `529fb5242b79fae736414b62f57f895d620573bfd11bb2b6efc831571a022e92` (unchanged) |

Cumulative product diff: 4 files, +313 −41. HEAD `b17a6839…`; package/lock untouched;
historical `fase-b1b-review-request.md` diff 0 lines; PM-owned files not written.

### Validation (logs `/tmp/b1b-validation/r5-*`)

| Gate | Result |
|---|---|
| Focused PDF | 6/6, exit 0 (`r5-focused-pdf.log`) |
| Dual-reader sweep, 3300 renders | pdf-parse 0, new deterministic checks 0, structural verifier 0 failures (`r5-diag-dual.log`, `r5-diag/summary.json`; first sweep kept as `r5-diag-first-sweep-*.json`) |
| Stability, corrected test, PM's 4-file command | **20/20** (57/57 each), load 5.6–6.5 (`r5-new-regression-repeat.log`) |
| Negative control (HEAD route: side-effect import + `doc.autoTable`) | **4 failed / 2 passed**, exit 1, `doc.autoTable is not a function` ×4; the passes are the 401/403 tests. Final route bytes restored, sha `c062dfe7…`, `cmp` identical (`r5-negative-control.log`) |
| Cumulative focused (service/billing/JSON/PDF) | **57/57**, exit 0 (`r5-focused-cumulative.log`) |
| Type-check | exit 0 (`r5-type-check.log`) |
| Lint | both files exit 0; `npm run lint` exit 0 |
| Full unit | **430 files, 9881 passed, 12 skipped**, exit 0 (`r5-full-unit.log`) |

Retained from r4, unaffected because product bytes are unchanged: build, production HTTP A2-PDF,
PM UI/visual evidence.

### Notes

- One command was **denied**: the sweep rerun as first written began with
  `rm -rf /tmp/b1b-validation/r5-diag-v2`. Deletion is excluded from this unit; the command
  was not retried in that form. The rerun ran without deletion and copied the first sweep's
  outputs to new names before they would be overwritten.
- `r4-school3-*.pdf` on disk were rewritten at 07:14:10 by PM's rerun of my r4 HTTP harness;
  §8c's sha `921a63f3…` refers to my 07:11:40 output, the current file is `9e73630d…`.
- :3107: PM's server (pid 72480) was left untouched; at the final check no listener remained.
  My r4 server pid 71728 was already gone at r5 intake.
- Out-of-scope findings from §8c still stand; `pages/api/contracts/extract-pdf.ts` and
  `lib/pasantias/__tests__/pdf.test.ts` also use pdf-parse (not assessed, not edited).
- No commit, push, PR update, merge, deploy, provider/hosted action or deletion.

**Status: READY_FOR_REVIEW** (executor validation only; PM verdict pending). No remediation
rounds remain under cap 2.

## 9. Requested verdict

Review the two-file product diff on the frozen state, plus PM-owned Computer Use of
`/reporte-horas` for school **3** against the expected totals in §5. Decide separately
whether the two §6 baseline failures — especially the PDF route, now the last thing standing
between `/reporte-horas` and a working PDF export — warrant their own work item. I recommend
they do; the PDF route is currently broken for every school regardless of this fix.

Executor writes stop here.

## 10. Current release note — SM-REL-B1b r1 (2026-09-10)

Appended; §§1–9 are preserved historical evidence. **§9 is stale:** it is the pre-r4 request.
The PDF route it recommends as separate work was authorized and corrected in r4 (§8c), the
unstable regression in r5 (§8d), and Codex's final local review in
`santa-marta-w-b1b-01-pm-review.md` ("Final local review — r4/r5") returned
APPROVED_WITH_NOTES + UI_VERIFIED with B1B-F01/F02 closed. That verdict, not §9, is current.

Publication hygiene only, under SM-REL-B1b r1 (Brent's 2026-09-10 Santa Marta authorization,
Codex PM, Claude Code release operator, claude-opus-5): the synthetic local login password
was removed from §5; persona role/id and harness reference retained. No product byte changed;
the four product SHA256s equal the PM review's final table. Counters unchanged: initial
continuation execution 1, remediation rounds 2/2; publication is not a repair round.
