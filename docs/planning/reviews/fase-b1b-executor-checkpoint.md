# W-B1b-01 — executor checkpoint

Executor: Claude Code, explicit invocation of `bounded-executor` 1.1.0 via delivered
safe-mode packet (contract 1.1.0, profile, root instructions). Native skill loading is
disabled in this session and is NOT claimed.
Model: claude-opus-5, effort medium, fallback NONE. Requested == selected == running.
PM_REVIEWER: Codex (task `01a0890a-e60d-7ee0-a4ad-b5a597f0c23c`).
Date: 2026-09-09 America/Santiago.

## 1. ACK before editing (order revision 2)

Acknowledged and OBSERVED, not assumed:

| Item | Order revision 2 | Observed in session |
|---|---|---|
| Execution root | `/Users/brentcurtis/dev/wt/b1b-current` | same (`pwd -P`, `git rev-parse --show-toplevel`) |
| Branch | `fix/horas-rep` | same |
| Base/HEAD | `b17a68393dc7cd3a6ccfed9fffa3252c7e97fb46` | same |
| Initial checkout | clean | clean (`--untracked-files=all` empty) |
| Registered worktree | linked worktree of canonical repo | confirmed via `git worktree list --porcelain` |

Authority acknowledged: COORDINATED mode, local implementation and local validation
only. I am the sole product writer. Explicitly excluded and NOT performed: commit, push,
PR update, merge, deploy, hosted DB/provider actions, credential reads, migrations,
resource/worktree deletion, successor task creation.

Protected work NOT touched: canonical checkout `/Users/brentcurtis/Documents/fne-lms-working`
(`codex/eval-complete`), historical `/Users/brentcurtis/dev/fne-lms`, the remote PR #50 and
branch, and every other registered worktree.

Attempts: new continuation executions 1 (this one), new remediation rounds 0. Historical
observed remediations on the source correction: 0; unrecorded private activity UNKNOWN.
No historical counter is reset by this session.

Roles: I do not review or approve my own work, do not write the PM ledger/verdict, and do
not claim PM-owned Computer Use evidence.

## 2. Discovery (OBSERVED)

Historical correction `f6d0e908c7be35ee4e107e12b8c30ac5d457fc1f` is reachable in this
repository and was recovered with `git show` (saved to
`/tmp/b1b-validation/historical-service.diff` and `historical-test.diff`).

Schema oracle verified independently of the commit message, from the baseline dump —
NOT copied from the code under test:
- `supabase/migrations/00000000000000_baseline.sql:7903` → `"is_anexo" boolean DEFAULT false`
- `:13796` → `CREATE INDEX "idx_contratos_is_anexo" ... ("is_anexo")`
- `:15124` → partial unique index predicate `("is_anexo" = true)`

So the database column is `is_anexo` (one n). Current main still selects `is_annexo`
(service lines 61, 142, 330) → PostgREST 42703 → the contratos read throws → 500 on
`/reporte-horas` for any school with an active contract. Defect reproduced by inspection.

Wire field must stay `is_annexo` (two n). Consumers verified:
- `lib/types/hour-tracking.types.ts:327` — `ContractSummary.is_annexo: boolean`
- `pages/api/school-hours-report/[school_id]/pdf.ts:174` — `contract.is_annexo`
- `components/hours/SchoolHoursReport.tsx:318` — `c.is_annexo`
- `__tests__/api/hour-tracking/school-report.test.ts` mocks `fetchSchoolReportData` at the
  wire level, so its `is_annexo` usages are correct and need no change (also out of allowlist).

Drift since the historical base `717c2c09`: both allowlisted files changed on main, so the
old commit is NOT cherry-picked. Main added a `tenant_kind` gate (`schools` select gains
`tenant_kind`, `parseTenantKind`/`isClientTenant`, non-client school returns null; the test
schema/fixtures gained `tenant_kind: 'client'`). This is orthogonal to `is_anexo` — no
conflict — and is retained unchanged. The correction is re-applied by hand onto current main.

## 3. Changes (adapted, within allowlist only)

`lib/services/school-hours-report.ts` — query side only, 3 sites:
1. `ContratoRow.is_annexo` → `is_anexo` (+ comment recording the wire/column split)
2. `.select(...)` `is_annexo` → `is_anexo`
3. mapping `is_annexo: contrato.is_annexo ?? false` → `is_annexo: contrato.is_anexo ?? false`
   (wire key unchanged)

`__tests__/lib/services/school-hours-report.test.ts`:
1. `BASE_SCHEMA.contratos` mirror `is_annexo` → `is_anexo`, copied from the dump, with a
   comment on why a mirror copied from the query under test is worthless
