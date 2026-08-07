# Fase A8 — review request (INSPIRA Comms)

- **Branch**: `phase/a8-leads-ui`
- **Base**: local `main` @ `5190344c` (6 docs-only commits ahead of `origin/main` @ `6824ca0d`; code byte-identical). Four of those are `docs(z2)` commits belonging to the ZOOM workstream that shares this checkout — expected, per the r1 prompt.
- **Commits**: 1 (code + tests + fixtures + this file + the ledger entry)
- **Worktree**: `~/dev/wt-a8` (dedicated, per the 2026-07-31 Decision Log rule)
- **Round**: r1, executor

## Objective

Build the admin surface over `public.pasantias_leads`: list, filter, triage through the D-03 status graph, notes and CSV export. `POST /api/pasantias/lead` (A5) is live and `/pasantias` posts to it, so the table fills up while nothing in the platform can read it.

One architectural concern: **an admin-only read/triage surface over a table that grants no authenticated write.** No business logic beyond triage, no schema change, no migration, no SQL of any kind.

### In scope (the prompt's 10 files, and no more)

| File | What |
|---|---|
| `pages/api/admin/pasantia-leads/index.ts` | NEW — GET + PATCH |
| `pages/admin/pasantia-leads.tsx` | NEW — the triage page |
| `components/admin/PasantiaLeadCard.tsx` | NEW — detail/expand surface |
| `components/layout/Sidebar.tsx` | EDIT — one nav child |
| `__tests__/api/admin/pasantia-leads.test.ts` | NEW — auth matrix, transitions, filters |
| `__tests__/components/admin/pasantia-lead-card.test.tsx` | NEW — hostile-value render + the [A-new-3] guard |
| `tests/e2e/pasantias-leads-admin.spec.ts` | NEW |
| `scripts/ci/e2e-mandatory.mjs` | EDIT — add the spec |
| `scripts/ci/e2e-fixtures.json` | EDIT — the lead fixture |
| `scripts/ci/seed-e2e.mjs` | EDIT — seed it |

### Out of scope, untouched

`middleware.ts` (D-10, zero changes) · `lib/pasantias/leads.ts` (frozen A5 file) · `pages/api/admin/users.ts:295` (the `.or()` interpolation defect — backlogged, deliberately not fixed here) · `pages/admin/tractor-signups.tsx`, `lib/exportUtils.ts`, `components/reports/EnhancedTable.tsx` (reused, never refactored) · any migration, RLS change or pgTAP file · Track B · `/pasantias` itself.

## Files, grouped by risk

**Highest — security/contract surface**

- `pages/api/admin/pasantia-leads/index.ts` (+304). Both verbs behind `checkIsAdmin` + `createServiceRoleClient`. D-03 enforced here (`canTransitionLead`), denied moves answer 400 with `allowed`. Update payload is a two-column whitelist. `search` sanitized before it reaches a PostgREST `.or()`.
- `components/admin/PasantiaLeadCard.tsx` (+296). Renders `source_path` and the three `utm_*` — all visitor-supplied. Emits no anchor at all.

**Medium — new user-facing surface**

- `pages/admin/pasantia-leads.tsx` (+461). Admin-guarded `getServerSideProps` mirroring `tractor-signups.tsx`; rows fetched client-side; CSV through `ReportExporter.exportToCSV`.

**Lower — CI plumbing and nav**

- `scripts/ci/e2e-fixtures.json` (+26/−1), `scripts/ci/seed-e2e.mjs` (+61), `scripts/ci/e2e-mandatory.mjs` (+3), `components/layout/Sidebar.tsx` (+8).

**Tests**

- `__tests__/api/admin/pasantia-leads.test.ts` (+487, 23 tests), `__tests__/components/admin/pasantia-lead-card.test.tsx` (+215, 15 tests), `tests/e2e/pasantias-leads-admin.spec.ts` (+78, 3 tests).

## Test evidence

