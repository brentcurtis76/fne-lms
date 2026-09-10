# W-B1b-01 — independent PM review and recovery checkpoint

Verdict: BLOCKED for the complete order; narrow two-file query correction APPROVED_WITH_NOTES. Phase: PHASE_NOT_CLOSED. No release approval. Codex is PM/reviewer; Claude Code is sole product author. Orders r1–r3 and user “impleméntalo” govern local implementation and validation only.

## Frozen state and scope

Worktree `/Users/brentcurtis/dev/wt/b1b-current`, branch `fix/horas-rep`, base/HEAD `b17a68393dc7cd3a6ccfed9fffa3252c7e97fb46`; uncommitted product diff 64 additions / 6 deletions in exactly two files. Service SHA256 `019253d3237f5f2df22336f05ba26b103448589374b37b5fc2e0a97f4d16c7ba`; test SHA256 `529fb5242b79fae736414b62f57f895d620573bfd11bb2b6efc831571a022e92`.

The query reads actual database column `is_anexo`, maps true/false/null to existing wire `is_annexo`, and retains tenant-kind exclusion and effective_minutes billing. Tests now use the database schema rather than mirroring the original query typo. Independent cumulative diff inspection found no defect in this change. Four new tests fail with the old select; live PostgREST reproduces 42703 with it. Historical email report `fase-b1b-review-request.md` remains unchanged. Original dirty checkout and historical work are preserved.

## Evidence and acceptance

Evidence directory: `/Users/brentcurtis/Documents/ChatGPT/Santa Marta Remediation/evidence/validation/`, with SHA256 manifest. Exact commands and further executor evidence are in `santa-marta-w-b1b-01-review-request.md` and immutable task orders.

- PM OBSERVED: focused service, billing, JSON and PDF suites 55/55 passed; pgTAP 4,116 tests / 42 files passed; browser guard passed. Production build passed, 149 pages.
- PM OBSERVED: production local mandatory Playwright run, `npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium --workers=1 --reporter=list,json`, CI=1, 223 passed, exit 0. Mandatory guard confirms 16 specs ran with no skips. This is local validation, not hosted CI.
- Executor REPORTED with retained logs: type-check and full lint passed; full Vitest 430 files, 9,879 passed / 12 skipped, exit 0. Focused regression and old-select negative controls passed their intended assertions.
- PM OBSERVED live synthetic report: regular totals contracted 50 / consumed 3 / reserved 2 / available 45, annex 10 available. JSON own-school 200; executor role HTTP evidence own-school 200, other-school 403, unauthenticated 401.
- A1 query/report load PASS locally. A2 true/false/null JSON mapping PASS; PDF consistency BLOCKED. A3 billing regression PASS. A4 automated authorization/error checks PASS, UI subset described below. A5 local mandatory gates PASS except known baseline ledger; whole release gate not met. A6 bounded scope and retained artifacts PASS; no cleanup authorization inferred.

## UI_REQUIRED — PM Computer Use

Codex inspected frozen product code through the in-app browser against local synthetic app on port 3107, with admin and equipo_directivo. Desktop 1366x768 and mobile 390x844: report loads, principal/annex selection and figures correct, two detail sessions show 2h and 3h, annex empty-session state displayed, directivo school selected automatically without a school selector. QA-kind fixture was excluded. Screenshots were emitted in the conversation; no standalone screenshot file is claimed.

PDF button opened a tab returning HTTP 500 with `doc.autoTable is not a function`. Keyboard focus reached the contract dropdown, but full keyboard selection was not demonstrated. These observations used the dev server with the same frozen product hashes. After production rebuild, stale browser internal error-page navigation was blocked by browser URL policy; no subsequent production manual UI pass is claimed. Mandatory production E2E passed but has no report-specific journey, so it does not substitute for PDF or the remaining manual checks. UI gate: BLOCKED.

## Findings and routing

B1B-F01, blocking A2/UI: `pages/api/school-hours-report/[school_id]/pdf.ts:146` (also 189,221) calls `doc.autoTable` after side-effect plugin import at 97–98. Real installed plugin does not provide this instance method. Existing PDF tests mock the method and miss integration. This route is unchanged from base; the corrected query exposes the earlier masked failure. Smallest proposed correction: explicit supported plugin invocation and meaningful integration regression in the PDF route/test, preserving response and totals. No dependency change is presumed necessary. Destination: proposed r4 scope expansion, owner decision pending; Claude executes only after grant. It is not accepted debt and not a new completed unit.

B1B-N01, nonblocking tooling backlog: `npm run test:api` references absent `vitest.config.api.ts` on base. Default Vitest already runs those API tests. No package/config repair in this unit.

Ledger validator baseline: exit 1 with 67 pre-existing ownership failures; structural and frozen-claim checks pass. No gate exception or human ownership assignment invented.

## Infrastructure attempts and current processes

