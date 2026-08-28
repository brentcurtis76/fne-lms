# Review request — Fase B2b (W-B2b-01): lockdown of the fourteen unused legacy tables

**Phase type:** database implementation (one active migration + pgTAP evidence + reviewed compensating artifact). No product code, no API/UI/auth change, no production access.
**Status requested:** independent review (Codex). REVIEW READY — nothing here is accepted, merged, deployed, or applied to production by its own existence.

---

## 1. Branch, worktree, base

| | |
|---|---|
| Branch | `fix/rls-anon` (12 chars, ≤ 20) |
| Worktree | `/Users/brentcurtis/dev/wt/rls-anon` |
| Base SHA (live `origin/main`, re-verified before and after the correction round) | `6b7561d4a2bd2bd4192ad514cd8f7f282b76f863` — the PR #58 governance-split merge, parents exactly `550ee347` + `b28a4779` |
| Commit count | exactly **1** — `fix(db): lock down unused legacy tables` |
| HEAD SHA | the single commit above the base; it contains this file, so its own SHA cannot be written here — verify with `git log 6b7561d4..HEAD` (exactly one commit) and the executor's phase report |

No push, no PR, no merge, no rebase, no history rewrite. `fix/rls-anon` did not exist locally, in any worktree, or on origin before this work (verified by `git branch`, `git worktree list`, `git ls-remote`).

## 2. Objective and scope

**Objective (W-B2b-01, lote B2b, class 2):** one atomic lockdown of exactly the fourteen repository-unused legacy tables approved by the merged governance split — revoke all application-role table access, enable row level security, preserve all data, preserve service_role's required behavior, with a written-and-tested additive compensating migration.

**The exact fourteen tables:** `answers`, `assignments`, `course_prerequisites`, `deleted_blocks`, `deleted_courses`, `deleted_lessons`, `deleted_modules`, `menu_permissions`, `metadata_sync_log`, `profiles_role_backup`, `questions`, `quizzes`, `student_answers`, `submissions`.

**In:** the active migration `20260827170000`; pgTAP `062` (new) and the allowlist edit in `001`; one bounded re-pin in `053` (see §4); the compensating artifact and this file under `docs/planning/reviews/`; one PROJECT_STATE.md Meta entry.

**Out (explicitly not done):** `learning_paths` / `learning_path_courses` and the six learning-path functions (W-B2c-01, BLOCKED); the six B10a referenced tables' grants/RLS/policies (W-B10a-01); W-PC-06; the D-RLS deferred units; any touch of `fix/rls-public` or `fix/auth-sec2`; any product code, API, UI, auth, package or CI change; any production query, migration, deployment or verification; `supabase db push`; push/PR/merge.

**Baseline being locked (committed baseline `00000000000000_baseline.sql`, uniform across all fourteen):** `GRANT ALL` to `anon`, `authenticated`, `service_role`; RLS not enabled; zero policies; zero PUBLIC grants; no later migration touches them.

**No-consumers verification (re-run at this base).** Idiom-complete repository sweep: Supabase client `.from('<t>')` (the six `assignments` hits are `supabase.storage.from('assignments')` — the Storage bucket, not the table), embedded-resource selects, raw SQL (`FROM/INSERT INTO/UPDATE/JOIN/DELETE FROM`), and quoted-name occurrences across `pages/ components/ lib/ utils/ hooks/ contexts/ scripts/ middleware.ts` (all remaining hits are UI state strings, route names, notification categories, jsonb payload keys, or `types/supabase.ts` FK metadata). DB-side: every baseline function body mentioning any of the fourteen names was triaged — `submit_quiz` and `grade_quiz_feedback` write `quiz_submissions`, `cascade_lesson_submission_updates` writes `lesson_assignment_submissions`; the one real reference is `log_metadata_sync_needed` (INSERT INTO `metadata_sync_log`), an **orphan** trigger function: no trigger references it in the baseline or any later migration, and no code calls it.

## 3. The correction round — original assumption, the 053 failure, and the authorized remedy

