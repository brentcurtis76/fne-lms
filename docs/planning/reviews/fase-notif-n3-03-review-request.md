# Review request — NOTIF N3-03 (dormant notification email worker core)

- **Branch:** `fix/notif13-render` · **Base:** HEAD `f95c1d5842dbe6f481611366344c720359861df0` (merge-base with `main` `49814091a2df`, 254 commits ahead) · **Commits:** 0 by the executor (the PM commits after review)
- **Unit:** NOTIF-14 r2 (r0 returned FINDINGS: the outbox row could not identify its source record; r1 returned CHANGES_REQUIRED, N14-R1-01: both group events still mailed a recipient whose role had moved to another school or community) · ledger item N3-03 · plan `docs/planning/notifications-plan-2026-09-26.md`, Design D4
- **Authorship:** the migration and pgTAP SQL were authored by the repo's DB agent (a dedicated Claude Code subagent, under AGENTS.md) from the executor's written contract; the executor reviewed the SQL and wrote the TypeScript and the Vitest suites.

## Objective and scope (from the order)
Implement the dormant N3-03 worker core: atomically claim outbox rows under a lease, recheck source-record access and current email preference before the first attempt, freeze an encrypted send snapshot, then submit only through `authorizeUserEmail` and `deliverOutboundEmail` with the stored idempotency key. Keep the live synchronous path unchanged and the worker inert while `NOTIFICATION_OUTBOX_DELIVERY` is unset/off.

- **In:** the eight allowlisted paths (below).
- **Out:** N3-04 retry classification, backoff/throttle, recovery priority, 24-hour `unknown`, purge; N3-05 unsubscribe; N3-07 mail mirror; N5-02 enqueue, cutover and cron registration; preferences UI. `vercel.json` is untouched: nothing schedules the route.

## Files by risk
**High — new privileged DB objects and the send decision**
- `supabase/migrations/20260930020000_notification_email_worker_claim.sql` (new, additive). Side table `notification_email_outbox_source` (`outbox_id` PK/FK ON DELETE CASCADE, `source_kind` in eight kinds, `source_id` lowercase UUID or positive integer; RLS on, forced-password guard, service-role only). Three SECURITY INVOKER functions with `search_path = ''`, EXECUTE for service_role only: `claim_notification_emails` (lease, `FOR UPDATE OF o SKIP LOCKED`, database clock, expired leases re-claimed), `begin_notification_email_attempt` (live owner only; the first snapshot is frozen and the stored bytes are returned), `finish_notification_email` (live owner only; `sent`/`failed`/`cancelled` clear the snapshot, `retry` keeps it, `digest` hands an unattempted row to the digest).
- `lib/email/notification-access.ts` (new). One rule per event: the record kind its reference must name and the membership check for that record, read with the service role. r2: both group events first read the `group_assignment_groups` row and require what its SELECT policy requires (active admin, active role in its community, or an active role at its school when `community_id IS NULL`); only then does the member row (`group_invitation`) or the active consultant assignment to its community (`group_assignment_submitted`) count. A missing group is revoked; a failed group, role, member or assignment read is `unavailable` and the row waits.
- `lib/email/notification-worker.ts` (new). Flag, config checks, claim, first-attempt checks, AES-256-GCM snapshot, authorization, delivery, outcome.

**Medium — entry point**
- `pages/api/cron/notification-emails.ts` (new). Method → `authorizeCronRequest` → flag → worker. With the flag off it answers before a database client exists.

**Low — tests/docs**
- `supabase/tests/100-notification-email-worker.sql` (96 assertions), `__tests__/lib/email/notification-worker.test.ts` (108 tests), `__tests__/api/cron/notification-emails.test.ts` (10 tests), this file.

