# Santa Marta hours report — actionable audit findings

Parent work item: **W-BL-A14-4**, BACKLOG / P1 in [the mutable work ledger](santa-marta-work-items.csv).
This register is the detailed checklist of that existing item, not a second work ledger or a new set of historical claims. Its child IDs preserve the SM-01 audit's F1–F12 numbering. The parent ledger links here for status, next actions and completion evidence.

Brent authorized recording these findings after the SM-01 audit. Recording is complete; remediation is not started. No executor, delivery date or remediation owner has been assigned. All entries below remain open. Product decisions must be recorded before the affected implementation is ordered; no decision is inferred from this checklist.

Evidence baseline: `edf9791e053d5198cba96be7fcf02f1ea4bb5f34`. SM-01 r0 was independently APPROVED_WITH_NOTES as a read-only audit; 57 focused tests passed. Source inspection supports the findings, but no database reproduction, browser interaction or production verification was performed. The external original audit/review remains under `/home/brent/Projects/pm-workflow/runs/SM-01/`; this register includes the actionable evidence so tracking does not depend on that local directory.

## Triage queue

All remediation/triage owners are **unassigned**. Priorities describe product risk, not authorization to execute. BACKLOG means unscheduled; DECISION_PENDING and HELD are child dispositions, not new work-ledger status values.

| Child ID (audit ID) | Priority | Disposition | Work to resolve |
|---|---|---|---|
| A14-4-F01 (F1) | P1 | MERGED — production/institutional verification pending | Correct overlapping parent/annex school-wide totals |
| A14-4-F02 (F2) | P2 | LOCALLY_APPROVED | Selected scope, CSV totals and explicit annex identification verified in SM-03/04/05; shipping separate |
| A14-4-F03 (F3) | P2 | PARTIALLY_LOCALLY_APPROVED | CSV heading clarified in SM-06; broader scenario completeness remains held |
| A14-4-F04 (F4) | P2 | BACKLOG | Identify unledgered session status/hours honestly |
| A14-4-F05 (F5) | P2 | BACKLOG | Make capped session detail complete or explicitly partial |
| A14-4-F06 (F6) | P2 | BACKLOG — browser proof pending | Keep school selection and report/export data consistent |
| A14-4-F07 (F7) | P3 | BACKLOG | Verify export/error feedback and download cleanup |
| A14-4-F08 (F8) | P3 | BACKLOG — importer proof pending | Preserve CSV carriage returns and accented text |
| A14-4-F09 (F9) | P3 | DECISION_PENDING | Define filenames and report-date timezone |
| A14-4-F10 (F10) | P3 | DECISION_PENDING | Define intended presentation differences |
| A14-4-F11 (F11) | P3 | HELD — attendance provenance | Establish a trustworthy attendance source before display |
| A14-4-F12 (F12) | P3 | BACKLOG | Cover existing refusal and error branches |

## A14-4-F01 — overlapping annex totals

Source: `supabase/migrations/20260813120200_session_hour_overrides.sql:407` includes direct and linked annex allocations; `lib/services/school-hours-report.ts:184` requests each contract summary; `pages/api/school-hours-report/[school_id]/pdf.ts:135` sums every contract. `__tests__/api/hour-tracking/school-report-pdf.test.ts:201` uses a parent allocation fixture that omits the annex contribution.

Counterexample: base allocation 50 + linked annex 10 + unrelated contract 20 gives 80 unique allocated hours. The PDF sums 60 + 10 + 20 = 90. With 3.33 consumed and 2 reserved, it shows 84.7 available rather than 74.7. An annex-owned consumed row can also be counted in both summaries; subtracting annex allocation from available alone is not a sufficient general correction. This is source-derived, not an observed production invoice.

Local resolution (2026-09-17, SM-02): real-service/PDF regression and independent review complete; unique allocation/ledger identity, short-page completeness and exact ledger inventory registration verified. PM236focused/inventory tests and25browser assertions pass; executor fullunit9305pass/1existing skip,type/lint/syntheticbuildpass. See /home/brent/Projects/pm-workflow/runs/SM-02/pm-review-r1.md and docs/planning/reviews/fase-sm-02-review-request.md. Next action: Brent-controlled shipping and institutional acceptance; no deployment or Production verification claimed.

