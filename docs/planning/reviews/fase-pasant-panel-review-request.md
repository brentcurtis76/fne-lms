# Review request — PASANTÍAS PANEL (logistics panel for the January 2027 cohort)

**Status (2026-11-09): built and validated locally; not pushed, no PR, no CI run, nothing in Production.**
This unit was done by one Claude session outside the PM–Executor workflow, at Brent's request, as a model test. The fuller review packet (decisions, risks, questions) is a separate document Brent shares with reviewers; this file is the in-repo record.

## Branch and base

- Branch `feat/pasant-panel`, cut from `origin/main` at `b06a5b852` (merge of PR #173). One commit.
- Vercel previews are disabled for the branch in `vercel.json`.

## Objective

One admin page, `/admin/pasantias-panel`, over the participant intake of PR #173:

- every traveller from every school in one table, with what the school sent;
- FNE's tracking per person: airfare, lodging, 50% deposit, 50% balance, notes — quick edits, bulk edits, CSV;
- admin correction of school-entered data;
- private documents per person (upload, signed download, removal);
- the Carta de Invitación generated as a PDF per person and stored with their documents.

**In scope:** one additive migration, eight admin API route files, the page and its components, tests.
**Out of scope:** any change to the intake tables, functions, routes or pages; email; adding or deleting travellers; insurance; passport copies; Production.

## Files, by risk

**Highest — database and files**
- `supabase/migrations/20261109210000_pasantias_logistics_panel.sql` — four tables, three functions, private bucket `pasantias-documents`.
- `lib/pasantias/panel/documents.ts` — multipart parsing, byte-sniffed type, random storage path, rollback.
- `pages/api/admin/pasantias-panel/participants/[id]/documents.ts`, `documents/[docId].ts`, `letter-assets.ts`.

**High — writes behind the admin guard**
- `lib/pasantias/panel/server.ts`, `validation.ts`
- `pages/api/admin/pasantias-panel/index.ts`, `bulk.ts`, `participants/[id].ts`, `participants/[id]/letter.ts`, `rosters/[rosterId].ts`
- `lib/pasantias/panel/letter.tsx`

**Medium — UI**
- `pages/admin/pasantias-panel.tsx`, `components/pasantias-panel/PanelParts.tsx`, `ParticipantDrawer.tsx`
- `lib/pasantias/panel/client.ts`, `activity.ts`, `types.ts`

**Low**
- `components/layout/Sidebar.tsx` (one admin-only entry), `vercel.json`, `scripts/ci/e2e-mandatory.mjs`

**Tests**
- `supabase/tests/116-pasantias-logistics-panel.sql`
- `__tests__/lib/pasantias/panel/*`, `__tests__/api/admin/pasantias-panel.test.ts`, `__tests__/pages/admin/pasantias-panel.test.tsx`
- `tests/e2e/pasantias-panel.spec.ts` (added to the mandatory list)

## Evidence (local, final tree, 2026-11-09)

| Gate | Result |
|---|---|
| Type-check | PASS |
| Lint, zero warnings | PASS |
| `lint:testid`, scoped to the new UI files | PASS |
| Guards: action runtimes, RLS + destructive migration, browser boundary, committed secrets | PASS |
| Vitest, whole suite in 8 shards | 18 091 passed, 12 skipped, 0 failed (543 files); 153 of them new |
| pgTAP, whole suite on a from-scratch local stack | 79 files, 8 233 tests, PASS; 116 contributes 94 |
| Production build + price guard (inside the e2e run) | PASS |
| Playwright on a fresh seeded stack, production build | `pasantias-panel` 8/8 and `pasantias-participant-intake` 26/26; 0 failed, skipped or flaky |
| Hands-on walkthrough (headless Chromium against `next dev`) | Two schools, five people: quick edits, bulk, correction, tracking, letter images, letter generated and read, upload, refused Word file, history. No errors from the new page. |

Not run: GitHub CI; the other 24 mandatory e2e specs (only the two Pasantías specs ran locally); any Production read or write.

## Where to look hardest

1. `pasantias_panel_save_participant` writes the intake table schools also write. Lock order (roster, then participant) and field checks must match `pasantias_nomina_save_participant`. It bumps the roster version but does not reopen a sent roster.
2. Upload path: the admin guard runs before the body is read; the type comes from the bytes; the stored name is random; a failed metadata row removes the object again.
3. The bucket has no `storage.objects` policy by design. Confirm nothing else grants broad read on `storage.objects`, and that the Production migration role can insert into `storage.buckets`.
4. Document upload, removal and letter generation write their activity row as a second statement, not atomically.
5. The letter prints a real signature (uploaded by an admin, never committed). Any global admin can generate one.

## Judgement calls

- Upload limit 4 MB (Vercel's request limit is 4.5 MB); table and bucket allow 10 MB.
- Corrections accept only the dates the school form offers, so the school form can always show them.
- Bulk edits are last-write-wins; single edits use an expected version.
- Stored change shape is `{"old", "new"}`: the repo's ledger consumer inventory test treats a property named `from` as a possible database handle. No exception was added to that test.
- The migration was hand-written in this session (CLAUDE.md assigns migrations to the DB agent; Brent asked for a single-session build).

## Known limitations

- A school can later overwrite an admin correction through its link.
- No retention period for stored files or the activity log; the school notice's coverage of stored tickets and letters needs a human reading.
- The two letter lines per school are not in the activity log.
- The logo and signature must be uploaded once per environment before any letter is generated.
- Two 300-character letter lines push the signature block to a second page.
