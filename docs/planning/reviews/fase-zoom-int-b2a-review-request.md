# Review request — ZOOM-B2a explicit roster database foundation

Orders: `ZOOM-B2a v1` and `B2a-remediation-1` (PM Codex). Executor: Claude Code DB_EXECUTOR (`claude-opus-5`, effort high), `/bounded-executor`, contract 1.1.0. Initial implementation 1, remediation **1 of 2** (initial session wrote the SQL/proof; the remediation session corrected R1-R3).

## State

| Item | Value |
| --- | --- |
| Worktree / branch | `/Users/brentcurtis/dev/wt/zoom-b2` / `codex/zoom-b2` |
| Base SHA | `b17a68393dc7cd3a6ccfed9fffa3252c7e97fb46` |
| Commits | 1 local commit on the base (not pushed); exact SHA in the external execution report |
| Status | **FINDINGS** — R1-R3 implemented and validated; required full DB gate stays red only on the pre-existing 079 baseline (not waived) |

## Objective (from the order)

Atomic explicit roster mutation primitives and a database operator-approval boundary, preserving client/QA behavior, membership revocation and recorded attendance. B2b consumes the RPCs (routes + notification consumers), B3 supplies UI.

**In scope:** one additive migration, one pgTAP file, one real concurrency proof + npm script + CI step, the 063 census/fixture adjustment (remediation R2), the Gate 3 entry in `docs/ci-setup.md`, this document.
**Out of scope:** routes, UI, notification consumers (B2b), money logic, general client approval concurrency, 079 repair, production, publication.

## Files by risk

| Risk | File | Change |
| --- | --- | --- |
| HIGH | `supabase/migrations/20260910120000_zoom_explicit_roster.sql` | gate trigger + function, two RPCs, GC trigger function replacement |
| MEDIUM | `scripts/ci/zoom-roster-concurrency-proof.mjs` | new, 13 real two-connection interleavings, bounded |
| MEDIUM | `supabase/tests/081-zoom-explicit-roster.sql` | new, 141 assertions |
| MEDIUM | `supabase/tests/063-fne-zoom-operator-tenant.sql` | C15 trigger census + uncounted eligible-roster fixture before E27 (plan 212 unchanged) |
| LOW | `.github/workflows/ci.yml` | one step in the existing pgtap job |
| LOW | `package.json` | `test:zoom-roster-concurrency` script only |
| DOC | `docs/ci-setup.md`, this file | Gate 3 proof entry; review request |

Not edited: `types/supabase.ts` is the canonical generated file but contains neither `session_attendees`/`consultor_sessions` nor any session RPC; `lib/types/database.types.ts` does not exist.

## Database design

1. **Gate** `trg_enforce_operator_roster_approval_gate` — `BEFORE INSERT OR UPDATE OF status, school_id, growth_community_id ON consultor_sessions`, row level, function `enforce_operator_roster_approval_gate()` (SECURITY DEFINER, `search_path=''`, EXECUTE revoked from PUBLIC/anon/authenticated). Gated rows: NEW status `programada` AND (INSERT, or OLD status not `programada`, or school_id/growth_community_id changed). The NEW school's tenant decides; for **operator** it requires an **eligible** attendee: `expected IS TRUE` and an active `user_roles` row in the NEW exact community. Otherwise `23514` (constant message), or `55P03` when every eligible row is locked. A refused row aborts the whole statement (bulk all-or-nothing). A scheduled row rewritten with the same status/school/community, metadata edits, and every non-`programada` write pass.
2. **Why context changes (R1):** `PUT /api/sessions/[id]` (`pages/api/sessions/[id]/index.ts:407-433`) writes `school_id`, `growth_community_id` and `status` in a plain update, so a scheduled client/qa session could become operator, or a scheduled operator session could change community, without a status transition.
3. **Locking protocol.** RPCs take the session row `FOR NO KEY UPDATE` first (conflicts with the UPDATE row lock, not FK `KEY SHARE`). The gate runs after the row lock with fresh READ COMMITTED snapshots and pins one eligible attendee + membership `FOR SHARE ... SKIP LOCKED`. RPCs lock memberships/targets `NOWAIT` → `roster_busy`. Direct attendee DELETE without the parent lock: uncommitted → gate `55P03` without waiting; after the pin → the delete waits for the approval commit (proof 10, 11).
4. **Approval-time + context-change rule, not a permanent invariant.** Revocation still expires the last participant; direct DML after approval is not intercepted. Such a roster cannot re-enter `programada` or move context until an eligible selection exists (081 E29, G12-G18).
5. **GC trigger** `sync_session_attendees_on_gc_change()`: INSERT branch excludes operator-tenant sessions; revocation branch is the baseline statement schema-qualified; `search_path=''`; owner/ACL/trigger unchanged.

## RPC contract for B2b

Both: `(p_session_id uuid, p_user_ids uuid[], p_actor_id uuid) RETURNS jsonb`, SECURITY INVOKER, `search_path=''`, EXECUTE **service_role only**. The API enforces view (shared not-found) then contribute first. `p_actor_id` must be a `profiles.id` (audit only). READ COMMITTED caller expected (PostgREST).

Refusals return **before any write**: `{"ok": false, "reason", "session_id", ["session_status"], ["user_ids"]}`.

