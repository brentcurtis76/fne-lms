# Review request — Fase PC-06: W-PC-06 classification closure, B2d creation, protocol revision 8

**Branch:** `docs/pc06-gov` · **Base SHA:** `7a470fe8fc0499452618ce7486562130d2cdf75a` (origin/main, re-locked and verified unmoved at task start) · **Commit count:** 1 (this correction, governance documents only)

## Objective

Record the already-completed W-PC-06 read-only learning-path data classification (2026-08-28) using aggregate evidence only; register its result — **B — DATA TRANSFORMATION REQUIRED** — in the mutable ledgers; create the governed class-3 repair unit **W-B2d-01** (lote B2d, rama `data/lp-scope`) as BLOCKED/UNAUTHORIZED; reorder W-B2c-01's dependencies so B2d completes first; reconcile every governing document and the validator to the new exact counts; and reconcile AGENTS.md with canonical CLAUDE.md.

## Scope

**In:** `docs/reviews/santa-marta-work-items.csv`, `santa-marta-work-claim-map.csv`, `santa-marta-release-protocol-2026-08-25.md` (revision 8), `santa-marta-ledger-normalization-report-2026-08-25.md` (new §13), `santa-marta-combined-plan-2026-08-25.md` (banner + row 0.4-bis), `PROJECT_STATE.md` (new authoritative Meta bullet), `scripts/check-ledger.mjs` (canonical B2d/`data/lp-scope`, 28 batches, new check `[21 clasificación]`), new `docs/reviews/w-pc-06-learning-path-data-classification-2026-08-28.md`, AGENTS.md (full mirror of canonical CLAUDE.md), and this file.

**Out (verified untouched):** the frozen `santa-marta-claims.csv` (byte-for-byte — zero diff), the archived legacy ledger, all application code, migrations, grants, policies, functions, RLS, CI configuration, production configuration, W-B2c-01's `gate_salida` scope lists, W-PC-01…W-PC-05, W-B10a-01, the D-RLS deferred units, and CLAUDE.md (canonical rules unchanged). No production access of any kind was performed by this task; no Supabase query was run; W-B2c-01/W-B2d-01 remain unimplemented and unauthorized. Nothing was pushed, no PR opened, nothing merged or deployed.

## Files by risk

**Higher risk (ledger semantics):**
- `docs/reviews/santa-marta-work-items.csv` — W-PC-06 row closed (DONE/AUTHORIZED/clase 0, execution_owner "Brent + Codex", chronology + classification in notes/gate); W-B2c-01 `compensacion_reversion` + `notes` rewritten to the ordered B2d-first chain; W-B2d-01 row inserted (alphabetical position).
- `docs/reviews/santa-marta-work-claim-map.csv` — exactly one new pair: `W-B2d-01,SWEEP-MI-APRENDIZAJE-09`.
- `scripts/check-ledger.mjs` — `B2d`/`data/lp-scope` added to the canonical batch/branch lists; batch count 27→28; new check `[21 clasificación]` pinning the literal classification, the evidence record's existence, W-B2d-01's exact shape (lote/rama/mode/clase/single mapping), UNAUTHORIZED⇒BLOCKED for B2d, and the ordered B2d→B2c dependency; PERMITTED_ID_TRANSFORM comment extended; DROP-anchor comment updated to `AGENTS.md:55`.