Done when: unique school-wide allocated/reserved/consumed/available figures reconcile without double-counting, including empty, override/waiver, returned and penalized cases; the real service-to-PDF path has a regression that fails against the old behavior. Existing billing semantics and per-contract views remain accounted for. No production or schema action is authorized by this entry.

## A14-4-F02 — export scope and omitted fields

Source: `components/hours/SchoolHoursReport.tsx:288` selects one contract; `:445` exports all programs/contracts; CSV omits totals and annex flags and emits no row for a zero-bucket contract. PDF includes all contracts and a grand summary.

Next action: obtain a recorded product decision on selected versus whole-school export scope, aggregate fields, annex identification and empty-contract representation. Do not assume every visual difference is a defect.

Done when: the chosen contract is implemented and verified with two programs, multiple contracts including an annex, an empty bucket and a zero-bucket contract; exported scope is clear to the user. Depends on the product decision, and on F01 for trustworthy school-wide totals.

## A14-4-F03 — displayed hours versus charged totals

Source: `lib/services/billable-hours.ts:93` distinguishes `per_session_display` from `charged_total`; `components/hours/SchoolHoursReport.tsx:471` exports the former. Example session rows sum to 7.66 while charged rows total 3.33. Returned, reserved and unledgered session rows are not proof of a charge.

Next action: decide whether CSV needs an explicitly separate charged total and/or clearer labels. Preserve the existing intentional session-display values and status distinctions.

Done when: consumed/penalized versus reserved/returned/unledgered scenarios, fractional overrides and zero waivers have an unambiguous, reproducible export result under the agreed semantics. Coordinate the decision with F02; do not silently replace one measure with the other.

## A14-4-F04 — unledgered fallback status

Source: `lib/services/school-hours-report.ts:68` and `:294`. Unledgered draft/unknown statuses default to `reservada`; cancelled sessions default to `penalizada`, with scheduled hours and no provenance marker.

Next action: define an explicit representation of unledgered status/hours, with synthetic cases distinguishing recorded facts from fallback display. Keep this separate from any broader status or billing rewrite.

Done when: an unledgered draft/cancellation cannot be mistaken for a proven reservation/penalty, and ledger-backed rows retain their authoritative statuses and amounts across UI/CSV/PDF.

## A14-4-F05 — silent 500-session cap

Source: `lib/services/school-hours-report.ts:19` and `:223` cap detail at the latest 500 sessions per bucket. Summary figures remain complete, but none of the three surfaces reports truncated detail.

Next action: choose a bounded completeness strategy (such as pagination or explicit partial-detail reporting) and verify the boundary before implementation. Preserve resource limits.

Done when: 499/500/501-session synthetic cases distinguish complete and incomplete detail truthfully across UI/CSV/PDF, while totals remain correct. No silent incomplete export is represented as the complete session list.

## A14-4-F06 — stale school response

Source: `components/hours/SchoolHoursReport.tsx:411` has no request sequencing/cancellation guard; `:499` builds the PDF URL from the current school prop. A late response for A can replace B's displayed data, so CSV can use A while PDF targets B. Browser reproduction is pending.

Next action: reproduce A→B with controlled out-of-order responses, then guard report state against stale completion.

Done when: fast school changes and delayed success/error responses keep the selected school, report name/data, CSV and PDF target consistent; loading/error behavior is verified through the real UI. No role/access policy changes are included.

## A14-4-F07 — export and error feedback

Source: `components/hours/SchoolHoursReport.tsx:417`, `:495`, `:499`; `lib/exportUtils.ts:53`; PDF route `:279`. Non-JSON HTTP failures are described as network errors; CSV throws are uncaught; success follows `link.click()` without proving download; blocked popups have no feedback; empty-bucket-less data can produce a header-only CSV; object URLs are not revoked.