| reason | add | remove | meaning |
| --- | --- | --- | --- |
| `invalid_request` | ✓ | ✓ | NULL session/actor/list, empty list, NULL element, not 1-D |
| `too_many_attendees` | ✓ | ✓ | > 200 distinct ids |
| `invalid_actor` | ✓ | ✓ | actor has no profile |
| `session_not_found` | ✓ | ✓ | no such session |
| `session_status_not_editable` | ✓ | ✓ | status ∉ {borrador, pendiente_aprobacion, programada}; `session_status` included |
| `session_inactive` | ✓ | ✓ | `consultor_sessions.is_active` not true |
| `tenant_unresolved` | | ✓ | school row not found (fail closed) |
| `roster_busy` | ✓ | ✓ | a target/membership row is locked by a concurrent writer; retry |
| `invalid_attendees` | ✓ | | `user_ids` = ids that are not active members of the exact community |
| `attendance_evidence_present` | ✓ | ✓ | `user_ids` = rows with attended (true/false), marked_by, marked_at, arrival_status or notes (add: only de-selected rows) |
| `last_eligible_attendee` | | ✓ | programada operator session would lose its last eligible attendee |

Success — add: `added_user_ids`, `reactivated_user_ids`, `already_present_user_ids` + `_count`s, `session_status`. Remove: `removed_user_ids` (hard delete), `missing_user_ids`, counts, `cancelled_notification_count` (this session's `scheduled` rows of removed users; sent/failed/cancelled and facilitator rows kept). One `session_activity_log` row (`edited`, `details.change` = `roster_attendees_added|roster_attendees_removed`) only when something changed. Unexpected errors raise (whole call rolls back). B2b consumers must read the live expected roster. B2b app copy must also map a refused school/community move (23514) on PUT.

## Test evidence (owned stack `zoom-local-20260910`, db 127.0.0.1:54762; logs `/Users/brentcurtis/dev/validation/zoom-20260910/rem1/logs`)

| Run | State | Result |
| --- | --- | --- |
| 081 fail-on-initial (`r01`) | initial B2a migration, remediation tests | 131 ok / 10 not ok (A12, G1-G7, G9, G10) |
| 063 on initial (`r01`) | same | 212/212 (R2 fixture/census) |
| proof fail-on-initial (`r02`) | same | exit 1 at scenario 12 (move into operator not refused); 0-11 pass |
| full `supabase test db` (`r06b`) | reset to final migration (56, head 20260910120000) | exit 1: 43 files, 4257 tests; **081 141/141, 063 212/212**; only **079** fails 102/116/118-119 (pre-existing) |
| proof (`r05`, final) | same | exit 0, 13 scenarios |
| type-check / lint (`r20`, `r21`) | final worktree, Node 22.22.0 | exit 0 / exit 0 |
| `npm test` (`r22`) | same | exit 0: 430 files, 9875 passed, 12 skipped |
| `npm run build` (`r23`) | same, synthetic localhost env only | exit 0 |
| `guard:migrations`, `guard:secrets`, `guard:browser`, `guard:actions`, `git diff --cached --check` (`r30`-`r32`) | staged tree | exit 0 each |

Earlier initial-session evidence (base replay fail-on-old 88/123, base full-suite 079 baseline) remains in `validation/zoom-20260910/logs`.

079 (not repaired, not waived): fixtures use `now() - N days`, so monthly buckets depend on the calendar date; identical failures without B2a. Routed to the approved-main integration that consumes the already-merged 079 repair.

## Scrutinize hardest

1. **Context-change predicate** — `OLD.status = programada` with identical school+community is the only exemption; confirm no remaining path schedules an operator row with an ineligible roster (e.g. `apply_session_reschedule` does not write these columns).
2. **Lock protocol honesty** — SKIP LOCKED pin / NOWAIT RPCs so revocation is never deadlocked or rolled back by the gate. Not claimed: arbitrary multi-row direct DML is deadlock-free (40P01 remains possible).
3. **Eligibility = expected AND active membership in the NEW community** — stricter than "expected attendee"; B3/B2b copy must explain it.
4. **SECURITY DEFINER gate** relies on owner BYPASSRLS (`user_roles` FORCE RLS); fails closed otherwise. Verify on the hosted instance before release.
5. **Proof bounds** — `statement_timeout` 30 s, `lock_timeout` 20 s, barrier 15 s, watchdog 120 s; busy branches match the gate's own message so a lock timeout cannot pass as `55P03`.

## Findings and limitations

- **F-B2a-1 (resolved by PM scope clarification R2):** 063 C15 census and E27 fixture adjusted; assertion intent and count preserved.
- **F-B2a-2 (info):** authenticated UPDATE of `consultor_sessions` raises `42P17` (policy recursion) for any column, independent of B2a; 081 exercises authenticated writers via INSERT. Not repaired.
- **Deferred to B2b:** routes, view/contribute denial shape, mixed operator/non-operator bulk refusal before financial side effects, PUT error mapping for refused moves, notification consumers filtering `expected=true`. **B3/C:** UI and CUA (UI_NOT_RUN here).
- No production access, `db push`, PR, merge, deploy, provider call or real mail.