2. the per-test schema override mirror likewise corrected
3. `baseOptions()` contrato fixture `is_annexo: false` → `is_anexo: false`
4. added true/false/null coverage pinning the select to `is_anexo`, asserting `is_annexo`
   is absent from the select, and proving the wire field passes the DB value through
   rather than falling back to `?? false`

No other product file is written. Refactoring NONE. `package.json`/lockfile untouched.

### 3b. Correction to this checkpoint (order revision 3)

This section was written BEFORE the work it describes was finished, and section 3 was
inaccurate when the PM interrupted the session. Reconciled against observed state:

- Items 1–3 of the service change and items 1 and 3 of the test change WERE applied
  before the interruption.
- Test item 2 (the per-test schema override mirror at what is now line ~860) was NOT
  applied, and test item 4 (the true/false/null coverage) did NOT exist. Section 3
  claimed both. That claim was false when written.
- Both were completed after resuming. All four test items and all three service items
  are now present and verified by the runs recorded in the report.

No other part of section 3 required correction.

## 4. Validation

See `santa-marta-w-b1b-01-review-request.md` for exact commands, environments, exit codes
and counts. (Revisions 1–2 pointed this reference at `fase-b1b-review-request.md`; that
path already belongs to phase/b1b-relay and was NOT written by this unit — it remains
byte-for-byte unchanged.) The report covers the unit and live negative controls, the
local DB/E2E-class validations on the disposable stack, and two pre-existing baseline
failures that are recorded, not repaired.

## 6. r4 ACK before editing — PDF correction (remediation round 1 for B1B-F01)

Order: W-B1b-01 r4, user authorization Brent "lo autorizo" 2026-09-10. Same local
exclusions as r2/r3. Initial continuation execution 1; remediation round **1** of cumulative
cap 2 starts now; no reset. Claude sole product writer; Codex independent reviewer; PM owns
ledger/PROJECT_STATE/verdict.

OBSERVED at intake (2026-09-10):
- root `/Users/brentcurtis/dev/wt/b1b-current`, branch `fix/horas-rep`, HEAD
  `b17a68393dc7cd3a6ccfed9fffa3252c7e97fb46`.
- Protected, must stay byte-identical: service sha256
  `019253d3237f5f2df22336f05ba26b103448589374b37b5fc2e0a97f4d16c7ba`, service test
  `529fb5242b79fae736414b62f57f895d620573bfd11bb2b6efc831571a022e92`.
- r4 allowlist at intake, unmodified from HEAD: `pages/api/school-hours-report/[school_id]/pdf.ts`
  `f14404c2a0a50ee91a5b487cd6a9ba3ee266ad4f8ac28647712b1c3ca60428d3`;
  `__tests__/api/hour-tracking/school-report-pdf.test.ts`
  `281b9b427b1f5fec6ce65284e4d7e53f7eb11decf7e76fac4fb521ad451c0b44`.
- PM-owned dirty files present and protected: `PROJECT_STATE.md`,
  `docs/reviews/santa-marta-work-items.csv`, `santa-marta-w-b1b-01-pm-review.md`.
- Port 3107 not listening at intake (the r3 dev server is no longer running).
- Runtime: Claude Code CLI 2.1.263, model claude-opus-5 (this session). Effort as delivered
  by the order; native skill loading not claimed.

Write scope ONLY: the two r4 allowlist files, this checkpoint and
`santa-marta-w-b1b-01-review-request.md` (append). No package/lock/config/migration, no
auth change, no refactor. Exceeding files => FINDINGS, not edits. Temp artifacts only in
`/tmp/b1b-validation/` (`r4-*`). No commit/push/PR/merge/deploy, no deletion.

### r4 discovery (OBSERVED, probes `/tmp/b1b-validation/r4-probe-*.{cjs,mjs}`)

- Installed `jspdf-autotable` 5.0.7 exports `autoTable(doc, options)` (also `default`) and
  `applyPlugin(jsPDF)` (`dist/index.d.ts:316-324`). Importing it does NOT add
  `doc.autoTable` (probe: `typeof doc.autoTable === 'undefined'`). Explicit
  `autoTable(doc, opts)` works and sets `doc.lastAutoTable.finalY`.
- Installed `jspdf` 3.0.4 CJS build: `__esModule: true`, `default === jsPDF`, so the route's
  existing `const { default: jsPDF } = await import('jspdf')` stays valid; unchanged.
- jsPDF output is uncompressed here (no FlateDecode); cell text such as `(50.0)` and
  `\(Anexo\)` is present in the raw bytes.