Next action: exercise each branch using synthetic browser scenarios and define honest feedback for attempted versus confirmed output. Track resource cleanup with the exporter change.

Done when: HTTP/non-JSON/network errors, service/PDF generation failure, CSV serialization/download errors, blocked popup and header-only output have deliberate tested outcomes; no false completion claim; created download resources are cleaned up. A browser cannot always prove a completed file save, so acceptance must not assume that capability.

## A14-4-F08 — CSV text fidelity

Source: `lib/exportUtils.ts:27` quotes comma, double quote and LF, but a bare CR is not quoted after formula neutralization. CSV has no BOM; actual target-importer accent handling is unverified, not a proven encoding defect.

Next action: round-trip synthetic comma/quote/LF/CR/accent cases in the chosen spreadsheet importer. Fix any demonstrated loss while retaining formula neutralization and numeric behavior.

Done when: original cell boundaries and intended text survive import; bare CR does not split a cell/record unexpectedly; accents are verified. Decide BOM behavior from importer evidence rather than adding one by assumption.

## A14-4-F09 — filename and date consistency

Source: `components/hours/SchoolHoursReport.tsx:483` replaces whitespace; PDF `:271` replaces non-ASCII filename characters. Both filename dates are UTC; a Chilean 22:00 export can carry the next day's date while displayed generation dates use local time.

Next action: record a shared filename sanitization and timezone decision appropriate for es-CL reports.

Done when: CSV/PDF names and dates follow that decision for accents, slash-containing/long school names and the Chile/UTC day boundary; browser filename handling is observed rather than assumed.

## A14-4-F10 — presentation differences

Source: component `:243` renders full titles with CSS truncation, localized status labels, an over-budget badge and the first facilitator; PDF `:221` slices titles at 35 UTF-16 units, emits status keys and omits the over-budget marker. Dates and decimal precision differ. Long school names and non-WinAnsi glyphs have not been visually verified. ProgramView `:288` retains its selected contract ID when programs change.

Next action: decide which differences are intentional and verify long text, Unicode, fractional hours, multiple facilitators, negative availability and program/contract changes. Check stale contract selection explicitly.

Done when: intended transformations are documented and covered; meaningful report information is preserved or clearly identified as omitted; supported PDF text/layout and selection behavior are verified at desktop and narrow widths. No requirement for byte-identical presentation is implied.

## A14-4-F11 — attendance provenance (held)

Source: `lib/services/school-hours-report.ts:306` always returns `attendance: null`; UI/PDF show a dash and CSV leaves both attendance columns empty. Null is not measured zero attendance.

Next action: retain this held dependency until a separately authorized attendance design identifies source, meaning and completeness of expected/attended counts. Related work `W-B4c-01` populates expected attendees; it does not by itself measure attendance or close this finding. Do not reopen completed access/meeting work.

Done when: an approved source supplies trustworthy expected/attended values, with missing, measured-zero and nonzero cases distinguished and verified across all three outputs. No attendance population or database operation is authorized here.

## A14-4-F12 — refusal/error coverage

Source: existing JSON/PDF route tests do not cover eight branches: missing/array ID in both routes, nonnumeric ID/non-GET/unauthorized role/missing school in PDF, and thrown service/generation errors in both routes.

Next action: inventory by route and add focused tests through the real handlers using existing mocks. “Missing/array ID” is one branch per route; each input shape should still be exercised. No access-policy change or live security probe is required.

Done when: existing 400/401/403/404/405/500 behavior has explicit assertions for both routes, including output type/body and method header where applicable, and test isolation is demonstrated. Keep separate from any future authorization redesign.

## Activation and closure

F01 is locally approved through SM-02; shipping remains Brent-controlled. Decide F02/F03 together before exporter redesign. F06 is an independent UI candidate. Other entries remain unscheduled; F11 remains held.