**Medium risk (reconciled prose):**
- `docs/reviews/santa-marta-release-protocol-2026-08-25.md` — revision 8 header (7/6/5 kept as italic history); LEDGER-SUMMARY JSON; six-figures table; mode/status tables; §2, §3 (B2c dependency chain), §4 (28 lotes, B2d row, 39/59 P0 links, branch inventory 28/24), §8 (B2a–d, B2d ordering), §9 (W-PC-06 executed-and-closed record; five-vs-six checks), B2b paragraph anchored with PR #60 / `7a470fe8` / CI 33183489941 + explicit reopen/reapply prohibition; final acceptance paragraph corrected (see judgment call 6).
- `docs/reviews/santa-marta-ledger-normalization-report-2026-08-25.md` — §2 current-tense tables; §3/§4 notes; §7 check table (W-PC-06 → AUTHORIZED/DONE); §9.2 stale "three live branches" parenthetical corrected to four; new **§13** (chronology, five query purposes, aggregates, no-PII confirmation, repo/app findings, classification, ledger/validator effects, non-authorizations).
- `docs/reviews/santa-marta-combined-plan-2026-08-25.md` — banner lineage (revision 8) + row 0.4-bis classification-closure annotation.
- `PROJECT_STATE.md` — one new authoritative Meta bullet (supersedes earlier "W-PC-06 BLOCKED/UNAUTHORIZED" statements without deleting audit trail).

**Lower risk (new/mirrored):**
- `docs/reviews/w-pc-06-learning-path-data-classification-2026-08-28.md` — new aggregate evidence record (no row identifiers, no ownership proposals, no SQL).
- `AGENTS.md` — full mirror of canonical CLAUDE.md: body verified byte-identical to CLAUDE.md lines 6–113 (`diff` of the aligned ranges is empty); only the three-line mirror header differs.

## Test evidence