- Repo idiom already on v5: `lib/expenseReportExport.ts:130,210`
  (`(await import('jspdf-autotable')).default` then `autoTable(doc, {...})`). The fix follows it.
- Why the suite passed: `school-report-pdf.test.ts` mocks `jspdf` with a `doc.autoTable`
  method the real library no longer provides; type-check passed because
  `lib/jspdfWrapper.ts` augments jsPDF with `autoTable`.
- Out-of-scope FINDINGS (not edited): same broken `doc.autoTable` pattern in
  `pages/api/consultant-earnings/[consultant_id]/pdf.ts:184,224` and `lib/exportUtils.ts:158`;
  `__tests__/api/hour-tracking/earnings-pdf.test.ts` mocks the nonexistent method too.

### r4 coherent change (checkpoint)

- `pdf.ts`: `const autoTable = (await import('jspdf-autotable')).default;` replaces the
  side-effect import; the three `doc.autoTable({...})` calls become `autoTable(doc, {...})`
  with identical options; `didParseCell` typed with the library's `CellHookData`
  (type-only import). Auth, 401/403/404/500 paths, figures, labels, headers unchanged.
- Test: jsPDF/autotable mocks removed, so all 5 tests run the installed libraries; the
  401/403 tests are unchanged; the 200 tests also assert real `%PDF-` bytes; a new regression
  reads the PDF text with `pdf-parse` and asserts grand totals, `(Anexo)` on the annex only,
  bucket 50/2/3/45/+10 and 10/10, and both session rows. Mock `sendAuthError` now also keeps
  `details`, so a 500 surfaces its message in the failure.
- First focused run on these bytes: 5/5 pass; lint on both files exit 0; type-check exit 0.
- Next: negative control, cumulative suites, full gates, production HTTP A2-PDF.

### r4 final status — READY_FOR_REVIEW (executor validation only; not approval)

- Final hashes: route `c062dfe7…ada1d3`, PDF test `8628d7f7…69c9af8`; protected service
  `019253d3…c7ba` and service test `529fb524…22e92` unchanged.
- Negative control 3 failed / 2 passed with old invocation; restored bytes verified.
- Cumulative focused 56/56; type-check, lint, full unit (9880 passed), build all exit 0.
- A2-PDF real HTTP PASS on school 3 (directivo 200 readable PDF with figures, other school
  403, unauth 401, admin 200); server log clean.
- Pending: PM UI; PM decision on pgTAP/E2E rerun; out-of-scope earnings/exportUtils findings.
- Server pid 71728 on :3107 left running for PM UI (`kill 71728`). Remediation round 1 used
  of cap 2. Details: `santa-marta-w-b1b-01-review-request.md` §8c. Executor writes stop.

## 7. r5 — B1B-F02 unstable PDF regression (remediation round 2 of cap 2)

