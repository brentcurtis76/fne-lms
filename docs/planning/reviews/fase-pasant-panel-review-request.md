# Review request — PASANTÍAS PANEL (logistics panel for the January 2027 cohort)

**Status (2026-11-09): built and validated locally; not pushed, no PR, no CI run, nothing in Production.**
This unit was done by one Claude session outside the PM–Executor workflow, at Brent's request, as a model test. The fuller review packet (decisions, risks, questions) is a separate document Brent shares with reviewers; this file is the in-repo record.

## Branch and base

- Branch `feat/pasant-panel`, cut from `origin/main` at `b06a5b852` (merge of PR #173). Three commits: the panel; the round-2 changes Brent asked for after trying it; then the school notice wording and the daily note to admins (his answers of 2026-11-10).
- Vercel previews are disabled for the branch in `vercel.json`.

## Objective

Round 1 — one admin page, `/admin/pasantias-panel`, over the participant intake of PR #173:

- every traveller from every school in one table, with what the school sent;
- FNE's tracking per person: airfare, lodging, 50% deposit, 50% balance, notes — quick edits, bulk edits, CSV;
- admin correction of school-entered data;
- private documents per person (upload, signed download, removal);
- the Carta de Invitación generated as a PDF per person and stored with their documents.

Round 2 — Brent's decisions of 2026-11-09:

- four real flight dates per person (salida de SCL, llegada a BCN, salida de BCN, llegada a SCL), entered by FNE;
- the school form asks for each traveller's email; FNE can add or correct it;
- once FNE marks a person's airfare as bought, the school can no longer change that person's dates, nor who pays the lodging for that list;
- each letter is emailed automatically seven days before the traveller leaves Santiago; the panel shows who is blocked and why, and has "send now";
- stored files and the panel's history are deleted one month after the program ends (28 Feb 2027 for both programs);
- a traveller whose email belongs to a GENERA account sees their own trip at `/profile/pasantia` ("Mi pasantía");
- (2026-11-10) the school notice now says what the email is for and that a traveller can see their own trip (version `pasant-intake-2026-11-v3`); and the daily letter job emails FNE's global admins one list of the letters that should be going out and have not, with the reason for each.

**In scope:** one additive migration; nine admin API route files; two traveller API routes; two daily jobs; the admin page, the traveller page and their components; the school form's email field and locks; tests.
**Out of scope:** any change to the intake tables or to the intake SQL functions (the school form now calls two wrappers defined in this migration); adding or deleting travellers; insurance; passport copies; Production.

## Files, by risk

**Highest — database, email and deletion**
- `supabase/migrations/20261109210000_pasantias_logistics_panel.sql` — five tables, eleven functions, private bucket `pasantias-documents`.
- `lib/pasantias/panel/letter-delivery.ts`, `pages/api/cron/pasantias-letters.ts` — the automatic email.
- `pages/api/cron/pasantias-retention.ts` — the deletion sweep.
- `lib/pasantias/panel/mine.ts`, `pages/api/pasantias/mine/index.ts`, `pages/api/pasantias/mine/documents/[docId].ts`, `pages/profile/pasantia.tsx` — a traveller recognised by email.
- `lib/pasantias/panel/documents.ts`, `pages/api/admin/pasantias-panel/participants/[id]/documents.ts`, `documents/[docId].ts`, `letter-assets.ts`.

**High — the live school form and the admin writes**
- `lib/pasantias/participants/server.ts`, `validation.ts`, `form.ts`, `types.ts` — email, locks, the wrapper RPC names.
- `components/pasantias-intake/ParticipantForm.tsx`, `SchoolDataForm.tsx`, `pages/pasantias/nomina.tsx`.
- `lib/pasantias/panel/server.ts`, `validation.ts`, `letter.tsx`, `dates.ts`
- `pages/api/admin/pasantias-panel/index.ts`, `bulk.ts`, `participants/[id].ts`, `participants/[id]/letter.ts`, `participants/[id]/send-letter.ts`, `rosters/[rosterId].ts`
- `lib/email/provider.ts` — one optional field, `attachments`.

**Medium — UI**
- `pages/admin/pasantias-panel.tsx`, `components/pasantias-panel/PanelParts.tsx`, `ParticipantDrawer.tsx`
- `lib/pasantias/panel/client.ts`, `activity.ts`, `types.ts`
- `components/layout/Sidebar.tsx` — the admin entry, the "Mi pasantía" entry and its check.

**Low**
- `vercel.json` (previews off for the branch; two daily jobs), `scripts/ci/e2e-mandatory.mjs`

**Tests**
- `supabase/tests/116-pasantias-logistics-panel.sql`
- `__tests__/lib/pasantias/panel/*`, `__tests__/lib/pasantias/participants/*` (updated)
- `__tests__/api/admin/pasantias-panel.test.ts`, `__tests__/api/pasantias-panel-jobs.test.ts`, `__tests__/api/pasantias-participants.test.ts` (updated)
- `__tests__/pages/admin/pasantias-panel.test.tsx`, `__tests__/pages/profile-pasantia.test.tsx`, `__tests__/pages/pasantias-nomina.test.tsx` (updated), `__tests__/components/layout/Sidebar.miPasantia.test.tsx`
- `tests/e2e/pasantias-panel.spec.ts`, `tests/e2e/pasantias-participant-intake.spec.ts` (updated for the email field)

## Evidence (local, final tree, 2026-11-09)

| Gate | Result |
|---|---|
| Type-check | PASS |
| Lint, zero warnings | PASS |
| `lint:testid`, scoped to the new and changed UI files | PASS |
| Guards: action runtimes, RLS + destructive migration, browser boundary, committed secrets | PASS |
| Vitest, whole suite in 8 shards (re-run on the final tree) | 18 202 passed, 12 skipped, 0 failed (547 files). An earlier run had 2 failures: two existing tests pin the exact list of scheduled jobs in `vercel.json`; both were updated to include the two new jobs. |
| pgTAP, whole suite on a from-scratch local database | 79 files, 8 302 tests, PASS; 116 contributes 163; 114 (176) and 115 (140) unchanged and passing |
| Production build + price guard (inside the e2e run) | PASS |
| Playwright on a fresh seeded stack, production build (re-run on the final tree) | `pasantias-panel` 11/11 and `pasantias-participant-intake` 26/26; 0 failed, skipped or flaky |
| Hands-on walkthrough (headless Chromium against `next dev`) | A school saves two people (no email → refused); the panel shows email, account badge and flight dates; dates out of order refused; letter generated; "send now" answers "el envío de correos no está configurado" and stores nothing; the school page shows dates and lodging greyed out; the docente fixture account opens Mi pasantía and downloads the letter. |

pgTAP ran on the round-2 tree; the third commit changes no SQL. Type-check, lint, guards, Vitest and Playwright were re-run on the final tree.

Not run: GitHub CI; the other 24 mandatory e2e specs (only the two Pasantías specs ran locally); any Production read or write; **a real email** — every test uses a stand-in transport and no environment here has a provider key.

## Where to look hardest

1. The two school-form wrappers (`pasantias_panel_school_save_participant`, `pasantias_panel_school_save_funding`): the live form depends on them. Lock order (roster, then participant); the email-only change path bumps both versions and reopens a sent roster; a replayed create applies nothing. The lodging lock reads tracking rows without locking them (a small race).
2. The automatic email: a signed PDF to an address a school typed. The claim is a 15-minute lease; the send and its record are two steps, so a failed record after an accepted message means a second send the next day.
3. The retention sweep is irreversible. End dates are constants in the SQL; "today" is passed by the job with no database-side check against a future date. `service_role` now has DELETE on documents and activity.
4. Traveller recognition is by email only (confirmed account email equals the stored email). A school's typo can show one person's trip, ticket and letter to another account.
5. `pasantias_panel_save_participant` writes the intake table schools also write. It bumps the roster version but does not reopen a sent roster.
6. Upload path: the admin guard runs before the body is read; the type comes from the bytes; the stored name is random; a failed metadata row removes the object again.
7. The bucket has no `storage.objects` policy by design. Confirm nothing else grants broad read on `storage.objects`, and that the Production migration role can insert into `storage.buckets`.
8. Document upload, removal and letter generation write their activity row as a second statement, not atomically.

## Judgement calls

- The email lives in a side table and the school form saves through wrappers, so the intake functions and pgTAP 114/115 stay untouched.
- "Ticket bought" = airfare set to comprado or pagado by FNE. It locks that person's two dates and, for the whole roster, who pays the lodging. Admins are not bound; setting the airfare back to pendiente unlocks.
- The letter goes out seven days before the FNE-entered "salida de SCL", in Chile's calendar, and never after departure. With anything missing, nothing is sent and the panel flags the person.
- The emailed letter's copy is stored only after the provider accepts the message.
- Retention keeps tracking, emails and the school's own data; it deletes files, document rows (removed ones too) and activity.
- "Mi pasantía" shows no RUT, passport, payment, note or "other" document, and lives under `/profile/` so `middleware.ts` is not touched.
- Upload limit 4 MB (Vercel's request limit is 4.5 MB); table and bucket allow 10 MB.
- Bulk edits are last-write-wins; single edits use an expected version.
- Stored change shape is `{"old", "new"}`: the repo's ledger consumer inventory test treats a property named `from` as a possible database handle. No exception was added to that test.
- The migration was hand-written in this session (CLAUDE.md assigns migrations to the DB agent; Brent asked for a single-session build).

## Known limitations

- The two new sentences of the school notice (v3) were drafted in this session at Brent's request; he has seen the wording in the session report, not approved it line by line. It is a content change, not a claim of legal sufficiency.
- Rosters already sent have people without an email; nobody is told.
- The note to admins repeats every day while a letter is pending, goes to every active global admin, and names travellers and schools in the email. A bounce is still not noticed.
- Brent decided (2026-11-10) that a mistyped email needs no confirmation step, and that FNE fills in the emails of lists already sent.
- A school can still overwrite an admin correction of a name, RUT, passport or email.
- After 28 Feb 2027 the history of corrections is gone.
- The two letter lines per school are not in the activity log.
- The logo and signature must be uploaded once per environment before any letter is generated; the letter email needs `RESEND_API_KEY` and both jobs need `CRON_SECRET`.
- Two 300-character letter lines push the signature block to a second page.