1. **Original zero-policy assumption.** The first executor prompt required the final state to carry *no policy of any kind*: REVOKE + ENABLE only, with pgTAP asserting zero policies per table.
2. **The failure it tripped.** `npm run test:db` failed 3 subtests in `supabase/tests/053-forced-password-change-data-layer.sql` — a file outside the then-authorized set — while everything else passed. 053's **catalog invariant** requires every row-secured `public` table to carry the restrictive `forced_password_change_guard` policy (tests 12 and 27 listed exactly the fourteen newly row-secured tables), and its test 23 pins the count of `public` tables **without** row security at literal 22, which the mandated lockdown necessarily shrinks to 8. 053 was proven 124/124 green at the exact base state — the failures were introduced by the lockdown, and no implementation of "enable RLS on the fourteen" could avoid test 23.
3. **Why the guard is mandatory.** The boundary migration `20260819120200` defines `public.apply_forced_password_change_guard(text, text)` — per its own COMMENT: *"A future migration that adds a table calls this once; supabase/tests/053 fails CI if it does not."* The invariant is deliberately uniform: no table may join row security without the authentication boundary considered.
4. **Why it cannot grant access or weaken the lockdown.** The guard is `AS RESTRICTIVE FOR ALL TO authenticated USING/WITH CHECK ((SELECT public.password_change_gate_ok()))`. A restrictive policy can only further constrain what a permissive policy would grant; these tables have zero grants and zero permissive policies, so the guard grants nothing and re-opens nothing. It targets neither `anon` nor `service_role`.
5. **The authorized remedy (Brent, Option A, 2026-08-27).** (a) the migration adds the boundary's own one-line helper call per table; (b) `053` is re-pinned **22 → 8** in exactly three touchpoints — the nearby explanatory comment, the expected literal, the assertion description — with the equality comparison, plan count, installer tests, restrictive-shape assertions, behavior matrix and negative control all untouched (the diff is 4 added comment lines + 2 changed lines); (c) `062` asserts the exact guard shape instead of "zero policies". The 8-count remains independently backed by the exact-set assertion in `001`.
6. **Option B rejected** (by Brent's authorization, matching the executor's recommendation): exempting fully-revoked tables from the catalog invariant would carve an exemption class into a global authentication invariant to keep one migration cosmetically smaller — the boundary's value is precisely that it admits no exemptions.

## 4. Files created/modified (exactly seven), grouped by risk

**Higher risk — the active database surface:**
- `supabase/migrations/20260827170000_lockdown_unused_legacy_tables.sql` (new) — the lockdown. Exactly **42 substantive statements**, three per table in a fixed order:
  1. `REVOKE ALL ON TABLE public.<t> FROM PUBLIC, anon, authenticated;` × 14
  2. `ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;` × 14
  3. `SELECT public.apply_forced_password_change_guard('public', '<t>');` × 14
  No permissive policy, no policy for anon/service_role, no data change, no new or modified function, no object outside the fourteen, no DROP/TRUNCATE/destructive ALTER, and row security is never disabled.

**Medium risk — test surface that gates the schema:**
- `supabase/tests/062-unused-legacy-lockdown.sql` (new) — 479 assertions from one canonical probe list: 2 governance guards (exactly fourteen tables; zero B2c/B10a names) · 14 RLS-enabled · 112 policy-shape (per table: exactly one policy; named `forced_password_change_guard`; RESTRICTIVE; FOR ALL; roles exactly `{authenticated}`; USING calls `password_change_gate_ok()`; WITH CHECK calls `password_change_gate_ok()`; zero permissive) · 168 ACL denials (PUBLIC / anon / authenticated × S/I/U/D × 14, via `information_schema.table_privileges` and `has_table_privilege`) · 56 service_role privilege preservations · 1 fixture · 112 real-operation denials (anon and a synthetic authenticated user each issue real SELECT/INSERT/UPDATE/DELETE against every table; all must throw `42501` "permission denied for table <t>") · 14 RLS-still-enabled after the probes. Rolls back; synthetic state only.
- `supabase/tests/001-rls-enabled.sql` (modified) — allowlist array shrunk from 22 to exactly the 8 remaining exceptions: `group_assignment_discussions`, `growth_community_transformation_access`, `instructors`, `learning_path_courses`, `learning_paths`, `modules`, `propuesta_rate_limits`, `qa_tester_time_logs` (6 B10a + 2 B2c); comment and description updated. Plan count unchanged (3).
- `supabase/tests/053-forced-password-change-data-layer.sql` (modified) — only the bounded re-pin of §3.5; nothing else.