When an item is activated, record its named owner, approved order, dependencies and target date here and reflect scheduling in the parent work ledger. When closed, retain the finding and append exact code/test/UI evidence or an explicit accepted deferral with owner and rationale. Parent closure requires dispositions for all twelve entries, applicable implementation quality gates and separately recorded institutional acceptance. An audit verdict or passing mock suite alone does not close the parent claim.

The three PM evidence/process notes (chronology, scratchpad discipline and a qualified empty-state statement) remain in the SM-01 PM review. They are workflow notes, not additional product defects or claims.


SM-02 merge verified 2026-09-17: GitHub PR #96 is merged into main (95766de9979d7c8bfabf5c22daff4ec5c70f98ce). Release contains the approved hours correction and its Santa Marta ledger documentation; unrelated GENERA work remains queued. F01 technical merge is complete. Parent W-BL-A14-4 remains held/unfinished, F02–F12 are not closed, and production/institutional acceptance is not claimed. Evidence: /home/brent/Projects/pm-workflow/runs/SM-02/merge-verification.json.

SM-03 local review 2026-09-17: Brent decided both downloads follow the selected contract. Independent r1 review approved that bounded correction: shared effective selection, selected PDF summary/detail and CSV rows, identifying empty-contract row, legacy filenames, unchanged hours accounting and legacy unscoped API compatibility. PM observed211focused tests including16component tests and31browser checks; complete repaired-runtime suite reported10114passed/12existing skips. Evidence: /home/brent/Projects/pm-workflow/runs/SM-03/pm-review-r1.md. Isolated runtime repair changes no repository/shared dependencies. Remaining F02 aggregate/annex fields and F03-F12 are held; F02 and parent are not closed. Shipping and production acceptance remain separate. Advisory documentation count wording/CI inference and existing presentation limits route to the next parent documentation/presentation unit.

SM-04 local review 2026-09-17: Brent approved selected-contract CSV summary totals alongside detail. Independent review accepts one first summary row, four existing screen totals at one decimal,16columns, unchanged session/category cells, explicit row kinds and blank totals on detail rows. PM212focused tests,32browser checks and6downloads parsed with Python csv passed; final full suite REPORTED10115passed/12existing skips. Evidence /home/brent/Projects/pm-workflow/runs/SM-04/pm-review-r0.md. Review-request bullet repeats baseline10114 in error; final10115 is authoritative. Session detail is not a reconciliation source for charged totals; F03 retains this semantic/label decision. Annex identification and F03-F12 remain held; parent and shipping/institutional acceptance are not closed.

SM-05 local review 2026-09-17: Brent approved explicit CSV annex identification. Independent review APPROVED_WITH_NOTES: appended Tipo de contrato summary field uses selected is_annexo only, Anexo/Contrato; first16columns and all detail/totals unchanged, other type cells blank. PM218focused, full10121passed/12existing skips435files, type/lint/build pass; named18browser checks plus independent23duplicate-number/opposite-flag checks,11downloads parsed independently. Evidence /home/brent/Projects/pm-workflow/runs/SM-05/pm-review-r0.md. F02 accepted decisions now locally complete; parent and F03-F12 remain open. Review-request focused count is7files/36suites, not35files; exact final lock omission in executor report recovered with PM independent full gates. These advisory reporting corrections belong to next parent documentation/dispatch, not another product repair. F03 still requires clearer session-versus-charged label decision; no new billing semantics, publication or institutional acceptance.

SM-06 local review 2026-09-17: Brent approved Horas de sesión as CSV detail heading. Independent APPROVED/UI_VERIFIED: exactly3product lines change header and matching row keys; all17positions/data values, summaries/annex labels and screen/PDF behavior retained. PM223focused pass; matching-lock executor final10126fullpass12existing skips435files and type/lint/build pass reused. PM named19browser checks and independent28counterexample checks passed; eight downloads parsed with Python csv, all parent cells equal SM05 except heading,0.00waiver retained. Evidence /home/brent/Projects/pm-workflow/runs/SM-06/pm-review-r0.md. F03 label step locally complete, wider F03 scenario completeness/F04-F12 and parent unfinished. No publication or institutional acceptance.
