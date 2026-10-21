# Review request — PASANT-B002a dormant program-interest database foundation (PASANT-09 r0, recovered in r1)

## Provenance (PASANT-09 local continuation r1, 2026-10-15)

- Branch `fix/pasant09-r1`, base/HEAD `85838af02a03a5289ad71852aab007fa62edbbf7` (the accepted PASANT-02 r1 parent
  rebuild on main `2922e1b74`), 0 new commits (uncommitted; a local commit follows only after independent review).
- r1 recovers the accepted r0 change (commit `3ce1339b7`, PM review APPROVED_WITH_NOTES) onto this base. The
  migration, pgTAP suite and DB contract are restored byte-for-byte from `3ce1339b7` (git blobs `ff07a3c6`,
  `cd7b49f4`, `e6b3df11`); no SQL was authored or changed in r1. The r0 change to `b001-parent-reconciliation.md` is
  not carried: this base already attributes C008 to B002 (P02-A1 resolved in the parent rebuild).
- Base drift since `dd1feaa2b` under `supabase/`: migration `20261009000000_notification_enqueue_source.sql` and
  pgTAP `106-notification-enqueue-source.sql`. No PASANT library, API or contract file changed.
- Fresh results on this base: **none yet**. Every Evidence line below is r0 history on `dd1feaa2b`. All gates
  (type-check, lint, all eight unit shards, build, full pgTAP, races, PostgREST smoke, October A9 4/4) must be rerun
  on the frozen r1 state before acceptance. Counts are expected to differ, e.g. pgTAP now includes 106.
- Same unit and attempts: legacy initial 1 / remediation 0. Parent C008 is still **not** closed by this child.

## Original r0 provenance

- Branch `fix/pasant02-ci`, base/HEAD `dd1feaa2ba4c18dbe7fde283760b91a8369dddb7`, 0 new commits (uncommitted; the PM
  commits the reviewed state through the harness). Ledger item PASANT-B002a, derived from B002 (criterion PASANT-C008)
  under approved plan PASANT revision 1. Parent C008 is **not** closed by this child.
- SQL authorship: a dedicated Claude DB subagent wrote the migration, the pgTAP suite and the SQL-bearing scratch
  scripts against the executor's contract (`docs/plan/evidence/pasant-january/b002-database-contract.md`). Hashes:
  migration `f3faa9a6…bc2f`, pgTAP `0df57242…9a04` (full list in RUN `evidence/db-agent-authorship.md`).

## Objective and scope (copied from the order)

Goal: create dormant additive database primitives for January's two interests on one existing lead, with atomic
contact/consent persistence, program-scoped reply claims and explicit access controls. No application caller
activation; B002b integrates and B002 independently verifies cumulative C008.

In: additive relation referencing `pasantias_leads`, unique lead/program, validated January cohort/program pair;
atomic service-only submission RPC; interest-scoped 24 h claim with ownership-safe settle; explicit grant-list, RLS,
restrictive `forced_password_change_guard`; pinned ACLs and search_path; P02-A1 attribution correction.
Out (non-goals): API/caller edits, January public runtime/cohort/form/admin cutover, pagination/export/PDF/commercial/
price changes, shared provider/auth changes, global refactoring or dependencies.

## Files by risk

- High — `supabase/migrations/20261013020000_pasantias_january_program_interests.sql` (230 lines): new table, one
  additive `UNIQUE (id, cohort)` on `pasantias_leads`, three SECURITY INVOKER RPCs (`search_path = ''`).
- High — `supabase/tests/112-pasantias-program-interests-rls.sql` (449 lines, plan 114).
- Low — `docs/plan/evidence/pasant-january/b002-database-contract.md` (interface contract for B002b),
  `docs/plan/evidence/pasant-january/b001-parent-reconciliation.md` (C008 attributed to B002, P02-A1),
  this file, `PROJECT_STATE.md`.
