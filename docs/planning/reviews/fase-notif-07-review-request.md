# NOTIF-07 review request — N2-01 occurrence identity and private audit (r1)

- **Branch:** `fix/notif02-redo`. **Base:** HEAD `90242eb8765fc9813228ff85fd32d54140323f0f` (merge-base with `main` `49814091`, 241 commits ahead). This unit adds 0 commits; the PM commits after review.
- **Order:** `runs/NOTIF-07/order-r1.md` (remediation round 1 of `order-r0.md`), ledger item N2-01, plan NOTIF revision 1 (D3). r1 addresses PM review r0 findings N07-R0-F1..F4.

## Objective and scope
Replace the minute-bucket 32-bit notification key with a stable identity made of event type, the actual occurrence id and the recipient. The in-app unique key and the synchronous provider request share it. Stop sending the full `eventData` into the notification audit.

- **In scope:** the key, occurrence extraction (catalog), a safe rule for payloads without an identity, the deadline producer's identity, the bounded audit, tests and two browser journeys.
- **Out of scope:** schema or migrations, the outbox and its worker, preference changes, unrelated template or payload fixes, other N2-02 producer behaviour, a real provider send, and release.

## Design
- `resolveOccurrence(event, data)` returns `record:<catalog occurrenceId>` when the payload carries a valid identity, else `unidentified:<random UUID>`, drawn once per `triggerNotification` call and shared by that call's DB triggers.
- `generateIdempotencyKey(event, occurrence, recipient)` = `notif-` + SHA-256 of `JSON.stringify([event, occurrence, recipient])` (70 chars, no clock, no readable id).
- **Safe rule** for a missing, malformed or entity-only identity: every call is delivered, none is merged, no idempotency is claimed.
- Catalog occurrence parts must be non-blank strings or finite numbers; UUIDs are lowercased; parts are URL-encoded before joining with `:`.
- **Null (unidentified) entries:** `course_assigned`, `learning_path_assigned`, `assignment_feedback`, `session_edit_request_{submitted,approved,rejected}` (entity-only payloads) and, new in r1, `session_rescheduled` (see scrutiny 2).
- **Deadline reminders (r1):** `lib/licitacionDeadlineChecker.ts` adds `deadline_date` (the persisted date that matched) and `reminder: 'today' | '1d'` to every deadline event. The 7 `licitacion_*_deadline*` catalog entries key on `(licitacion_id, deadline_date, reminder)`. A page-load rerun of one phase is a retry; the day-before and day-of `licitacion_evaluacion_deadline_1d` and a moved deadline are separate occurrences.
- A keyed in-app row skips the 60-second title/description check; the unique key alone deduplicates it. Unkeyed direct `createNotification` callers keep the check.
- `log_notification_event` receives `p_event_data = { occurrence: 'identified'|'unidentified', occurrence_ref: 'occ-<sha256(event, occurrence)>'|null }` on success and failure paths.

## Files by risk
- **High:** `lib/notificationService.ts` (key, occurrence, title-check scoping, audit).
- **Medium:** `lib/notifications/catalog.ts` (parser, null entries, deadline identity); `lib/licitacionDeadlineChecker.ts` (two payload fields, header comment); `lib/email/notifications.ts` (one comment line).
- **Tests:**
  - `__tests__/lib/notificationService.occurrence.test.ts` (new, 30): real `triggerNotification`, fake client enforcing the unique key; r1 adds deadline phase/moved-date and duration-only/move-back reschedule cases.
  - `__tests__/lib/licitacionDeadlineChecker.test.ts` (new, 8): the real checker's payloads keyed with the real catalog and key function; day-before/day-of, reruns, moved date, all estados, no-date, read failure, trigger exception.
  - `__tests__/lib/notifications/catalog.test.ts` (142): encoded expectation, entity-only nulls, deadline identity and negatives, reschedule null.
  - `__tests__/lib/notificationService.email.test.ts` (64): 2 retry tests answer the retry with the real 23505 conflict.
  - `__tests__/api/feedback/notify-admins.test.ts` (41, r1): the "repeat" case now meets the real unique-key conflict and asserts no title-check query; the two title-check fault rows (unreachable for triggered rows) are retargeted to the keyed insert returning/throwing.
  - `tests/e2e/notification-occurrence-idempotency.spec.ts` (new, 3) and `tests/e2e/notification-preference-compat.spec.ts` (r1: exact audit ownership).

## Test evidence
- **Focused** (5 files): 285 passed, 0 failed. r1 baseline on the r0 state: 270 passed, 3 failed (notify-admins).
- **Mutations:** r0's 7 plus r1's 7 are caught (`runs/NOTIF-07/evidence/mutations.log`, `evidence/r1/mutations.log`): deadline keyed by id only; deadline without phase; producer without phase or date; reschedule keyed on (id, date, time) or with end time; the title check kept for keyed rows (notify-admins).
- **Browser:** both specs under `pm-unit ui-run` against the isolated stack (55051/55052), 6/6. The bell shows exactly 2 items for the two same-text occurrences plus retry at 1366×768 and 390×844, captured keys `[first, second, first]`; the preference journey still shows its 4 items. Each spec deleted exactly its own audit rows (3 and 4), rows, prefs, role, profile and account, with every remaining count 0.
- **Full gates** (type-check, lint, `npm test`, build, `test:db`, guard): exact commands, exit codes and counts are in `runs/NOTIF-07/executor-report-r1.md` and `evidence/r1/final-*.log`.

## Scrutinize hardest
1. **Deadline identity relies on the checker's payload.** Any other producer of a deadline event without `deadline_date`/`reminder` falls back to unidentified, which delivers on every call. Today the checker is the only producer; its test covers every estado and both phases.
2. **`session_rescheduled` is unidentified.** Without a durable transition id, a later move back to an earlier schedule (A→B→A→B) cannot be told apart from a retry, so every reschedule is delivered, including a duration-only change. The cost: a retried reschedule request gives a second bell row and email. Restoring retry dedup needs a transition id from the producer.
3. **The audit ownership in the specs recomputes the service's `occ-` ref formula.** It is exact (Playwright runs the two files in parallel workers, so a type-only before/after diff was not), but it duplicates one line of the implementation.
4. **The unidentified rule gives up retry dedup** for the null events; a double-submitted form gives two bell rows.
5. **The audit reference is an unkeyed SHA-256 of ids.** Someone who already knows candidate record ids could confirm a match (PM advisory for N3-01/N3-03 outbox audit design).

## Known limitations and deferred items
- Per-occurrence ids (assignment row, feedback version, edit-request id, reschedule transition) would restore retry dedup for the null events; that is a producer change (N2-02 or later).
- A retry absorbed by the unique key still counts in `notificationsCreated` and the audit's `notifications_created` (existing semantics).
- Both specs write `fixtures.json` into one `UI_EVIDENCE_DIR`; the occurrence spec's manifest is also appended to `RUN/db-notif07/fixture-manifest.json`.
- Synthetic fixtures only (`*@qa.local.test`); the isolated stack is stopped with `--no-backup` after the gates. No schema change, outbox or live provider was involved.
