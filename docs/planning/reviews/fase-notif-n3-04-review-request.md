# Review request — NOTIF N3-04 (notification email worker failure semantics, dormant)

- **Branch:** `fix/notif13-render` · **Base:** HEAD `180c953a86c1f94abc6704fd67de85e5e70e3a0d` (NOTIF-14, N3-03 worker core) · **Commits:** 0 by the executor (the PM commits after review)
- **Unit:** NOTIF-15 r0, remediated in r1 (review finding N15-R0-01) · ledger item N3-04 · plan `docs/planning/notifications-plan-2026-09-26.md`, Design D4
- **Authorship:** the migration and pgTAP SQL were authored by the repo's DB agent (a dedicated Claude Code subagent, under AGENTS.md) from the executor's written contract (`RUN/evidence/db-contract-r0.md`); the executor reviewed the SQL and wrote the TypeScript and the Vitest suites.

## Objective and scope (from the order)
Complete approved N3-04 on the dormant notification worker: classify definite and ambiguous provider outcomes; keep one frozen snapshot and idempotency key; recheck eligibility before ambiguous retries; terminate 409 and 24-hour ambiguity; apply bounded backoff/throttle with password-recovery outbox priority; clear terminal snapshots; and purge terminal rows after 90 days. The route remains unscheduled and `NOTIFICATION_OUTBOX_DELIVERY` defaults off until N5-02.

- **In:** the eight allowlisted paths (below).
- **Out:** unsubscribe, bounce suppression, digest run, enqueue/cutover, cron registration, source-reference population, any UI or real send. `vercel.json` is untouched: nothing schedules either route.

## Files by risk
**High — privileged DB objects and the send decision**
- `supabase/migrations/20260930030000_notification_email_failure_semantics.sql` (new, additive; no table, column, constraint or index change). Four new functions, EXECUTE for service_role only: `password_recovery_email_due()` (SECURITY DEFINER, returns only a boolean: recovery mail queued or in flight and due), `notification_email_retry_state(id, owner)` (live owner: attempt count and whether 24 hours have passed since the first attempt), `settle_ambiguous_notification_email(id, owner, outcome, code)` (live owner, frozen row: `cancelled_after_ambiguous`, or `unknown` only after 24 hours; clears snapshot and lease), `purge_notification_email_outbox(limit)` (bounded delete, oldest created first, of terminal rows completed more than 90 days ago). Two N3-03 functions replaced with the same signature: `claim_notification_emails` returns nothing while recovery mail is due; `begin_notification_email_attempt` starts no attempt 24 hours after the first. `finish_notification_email` is unchanged.
- `lib/email/notification-worker.ts` (modified). Eligibility is re-read before every ambiguous retry; ambiguous rows end as `cancelled_after_ambiguous` or `unknown`; 409 → `failed / provider_conflict`; jittered exponential backoff; recovery check before each send; a run that stops sending hands its rows back.
- `lib/email/provider.ts` (modified, shared by every sender). The keyed transport reports the HTTP status of a refusal. For a send with an idempotency key only, `deliverOutboundEmail` marks a 409 (`conflict: true` on `provider_rejected`) and answers `transport_error` for a 429/5xx reported as an error value. A send without a key never has its status read: any error value is `provider_rejected` with no conflict mark, as before this unit. New `isDeliveryConfigured`.

**Medium — entry point**
- `pages/api/cron/notification-email-retention.ts` (new). Method → `authorizeCronRequest` → flag → one purge call. With the flag off it answers before a database client exists.

**Low — tests/docs**
- `supabase/tests/101-notification-email-failure-semantics.sql`, `__tests__/lib/email/notification-worker.test.ts`, `__tests__/api/cron/notification-email-retention.test.ts`, this file.

## Behaviour in one table
| Situation | Row afterwards | Provider call |
|---|---|---|
| Accepted | `sent`, snapshot cleared | 1 |
| Refused (4xx, or an error without a status) | `failed / provider_rejected` | 1 |
| 409 | `failed / provider_conflict`, on the first response, same key | 1 |
| 429, 5xx, call threw | `pending / transport_error`, snapshot and key kept, next attempt in 60–120 s doubling to at most 1 h; the run sends nothing more | 1 |
| No provider key | `pending / not_configured` (900 s), nothing frozen, no attempt counted | 0 |
| Retry, recipient no longer eligible (access, role, preference off or digest, QA tenant, refused school) | `cancelled_after_ambiguous` + the reason | 0 |
| Retry, a read failed | `pending` (900 s), same snapshot | 0 |
| Retry, 24 h after the first attempt | `unknown / ambiguous_timeout` | 0 |
| Recovery mail due at claim | nothing claimed | 0 |
| Recovery mail due, or unreadable, before a send | this row and the rest of the batch `pending` (60 s) with `recovery_priority` / `priority_unavailable` | 0 |
| Terminal row completed more than 90 days ago | deleted with its source reference by the retention route | — |

