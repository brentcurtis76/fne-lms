# PROC-01 — Archived evaluation list: browser verification review request

## Branch and base

- Branch: `codex/proc-e2e-auth` (existing name kept)
- Base / HEAD at start: `11369363c7fbd0bc1773675f0bb17d89979675c9`
- Current HEAD (round 2): `f4acaf59dca90c2be576c46b55c3bcc9bff3f247` (a docs-ledger commit on top of the base; not from this unit)
- Implementation commits in this unit: **0**. Application source, migrations, tests and env files were not edited. This document is the only repository deliverable.
- Pre-existing uncommitted B5/consultor work (21 protected paths) was left byte-identical (sha256 check against the PM's protected-hash list).

## Objective and scope

Objective (from order r0): verify the already-reviewed archived-evaluation list through the real local app, with repeatable synthetic fixtures and proven cleanup. Deliver browser evidence and this review record; no application repair and no phase-close claim.

In scope:
- Docente list `/docente/assessments` (all states, `Archivado` filter, loading/empty/error states) and archived detail `/docente/assessments/[instanceId]` (read-only).
- Local synthetic fixtures: exactly ten rows with fixed UUIDs `01a00000-0000-4000-8000-0000000000{01,02,11..14,21..24}` in `assessment_templates` (1), `assessment_template_snapshots` (1), `assessment_instances` (4: pending, in_progress, completed, archived), `assessment_instance_assignees` (4, existing synthetic docente only).
- Local loopback stack only: API `127.0.0.1:54421`, PostgreSQL `127.0.0.1:54422/postgres`.

Out of scope: source fixes, schema/RLS/migrations, pgTAP, full E2E suite, production, new accounts, answers/results data, closure of the Procesos de Cambio phase.

## Files created or modified

Repository (commit candidate):
- `docs/planning/reviews/fase-proc-archived-list-ui-review-request.md` (this file) — low risk, documentation only.

Outside the repository (PM run directory, not committed):
- `ui/fixtures.cjs` — highest risk: the only code that writes to the local database (seed/cleanup of the ten rows).
- `ui/fixtures.test.cjs` — guard tests for target validation, preflight refusals, fault injection, forged manifests and cleanup.
- `ui/journey.cjs` — Playwright browser journey against the app started by `pm-unit ui-up`.
- `ui/gates.cjs` — runs `npm run type-check|lint|test|build` with only the generated local env; the unit gate drops browser-only settings (round 1) and preloads `ui/focused.cjs` (round 2).
- `ui/gates.test.cjs` — tests for the gate env selection, the unit-gate preload and target validation (rounds 1–2).
- `ui/focused.cjs` — runs the six list-card tests with the broken `canvas` native module hidden (round 1).
- `fixtures-manifest.json`, `evidence/` — manifest, cleanup receipts, gate logs, screenshots.

## Test evidence

| Suite | Command (runtime `mise exec node@22.16.0 --`) | Result |
|---|---|---|
| Fixture guard tests | `node --test RUN/ui/fixtures.test.cjs` | round 0: 16/16; round 1: 20 tests (4 new lost-acknowledgement cleanup cases) |
| Gate runner tests | `node --test RUN/ui/gates.test.cjs` | round 1: 7 tests; round 2: 13/13 (6 new preload tests) |
| Existing list-card unit tests, plain | `npx vitest run __tests__/pages/docente/assessments-list-cards.test.tsx` | **0 tests run**, exit 0 (see finding below). This is not a pass. |
| Existing list-card unit tests, focused runner | `node RUN/ui/focused.cjs` | 6/6 pass, assertions/setup/config unchanged (rounds 1 and 2) |
| Browser journey (1366×768 and 390×844) | `pm-unit ui-run PROC-01 --paths-file commit-paths.txt -- node RUN/ui/journey.cjs` | pass, 97 assertions, cleanup verified |
| Journey interrupted (SIGINT after seeding) | same command, SIGINT sent to the journey process | exit 130, ten rows deleted, verify-clean true |
| type-check / lint / build | `node RUN/ui/gates.cjs <gate>` | exit 0 at baseline and on final state |
| Unit suite (Vitest), round 2 final | `node RUN/ui/gates.cjs test` | **436/436 files; 10247 pass, 12 skipped, 0 fail; exit 0**; list-card file 6 tests |
| Unit suite, historical (incomplete) | same command, rounds 0–1 | 361 files only (75 jsdom files silently absent). Round 0: 9474 pass, 2 fail (runner-induced, below), 1 skipped. Round 1: 9476 pass, 1 skipped |

The 12 skips are declared in existing test source (`describe.runIf` and `describe.skip`); 11 of them sit in jsdom files that earlier runs never loaded. Round 2 counts are in `evidence/final-r2.md`, round 1 in `evidence/final-r1.md`, round 0 in `evidence/final.md`.

### Round 0 unit failures were caused by the gate runner

Round 0 reported two unit failures as baseline defects. That was wrong: the runner caused them.
- `__tests__/api/auth/recovery-request.test.ts` › normalizes the address and sends IP/origin only to the durable enqueue
- `__tests__/lib/email/outbox.test.ts` › is inert when E2E_MAIL_OUTBOX is unset

The round 0 runner passed the browser/e2e settings from the generated env into the unit gate. `E2E_MAIL_OUTBOX` turns the mail outbox on. `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_BASE_URL` and `NEXT_PUBLIC_SITE_URL` override the request origin (`lib/utils/app-url.ts` falls back from one to the next, so all three must be removed). Diagnosis of the two files under env variants (names only, no values): old env 18/20; without `E2E_MAIL_OUTBOX` the outbox test passes; without all three origin settings the recovery test passes; with the round 1 unit env, 20/20. The two files also pass 20/20 outside the runner (independent review). Neither failure is a proven product defect. The unit gate now drops only these four names; the local DB/API target check and the ambient `SUPABASE*`/`NEXT_PUBLIC_*`/`PG*` stripping are unchanged. Other gates keep the full generated env.

Journey coverage: anonymous redirect to `/login`; empty list before seeding; loading state during a delayed (real) list request; real API returning the four fixture states; sections `Por Completar (2)`, `Completadas (1)`, `Archivadas (1)`; `Continuar` links for active cards, `Ver Resultados` for completed, `Ver evaluación` plus read-only note for archived; one forced 500 on the list request showing the error toast, then recovery with real data; archived detail with no save/submit buttons after load, reload and keyboard Tab traversal; back navigation by keyboard; no horizontal overflow or scroll offset. Interception only delays or fails the list request; no successful response is fabricated.

## Local unit runner: jsdom needs the no-canvas preload (environment limit)

Round 0 described this as "`.tsx` files are not collected". The round 1 diagnosis corrected that: collection works, but the jsdom environment fails to load.
- `node_modules` in this worktree is shared. Its `canvas@2.11.2` has no native binding (`build/Release/canvas.node` is missing).
- jsdom 20 finds `canvas` with `require.resolve`, then `require('canvas')` throws.
- Vitest 0.34.6 calls `process.exit()` in the worker's `finally`, which swallows the error, so every jsdom file reports "no tests" and exits 0.
- Without a workaround, `npm test` reports 361 files. The 75 files that need jsdom, including the six list-card tests, are missing from both the passing and failing counts.

`RUN/ui/focused.cjs` preloads a hook that makes `canvas` unresolvable. That is jsdom's supported "canvas not installed" path. It fakes no canvas behaviour. In round 2 the PM approved this environment-only runner change: `gates.cjs test` adds the hook to `NODE_OPTIONS` for npm/Vitest children and keeps any other `NODE_OPTIONS`. The other gates, the local DB/API target check and the four unit-gate exclusions are unchanged. Assertions, setup, config and exclusions in the repository are also unchanged. With the hook, the canonical gate runs all 436 files. The gate tests check that the hook is present for `test`, absent for the other gates, and that it really blocks `canvas` resolution in a child process.

**Still open (not repaired):** the shared `canvas` native binding is still broken. No canvas functionality is tested or claimed. A plain `npm test` without the hook still silently skips the jsdom files. Making the install portable (rebuild `canvas` for Linux, or remove it) belongs to a future environment/publication unit.

## Areas to scrutinize

1. **Cleanup safety in `fixtures.cjs`.** Deletion is keyed to the ten fixed IDs, but only after manifest validation, row-digest match, ownership nonce match and a catalog scan for foreign references. Check that no path deletes without all four.
2. **Test shortcuts in the fixture guards.** The foreign-reference refusal injects a non-zero reference count through an adapter, because creating a real child row would change a table outside the ten allowed rows. The real catalog scan runs separately and finds zero references. The modified-row test changes the template inside an outer transaction that is rolled back, which is not the same as a change committed by another session.
3. **Uncertain cleanup COMMIT (round 1).** If the DELETE commit's acknowledgement is lost, `fixtures.cjs` rolls back and checks the rows on a fresh connection. Zero rows → state `cleaned` with receipt `deleted-unacknowledged`. All ten rows with matching digests → state `committed`, so a retry can delete them. Any other readback, or a failed readback → state stays `cleanup-started` and the step fails closed. Every outcome throws `COMMIT_UNCERTAIN` or `RECONCILE_AMBIGUOUS`. Check that no branch deletes, forces or adopts rows.
4. **Unit gate preload (round 2).** The full-suite pass depends on `focused.cjs` hiding `canvas` from every Vitest process. Check that the hook only affects the `canvas` request, is limited to the `test` gate, and that no test relies on real canvas output. Such a test would have to fail, not be mocked or skipped.
5. **Pre-existing UX/layout limits, not repaired (A01/A02).** A01: after the injected 500, the page keeps the previous (real) full list while the filter reads `Archivado`, until the next successful fetch. The error toast is shown and no data changes. The page may also not ignore stale responses when filters change quickly (unverified). A02: at 390×844 a narrow sidebar strip covers the left edge of the archived detail, and at 768px the open sidebar clips left content. Scroll/overflow checks pass at the required viewports. Both are future UX/layout work; there is no general responsive-acceptance claim.

## Known limitations and deferred items

- Local stack only; results say nothing about production or Vercel previews.
- No full E2E or pgTAP run (no product or schema change).
- The first interruption test left the ten rows in place: Playwright's own SIGINT handler exited the process (code 130) before the journey's async cleanup finished. The rows were then removed with `fixtures.cjs cleanup`. The journey now launches Chromium with Playwright signal handling off, and a repeat interruption cleaned up by itself. A `kill -9` still skips cleanup; the manifest remains so `fixtures.cjs cleanup` can recover.
- Traces were not recorded because they would capture the login request body; screenshots and `journey.json` are the evidence.
- The two round 0 "baseline" unit failures were caused by the runner (see above), not by the product.
- The full unit gate runs all 436 files only with the approved local no-canvas preload. The native `canvas` binding is still broken, and canvas behaviour is untested (see above).
- The cleanup evidence manifest from the independent review's counterexample (`ui/pm-cleanup-ack-manifest.json`) is kept unchanged as failure evidence.
- Fixtures are removed after every journey; the reviewer can reseed, run and clean the same IDs independently.