- r1 change set: the two High files and the contract (restored unchanged), this file and `PROJECT_STATE.md`. The B005
  docs `b005-flight-deck-verification.md` and `fase-pasant-area-review-request.md` are restored unchanged from
  `e8f54ee0f` and are not part of this review. `b001-parent-reconciliation.md` is unchanged in r1.

## Evidence — historical r0 on `dd1feaa2b`, not rerun on the r1 base (owned private stack `pasant09db`, API 57011 / DB 57012; synthetic data only)

- pgTAP: focused 112 → 114/114; full `supabase test db` → 74 files / 7658 PASS (baseline 73 / 7544, all unchanged).
- History: synthetic October/legacy leads snapshotted before the migration, after it, and after all races and
  smoke calls: byte-identical, 0 interest rows on non-January leads.
- Concurrency (independent psql connections, wall-clock barrier): submission 22 races, 22/22; claim/settle 23 races
  + 4 sequential counterexamples, 27/27.
- Real PostgREST smoke: 24/24 (service create/second program/idempotent repeat, 400 `22023` for consent and identity,
  400 `22P02` for type-malformed, 404 `PGRST202` for a missing key, anon 401 `42501`, authenticated 403 `42501`,
  claim/settle through REST, legacy `brochure_sent_at` untouched).
- Dormancy: no application file references the new objects; A9 October flow 4/4 (0 skipped, 0 flaky) unmocked,
  production build, explicit private env, `--retries=0`.
- Gates on the final state: type-check, lint (0 warnings), `npm test`, build — see the PASANT-09 executor report.

## Scrutinise hardest

1. **Submission merge vs `lead.ts`.** The RPC re-implements `contactColumns`/`marketingColumns`/`sourcePathColumns`
   and the D-03 reopen in SQL. Any drift (e.g. text trimming: SQL trims but does not collapse internal whitespace)
   becomes a behaviour change once B002b switches the caller.
2. **Forced-password guard evidence.** `user_roles` carries the same guard, so the suite evaluates the literal admin
   predicate as postgres for that uid, then shows 0 rows, then clears the flag and shows rows. Check that this really
   isolates the restrictive policy as the narrowing cause.
3. **Claim semantics.** Settle clears the token on every outcome; `ambiguous` keeps the claim only for its 24 h window;
   an unsettled crash leaves the token until the next claim. Check this matches `canReleaseAutoReplyClaim` intent.
4. **Additive constraint on a live table.** `pasantias_leads_id_cohort_key` takes a brief lock and builds an index on
   `pasantias_leads`; it exists only to make the composite FK enforce "January lead only".
5. **service_role privilege narrowing.** service_role gets SELECT/INSERT/UPDATE/DELETE (no TRUNCATE/REFERENCES/
   TRIGGER/MAINTAIN), narrower than `pasantias_leads`. Deliberate; confirm no operational path needs more.

## Known limitations / deferred

- Dormant: no caller. B002b wires `pages/api/pasantias/lead.ts`, mail settle outcomes and UI acceptance; B002
  verifies cumulative C008; full January CI/C011 is B006; January runtime is B003.
- Race overlap is enforced by a shared wall-clock barrier, not measured lock waits.
- Size: ~680 new SQL lines plus docs, above the executor template's ~400-line guide; the PM split already scoped
  this as one atomic invariant.
- Local stack only; nothing was applied to any hosted or production database.
- r0 review advisory P09-A1 (P3): the comment at `112-pasantias-program-interests-rls.sql:294` credits the denial
  only to the target guard, but `user_roles` is guarded too. The r0 PM isolated the guard separately. The destination
  is B002b or the DB-test owner; r1 does not edit SQL.
- The migration's `UNIQUE (id, cohort)` constrains an existing table. A count-check manifest and synthetic evidence
  must be recorded before acceptance (pending in r1). The Production count check belongs to the publisher; this
  unit has no production access.