```
npx vitest run __tests__/api/admin/pasantia-leads.test.ts __tests__/components/admin/pasantia-lead-card.test.tsx
 ✓ __tests__/api/admin/pasantia-leads.test.ts  (23 tests)
 ✓ __tests__/components/admin/pasantia-lead-card.test.tsx  (15 tests)
 Test Files  2 passed (2)
      Tests  38 passed (38)
```

Full gates, all green in `~/dev/wt-a8`:

- `npm run type-check` — clean
- `npm run lint` — clean (zero warnings allowed)
- `npm test` — 265 files, **6237 tests passed**
- `npm run build` — compiled; `/admin/pasantia-leads` and `/api/admin/pasantia-leads` both in the manifest
- `npm run lint:testid` — advisory. **No warning on either new file.** The one `Sidebar.tsx` warning (line 1429) is pre-existing and untouched by this diff.
- `npx playwright test --list tests/e2e/pasantias-leads-admin.spec.ts` — 3 tests collected (which also exercises `assertFixtureRosterComplete()` at import: the new fixture block is top-level and the roster still balances).

**E2E was not executed locally** — see Known limitations.

## The 4 areas an independent reviewer should scrutinise hardest

1. **The `search` sanitizer ([A-new-4]) — my judgment call, and the one most likely to be wrong.** I drop `, ( ) " \ *` and deliberately keep `%` and `_`. The reasoning is written at the function, but the honest summary is: dropping cannot produce a second interpretation the way hand-rolled escaping can, and the two wildcards can only widen a match inside a search the admin typed on a SELECT-only route. If you disagree about `%`, that is a real disagreement and the fix is one line. The test asserts the expression still splits into exactly four filters and that no filter contains `,()`.

2. **`counts` is a second, unfiltered query and both run in one `Promise.all`.** That is the "counts must not collapse under the filter" rule, but it means every GET reads the whole `status` column. Fine at today's volume, unbounded in principle — if you want a cheaper shape it should be decided now rather than after the table grows. The error handling folds both results (`leadsError ?? countsError`), so a counts failure fails the whole request; I think that is right, but it is a choice.

3. **The dropdown derives from `canTransitionLead`, and I ask you to distrust that claim.** `allowedLeadTransitions()` filters `LEAD_STATUSES`; nothing re-lists the graph. The test iterates all four statuses and compares against `canTransitionLead` directly rather than against a literal — mutate an edge in `lib/pasantias/leads.ts` and both the UI test and the API test should move together.

4. **The page is not `EnhancedTable`.** `tractor-signups.tsx` uses it; I wrote a plain `<table>` with an expandable second `<tr>`, because [A2] requires row expand and `EnhancedTable`'s column API does not offer it. That is the largest single deviation from the house pattern in this diff, and it is the reason the page is 461 lines rather than shorter. Judge whether that trade was right.

Also worth a look, lower stakes: the `[A-new-3]` source guard lives in the card test file rather than a sibling (scope was 10 files); and `sourcePathRepeatsUtm` uses `String.includes` rather than parsing the query string — a UTM value that happens to be a substring of the path (e.g. `utm_source=pasantias`) would show the shared-attribution note when the two are not actually the same observation. That errs toward warning, which is the safe direction, but it is imprecise.

## Known limitations / deferred

- **E2E not run locally.** A local Supabase stack is up on 127.0.0.1:54321, but it was started by a concurrent session (A7a is live in `~/dev/wt-a7a`); the prompt says not to race another worktree for it, so I did not seed it or run Playwright against it. The spec, its fixture and the seeder are therefore proven by collection and by static validation only (`node --check`, JSON parse, mandatory-list membership, fixture-roster guard). **CI gate 4 is the real evidence.** The riskiest untested step is the seeder INSERT; I re-read it against the migration's columns and all four CHECKs by hand.
- **The e2e is read-only on the seeded lead**, by design (the fixture is not reset between local runs). Transition behaviour is proven at the API.
- **`.env.local` was copied into the worktree** so `npm run build` could collect page data. Gitignored; not part of the diff.
- **Notes save is a button, not autosave**, and the page refetches after every PATCH rather than patching state in place. Simple and correct; slightly chatty.
- **No pagination.** The list renders everything the API returns. At lead volumes this is right; it is the first thing that will need revisiting.
- Out-of-scope defects left alone: `pages/api/admin/users.ts:295` (backlogged) and the pre-existing `lint:testid` baseline.

