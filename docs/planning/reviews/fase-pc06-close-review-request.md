# Review request — Fase PC-06-close: post-merge closure correction (documentation only)

**Branch:** `docs/pc06-close` · **Base SHA:** `f39a90c3f69ce930173b97276c4bd12d33b23693` (origin/main — the PR #61 merge commit itself, fetched read-only and verified equal to the required base at task start; worktree clean before work began) · **Commit count:** 2 — the original closure commit `9ebb4080` plus one independent-review correction commit; neither amended nor rewritten (see the independent-review section below).

## Objective

Close the factual drift PC-06 left behind after its merge. The authoritative W-PC-06 entry in `PROJECT_STATE.md` was authored pre-merge and still claimed the record was "NOT merged"; the pre-merge review request stated "nothing was pushed/merged" in the present tense. Brent has since pushed and merged PR #61. This correction (a) records the merged closure with its exact evidence in the authoritative entry, (b) qualifies the pre-merge statements as facts *at the review point* without rewriting the review history, (c) adds this closure review request, and (d) narrowly extends validator check `[21 clasificación]` so the merged closure cannot silently regress.

**This fixes factual post-merge status only.** It changes **no** classification (B — DATA TRANSFORMATION REQUIRED stands), **no** ledger semantics, **no** work-item or map counts (107/152/59/28 untouched), **no** statuses or mappings, **no** protocol revision (revision 8 stands), **no** ownership decision (global/shared vs school-owned remains Brent's open decision), **no** algorithm, **no** SQL, **no** application code, migrations, database tests, grants, policies, functions, or RLS, and **no** production state.

## External evidence verified before recording (read-only git/gh; no Supabase, no database, no Management API, no Vercel mutation)

- `gh pr view 61` → state **MERGED**, head branch `docs/pc06-gov`, headRefOid `db43b4f57c97c7aba23fbacedc6f577f71bcafe4`, mergeCommit `f39a90c3f69ce930173b97276c4bd12d33b23693`, merged 2026-08-28T22:59:29Z by brentcurtis76.
- `git fetch origin main` (read-only) → `origin/main` = `f39a90c3f69ce930173b97276c4bd12d33b23693` = the required base.
- `gh run view 33217715789` → CI, `pull_request` event, headSha `db43b4f5…`, status completed, conclusion **success**.
- `gh run view 33218834453` → CI, `push` event, headSha `f39a90c3…`, status completed, conclusion **success**, **all seven jobs success**: Gate 1 Typecheck, Gate 1b Lint, Gate 2 Unit (Vitest), Gate 3 RLS pgTAP, Gate 4 E2E (Playwright), Migration safety guard, Browser/server boundary guard.
- `gh api repos/…/deployments/6149936913` → environment **Production**, sha/ref `f39a90c3…`; its status: state **success**, "Deployment has completed" (the automatic Vercel deployment; nothing was triggered or mutated by this task).

## Scope

**In (the only four files touched):**
- `PROJECT_STATE.md` — one line: the authoritative W-PC-06 Meta entry.
- `docs/planning/reviews/fase-pc06-review-request.md` — two pre-merge statements qualified in place; post-merge closure section appended.
- `docs/planning/reviews/fase-pc06-close-review-request.md` — this file (new).
- `scripts/check-ledger.mjs` — additive clauses inside existing check `[21 clasificación]`; extended OK note.

**Out (verified untouched — `git diff` over `docs/reviews/` is empty; the commit diff contains exactly the four files above and the committed working tree is clean):** the frozen `santa-marta-claims.csv` (byte-for-byte), the archived legacy ledger (SHA-256 re-verified `009f14ab…` = the validator's frozen pin), both mutable ledger CSVs, the release protocol (revision 8), the combined plan, the normalization report, the W-PC-06 evidence record, AGENTS.md, CLAUDE.md, all application code, migrations, database tests, grants, policies, functions, RLS, and CI configuration. No W-B2d ownership semantics, school selection, algorithm, SQL, or authorization was created or changed anywhere.

## Files by risk

**Higher risk (validator semantics):**
- `scripts/check-ledger.mjs` — a new block inside check `[21 clasificación]` (no check renumbered, no existing clause weakened or removed; every pre-existing clause still runs unchanged) pins: the authoritative `- **W-PC-06 — CLOSED` entry's existence; six merged-closure anchors in that entry (PR #61 link, approved head `db43b4f5…` full SHA, merge commit `f39a90c3…` full SHA, PR CI run 33217715789, post-merge CI run 33218834453, and the literal "automatic Vercel Production deployment of `f39a90c3` completed"); rejection of any reappearing "not merged" claim (case-insensitive) in that entry; and unconditional W-B2d-01 BLOCKED + UNAUTHORIZED and W-B2c-01 BLOCKED + `clase_migracion` BLOCKED pins (13 new failure clauses in commit 1; the correction commit adds 6 durability clauses — see the independent-review section below). The OK note is extended accordingly.

**Medium risk (authoritative prose):**
- `PROJECT_STATE.md` — within the single authoritative W-PC-06 entry: "NOT merged" replaced by the merged-closure record (PR #61, approved head, merge commit, both CI runs, completed automatic Production deployment, explicit production-boundary statement — refined in the correction commit to the precise no-production-database / ephemeral-local-CI wording); the review-request sentence now also names this closure file; the final sentence re-anchors the continuing non-authorization on the merged state (W-B2d-01 BLOCKED/UNAUTHORIZED class 3; W-B2c-01 BLOCKED/BLOCKED). The Management API access chronology, aggregate results, classification, counts, B2d/B2c semantics, and W-B2b anchors in the entry are byte-untouched.

**Lower risk (review documentation):**
- `docs/planning/reviews/fase-pc06-review-request.md` — the two present-tense pre-merge claims ("nothing was pushed/merged", "this branch is not pushed or merged") are qualified as facts *as of the pre-merge review point*, originals retained in place; a concise post-merge closure section is appended with the exact evidence above. All branch/base/test/review history above the appended section is preserved unmodified.
- This file (new).

## Test evidence (at the original closure commit `9ebb4080` — preserved; round-2 re-run in the independent-review section below)

- `node scripts/check-ledger.mjs` — exit 1 with **exactly the 67 pre-existing `[16 propiedad]` ownership failures and nothing else**; the failure list was diffed against a fresh pre-edit baseline run of this same tree — **zero differences**. The extended `[21]` OK note prints ("cierre post-merge anclado (PR #61 … ) con W-B2d-01 BLOCKED/UNAUTHORIZED y W-B2c-01 BLOCKED/BLOCKED").
- **Negative mutation proof of the 13 new clauses** (each in a disposable scratch copy of the full validator input set — script, PROJECT_STATE, `docs/reviews/`, baseline SQL — real tree untouched; the control run before, between, and after mutations stayed at exactly 67 with zero `[21]` failures; 16/16 harness assertions passed):
  - (M1) PR #61 link removed from the authoritative entry → `[21]` "no ancla el PR de cierre #61" (68 total);
  - (M2) approved-head SHA corrupted → head-anchor failure (68);
  - (M3) merge-commit SHA corrupted → merge-anchor failure (68);
  - (M4) PR CI run id altered → PR-CI-anchor failure (68);
  - (M5) post-merge CI run id altered → post-merge-CI-anchor failure (68);
  - (M6) deployment phrase degraded ("completed" → "attempted") → deployment-anchor failure (68);
  - (M7) "NOT merged" reintroduced into the authoritative entry → "vuelve a afirmar que el registro no está fusionado" (68);
  - (M8) authoritative entry heading renamed away → entry-not-found failure (68);
  - (M9) W-B2d-01 `authorization_status` → AUTHORIZED with status still BLOCKED (the pre-existing conditional UNAUTHORIZED⇒BLOCKED clause is silent here) → the new unconditional UNAUTHORIZED pin fails (68);
  - (M10) W-B2d-01 BLOCKED → SCHEDULED **and** AUTHORIZED (old conditional fully bypassed) → the new unconditional BLOCKED pin fails, plus the UNAUTHORIZED pin (71 total: the 2 extra are pre-existing `[14 reconciliación]` protocol status-count failures also firing — defense in depth, disclosed);
  - (M11) W-B2d-01 → DONE/AUTHORIZED and W-B2c-01 → SCHEDULED with `clase_migracion` 2 (the pre-existing ordered-dependency clause is bypassed because B2d reads DONE) → both new unconditional W-B2c-01 pins fail (status and clase), plus both B2d pins (74 total; 3 extra are `[14 reconciliación]` status counts);
  - (M12) W-B2c-01 row deleted → the new "W-B2c-01: no existe…" clause fails alongside the pre-existing structural checks (76 total).
- `npm run type-check` — pass (tsc --noEmit, 8 GB heap, exit 0).
- `npm run lint` — pass, `eslint --ext .js,.jsx,.ts,.tsx --max-warnings=0 .` exit 0. Disclosure: inside this nested worktree lint first failed with the **known environment artifact** (ESLint resolves both this worktree's and the parent checkout's `.eslintrc.json` and loads `@next/eslint-plugin-next` twice); per the documented remedy — the same one recorded and accepted in the merged pc06 review — it was re-run **unmodified** from a non-nested export of the exact working tree (rsync, node_modules symlinked, no ancestor eslintrc) — clean. No file was changed to make lint pass.
- `npm test` — full Vitest: **368 files passed, 8,406 tests passed / 11 skipped** (220.3 s) — identical to the healthy baseline recorded at the pc06 head.
- `npm run build` — **exit 0, ✓ Compiled successfully, ✓ Generating static pages (149/149), zero unhandled rejections**. Same environment note as the merged pc06 review: this fresh worktree has no `.env.local`, so the gate ran with **command-scoped synthetic localhost env only** (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, a synthetic anon key; nothing written or persisted; the build performs zero data fetching, and the production env file was deliberately not used).
- `test:db` / `e2e` — **intentionally not run**: no DB or UI behavior changes (task instruction); CI runs all its gates when this branch later gets a PR.
- `git diff --check` — clean. `git diff -- docs/reviews/` — empty (every frozen and mutable santa-marta artifact byte-identical); archived legacy ledger SHA-256 re-verified equal to the validator's frozen pin.

## Independent review — round 1 (2026-08-29): REQUEST CHANGES, remediated in commit 2

Codex independent review of commit `9ebb4080` returned REQUEST CHANGES with three narrowly scoped factual-durability findings. Commit `9ebb4080` was left intact — not amended or rewritten — and all three findings are remediated in a single additional correction commit. Every ledger, mapping, count, protocol revision (8), frozen artifact, classification (B), and the W-B2d-01/W-B2c-01 blocked states are unchanged by the remediation.

**Finding 1 — "the current `main`" self-invalidates.** The authoritative entry described the merge commit as "the current `main`", which becomes false the moment `main` advances. Replaced with the durable historical qualifier **"`origin/main` at PC-06 closure-verification time"** (origin/main was re-fetched read-only at correction time and re-verified still exactly `f39a90c3…`, so the qualifier is verified, not assumed).

**Finding 2 — "performed no database operation" overclaimed.** Post-merge CI run 33218834453 legitimately ran Gate 3 (pgTAP) and Gate 4 (E2E) against an ephemeral local Supabase stack spun up inside CI, so the blanket denial was overbroad in exactly the way earlier PC-06 review rounds taught. Replaced — in the authoritative PROJECT_STATE entry and in the pre-merge review request's appended closure section — with the precise boundary: **no production database query or mutation occurred during the merge or the documentation closeout; the post-merge CI used only an ephemeral local Supabase stack for pgTAP/E2E, which is not production access.** The automatic Vercel Production deployment record and all non-authorization language are preserved verbatim.

**Finding 3 — this file's phase accounting.** "`git status` shows exactly the four files" described a pre-commit working tree, not the committed state — replaced with the commit-diff formulation; the commit count is corrected 1 → 2; the original test evidence is preserved under its now-scoped heading and this section carries the round-2 re-run.

**Validator hardening (additive only; no check weakened, removed, or renumbered):** check `[21 clasificación]` gains six durability clauses on the authoritative entry — it rejects the literal "the current `main`" and requires "`origin/main` at PC-06 closure-verification time"; it rejects the literal "performed no database operation" and requires all three parts of the precise boundary ("no production database query or mutation occurred", "ephemeral local Supabase", "not production access"). The OK note is extended accordingly.

**Negative mutation proof of the six new clauses** (disposable scratch copies of the full validator input set; real tree untouched; controls before and after at exactly 67 with zero `[21]` failures; 8/8 harness assertions passed): (R1) "the current `main`" appended while the durable wording remains → the reject clause fires alone (68 total); (R2) the durable qualifier reworded → its require clause fires alone (68); (R3) "performed no database operation" reintroduced beside the intact precise boundary → the reject clause fires alone (68); (R4) the precise-boundary sentence reworded → its require clause fires (68); (R5) "ephemeral local Supabase" reworded → its require clause fires (68); (R6) "not production access" reworded → its require clause fires (68). The full round-1 mutation suite (M0–M12, 16 assertions) was also re-run against the corrected tree — **16/16 still pass**, so none of the original 13 clauses was weakened.

**Round-2 gates at the correction head (every gate repeated):** `node scripts/check-ledger.mjs` exit 1 with **exactly the 67 pre-existing `[16 propiedad]` failures and nothing else** — the failure list diffed byte-identical against the original pre-edit baseline — and the extended `[21]` OK note printed; `npm run type-check` exit 0; `npm run lint` exit 0 (`--max-warnings=0`, from a freshly re-synced non-nested export — same documented worktree artifact and remedy, tree unmodified); `npm test` **368 files / 8,406 passed / 11 skipped**, exit 0; `npm run build` exit 0 (✓ Compiled successfully, ✓ Generating static pages 149/149, zero unhandled rejections; same command-scoped synthetic localhost env, production env untouched); `git diff --check` clean; `docs/reviews/` byte-untouched with the archived legacy ledger SHA-256 re-verified against the frozen pin. `test:db`/`e2e` intentionally unrun (no DB/UI change). No push, PR, merge, deployment, Supabase call, or production access of any kind occurred during this correction.

## Hardest review areas (judgment calls — descending importance)

1. **The unconditional W-B2d-01/W-B2c-01 pins encode *current* governance, not permanent truth.** The directive requires them, and they mean a legitimate future authorization of B2d (or unblocking of B2c) must deliberately revise the validator in its own reviewed correction — the failure messages say exactly that. Verify this is acceptable friction, not an obstacle: it is the same pattern check 21 already uses for W-PC-06's DONE pin.
2. **The "not merged" rejection is scoped to one line.** It applies only to the line beginning `- **W-PC-06 — CLOSED` (found via `String.prototype.startsWith` on the first match), so the historical bullets that legitimately say "NOT MERGED" about other units stay legal. Adversarial reading: a second, stale W-PC-06 entry inserted *below* the authoritative one would not be scanned — but it would not be the first match precisely because the authoritative entry still exists and is pinned; deleting or renaming the authoritative entry fails on its own clause (M8).
3. **Surgical edit inside a very large single-line entry.** The authoritative entry is one line; three segments were replaced (stale parenthetical claim → merged record; review-request sentence → adds this file; final non-authorization sentence → re-anchored on the merged state). Diff-review that the untouched middle — access chronology, aggregates, classification, counts, W-B2b anchors, B2d/B2c semantics — is byte-identical (the single-line unified diff makes this tedious; a word-diff is the honest tool).
4. **The pre-merge review request was qualified, not rewritten.** Both original sentences remain readable in place with an appended "as of this pre-merge review point" qualification, and the closure section is explicitly labeled as appended after the merge. Confirm no review-history content above it was altered.
5. **Mutation-total accounting.** M10–M12 produce more than baseline+new-clause failures because pre-existing checks ([14 reconciliación] status counts, structural checks) also fire on the same mutations. The harness attributes every extra failure; confirm the attribution rather than taking the totals on faith.

## Known limitations / deferred

- The closure pins hard-code the PR #61 facts (SHAs, run ids, deployment phrase). That is deliberate: they pin one immutable historical event. Any future re-recording of the closure wording in PROJECT_STATE must keep those literal anchors or revise the validator in the same reviewed change.
- W-B2d-01 remains BLOCKED/UNAUTHORIZED (class 3) and W-B2c-01 remains BLOCKED/BLOCKED — this correction records that state and pins it; it neither advances nor designs either unit, and the global/shared vs school-owned ownership decision remains Brent's and open.
- The 67 `[16 propiedad]` ownership blockers are retained exactly; nothing here reduces them.
- Lint evidence comes from a non-nested export because of the worktree environment artifact (see Test evidence); a reviewer running from a normal checkout should not hit it.
- Stale "sin fusionar" phrases exist in `docs/reviews/santa-marta-promise-audit-2026-08-24.md` about *other* branches (`fix/gate-score`, `fix/auth-sec2`); that file is a dated historical audit snapshot, out of this correction's authorized scope, and was left untouched.
- This branch is not pushed or merged as of this writing; per the standing rule, Brent decides the merge after independent review. No database or product implementation is authorized by this correction.