First PM browser-suite attempt used a dev server and mismatched synthetic mail outbox; it was interrupted (exit 130; 218 expected, 3 unexpected, 2 skipped). This is retained as invalid infrastructure evidence, not PASS. PM aligned the local outbox, stopped its own dev server, rebuilt and ran the production suite above successfully. The executor report's earlier “dev server running” statement is superseded: port 3107 has no listener after completed Playwright. No product edits between attempts.

Dedicated synthetic Supabase stack `/tmp/b1b-validation/stack` remains retained (API 127.0.0.1:54461, DB 127.0.0.1:54462). Local runtime secrets remain outside reports. No hosted database/provider actions, commits, pushes, PR updates, merges, deployments or resource deletions. Do not touch unrelated servers/worktrees. Temporary harness `/tmp/b1b-validation`, ignored local env/dependencies/build outputs and evidence are retained for continuation; retirement is not authorized.

## Continuity and ownership

Historical PR #50 implementation retained; new continuation executions 1, remediation rounds 0. Infrastructure/order corrections do not reset or consume code-remediation counters. Claude session `e456a8ce-c239-4dab-8eab-546495737061` finished and writes stopped; actual model claude-opus-5, medium effort, fallback NONE, safe-mode with explicit skill packet. No active product writer.

PM effective context/occupancy UNKNOWN; first compaction occurred. This is an atomic evidence/review checkpoint, not initiation of a new scope. Recovery handoff is TRANSFER_PENDING, no receiver started or accepted, no background execution. See task `orders/W-B1b-01-pm-recovery.md`. Preserve current state, orders, decisions and counters. Pending explicit user question requests authorization for PDF route/test scope. Until answered, do not dispatch r4 or mark ledger DONE. Human Directora signature, remote CI, merge and deployment remain separate and unperformed.


## Final local review — r4/r5, 2026-09-10

This appended verdict supersedes the initial BLOCKED verdict and pending PDF scope decision above. User “lo autorizo” approved r4 PDF route/test scope. Current Codex PM accepted the recovery lock in r4; no new task or competing PM was created. Orders r1–r5 and accepted decisions remain preserved.

**Verdict: APPROVED_WITH_NOTES for the complete local implementation. UI_VERIFIED for the bounded report/PDF journey. B1B-F01 and B1B-F02 CLOSED.** Authorized local implementation/review boundary: VERIFIED_PHASE_CLOSED. Release work item W-B1b-01 remains SCHEDULED, not DONE: no commit/publication/remote CI/merge/deploy/production verification or human Directora signature is claimed. No next unit activated.

### Exact final state

Root `/Users/brentcurtis/dev/wt/b1b-current`, branch `fix/horas-rep`, HEAD/base `b17a68393dc7cd3a6ccfed9fffa3252c7e97fb46`. Cumulative product diff 4 files, +313/-41, uncommitted. Claude Code sole author, Codex independent reviewer. PM inspected all cumulative product changes and the new reports; the product remains inside the expanded allowlist. Existing query behavior, tenant exclusion, billing, API wire shape and authorization are preserved.

| File | Final SHA256 |
|---|---|
| lib/services/school-hours-report.ts | 019253d3237f5f2df22336f05ba26b103448589374b37b5fc2e0a97f4d16c7ba |
| __tests__/lib/services/school-hours-report.test.ts | 529fb5242b79fae736414b62f57f895d620573bfd11bb2b6efc831571a022e92 |
| pages/api/school-hours-report/[school_id]/pdf.ts | c062dfe7e009416b3f2d1a919c104d6392ac5f0271cc24c0b703818100ada1d3 |
| __tests__/api/hour-tracking/school-report-pdf.test.ts | 5edb18b5d1595179278e064bd3694c0aeb5aeb2cf6c2731e6939cbbe06d0d566 |

PDF route uses the installed plugin's explicit function for all three tables, plus its own callback type. No dependency/configuration changes. The test executes actual jsPDF/autotable and checks PDF structure, content and damaged-byte counterexamples with existing pdf-lib. The content extraction helper is scoped to the current generator's literal-string output; it is not certified as a general PDF text parser.

### Independent validation and evidence limits

PM OBSERVED: final 4-suite focused command (service, billing, JSON, PDF) passed **57/57 in three independent processes**, exit0 each (`r5-pm-focused-1/2/3.log`). This bounded repeat addresses the observed flake, not retry-until-green.

PM OBSERVED: production mandatory E2E **223/223**, exit0, 16 required specs and no skips, guard PASS (`r4-pm-e2e-results.json`, `r4-pm-e2e.log`). Test-only r5 leaves the reviewed production bytes byte-identical, so the build, HTTP, E2E and UI evidence remains applicable. The prior pgTAP **4116/42 files** pass is retained as unaffected database evidence: no DB, migration, auth or query change in r4/r5. No misleading claim that pgTAP reran in r5.