Intake 2026-09-10 (OBSERVED): same root/branch/HEAD `b17a6839…`; route `c062dfe7…`, PDF test
`8628d7f7…`, protected service `019253d3…` and service test `529fb524…` all at r4 values.
:3107 held by pid 72480 (PM's server; not touched). PM failure log preserved byte-identical as
`/tmp/b1b-validation/r5-preserved-r4-pm-focused.log` (sha256 `cf438840…4462`).

Cause (classified, trigger UNPROVEN): the single failure was raised inside pdf-parse 1.1.4's
bundled pdf.js 1.10.100 (`pdf.worker.js:12318`, XRef.fetchUncompressed) — a 2017 reader running
through a fake worker with deferred message delivery, an implicit global `PDFJS`, and an
un-awaited `doc.destroy()`. No evidence of malformed product bytes:
- 3300 real-handler renders (clock sweep 07:14:00-59 plus every minute of a day, twice each,
  and 300 at fixed 07:14:08): 0 pdf-parse failures, 0 structural failures. Bytes differ per
  render (random jsPDF `/ID`), lengths 16261/16262 (hour digits).
- r4 test repeated 15× with PM's exact 4-file command under load 3.9–4.1: 15/15 pass.
- identical valid production bytes parsed 400× (300 sequential, 100 in batches of 5): 400/400.
- production PDFs pass an independent xref/stream-length verifier.
The failing run's bytes were not captured, so the precise trigger cannot be shown; that
limitation is recorded rather than filled with a guess.

Correction (test only; product unchanged at `c062dfe7…`): the regression now reads the PDF
deterministically — checks every in-use xref entry points at its `N G obj` (the property
"bad XRef entry" is about), strictly loads it with installed pdf-lib 1.17.1 (already used by
repo tests; no worker, no timers), and extracts the page content-stream text. All figure
assertions kept verbatim; added `xrefProblems == []` and `pages == 1`. New self-test proves the
checks are not vacuous: a one-byte-late xref entry is reported, and half-truncated bytes are
rejected by the strict load. No mock, skip, retry, dependency or config change.

Post-change on test `5edb18b5…`: focused PDF 6/6; lint and type-check exit 0; dual-reader sweep
3300 renders with 0 failures for pdf-parse, the new checks, and the structural verifier;
corrected test 20/20 with PM's 4-file command (57/57 each) under load 5.6–6.5.
Next: negative control, cumulative/full gates, report §8d.

Evidence note: `/tmp/b1b-validation/r4-school3-*.pdf` were overwritten at 07:14:10 by PM's rerun
of `r4-check-pdf-http.js` (my run: 07:11:40). The r4 sha `921a63f3…` is therefore not the file
now on disk (`9e73630d…`); both are real production output of the same route bytes.

### r5 final status — READY_FOR_REVIEW (executor validation only; not approval)

- Final: test `5edb18b5…d566`; route `c062dfe7…a1d3`, service `019253d3…c7ba`, service test
  `529fb524…2e92` unchanged. Product diff 4 files +313 −41.
- Negative control 4 failed / 2 passed with old invocation; route restored, `cmp` identical.
- Cumulative 57/57; stability 20/20; dual sweep 0/3300 failures; type-check, lint, full unit
  (9881 passed) exit 0. No rebuild (product unchanged).
- Denied once: a command beginning with `rm -rf` on a /tmp path; not retried in that form.
- Remediation round 2 of cap 2 used; none remain. PM verdict pending.
  Details: `santa-marta-w-b1b-01-review-request.md` §8d. Executor writes stop.

## 5. Next action

Independent Codex PM review on the frozen final state, plus PM-owned Computer Use for
UI_REQUIRED=YES. Executor writes stop at the final report.

## 8. SM-REL-B1b r1 — publication checkpoint (release-only, 2026-09-10)

Appended; §§1–7 and §5 are historical. §5's request was satisfied by Codex's final local review
(APPROVED_WITH_NOTES, UI_VERIFIED). Authority: Brent's 2026-09-10 Santa Marta authorization
(`docs/reviews/santa-marta-autonomous-run-2026-09-10.md`), order SM-REL-B1b r1. Codex PM; Claude
Code (new clean context, claude-opus-5, fallback NONE) sole executor and release operator. Not a
product repair round: initial continuation execution 1, remediation rounds 2/2, unchanged.

OBSERVED at intake: root `/Users/brentcurtis/dev/wt/b1b-current`, branch `fix/horas-rep`, HEAD
`b17a68393dc7cd3a6ccfed9fffa3252c7e97fb46`; live `origin/main` = same SHA (no drift); live
`origin/fix/horas-rep` = PR #50 head `f6d0e908c7be35ee4e107e12b8c30ac5d457fc1f` (OPEN, not draft).
Four product SHA256s equal the PM final table (service `019253d3…`, service test `529fb524…`,
route `c062dfe7…`, PDF test `5edb18b5…`).

History join evidence: `git log b17a6839..f6d0e908` = exactly one commit, `f6d0e908`, parent
`717c2c09`, 2 files (service +4/−3, service test +48/−3). Its service diff is identical in content
to the reviewed service diff (the three `is_anexo` sites). Its test changes are all represented in
the reviewed test: dump-faithful mirror comment and `is_anexo` mirror, fixture, override mirror, and
a regression pinning the select (`toContain('is_anexo')`, `not.toContain('is_annexo')`,
`validateSelect === null`) plus DB-value pass-through for `true`, extended to true/false/null.
Therefore `git merge -s ours --no-ff f6d0e908` adds ancestry only; no content is taken from it.

Publication hygiene: synthetic login password removed from the review request §5 (role/id and
harness reference kept); §10 release note appended clarifying the stale §9. No product edit.
Local ledger validator on this tree: exit 1, pre-existing ownership failures only (baseline 67),
not repaired, not relabelled.

Plan: stage exactly the four product files, `PROJECT_STATE.md`,
`docs/reviews/santa-marta-work-items.csv`, `docs/reviews/santa-marta-autonomous-run-2026-09-10.md`
and the three B1b executor/checkpoint/PM review files; `git diff --cached --check`, committed-secrets
guard, scope check; commit; ours-merge with pre/post tree comparison; normal fast-forward push;
update PR #50 title/body via body-file. No merge to main, deploy, force push, approval or admin
bypass. Push/PR results are reported in the executor release report, not in this committed file.