---

# r2 — remediation round (B1 + S1 + S2)

**Branch:** `phase/a8-leads-ui`, one commit on top of r1's `2448322a`. The r1 section above still describes the bulk of the phase; r2 changed three files: `pages/admin/pasantia-leads.tsx`, `components/admin/PasantiaLeadCard.tsx`, `__tests__/components/admin/pasantia-lead-card.test.tsx`. Everything the r1 review cleared — the API route, transition enforcement, the search sanitizer, the counts query, the CSV neutralization path, the seeder, the e2e spec — is untouched.

## What changed and why

- **B1 (BLOCKING) — the label named the wrong document.** `brochure_sent_at` was labelled "Ficha enviada", but the *ficha* is the price-free public download (`pages/pasantias.tsx` → `/api/pasantias/ficha`, price-free by construction, D-02) and nothing stamps a column when it is downloaded. The column is stamped by the auto-reply that mails **the priced programme** (`sendLeadAutoReply` → `BROCHURE_PATH`, body: "Descargar el programa"). Renamed to **`Programa enviado`** in all three places — CSV export row key, table header, `EMPTY_EXPORT_ROW` — which must stay byte-identical because `ReportExporter.exportToCSV` uses headers as both printed text and row-key path. Pinned by a source-level test: zero occurrences of capitalized "Ficha" in the page, exactly three of the quoted literal `'Programa enviado'`.
- **S1 — both layouts mount, so the card rendered twice.** The desktop table (`hidden md:block`) and mobile list (`md:hidden`) are both in the DOM; an expanded lead mounted `PasantiaLeadCard` twice, duplicating every `id` and `data-testid`, and `htmlFor` bound to the hidden desktop control — on a phone the visible labels focused nothing. **Shape chosen: a `domPrefix` prop** (`"desktop-"` / `"mobile-"`), not the single-mount-outside-both-containers option. Reason: both layouts expand *in place*, adjacent to the tapped "Detalle" control; a single card rendered after both containers would land below the entire list — offscreen on exactly the small-screen hardware `CLAUDE.md` names. That is the "layout fights you" case the prompt carved out. Default `''` keeps every r1 test byte-identical. Pinned by tests: the page passes both prefixes (source-level), and two mounts with those prefixes emit zero duplicate `id`s/`data-testid`s, with every `label.htmlFor` resolving to exactly one element.
- **S2 — an [A2] column was unreachable on a phone.** `brochure_sent_at` appeared only in the desktop table. Added a `Programa enviado` field to the shared card (in the Consentimiento/Marketing group), `formatDateTime` + the `—` empty state `Field` already provides. Pinned by tests for both the populated and null cases.

## What the reviewer should scrutinise in r2

1. **The `domPrefix` choice over single-mount.** The duplication is now namespaced, not structurally impossible. If you think the placement regression of single-mount was acceptable, this is the disagreement to have. Note the two mounts also mean two independent notes-draft `useState`s; only one is ever visible, so a draft is only lost on a mid-edit viewport resize.
2. **The B1 test's shape.** "No capitalized `Ficha`" plus "exactly 3 × `'Programa enviado'`" is a source-level pin, not a behavioural one; comments deliberately use the lowercase common noun "ficha" to stay out of its way. A count of 3 will need updating if a column is ever legitimately added to all three structures — that is the pin working, not breaking.
3. **Future e2e selectors must now pick a prefix** (`desktop-`/`mobile-`). The r1 spec is unaffected (it selects on institution text and page-level testids, which are unprefixed).

## Test evidence (r2)

- Targeted: `npx vitest run __tests__/api/admin/pasantia-leads.test.ts __tests__/components/admin/pasantia-lead-card.test.tsx` — **43/43** (r1: 38; +5 new, none removed).
- Full gates re-run: see the ledger r2 entry for counts.
- E2E: still not executed locally (same shared-stack constraint as r1); the card testid changes do not touch anything the spec selects.