## Interface N5-02 must honour (flag-on dependency)
- **The source reference is written by the producer wiring, not here.** `enqueue_notification` (N3-01) does not take or write it. When N5-02 wires producers it must insert the `notification_email_outbox_source` row in the same transaction as the outbox row. Until then every record-bound row ends `failed / source_missing` and no email leaves: that is the intended fail-closed state, not a delivery path. This unit does not claim cutover.
- Kind per event: `session` (consultor_sessions.id) for the eight `session_*` events; `licitacion` for the fourteen `licitacion_*`; `course` (courses.id) for `course_assigned`, `course_completed`, `module_completed`; `assignment` (lesson_assignments.id) for the three `assignment_*`; `consultant_assignment` for `consultant_assigned`; `group` (group_assignment_groups.id) for `group_invitation`, `group_assignment_submitted`; `quiz_submission` for `quiz_review_pending`, `quiz_reviewed`; `workspace` (community_workspaces.id) for `message_sent`, `user_mentioned`. No reference for `new_feedback`, `qa_test_failed`, `data_quality_alert`, `qa_scenario_assigned`, `system_update`.
- Never sent by this worker: unmapped events, `learning_path_assigned` (no recipient rule exists) → `failed / event_unsupported`; `meeting_finalized` → `cancelled / email_suppressed` until N5-06.
- New server-only variable `NOTIFICATION_SNAPSHOT_SECRET` (≥ 32 characters, no fallback). Unset or short: the worker claims nothing. It belongs on the N5-07 enablement checklist; changing it makes queued snapshots unreadable (`retry / snapshot_unreadable`, never sent).

## Test evidence
- Focused Vitest: 2 files, 118 passed (r1: 97). The r2 additions are the 20 group rows of the D2 matrix (moved school and community, moved community within the school, inactive community role, school-only group, admin, deleted group, each with the member or assignment row left behind) and 6 group read-failure tests. With the visibility check removed, six of them fail (`RUN/evidence/logs/r2-mutation-visibility-removed.log`); the PM's r1 counterexample now prints `revoked` twice (`r2-pm-counterexample.log`). The worker suite drives `runNotificationEmailWorker` over an in-memory database stand-in whose three RPCs follow the semantics pgTAP 100 proves for the real functions; the route suite runs the real worker behind the real handler.
- pgTAP (SQL unchanged in r2) on the private stack `notif14isolated` (DB 127.0.0.1:55162), migration applied with `supabase migration up --local`: file 100 96/96; full suite `Files=56, Tests=5490, PASS` (baseline 55 / 5394). A two-session proof of `SKIP LOCKED` on the same stack is in `RUN/evidence/logs/dbagent-*.log`.
- Type-check, lint, full unit, build: exits and counts for the final r2 state in `RUN/executor-report-r2.md`.

## Where to look hardest
1. **The access rules are hand mirrors.** `courseAccess` re-reads what `course_enrollment_grants_access` computes (the service role cannot execute that function); `visibleGroup` repeats the `group_assignment_groups` SELECT policy of the baseline migration; the quiz and group reviewer rules mirror `notify-pending.ts` and `submit-group.ts`; the session rule calls the shared `canViewSession` but repeats the `is_active` gate of GET `/api/sessions/[id]`. Each can drift from its original.
2. **Side table instead of columns.** The order asks for a nullable typed reference on the outbox "or equivalent". Columns would change the exact column, constraint and index lists pgTAP 099 asserts, and 099 is outside this allowlist. Check that a 1:0..1 table is acceptable as that equivalent.
3. **Outcome mapping (this unit's minimal policy, N3-04 replaces it).** Definitely revoked → `cancelled`; unusable reference or event → `failed`; failed read, `transport_error`, `not_configured`, unreadable snapshot → back to `pending` after a fixed 900 s with the code recorded; provider rejection → `failed`. There is no attempt cap and no re-check of access before a retry.
4. **The snapshot holds the recipient address.** It is frozen with subject and HTML so a retry is byte-identical under the same key; a changed profile address therefore does not reach a retry. It is encrypted and cleared at every terminal outcome.
5. **A row whose current preference is the digest** is handed over (`email_mode = 'digest'`, `pending`) rather than sent or cancelled. N5-01 must treat such a row like any digest row.
6. **Email copy.** Title and description come from the registry templates over the catalog's allowlisted fields of the stored payload, not from the bell row; the five producer-templated events get a generic notice.

## Known limitations / deferred
- Group submissions are now narrower than `submit-group.ts`'s bell recipients: a consultor whose active role row carries no `community_id` for the group's community cannot see the group under its RLS policy, so is not mailed even with an active consultant assignment to that community (admins are unaffected). A school-only group has no community consultants and its submission email is always cancelled.
- Post mentions (`pages/api/messaging/mention.ts`) need the workspace of the post as their reference; a row without it fails closed.
- `session_edit_request_approved/rejected` use the session page rule, which does not look at `session_facilitators`.
- The lease is 120 s for up to 20 rows processed in sequence; a row whose lease runs out mid-run is not sent by that run (the database refuses) and is re-claimed later.
- `enqueue_notification` is unchanged; the migration is applied only to the private `notif14isolated` stack, kept for PM review.