**Lower risk — reviewed artifacts and state:**
- `docs/planning/reviews/fase-b2b-compensating-migration.sql` (new) — the class-2 emergency compensator (§7), with a prominent DO-NOT-APPLY-without-Brent warning; NOT installed in `supabase/migrations/`.
- `docs/planning/reviews/fase-b2b-review-request.md` (new) — this file.
- `PROJECT_STATE.md` (modified) — one new Meta entry; nothing else rewritten (the governance package is untouched).

## 5. Fail-on-old → green (from scratch, after the correction; the earlier round's outputs were not reused)

Disposable local database reset to the **exact base schema** (39 migrations; the new migration parked outside the tree during the reset), then the revised suites run against that old state via `psql` in the db container:

| Suite | On old state | Failure reasons | After applying only the corrected migration |
|---|---|---|---|
| `001` | 2 ok / **1 not ok** | the global RLS check lists exactly the fourteen tables (`have: {answers,…,submissions} want: {}`) | **3/3 ok** |
| `053` (revised) | 123 ok / **1 not ok** | only test 23: `have: 22 want: 8` — the re-pin detects the old grants/RLS state | **124/124 ok** (plan count unchanged) |
| `062` | 129 ok / **350 not ok** | exactly 25 failure classes × 14 tables: RLS off (×2 blocks), anon+authenticated ACL present (×8), anon+authenticated operations succeed instead of throwing (×8), and the seven **missing-guard** classes (no policy, name, RESTRICTIVE, FOR ALL, roles, USING, WITH CHECK). The 129 passes are the classes that also hold at baseline (governance guards, zero-permissive, PUBLIC, service_role, fixture) | **479/479 ok** |

Identical files ran in both states; no assertion was weakened, deleted, or special-cased to turn green.

## 6. Data-preservation proof (synthetic local data; no production query)

On the same base-state database: 2 synthetic rows seeded into every one of the fourteen tables (synthetic parents: 1 `auth.users` row, 1 `instructors` row, 2 `courses` rows — data only, wiped by the final reset), then `count(*)` plus an order-independent deterministic digest (`md5(string_agg(md5(row::text) ORDER BY md5(row::text)))`) captured **before** and **after** `supabase migration up` applied only `20260827170000`:

| table | rows pre → post | digest pre = post |
|---|---|---|
| answers | 2 → 2 | `be50c7143a202cd88d63f4c447f9bea3` |
| assignments | 2 → 2 | `6e670c3c4631a7849e7ad64d437381c8` |
| course_prerequisites | 2 → 2 | `ae4336bd5ef87ac1056d77bb6ce135c0` |
| deleted_blocks | 2 → 2 | `5ac27af3119a6dca83914100776cb51e` |
| deleted_courses | 2 → 2 | `c18533d1fe54291d2ef030b811736d9d` |
| deleted_lessons | 2 → 2 | `3db4f37b1efcbf211e3b38fc80d4347e` |
| deleted_modules | 2 → 2 | `f6d29fb43d545df4bbc31adfef3ac000` |
| menu_permissions | 2 → 2 | `adfc59b0a92ecb2ab1417ca35ba437b1` |
| metadata_sync_log | 2 → 2 | `457ffdb524c88bcc47c82d0be056789b` |
| profiles_role_backup | 2 → 2 | `73d67f8ece801659312e194e84887484` |
| questions | 2 → 2 | `b7d4be5833c15997de63004fdc589f68` |
| quizzes | 2 → 2 | `fe772dbbbc4bf33aac8947fd2b077cf4` |
| student_answers | 2 → 2 | `7ba0904d3710b0f9802384422266bdb2` |
| submissions | 2 → 2 | `a28241450ddb6ad6dca67c216fe14ec8` |

`diff` of the pre/post capture: empty — **exact equality on all fourteen**.

## 7. Compensating-migration test evidence (rollback-only local transaction; execution authorized only for this test)

