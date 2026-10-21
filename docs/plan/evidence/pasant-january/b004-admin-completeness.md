# PASANT-B004 — admin leads completeness (C009)

Status: **AUTHORED, NOT VALIDATED — PARTIAL** (PASANT-B004 r1, authorship-only, 2026-10-15; fixture continuation
`r1-fixture-continuation-1`, §8; remediation 1 `r1-remediation-1`, §9). No test, scanner, build, seed, service or browser
check has been run on this state. Every gate below is open. Nothing here is accepted on the strength of code. The
consolidated review's three blockers (B004-R1-01, B004-R1-02, N5) are addressed in code by remediation 1 (§9) and are
still open until independent review and execution.

- Executor: Claude Code (`claude-opus-5-5`, requested effort high, fallback NONE). `bounded-executor` was read manually as
  instructed, not natively invoked. PM: Astra (coordination only). Independent reviewer: Codex Sol 6.1.
- Base: `fix/p02b-r1` at `85838af02a03a5289ad71852aab007fa62edbbf7`, on top of the uncommitted B002a/B002b/B003 overlay
  (B003-part2 final freeze identity `689d9fd4…`). No inherited file outside this unit's allowlist was changed.
- Scope: the existing FNE-global admin screen `/admin/pasantia-leads` and its API. No SQL, RLS, auth helper, RBAC helper or
  shared exporter change.

## 1. What changed

