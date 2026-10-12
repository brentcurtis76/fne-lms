# Review request — PASANT-B001f: retained A9 review provenance repair (PR #161 unit gate)

## Branch

- Branch `fix/pasant02-ci`; base and HEAD `3234eb8d1956d2af22be29768f03745cc83afe9c`. This is the combined release
  candidate (PR #161 head, `rel/genera-10091510`: NOTIF-22, PASANT-06 and PASANT-05 r1 on `main`). Its ancestor is
  the refreshed `main`, `42997ec6508396723a15aa1d2492d34e636c1bfe`. Commit count 0: the PM owns the commit, and the
  four files below are uncommitted at delivery.
- Unit PASANT-07 r0, ledger item PASANT-B001f, derived from PASANT-B001 under approved plan PASANT revision 1.
  Requested by Brent's notes `64a56f1144417d66` and `e96ba535f26080ed`.

## Objective and scope

Parent objective (approved plan, B001): "Reconcile A9 and the refreshed baseline; ratify the January contract and
publication decisions." C001 requires A9's spec, guards, registration and evidence to be ported "with provenance",
and says "Baseline selection cannot silently orphan A9".

This child repairs the one failing unit test on the combined release. PASANT-06's `january-contract.test.ts:876`
pinned the original A9 port review request (`c516ad80…`), and PASANT-05 r1 replaced that file with its accepted
rebuild (`a22f8aa0…`).

- **In:** archive the original's exact committed bytes, add a provenance record that maps the original to the
  rebuild, replace the stale single pin with an original/rebuild provenance check and negative cases, and write this
  request.
- **Out:** both accepted review requests (unchanged); every other retained, fact, source, approval and ratification
  pin (unchanged); runtime, schema, UI, config, provider, CI and NOTIF-22 paths; parent C001–C003 reconciliation;
  publication, merge and deploy. **B001 remains open**, and so do the release gates.

## Files by risk

- Medium — `__tests__/lib/pasantias/january-contract.test.ts`. The A9 entry leaves `RETAINED`; every other entry and
  hash is unchanged. New `A9_REVIEWS` pins both forms by SHA-256 and git blob, each with its accepted and binding
  commits. `checkRetained` and `checkA9Reviews` return errors instead of asserting in a loop, so mutations can be
  tested. One positive test is added, plus 10 A9 negative cases and 3 unrelated-corruption cases. Imports are
  unchanged (`node:crypto`, `node:fs`, `node:path`, `vitest`), with no `lib/` or git access.
- Low — `docs/plan/evidence/a9/pasant-b001d-original-review-request.md` (new): byte copy of
  `83a8b7a46:docs/planning/reviews/fase-pasant-a9-port-review-request.md`, blob `90c6124f`, the same blob as at
  `a81338a95`.
- Low — `docs/plan/evidence/a9/pasant-b001f-review-provenance.md` (new) and this file.

## Test evidence

RUN `/home/brent/Projects/pm-workflow/runs/PASANT-07/evidence/`. Every command ran in the foreground, one at a time,
through `pm-resources run PASANT-07 -- mise exec node@22.16.0 --`.

- Baseline (`baseline.md`): the focused command failed 1 and passed 326. `npm test` gave 521 files with 1 failed,
  13223 passed and 12 skipped, which is the PR #161 CI failure exactly. type-check, lint and build exited 0. The
  NOTIF-22 command passed 233.
- D2 probes (`d2-probes.tsv`): the HEAD test on the HEAD tree is red. The clean candidate plus fix is green
  (191/191). Each of these is red: archive missing, archive edited, archive holding the rebuild bytes, review path
  reverted to the original, provenance record missing, a provenance row with swapped hashes, an unrelated retained
  snapshot edited, and an unrelated retained review request deleted.
- Final state (`final.md`): order focused 5 files/341 passed; PASANT-05 direct command 4 files/311 passed;
  NOTIF-22 command 4 files/233 passed; type-check 0; lint 0; `npm test` 521 files passed with 13238 passed,
  12 skipped and 0 failed (+14 new contract tests; same 12 pre-existing skips); build 0; `git diff --check` 0; the
  CI committed-secrets classifier finds 0 issues on the changed files.
- Gates 3 and 4 (pgTAP, Playwright) passed at `3234eb8d1` (run 37971537961, `pr161-checks.json`). They are reused
  because this diff touches no `supabase/`, `tests/e2e/`, `scripts/`, config, runtime or spec path. A fresh PR CI
  run on publication stays a release obligation.

## Scrutinize

1. **Original versus rebuild.** Neither form may stand in for the other. Check that the archive is the historical
   blob and not a re-typed copy, and that the `A9_REVIEWS` constants are set independently of the provenance record.
   The record is checked against them, not read for them.
2. **Moving the A9 pin out of `RETAINED`.** The protection moves rather than disappears. The original's hash is still
   enforced at its archive path, and the review path is now pinned to the accepted r1 bytes. Confirm that no other
   `RETAINED` entry changed.
3. **The rebuild-link check.** It requires the r1 file's own sentence naming `a81338a95` and closure `12ca52a059d1`.
   That is redundant with its hash pin, but it gives a specific error when someone re-edits the review request.
4. **Cascading negative tests.** The unrelated-corruption cases assert on the real tree. A real corruption therefore
   also fails some negative cases, so read the first failure.

## Known limitations

- Fresh `main` alone does not contain the A9 review request. This fix is only meaningful on the combined release,
  which this tree is.
- Gates 3 and 4 are reused from PR #161 CI (unchanged paths), not rerun locally. Publication, PR CI and merge belong
  to the release workflow and Brent.
- Parent B001 (C001–C003) reconciliation is still open. R-08 and R-17 stay Brent-owned release gates.