- `node scripts/check-ledger.mjs` — exit 1 with **exactly 67 failures, all `[16 propiedad]`**, proven **byte-identical to the base**: the failure list was diffed against a fresh run of the untouched `7a470fe8` tree (`git archive` export) — zero differences. Zero structural, count, scope, provenance, or dependency failures. Figures: 160 claims / 36 P0 / **107 work items / 152 links / 59 P0 links / 36 P0 claims linked / 28 batches**; modes **90/10/6/1**; ownership numbers 67/80/4 and the 6-item PRODUCTION_CHECK exception unchanged. OK notes printed for checks 17, 18, 19, 20 and the new 21.
- **Negative mutation proof of check 21** (in a disposable scratch copy, real tree untouched; control re-run stayed at 67): (a) W-PC-06 `clase_migracion` 0→1 → `[21 clasificación]` fails; (b) W-B2c-01 BLOCKED→SCHEDULED while W-B2d-01 not DONE → ordered-dependency failure; (c) removing the `W-B2d-01,SWEEP-MI-APRENDIZAJE-09` map row → single-mapping failure.
- `npm run type-check` — pass (tsc --noEmit, 8 GB heap).
- `npm run lint` — pass, `eslint --ext .js,.jsx,.ts,.tsx --max-warnings=0 .` exit 0. Note: inside this nested worktree (`.claude/worktrees/…`) lint first failed with the **known environment artifact** (ESLint resolves the parent checkout's `.eslintrc.json` and loads `@next/eslint-plugin-next` twice); per the documented remedy it was re-run **unmodified** from a non-nested export of the exact tree (rsync of the working tree, node_modules symlinked) — clean. No file was changed to make lint pass.
- `npm test` — full Vitest: **368 files passed, 8,406 tests passed / 11 skipped** (220.8 s) — identical to the healthy main baseline.
- `npm run build` — **exit 0, ✓ Compiled successfully, ✓ Generating static pages (149/149), zero unhandled rejections**, full route table emitted. Environment note, disclosed fully: this fresh worktree has **no `.env.local`** (env files are never committed; prior phases copied one into their worktrees). A bare `npm run build` without any env is nondeterministic here — the first run exited 0 while logging a tolerated `createClientComponentClient` rejection during page-data collection, and an identical rerun exited 1 at the same point. The recorded green gate was produced with **command-scoped synthetic env only** (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, a synthetic anon key; no file written, nothing persisted). This is safe and meaningful because the build performs **zero data fetching**: the repository's only `getStaticProps` (`pages/email-showcase.tsx`) returns an in-memory object, so the env is consumed solely by client *construction* during collection — no request is ever made, and a localhost target could not reach production even if one were. The production env file was deliberately **not** copied into this task's environment.
- `test:db` / `e2e` — **intentionally not run**: no DB or UI file changes (task instruction; CI runs its four gates on the PR regardless).
- `git diff --check` — clean. `git diff docs/reviews/santa-marta-claims.csv` — empty (byte-for-byte preservation).
- External evidence verified before recording: `gh run view 33183489941` → success, headSha `7a470fe8` (the PR #60 merge push); `gh pr view 60` → MERGED, mergeCommit `7a470fe8`.

## Hardest review areas (judgment calls — in descending order of importance)

1. **Protocol revision 8, not "6 → 7" as the directive's item 7 literally says.** At the pinned base `7a470fe8`, the protocol already carries **revisión 7** (the merged PR #60 B2b closure), and every target count in the directive (DONE 3, SCHEDULED 29, 107/152/59/28, ownership 67) is computed from that post-#60 state — so the "from revised 6 to revision 7" wording is stale drafting, not a different intent. Relabeling or extending the already-merged revision-7 stamp would have falsified the merged record. I recorded this correction as **revision 8** and kept revision 7's summary as italic history. If Brent intended something else, this is a one-word change before merge.
2. **Directive item 6 (W-B2b-01 "SCHEDULED to DONE") was already satisfied at the base.** PR #60 had already set W-B2b-01 to DONE in the CSV, protocol, report §12.9, combined plan and PROJECT_STATE, and the target status counts only reconcile if it stays DONE. I therefore verified rather than re-performed it: anchored its existing evidence (PR #60 → `7a470fe8`, post-merge CI 33183489941 verified green via `gh`, completed automatic deployment, recorded production application of `20260827170000`) into the revision-8 record and made the reopen/reapply prohibition explicit.
3. **W-B2d-01's title is the es-CL rendering of the directive's English title.** The directive says `governed repair of existing learning-path ownership before B2c`; every title in the ledger is Chilean Spanish, so the row reads *"Reparación gobernada de la propiedad de rutas de aprendizaje existentes antes de B2c"*. The gate/notes were written to stay strictly inside the allowed boundary — aggregate categories + class-3 safeguards, explicitly refusing school selection, ownership semantics, algorithm and SQL — worth adversarial reading.
4. **AGENTS.md became a full mirror and the `AGENTS.md:37` DROP anchor moved to `AGENTS.md:55`.** The reconciliation was derived directly from canonical CLAUDE.md (deliberately **not** reusing the parked `fix/rls-public` commit that once did the same, per the no-reuse rule); the protocol's citation was updated in the same commit and annotated. Verify no other file cites the old anchor (repo grep found only the protocol).
5. **Two pre-existing factual drifts were corrected beyond the ten literal items:** the protocol's final acceptance paragraph still claimed "only one component recorded in the whole ledger" (a revision-6 leftover contradicting revision 7's evidenced B2b acceptance), and report §9.2's parenthetical still said "three live batch branches today". Both were reconciled to the already-merged revision-7 facts and flagged in place. Reviewer should confirm these are corrections, not scope creep.

## Known limitations / deferred

- **W-B2d-01 is created, not advanced:** UNAUTHORIZED, BLOCKED, unimplemented; the global/shared vs school-owned semantics decision is Brent's and remains open; no algorithm, SQL, or backfill design exists anywhere in this change — by design.
- W-B2c-01 remains BLOCKED/BLOCKED; W-PC-01…W-PC-05 remain BLOCKED/UNAUTHORIZED; the W-B2a-01 stakeholder-acceptance record remains unevidenced (all unchanged, deliberately).
- The lint evidence comes from a non-nested export because of the worktree environment artifact (see Test evidence); an independent reviewer running from a normal checkout should not hit it.
- The 67 ownership blockers are retained exactly; nothing here reduces them.
- This branch is not pushed or merged; per the standing rule, no database or product implementation is authorized until this correction passes independent review and Brent merges it.