## Test evidence
Exits and durations of every gate on the final state are in `RUN/executor-report-r1.md`; logs in `RUN/evidence/logs/`.
- Worker Vitest (`notification-worker.test.ts`): 162 tests (108 at the base), the N3-03 tests plus four `N3-04 D1–D4` blocks, through `runNotificationEmailWorker`. D1 runs the real keyed transport over a stubbed `fetch` with HTTP 200/403/409/422/429/500/503 and a thrown call. Three cases call `deliverOutboundEmail` without a key and a transport that reports 429, 500 or 409 as an error value: each is exactly `provider_rejected`, no conflict mark. The database is an in-memory stand-in whose RPCs follow what pgTAP 100 and 101 prove. Fifteen mutations of the worker and provider, and three of the keyed-only status rule, were each caught (`r1-mutation-worker.log`, `r1-mutation-provider.log`). Three N3-03 tests changed with the rule they pin: the retry now re-reads the source record, and an ambiguous retry waits a backoff instead of 900 s.
- Retention route Vitest (new, 16 tests): 401, 405, flag unset/off/false/empty, flag on (both cron schemes), purge error / no count / throw, client creation failure.
- pgTAP 101 on the private stack `notif15isolated` (DB 127.0.0.1:55172): function shape and ACL, role × operation matrix, state transitions, lease and snapshot identity, the 24-hour boundary, recovery priority at the claim, retention boundary. 89 assertions; full suite `Files=57, Tests=5579, PASS` (base 56 / 5490); pgTAP 099 and 100 pass unchanged. The DB agent removed or altered each guard in 31 variants: 30 were caught; the one that was not is the purge's `created_at` predicate, an index aid that changes no result (`dbagent-mutations.log`). The worker's RPC names, arguments and return shapes were also called through PostgREST on that stack (`rpc-shape-smoke.log`).

## Where to look hardest
1. **Recovery priority can starve notifications.** The claim returns nothing while any recovery row is queued or in flight and due. If the recovery cron stops, its rows stay due and no notification email leaves until they are handled or run out of attempts. That is the ordered fail-closed rule; N5-02 should alert on it.
2. **"Ambiguous" is "a snapshot is frozen".** The snapshot is frozen immediately before the provider call and cleared at every terminal outcome, so its presence is the only marker that a send may have happened (no column could be added: pgTAP 099 pins the table). A run that lost its lease between freeze and send also counts as ambiguous. Check that nothing freezes a snapshot without intending to send.
3. **Two N3-03 functions were replaced, not versioned.** The claim shape and `finish` rejecting `unknown` are pinned by pgTAP 100, and the cron route test pins the claim/finish call sequence, so N3-04 adds `retry_state` and `settle` around them. Check the replaced claim and begin keep every N3-03 guarantee (pgTAP 100 passes unchanged).
4. **`provider.ts` is shared; the status rule is keyed-only.** Senders without an idempotency key (the SDK path: contact, pasantías, expense and invitation mail) keep the earlier result for every error value. Two live senders do pass a key: the synchronous notification mail (`lib/email/notifications.ts`) and password-recovery mail. Over the real keyed transport their `status` is what it was (429/5xx already threw → `transport_error`; any other refusal → `provider_rejected`); the one addition is `conflict: true` on a 409, which neither reads or passes on. Check that no keyed caller other than the worker acts on it.
5. **Mapping choices.** A 409 is `failed`, also after an earlier ambiguous attempt. A preference moved to the digest after an ambiguous attempt is `cancelled_after_ambiguous / preference_digest` (it cannot be handed to the digest: it may already have gone out). Released rows wait 60 s and keep their attempt count.

## Known limitations / deferred
- The 24 hours count from the first attempt (`first_attempt_at`). A row is closed as `unknown` when it is next claimed after that, so up to one backoff later.
- A 429's `Retry-After` header is not read; the backoff is the worker's own.
- A row whose lease runs out mid-run stays `sending` until the lease expires, as in N3-03.
- The purge needs `completed_at`; every terminal status sets it. Rows that never reach a terminal status are not purged.
- Both cron routes are unscheduled and the flag is off; the migration is applied only to the private `notif15isolated` stack, kept for PM review.