Executor REPORTED, logs inspected: final full Vitest **430 files, 9881 passed, 12 pre-existing skipped**, type-check and lint exit0. Production build r4 exit0,149 pages; r5 changes tests only. Corrected focused test 20 separate runs passed. Old-route negative control caused four failures with the original plugin error; route restored to exact final hash. Direct PDF regression runs 6 tests including rejection of a shifted xref entry and a truncated PDF.

PM OBSERVED real HTTP rerun: directivo own-school PDF200/application-pdf, admin200, directivo other-school403, unauth401. Valid PDF signature, content length and readable content; regular50/3/2/45, annex10, aggregate60/3/2/55. The aggregate includes both contracts; the UI card shows the selected contract. PDF is one A4 page, all tables/session rows and footer readable without overlap or clipping. PM rendered and inspected it with Poppler. Durable sample `evidence/validation/r4-school3-directivo.pdf`; preview corresponds to the same product bytes, with generation time earlier than the HTTP rerun. UI screenshots were tool-visible in the conversation, not saved image files.

PM OBSERVED Computer Use, production localhost3107, synthetic equipo_directivo: login, automatic own-school report load, regular card, PDF button activation on desktop and mobile, keyboard Space/ArrowDown/Enter changes to annex, expected10/0/0/10 card, reload restores the initial contract, expand two session details. Desktop1366x768 and mobile390x844 reviewed; mobile menu closed before layout review, session table uses its existing horizontal scroll. Viewport override reset afterwards. The PDF attachment did not open a new browser tab; actual bytes/headers were independently retrieved over the same route and visually inspected. No native download-folder confirmation claimed. Console recorded a synthetic fixture profile warning at login, not a PDF error. No assistive-technology audit, multi-page stress or hosted human acceptance claimed.

A1 report/query PASS; A2 mapping/PDF consistency PASS; A3 billing regression PASS; A4 auth/error/empty and scoped keyboard/reload journey PASS; A5 required local checks PASS, release/human gates unperformed; A6 bounded diff/protected work and artifact accounting PASS.

### Findings closed and notes routed

B1B-F01 CLOSED: actual library invocation corrected and live/visual/test proof obtained.

B1B-F02 CLOSED by replacing the failing test reader with independent structural/content checks, with preserved assertions and corruption counterexamples. PM initially observed 55pass/1fail (`bad XRef entry` in pdf-parse); that failure is retained, never relabelled PASS. The failed run's PDF bytes were not captured. Exact trigger is therefore UNKNOWN: executor's proposed reader/race explanation is an inference, not proven cause, and the assertion that malformed bytes are ruled out does not extend to that missing sample. Replacement removes that reader from the regression; stress and independent final checks substantiate current acceptance without pretending to diagnose the old internal race.

B1B-N01 retained: stale test:api script/config, tooling backlog, PM triage before next tooling maintenance; default Vitest covers the API tests.
B1B-N02 routed outside this unit: analogous doc.autoTable usages in consultant-earnings PDF and lib/exportUtils, with a mocked earnings-PDF test. PM independently confirmed the calls, not their runtime failure. Owner: Codex PM triage in a future bounded export-maintenance order; trigger before touching/publishing those exports. No new work item or repair authorized by this note.
B1B-N03: remaining pdf-parse consumers are unassessed; dependency/tooling backlog for future reproducible-reader failure. No broad upgrade proposed as part of this unit.

Ledger baseline remains 67 existing ownership failures, exit1; frozen/structural checks pass. This governance debt was not repaired or waived. Historical reports retained; executor report §9 contains an old pre-r4 request and is superseded by its §§8c/8d and this verdict.

### Delivery and continuity

Initial continuation execution1; remediation rounds2/2, no reset and no rounds remaining. Claude session e456a8ce-c239-4dab-8eab-546495737061 finished exit0, product writes stopped. Verified actual model claude-opus-5, medium, safe-mode with explicit packet, no fallback. PM final scope/hash checks passed; original dirty checkout preserved, historical email report/frozen map unchanged.

Evidence copied to task evidence/validation with SHA256 manifest. Temporary synthetic stack, test harness, diagnostic PDFs and local env/build/dependencies RETAINED for review; no resource deletion. An attempted executor deletion was denied, then the diagnostic was run without deletion; no bypass or user cleanup grant inferred. Production test server stopped after E2E. Any later preview restart is recorded separately. No hosted/provider operations or publication.

Context occupancy remains UNKNOWN; first compaction belonged to pre-r4 checkpoint, no additional compaction observed during r4/r5. Authorized local work is complete, not a transfer into another phase. Earlier recovery handoff is superseded; future continuation must read this final verdict and preserve counters, existing checkout, release protocol revision11 and canonical ledger. Next step is a separate release/human-acceptance decision, not another automatic implementation round.

Preview retention 2026-09-10: Codex PM restarted the reviewed production build on localhost:3107 in persistent terminal session26992, PID 83306, cwd verified. An earlier detached start PID83283 did not persist and is not running. This restart is PM-owned; the original executor script label is not current ownership. Synthetic stack retained. No publication. Stop this PID only after ownership recheck; no resource/worktree cleanup authorized.