| Area | Change |
| --- | --- |
| Access (`pages/api/admin/pasantia-leads/index.ts`) | `checkIsAdmin` (401 / 403) unchanged, then the shared forced-password verdict (`getForcedPasswordChangeVerdict` + `sendForcedPasswordChangeResponse`, unchanged) for every GET (screen and export pages) and PATCH, before any lead, interest or count query. A thrown flag read is `unavailable` → 503 (fail closed). The page keeps `getServerSideUser` + `isGlobalAdmin`. |
| Contacts and counts | GET pages contacts: `order(created_at desc, id desc)`, `.range()`, `count: 'exact'`. Interests are embedded per contact (`program_interests`, JSON array, contract order), so a contact with both programs is one row. The global tab counts are five unfiltered exact HEAD counts (total + four statuses), independent of status/search/program filters; the matching total is `pagination.total`. A missing or failed count is a 500, never a guess. |
| Validation | `page` 1–10 000, `pageSize` 1–500 (below PostgREST `max_rows` 1000), plain positive integers only; repeated params, signs, decimals, leading zeros, exponents and blanks are 400 before any query. `program` ∈ `inspira`, `mirada-profunda`, `sin-programa`. Search sanitization unchanged. A page past the end answers 200 with no rows and the real total (PGRST103 → filtered recount). |
| Program filter | A second embed of the same relation under the alias `program_match` with `!inner` carries the filter, so the matched contact keeps ALL its interests; the alias is stripped from the response. `sin-programa` uses embedded-null filtering on `program_interests`. |
| Labels (`components/admin/PasantiaLeadCard.tsx`) | `leadProgramLabels`: program names from `cohort-public` (`Pasantía INSPIRA`, `INSPIRA Mirada Profunda`); a non-January contact without an interest is `Histórico (cohorte …) · sin programa registrado`; a January contact without one is `Sin clasificar · sin programa registrado`; an unexpected stored value is shown as inert text. Same labels on the desktop table, the mobile list, the detail card (with each interest's own consent time and version) and the CSV. |
| Screen (`pages/admin/pasantia-leads.tsx`) | First / previous / next / last pager with range text; program filter; stale-response guard; clamp to the last page when the set shrinks; error panel with retry; filter changes return to page 1. Triage (status select, notes) unchanged. |
| CSV | `collectAllMatchingLeads` walks every page of ONE captured filter set at 500 per page and refuses (no download) on any non-OK page (including session expiry or a held account), a total or watermark change, a short page, a repeated id, an order violation, an echo for the wrong page, or a final count mismatch. Only then is `ReportExporter.exportToCSV` called once with all rows. Headers are `LEAD_CSV_HEADERS`, and `leadCsvRow` is typed against them; columns `Cohorte` and `Programas` added. An empty match exports headers only. |
| PATCH | Unchanged: `{status, notes}` whitelist, D-03 transitions, compare-and-set `.eq('status', current)`, 2000-character notes cap. It reads and writes `pasantias_leads` only — never interests or consent evidence. |

## 2. Export consistency protocol

> **Correction (remediation 1, B004-FLOW-N1 / B004-R1-02).** This section is kept as first authored. Item 2 and the
> residual-limit paragraph overstated final-page protection. The watermark was read only BEFORE each page, so a write
> landing between the last page's watermark read and its list query was never checked. The actual protocol now in the
> code is §9.2. The §1 "stale-response guard" also did not cover a save's refresh (B004-R1-01, §9.1).

1. The filter set is captured once, before the first request; tab/search/program changes during an export cannot splice two
   result sets.
2. Every GET reads `max(updated_at)` over ALL contacts **before** its page (`watermark`). Inserts stamp `updated_at`
   (`DEFAULT now()`), updates bump it (trigger `trg_pasantias_leads_updated_at`), and a resubmission upserts the contact row,
   so any write after page 1's watermark read changes a later page's watermark → refusal.
3. Every page must repeat the first page's `total` and `watermark`, echo its own page number and size, hold exactly the
   expected number of rows, introduce no id seen before, and continue the `(created_at desc, id desc)` order (compared at
   microsecond precision).
4. The walked count must equal the announced total.

Residual limits (stated, not hidden): a transaction that began before the watermark read and commits after it carries an
older `updated_at` and is invisible to the watermark (the total/duplicate/order checks still catch inserts and filter-moving
updates); a write after the last page's watermark read is consistent with that page's single statement only. Detection is
fail-closed (any edit by another admin during an export refuses it) — retry is cheap at this scale.

## 3. Criteria map

| Criterion | Code | Unit evidence (authored, NOT RUN, mocked) | Real evidence (authored or owed, NOT RUN) |
| --- | --- | --- | --- |
| C009-access | route handler order; page SSR unchanged | `__tests__/api/admin/pasantia-leads.test.ts` — 401/403 untouched; `forced password change` block: required → 403 `PASSWORD_CHANGE_REQUIRED`, unavailable → 503, thrown → 503, for GET, export-shaped GET and two PATCH shapes, each with and without a Bearer header, and `from()` never called | `tests/e2e/pasantias-flow.spec.ts` — anonymous 401 and docente 403 on GET, export page and PATCH (non-mutating unknown id). Continuation: `adminForcedPassword` by cookie AND by a genuine password-grant bearer token → 403 `PASSWORD_CHANGE_REQUIRED`, no data keys, on GET, export page, notes PATCH and status PATCH of an owned `new` contact, whose status/notes/`updated_at` are then unchanged; controls: unflagged admin bearer 200, docente 403 without the code. `ci-fixture.spec.ts`: the persona lands on `/change-password` and the PASANT route refuses it. |
| C009-contact-counts | `handleGet` | order + tie-break, default and explicit ranges, `count: 'exact'`, 5 unfiltered HEAD counts with status/search/program applied to the list only, missing/failed count → 500, 15 invalid pagination shapes → 400 with zero queries, PGRST103 → empty page + filtered recount | flow spec: invalid pagination/filters → 400 on the real route; past-the-end page; **C009-scale**: walk of every contact, exact counts per status vs walk tallies and vs each tab's filtered total |
| C009-programs | route embeds; `leadProgramLabels`; card; page | both/one/none/historical/unclassified/unknown labels; contract order; program filter keeps both interests and strips the alias; card shows per-interest consent; page source carries both desktop and mobile label testids | flow spec: a real two-submission contact has both interests with their consent version; program filter by either program returns both and total 1; `sin-programa` excludes it and includes the seeded October contact; desktop 1366×768 and mobile 390×844 label the historical contact |
| C009-complete-export | `collectAllMatchingLeads`, `leadCsvRow`, page `handleExport` | 1205 synthetic contacts in runs of 7 equal timestamps (500-row page boundaries inside runs): all returned once, newest/oldest included; CSV through the SHARED exporter (Blob captured) has 1206 records and every label kind; refusals for arrival mid-export, watermark-only change, boundary duplicate, short page, swapped order, wrong page echo, failed page, missing total, >200 pages; empty → headers only; hostile cells (comma, quotes, newline, bare CR, `=`, `@`, leading-whitespace `+`, `-2+3`, embedded tab) stay in their field and no cell opens a formula | **C009-scale browser:** export from page 1 downloads exactly `total` rows whose e-mail multiset equals the API walk |
| C009-triage | PATCH unchanged; card unchanged | every pre-existing PATCH case kept; new: triage touches `pasantias_leads` only; extra keys incl. consent/interest keys never reach the update; notes at exactly 2000 accepted | existing A8/A9 specs; UI actor persists a status change and a note |
| C009-scale | — | unit layer above (mocked; insufficient by itself) | flow spec `C009-scale` ×2 plus the owned-fixture describe (§8): the owned 1205 are the table's exact tail in declared order, equal-timestamp runs proven to span export and screen page boundaries, every status × program filter as exact ordered ids, hand-written search cases, 1366×768 export of all 1205 / of one 120-row filter / of an empty filter, hostile cells, 1366×768 and 390×844 labels. Needs the seeded fixture; real PostgREST `max_rows` + browser evidence mandatory |

## 4. Needs routed to the PM (no file outside the allowlist was touched)

N1 and N2 were allowlisted by the fixture continuation and are now AUTHORED (§8). N3 is met by timestamp ordering. N4
stands. N5 is new.

- **N5 session-tier partition (load-bearing, continuation finding; authored in remediation 1, §9.3)** —
  `tests/e2e/helpers/session-personas.ts:97-118`
  throws at module load for any roster persona in no tier. With `adminForcedPassword` in the roster, the four specs that
  import it (`zoom-join-authz`, `zoom-managed-join`, `session-disclosure`, `session-ical`) fail to load until it is
  classified. No existing tier fits: the password gate refuses the persona before any session decision. Recommended
  smallest correction (needs an exact path extension): add `PASSWORD_HELD_PERSONAS = ['adminForcedPassword']`, counted by
  the partition and iterated by no session matrix. Alternative: move the persona out of `users` (deviates from the
  reviewed "complete roster" scope). Not edited.
- **N1 bulk fixture** — narrow allowlist on the PASANT portion of `scripts/ci/seed-e2e.mjs` and
  `scripts/ci/e2e-fixtures.json`. Recommended content: 1205 synthetic contacts (`example.com`), all `created_at` OLDER than
  the seeded `pasantiasLead` (see N3); runs of equal `created_at` straddling offsets 50, 500 and 1000; all four statuses;
  January contacts with both interests, with each single interest, and without any interest (unclassified); October contacts
  without interests (historical); interest rows with consent time/version; a few rows with hostile CSV text (leading `=`,
  `@`, `+` after spaces, comma, quotes, LF, bare CR). Idempotent like `ensurePasantiasLead`.
- **N2 forced-password persona** — real-app evidence for a flagged admin (cookie and Bearer) needs a persona in the seed /
  fixtures / `tests/e2e/helpers/auth.ts`, or a PM-provided synthetic actor for the UI run.
- **N3 non-allowlisted admin spec** — `tests/e2e/pasantias-leads-admin.spec.ts` (unchanged) expects the seeded lead on the
  first screen page (newest 50). It stays green only if fewer than 50 contacts are newer than the seeded lead: hence N1's
  timestamps. Locally accumulated flow-spec contacts (4 per run, never reset) can eventually push it off page 1.
- **N4 shared exporter gap (finding, not edited)** — `csvEscape` (`lib/exportUtils.ts:29`) quotes on `,` `"` `\n` but not on a
  bare `\r`, which ends a row in spreadsheet readers. Mitigated locally (`leadCsvRow` normalizes CR/CRLF to LF before the
  exporter); the shared helper is out of scope and should get its own unit.

## 5. PostgREST features relied on (unit mocks cannot prove these)

Aliased duplicate embed of one relation with `!inner` and a filter on the alias; embedded-null filtering
(`program_interests=is.null`, PostgREST ≥ 11); exact counts with an inner embed; composite-FK embedding
(`(lead_id, cohort)` → `(id, cohort)`); HTTP 416 / `PGRST103` past the last row. All are exercised by the authored flow-spec
cases on the real stack; none has been run.

## 6. Gates (all NOT RUN)

Focused unit (`__tests__/api/admin/pasantia-leads.test.ts`, `__tests__/components/admin/pasantia-lead-card.test.tsx`,
`__tests__/lib/pasantias-leads.test.ts`, and since remediation 1 `__tests__/pages/admin/pasantia-leads.test.tsx`), the four
session specs that import `session-personas.ts` (must load and run normally), type-check, zero-warning lint, full unit, build + price guards, full pgTAP/RLS and
password guard, real API/PostgREST, browser (`tests/e2e/pasantias-flow.spec.ts`, `pasantias-leads-admin.spec.ts`), and the four
PR CI gates. UI journeys (both viewports; synthetic admin, non-admin, anonymous, forced-password admin; navigation,
first/last pagination, search, status and program filters, labels, notes and status updates with persistence, CSV > 1000,
empty/error/retry, keyboard focus, denials) belong to the designated UI actor and have not been performed.

## 7. Inherited hygiene

B003-P2-N1: `__tests__/lib/pasantias-leads.test.ts` — the single test title that claimed a refusal it does not exercise now
reads `pins the programInvalid message the retained single-track branch would return`. Assertions, fixtures and logic
unchanged.

R-08 (designed brochure upload) and R-17 (real mail) remain Brent-owned release obligations; historical A9 failures and
blocked rows persist. No delivery or deployment is claimed.

## 8. Fixture continuation (`r1-fixture-continuation-1`, authorship only, NOT RUN)

Same executor role and model; new session `2a39437b…`. The six frozen core paths (route, card, page, two unit suites,
hygiene title) were not touched. Paths changed in this pass: `scripts/ci/seed-e2e.mjs`, `scripts/ci/e2e-fixtures.json`,
`tests/e2e/helpers/auth.ts`, `tests/e2e/ci-fixture.spec.ts`, `tests/e2e/pasantias-flow.spec.ts`, this record, the review
request and `PROJECT_STATE.md`. Nothing was seeded: the fixture exists only as authored code until a reviewed runtime release.

**Owned bulk fixture (`pasantiasBulk`).** 1205 is the OWNED count, separate from the A8 lead and from journey contacts. No
spec treats it as the table total. Rules:
- Ids `e2eb0040-0000-4000-8000-00000000NNNN`, e-mails `e2e-pasantias-lote-b004-NNNN@example.com`.
- kind = (i−1) mod 5 → inspira / mirada-profunda / both / historical (`octubre-2026`, no interest) / unclassified
  (`enero-2027`, no interest), 241 each.
- status = ⌊(i−1)/5⌋ mod 4 → new 305, contacted/converted/dismissed 300 each. Each program filter matches 482.
- Timestamps, all before 2026-07-01, so older than any A8 lead:
  - run A, i 1–600: one instant;
  - ladder B, i 601–1100: one millisecond, distinct microseconds;
  - run C, i 1101–1205: one older instant.

Runs A and C exceed 501 and 51 rows respectively, so they span export and screen page boundaries whatever the number of
newer contacts. The `expected` block (counts, order segments, newest/oldest, 12 search cases) is hand-written. The seeder
refuses before connecting if its generated rows disagree with it. The spec re-derives the contacts independently and
checks the same block. Seven hostile contacts carry formula prefixes (incl. leading spaces), tab, CR, CRLF, quotes/commas,
Unicode, HTML/script and PostgREST-structure text, each with the hand-worked CSV cell expected.

**Ownership and reruns (expected mutations, disclosed).**
- Before writing, the seed refuses if an owned id holds another e-mail or cohort, or an owned contact holds an
  undeclared interest. It never deletes.
- Contacts are upserted on id, interests on (lead_id, program).
- A rerun converges every listed column of the OWNED contacts, status and notes included, and moves their `updated_at`.
  It never reads-for-write or alters the A8 lead (`ensurePasantiasLead` unchanged) or any other contact.
- A non-owned row holding an owned (e-mail, cohort) pair makes the upsert fail on the unique key. The seed fails closed.

**Forced-password persona.** `users.adminForcedPassword` (admin, `mustChangePassword: true`). `ensureProfile` now writes
`must_change_password` as `fixture.mustChangePassword === true`, so every existing persona stays false. The seeder and
the auth helper both refuse a fixture file where the flag is anywhere else, is missing, or is not on an admin.
`loginViaUi` expects `/change-password` (exact path, plus the "Cambio de Contraseña Requerido" heading) for that persona
only. Every other persona is still held to `/dashboard`. `ci-fixture.spec.ts` gives the persona a dedicated test and
keeps the normal per-persona test unchanged. Bearer tokens come from a password grant against the LOCAL auth server
with the fixture's own credentials (the `notification-dispatch.spec.ts` pattern), refusing a non-local URL.

**Submission proof.** The existing two-submission test now also reads the contact after the FIRST submission (exactly
`['inspira']`), sends the second submission with the same address in capitals, and asserts the same contact id afterwards.
It makes no extra submission: `/api/pasantias/lead` allows 5 per minute per client, and the A9 describe already makes 4.

**Residual risks (for review).**
- N5 above.
- A local stack with leads created before 2026-04-01 would break the "owned set is the tail" assertion (impossible on
  CI's fresh stack).
- A UI journey that triages a bulk contact makes the exact-count tests fail until the next seed.
- Other specs that count admins were looked for by search only. None was found.
- The CSV expectations for `Fecha` / `Programa enviado` are not asserted (presentation).

## 9. Remediation 1 (`r1-remediation-1`, authorship only, NOT RUN)

Same executor role and model; session `5147b14d…`. Order `order-remediation-1.json`, from the consolidated review
`combined-review-r1.json` (CHANGES_REQUIRED). Attempts: initial 1, scope continuations 1, **remediation 1**; inherited
counters unchanged. Paths changed: the route, the page, the card (a comment only), the API suite, the new page suite
`__tests__/pages/admin/pasantia-leads.test.tsx`, `tests/e2e/helpers/session-personas.ts`, `tests/e2e/zoom-join-authz.spec.ts`,
this record, the review request and `PROJECT_STATE.md`. The fixture/seed/flow files are untouched.

### 9.1 B004-R1-01 — a save's refresh repainting an old filter or page

Finding: a successful PATCH awaited the `fetchLeads` captured when the save BEGAN. If the admin changed filter or page
while the save was pending, that refresh fetched the OLD context. It started after the new context's request, so the
newest-request guard let it win.

Fix (`pages/admin/pasantia-leads.tsx`): a successful save bumps a `reloadToken` state, which is a dependency of the fetch
effect. The refresh is therefore issued by the effect of the render that is current when the save ENDS, with the filters
and page on screen. The newest-request guard still discards any earlier answer (a stale pre-switch GET included). Controls
are not disabled during a save.

Evidence (authored, NOT RUN): the new page suite renders the real page and answers every request explicitly.
- Status-tab and program-filter switches, each in both completion orders. The test checks that the save's refresh asks
  for the new context, that no request after the switch asks for the old one, and that the final screen (after draining
  timers) shows only the new contact, its counts and its pager text.
- A status-change save with a context-A refresh answered last.
- Page 1 → 2 in both orders, after which the pager moves on to page 3.

### 9.2 B004-R1-02 — the last page's mutation window: actual protocol

Every GET (screen and export pages alike), in this order:
1. Read the watermark `W1 = max(updated_at)` over ALL contacts.
2. Read the page (exact count) and the five global counts, plus the filtered recount if the page is past the end.
3. Read the watermark again (`W2`). If `W2 ≠ W1` → **409** `{ error: 'Los leads cambiaron mientras se leían', code:
   'LEADS_CHANGED_DURING_READ' }`, with no rows. If the second read errors → 500. If it throws → the existing 500. It
   never answers 200 on an unreadable second read.
4. Only otherwise 200, carrying `W1`.

The collector (unchanged) still requires every page to carry page 1's watermark and total, full pages, no repeated id,
the `(created_at desc, id desc)` order, and the walked count equal to the total. The page turns any non-OK page
(409 included) into "… No se descargó ningún archivo." and downloads nothing.

What this detects: any write whose `updated_at` stamp, as seen by a later watermark statement, is newer than the first
read of page 1. That covers the gap between page 1's first read and the last page's second read, the last page's own
list query included.

What it does NOT guarantee (bounded honestly):
- No snapshot isolation. Each query is its own PostgREST statement.
- A transaction that began before a first read and commits later carries an older `now()` stamp and does not move the
  maximum. The §2 total/duplicate/order checks still catch inserts and many filter-moving updates, not all of them.
- A delete is not modelled. The route offers none, and D-04 grants none.
- A write after a page's second read is caught by the next page's reads. A write after the LAST page's second read falls
  outside the export's read window: the file reflects the table as it was during the walk.

The screen GET uses the same rule. A write racing a screen read shows the existing error panel with Retry instead of a
mixed page.

Evidence (authored, NOT RUN; mocks prove orchestration only): `final-page consistency (B004-R1-02)` in the API suite
runs the route against one shared fake table. The list query is held once it arrives, so this request's first read is
already done. The table is written, then the list is released. The cases:
- a collected contact's edit → 409;
- a `status=new` membership swap with the total unchanged (301) → 409. The test shows the refused final page was full,
  unique, in order and complete-looking, yet the mixed set kept a non-matching contact and missed a matching one;
- a one-page write → 409;
- a second-read error or throw, on one page and on the final of three → 500;
- an empty second read → 409;
- an unchanged positive control with equal-timestamp boundaries → 200 ×3;
- the collector walking the real route: 1205 on success, and the exact refusal message otherwise.

The page suite drives the real Export button: pages 1–2 OK and page 3 answered 409 → zero exporter calls, zero
`createObjectURL`, zero `<a download>` clicks, the alert text and an error toast, no success toast, and the button
re-enabled. A retry then downloads exactly once with 1205 rows. The real PostgREST/database race proof stays owed.

### 9.3 N5 — password-held roster tier

`tests/e2e/helpers/session-personas.ts`:
- adds `PASSWORD_HELD_PERSONAS = ['adminForcedPassword']`;
- counts it in the totality, duplicate and unknown checks;
- requires it to equal exactly `[FORCED_PASSWORD_FIXTURE_KEY]` from the auth helper.

PRIVILEGED, REPORT_PRIVILEGED, EMAIL_ONLY_PRIVILEGED, VIEW_ONLY, DENIED and VIEWER are unchanged. The held persona is in
neither VIEWER nor DENIED, and no session matrix iterates it. The hold comes before authorization, so it is not a
permission denial. Its evidence is the mandatory `ci-fixture.spec.ts` login (`/change-password`) and the
`pasantias-flow.spec.ts` cookie/bearer GET/PATCH denials.

`tests/e2e/zoom-join-authz.spec.ts`: only the partition test changed. It compares the sorted four-tier roster with sorted
`FIXTURE_KEYS`, refuses duplicates, and pins the held tier to `['adminForcedPassword']`. It is labelled as complete
fixture classification, not session coverage. Every other assertion and journey is unchanged. No session endpoint
behaviour was assumed.

### 9.4 Repeated parameters (core review note B004-N1)

A repeated `program` is now refused: 400 "Indica un solo programa.", before any query. `program` is new with this unit and
the route offers no "either program" filter. `status` and `search` keep their inherited first-value reading; tests pin it
(a repeated `status` still validates its first value, and a repeated `search` is still sanitized).

### 9.5 Gates

All NOT RUN, as in §6. Mocked unit evidence is not runtime evidence. The real 1205-contact PostgREST/browser runs, the
real race, the four session specs loading normally and every UI journey remain owed. R-08/R-17 and the historical A9
failures/blocked rows persist.