The artifact was applied **verbatim** (streamed unmodified between the harness pre/post scripts) inside one `BEGIN … ROLLBACK` transaction on the migrated local database. `ON_ERROR_STOP=1`; exit 0; zero ERROR lines; command tags captured. Hard-assert results, in order:

1. **Pre-compensation:** exactly one restrictive `forced_password_change_guard` and zero permissive policies on every table.
2. **Under compensation — structure:** RLS still enabled on all fourteen; ACL matrix all-true for anon/authenticated/service_role × S/I/U/D; service_role retains all seven table privileges; **exactly three policies per table** — the intact restrictive guard (name, RESTRICTIVE, ALL, `{authenticated}`, `password_change_gate_ok()` in USING and WITH CHECK) plus `w_b2b01_comp_anon_<t>` (`{anon}`) and `w_b2b01_comp_authenticated_<t>` (`{authenticated}`), both PERMISSIVE, FOR ALL, `true`/`true`; no policy targets service_role. Tags: 14 `GRANT`, 28 `CREATE POLICY`.
3. **Under compensation — behavior (four actors, per table):**
   - **anon**: INSERT/UPDATE/DELETE each affected exactly 1 row on every table (14× `INSERT 0 1`, 14× `UPDATE 1`, 14× `DELETE 1`) and SELECT saw exactly the 2 committed synthetic rows on every table — the guard is `TO authenticated` and `password_change_gate_ok()` allows a NULL `auth.uid()`, so anon is unaffected, as before the lockdown.
   - **clear authenticated** (synthetic account, `must_change_password = false`): same per-table 1-row INSERT/UPDATE/DELETE effects and 2-row visibility.
   - **flagged authenticated** (synthetic account, `must_change_password = true`): on every table, SELECT sees **0** rows, full-table UPDATE and DELETE reach **0** rows, and a constraint-valid INSERT throws `42501` (14/14 caught) — the intact restrictive guard stays effective under compensation. This is deliberately *not* byte-identical to the pre-lockdown world (these tables then had no row security, so the boundary could not bind them): the compensator restores application-role access **without reproducing that historical gap** in a now-mandatory global authentication invariant.
   - **service_role**: unchanged throughout (all seven privileges; no policy names it; BYPASSRLS).
4. **After ROLLBACK:** anon/authenticated hold zero S/I/U/D privileges, exactly one policy per table (the restrictive guard), zero permissive policies, RLS enabled, service_role intact — the candidate lockdown fully restored.

The artifact was not applied anywhere else, and remains outside `supabase/migrations/`.

## 8. Validation commands and results (all at the reviewed head, worktree `rls-anon`, `npm ci` node_modules; focused pgTAP executed via `psql` inside the local db container — the host has no psql)

| Gate | Result |
|---|---|
| `git diff --check` | clean — zero warnings (re-run after every file, including this one) |
| `npm run guard:migrations` | PASS — "no migration disables ROW LEVEL SECURITY" + "40 migration file(s) scanned; no DROP, TRUNCATE, row-security disable or destructive ALTER" |
| Focused pgTAP `001` / `053` / `062` (post-migration) | **3/3 · 124/124 · 479/479** — plus the §5 fail-on-old runs on the base schema |
| `npm run test:db` (`supabase test db`, fresh `supabase db reset`, 40 migrations) | PASS — **24 files, 1,931 tests, 0 failed** |
| `npm run type-check` | PASS — zero diagnostics |
| `npm run lint` (`--max-warnings=0`) | PASS — zero errors, zero warnings |
| `npm test` (Vitest, full run) | PASS — **368 files / 8,406 passed / 11 skipped / 0 failed** (203.4s) — identical counts to the `main` baseline |
| `npm run build` (production, after the CI-equivalent `.env.local`) | PASS — exit 0 (pipefail-verified), full route manifest |
| `node scripts/check-price-leak.mjs` | PASS — 262 files scanned, no commercial data |
| Seed + mandatory Playwright: `supabase db reset` → `.env.local` from `supabase status` (synthetic local values only) → build → `node scripts/ci/seed-e2e.mjs` → `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | PASS — **192 passed / 0 skipped / 0 unexpected / 0 flaky across 13 specs** (2.2m; JSON stats expected=192, unexpected=0, skipped=0, flaky=0) |
| `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | PASS — "13 mandatory spec(s) ran with no skips" |
| `node scripts/check-ledger.mjs` | exit 1 with **exactly the 67 `[16 propiedad]`** pre-existing ownership failures and **zero failures in every other class**; the failure set diffed **byte-identical** against the pre-change run; all structural OK notes print (byte/id conservation, split-scope set-equality 14+2+6, B2c functions, deferred units) — re-run after the PROJECT_STATE edit |

Environment: local ephemeral Supabase stack only (CLI 2.110.0 — CI's pinned version); `.env.local` contained only local-stack values and synthetic placeholders and was removed after the run (recreate exactly as CI does: `supabase status -o json` → the nine keys of `.github/workflows/ci.yml` "Point the app at the local stack"). Generated test outputs (`test-results/`, `playwright-report/`) were removed after evidence capture. The shared local database was left freshly reset.

## 9. Areas an independent reviewer should scrutinize hardest

1. **The 053 edit boundary.** Diff `supabase/tests/053-…sql` against base: it must be exactly 4 added comment lines + the literal `22 → 8` + the description word `22 → 8`. Anything else in that file — the catalog invariant, installer tests, restrictive-shape assertions, behavior matrix, negative control, plan count — must be byte-identical. This was the one file the correction round newly authorized; its blast radius is the thing to bound.
2. **Guard-expression assertions use containment, not deparse equality.** 062 asserts `qual/with_check LIKE '%password_change_gate_ok()%'` rather than pinning Postgres's exact deparsed text (version-sensitive). 053's repo-wide shape assertions are the stronger backstop; confirm the pair is sufficient.
3. **The compensator restores `GRANT ALL`, not just S/I/U/D.** That is the baseline-exact "prior grants" (TRUNCATE/REFERENCES/TRIGGER included). Confirm that reading of "restore the prior table grants" is the intended one.
4. **Flagged-account semantics under compensation.** The compensated world deliberately keeps the forced-password boundary binding (§7.3), i.e. it is prior behavior ∩ current global invariant, not a time machine. Confirm the artifact's comments and this file say that consistently.
5. **The no-consumers sweep's residual risk is dynamically-built table names.** The idiom sweep cannot see a `.from(variable)` whose value is assembled at runtime; mitigations: the governance audit's original derivation, the Z7 site-exact danger census on ledger authority, and the orphan status of `log_metadata_sync_needed`. Spot-check `lib/` for dynamic `.from(` targets if unconvinced.

## 10. Known limitations and deferred items

- **The guard is functionally inert on these tables today** (zero grants, zero permissive policies). It exists for catalog uniformity; if any future authorized unit re-grants access, the boundary is already in force.
- **`log_metadata_sync_needed` stays an orphan** SECURITY INVOKER function that writes `metadata_sync_log`; re-wiring it to a trigger would now require its invokers to hold privileges. Out of scope; adjacent to the deferred D-RLS surface.
- **053's count pin stays equality-based** (authorized as-is, no `<=`): when W-B10a-01 / W-B2c-01 later remove tables from the no-RLS set, 053 will be re-touched deliberately, exactly as here.
- **All validation is local.** Applying the migration to production remains the standing human post-merge step (protocol rule from Z1b: a phase with migrations is not closed until Brent applies them and the schema is verified read-only).
- **Privacy signoff: NOT evidenced.** W-B2b-01's `gate_salida` requires "firma Privacidad"; no approval, approver, or date exists or is claimed here — **it remains a required merge condition**. Nothing in this branch invents or substitutes for it.

## 11. Confirmation of non-actions

Nothing was pushed, merged, deployed, or applied to production. No production database was queried for any purpose (all evidence is from the local ephemeral stack with synthetic data). No PR was opened. `supabase db push` was not used. No learning-path table or function, no B10a grant/RLS/policy, no `fix/rls-public`, no `fix/auth-sec2`, no CLAUDE.md/AGENTS.md, no package or CI file was touched. The compensating artifact was executed only inside the rollback-only local test of §7, as explicitly authorized, and nowhere else.

---

## 12. Post-merge production closure (authoritative — 2026-08-28)

**This section supersedes the pre-merge status claims of §§1–11**, which remain above unchanged as the historical record of the review candidate. Where §1 says "no push, no PR" and §11 says "nothing was … applied to production", those statements were true when written and are superseded by the following governed events.

1. **Review, push, merge, CI, deployment.** Independent review (Codex): **APPROVE, no findings**, on the exact range `6b7561d4…..21e01b11…`. Brent pushed `fix/rls-anon` and opened PR [#59](https://github.com/brentcurtis76/fne-lms/pull/59); all nine checks passed (both migration guards, typecheck, lint, unit, pgTAP, e2e, and the automatic Vercel preview integration). Brent merged it as **`0377edbf13bbaf8b4f98dc24b6acd161c705141b`** (parents exactly `6b7561d4` + `21e01b11`). Post-merge CI run [33134662387](https://github.com/brentcurtis76/fne-lms/actions/runs/33134662387) completed **success** on that SHA, and the **automatic** Vercel deployment for that SHA completed ("Deployment has completed"). No manual deployment was invoked at any point.
2. **Privacy approval (the gate's "firma Privacidad").** Recorded and governed in the PR #59 approval comment ([issuecomment-5447468927](https://github.com/brentcurtis76/fne-lms/pull/59#issuecomment-5447468927)): **Brent Curtis — Project Lead and designated Privacy approver for W-B2b-01 — 2026-08-27.** The §10 "Privacy signoff: NOT evidenced" limitation is thereby closed; the frozen claim register remains untouched.
3. **Production preflight (read-only).** Before any write, Brent visually confirmed the production project and ran the read-only catalog preflight: **all eleven assertions `true`** — the fourteen tables present as ordinary tables, RLS off, zero policies, zero `PUBLIC` grants, `anon`/`authenticated`/`service_role` each holding all seven baseline table privileges, `apply_forced_password_change_guard(text,text)` present, migration version `20260827170000` absent from `supabase_migrations.schema_migrations`, ledger columns present, and the no-RLS set equal to exactly the 22 legacy tables. Production matched the committed baseline with zero drift.
4. **One-transaction application.** Brent applied, in the production SQL Editor, **one transaction** (`lock_timeout 5s`, `statement_timeout 60s`) containing the **byte-exact migration body obtained via `git show` from the merge commit** (blob `bba7f7e510f4fa0e51e5091ea724fee0c7a2650f`, SHA-256 `983268f6ea89c7943e4c1c9d3d7b275e404ee7dec8f416828878770bfe58400e`, 107 lines / 6,189 bytes) followed by its ledger row `('20260827170000','lockdown_unused_legacy_tables')`. It committed without error.
5. **Postflight state (read-only).** **All eight assertions `true`**: RLS enabled on all fourteen; exactly one policy per table — the restrictive `forced_password_change_guard`, FOR ALL, targeting only `authenticated`, `password_change_gate_ok()` in USING and WITH CHECK — and zero permissive policies; `anon`/`authenticated` at zero privileges across all seven privilege types; zero `PUBLIC` grants; `service_role` retaining all seven; the ledger row exact; and the public no-RLS set now **exactly the 8 remaining governed exceptions** (6 B10a + 2 B2c).
6. **Data preservation (aggregate counts only).**

   | table | pre → post | | table | pre → post |
   |---|---|---|---|---|
   | answers | 0 → 0 | | metadata_sync_log | 0 → 0 |
   | assignments | 0 → 0 | | profiles_role_backup | 25 → 25 |
   | course_prerequisites | 0 → 0 | | questions | 0 → 0 |
   | deleted_blocks | 0 → 0 | | quizzes | 0 → 0 |
   | deleted_courses | 12 → 12 | | student_answers | 0 → 0 |
   | deleted_lessons | 0 → 0 | | submissions | 0 → 0 |
   | deleted_modules | 0 → 0 | | menu_permissions | 104 → 104 |

   Only aggregate counts and catalog metadata were returned from production — **no table rows, names, emails, or any personal data were queried or displayed** at any point in the ceremony.
7. **Non-actions and scope exclusions.** No compensator was applied; no `supabase db push`; no `migration repair`; no CLI was linked to production; no Management API call; no credential was requested or exposed; no manual deployment. `learning_paths`/`learning_path_courses` and the six learning-path functions (W-B2c-01, BLOCKED), the six B10a referenced tables' grants/RLS/policies (W-B10a-01), W-PC-06 (unauthorized), the D-RLS deferred units, `fix/rls-public`, and `fix/auth-sec2` remain untouched.
8. **Standing instruction.** Migration `20260827170000` is applied and recorded in production — **do not reapply it**. The compensating artifact (§7) remains a reviewed emergency document only and must not be applied without separate, explicit Brent authorization.

---

## 13. Documentation-closure review — round-1 remediation (2026-08-28)

The independent review of the documentation-closure commit (`240cec53`, the six-file diff of §12's closure round) returned two findings. Both are remediated in **one additional correction commit** on top of `240cec53`; the reviewed commit was **not amended, rebased, squashed, or rewritten**, and the historical pre-merge (§§1–11) and production-closure (§12) evidence above is untouched.

| # | Finding | Disposition |
|---|---|---|
| R1-1 | **False acceptance statement in protocol §2.** The active sentence still said "Hoy ningún lote tiene registrada la componente (2)…", which the closure round had made false: W-B2b-01 now has governed stakeholder acceptance recorded. | **Fixed minimally in place** (release protocol §2). The passage now states that exactly one batch — B2b — has BOTH components: component (1) complete (technical production closure, 2026-08-28) and component (2) **evidenced** in a governed mutable record identifying **Brent Curtis, Project Lead and designated Privacy approver for W-B2b-01, dated 2026-08-27** (the PR #59 approval comment); that `W-B2a-01` remains technically `DONE` with component (2) still **pending a person-and-date record**; that the two components remain distinct registers, neither substituting for the other; and that the frozen claims snapshot's `evidencia_prod`/`firmado_por`/`fecha_firma` fields stay byte-frozen and are never edited — B2b's acceptance lives only in the mutable register. The two-register acceptance model is unchanged. |
| R1-2 | **Stale governing revision in the combined plan.** The active banner still pointed to revision 6 as governing and said revision 6 wins on disagreement, and its "only in-place corrections" sentence omitted the closure annotation. | **Fixed in the banner only.** Both active pointers now name **revision 7** ("at revision 7", "where this file and revision 7 disagree, revision 7 wins"); the in-place-corrections sentence now also names the 2026-08-28 W-B2b production-closure annotation to row 0.4; and revision 6 is preserved explicitly as the banner's **historical provenance** (governed 2026-08-27 until revision 7 superseded it). No historical section was modernized or rewritten. |

**Correction range:** exactly three files — `docs/reviews/santa-marta-release-protocol-2026-08-25.md` · `docs/reviews/santa-marta-combined-plan-2026-08-25.md` · this file. The cumulative range from base `0377edbf` still changes only the six closure files of §12's round (PROJECT_STATE.md, the work-items CSV, the protocol, the normalization report, the combined plan, and this file); no CSV, validator, migration, test, product, configuration, package, or workflow file changed in this round, and every frozen artifact remains byte-identical.

**Validation at the correction head:** `git diff --check` clean over the correction range; `node scripts/check-ledger.mjs` exits 1 with **exactly the 67 `[16 propiedad]` ownership failures, byte-identical** to the pre-edit capture, zero failures in every other class, and the split-scope / B2c-function / deferred-unit OK notes printing; independent RFC-4180 recount unchanged (160 claims · 36 P0 · 106 work items · 151 links · 58 P0 links · 27 batches · statuses 29/57/18/2 · modes 89/10/6/1 · DONE = {W-B2a-01, W-B2b-01} · W-B2b-01 `gate_salida` byte-identical); targeted prose checks confirm the false "ningún lote" claim is gone from active prose, the plan's governing pointer names revision 7 consistently, and no active sentence prefers revision 6 over revision 7; `npm run type-check`, `npm run lint`, `npm test` and `npm run build` all pass (build on shape-valid synthetic placeholders only).

**Non-actions:** nothing was pushed, merged, deployed, or accessed in production in this round; no PR was opened or modified; no branch deleted; `fix/rls-public`, `fix/auth-sec2`, W-B2c-01, W-PC-06, B10a, and the D-RLS units untouched; no additional work item marked DONE.
