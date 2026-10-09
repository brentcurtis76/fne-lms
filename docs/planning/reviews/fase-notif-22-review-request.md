# NOTIF-22 (N5-01) — review request: dormant daily notification digest

- **Branch:** `fix/notif22-main` · **base/HEAD:** `1e19b849674294475a9cf42410c29b5afc5b1d7e` (fetched `origin/main`, 0 commits above
  main) · **N5-01 commits:** 0 (uncommitted working tree; the PM commits on acceptance). The tree also holds the PM's own ledger
  edit (`docs/ledger/notifications.md`), not part of this unit. Same-unit rebuild r7: the change reviewed and accepted as historical
  commit `d7f57ea41` (on `fix/notif19-prefs-api`) was re-applied after checking that every pre-existing allowlisted file except
  `PROJECT_STATE.md` is byte-identical between that commit's parent `9e5fe1feb` and this HEAD, that the six new files are absent
  on main, and that every module the digest code imports is unchanged. The historical commit and its closure do not approve this
  tree. Status: **local rebuild, review pending** (PM independent review and PM CUA not yet done).
- **Objective (ledger N5-01, orders r0–r7):** replace the obsolete `email_digest_queue` stub with an authenticated, flag-dormant
  daily digest of `notification_email_outbox` rows: service-only `notification_digest_runs` keyed by user and America/Santiago civil
  date, immutable membership, exclusive renewable leases, a stable provider key, an encrypted rendered snapshot frozen before
  delivery, and due-date catch-up across skipped hours and DST. With `NOTIFICATION_OUTBOX_DELIVERY` unset or off the route creates
  no client, claims nothing and sends nothing; existing synchronous behaviour is unchanged.
- **In scope:** the migration and its pgTAP file, the digest consumer, the cron route, the keyed provider path's 429/5xx
  `Retry-After` handling, the mirror's optional headers (`lib/email/outbox.ts`), their unit tests, this file and `PROJECT_STATE.md`.
- **Out of scope:** N5-02 (producer dispatch, Vercel cron registration, cutover), reminder crons, meeting summary, sync retirement,
  preferences UI/API redesign, a per-user digest hour, production flags, edits to older migrations/tests, the routed N22-F1/F2/F3
  findings, broader refactors, release.

## What changed
| Risk | File | Change |
|---|---|---|
| High (schema/RLS) | `supabase/migrations/20261008000000_notification_digest_runs.sql` | Additive: `notification_digest_runs` + `notification_digest_run_members`, RLS enabled, no policies (service role only); guard triggers (identity and provider key derived from user/date and immutable, status transitions, terminal runs frozen, a member in one run only); fixed-search-path RPCs for due date (09:00 Santiago), open, claim (recovery mail first), renew, state, members, cancel member, begin attempt (freeze), finish, settle ambiguous; a 90-day purge RPC for terminal runs (not scheduled). Byte-identical to the DB-reviewed file (sha256 `848989d3…bb0b`). |
| High (delivery) | `lib/email/notification-digest.ts` | The consumer: per run, re-checks access and current preference of every member before rendering, cancels refused ones, renders es-CL HTML (allowlisted fields, escaped, absolute same-origin links, settings link, one unsubscribe link per category, RFC 8058 header link), freezes the sealed snapshot with the exact member set and address digest, then sends through `authorizeUserEmail` → `deliverOutboundEmail` under the run's key after an owner guard (renew + state read). Retries resend the frozen bytes only; ambiguity, revocation, address change or suppression settle truthfully; 24 h → `unknown`. |
| Medium (provider) | `lib/email/provider.ts` | Keyed sends classify 429/5xx as ambiguous and pass a validated `Retry-After` (delay-seconds or a real IMF-fixdate, clamped to a day); impossible dates/times are ignored. Unkeyed SDK path, sender rules and 409/4xx classification unchanged. |
| Medium (entry point) | `pages/api/cron/email-digest.ts` | GET/POST only (405), `authorizeCronRequest` (401 in every environment), flag off/unset → 200 `{ok:true, enabled:false}` with no DB client, errors generic es-CL with nothing logged that names a recipient. Not scheduled. |
| Low (test transport) | `lib/email/outbox.ts` | The mirror records the message's own headers when given (the digest's RFC 8058 pair). |
| Tests | `__tests__/lib/email/notification-digest.test.ts`, `__tests__/api/cron/email-digest.test.ts`, `__tests__/lib/email/provider.retry.test.ts`, `__tests__/lib/email/outbox.test.ts`, `supabase/tests/105-notification-digest-runs.sql` (sha256 `cc53b9ee…e0ff`) | Unit and pgTAP coverage of D1–D5. |

## Evidence (rebuilt tree on main `1e19b8496`; runner `pm-resources run NOTIF-22 -- mise exec node@22.16.0 --`)
- Focused: `npx vitest run __tests__/lib/email/notification-digest.test.ts __tests__/api/cron/email-digest.test.ts __tests__/lib/email/provider.retry.test.ts __tests__/lib/email/outbox.test.ts` → 4 files, 233 passed. PM counterexample suites r3/r4/r5 → 3/1/6 passed.
- `npm test` → 521 files, 13133 passed, 12 skipped (untouched main: 518 files, 12907 passed, 12 skipped); `npm run type-check` and zero-warning `npm run lint` pass; migration guard OK (86 files).
- Full pgTAP on the private stack (main's four newer migrations applied to it first): `supabase test db --db-url "postgresql://postgres:postgres@127.0.0.1:55622/postgres?sslmode=disable"` → 73 files, 7544 tests, PASS (untouched main: 72 files, 7342).
- Build: `npm run build` of a source-manifested copy (main's tracked files + the 12 candidate files, no env files) with synthetic local configuration only → exit 0.
- Generated mail (parent D6), actual private app on `:3107` with the digest flag on, synthetic secrets, a preloaded network guard (non-loopback sockets refused and logged; the provider URL rewritten to a local stub that never forwards): `pm-unit ui-run NOTIF-22 --paths-file commit-paths.txt -- node RUN/ui/digest-journey.cjs` → 24 assertions PASS. Cron 405/401 guards; cron #1 `opened 3, claimed 3, sent 1, cancelled 2, membersCancelled 2`; one mirror capture and one keyed stub POST with identical bytes; subject `Tu resumen diario de Genera: 3 notificaciones`; `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`; escaped course name; suppressed and blocked cohorts cancelled with no capture; immediate and after-09:00 rows untouched; cron #2 all zero; 0 blocked outbound connects. Chromium 1366×768 and 390×844: keyboard order over all 7 links, settings link → sign-in → own settings, the Sistema link changes only Sistema, tampered link refused, replay changes nothing else, one-click POST turns off every digest category. Exact-id cleanup to zero.
- Repo suites on the same build (CI-like config): `pm-unit ui-run NOTIF-22 --paths-file commit-paths.txt -- npx playwright test tests/e2e/notification-unsubscribe.spec.ts tests/e2e/notification-settings.spec.ts tests/e2e/notification-preferences-api.spec.ts tests/e2e/notification-mail-mirror.spec.ts` → 15 passed.
- Run directories, hashes, fixture ids and logs: `runs/NOTIF-22/executor-report-r7.md`.

## Scrutinize hardest
1. **The rebuild claim itself.** Verify that the 10 code/test/SQL files equal `d7f57ea41`'s blobs and that nothing they import or call drifted on main (`git diff 9e5fe1feb 1e19b8496 -- lib/email lib/notifications lib/api-auth.ts lib/zoom/cron-auth.ts lib/utils`).
2. **Migration ordering on main.** `20261008000000` now sorts before main's `20261008120000` and `20261009120000`. A from-scratch apply (CI) is unaffected and the objects do not overlap, but a target that already applied those later versions needs an out-of-order apply; that is a release-time decision, not changed here.
3. **Provider/lease atomicity.** The owner guard renews and re-reads right before the provider call, but the window up to the provider's answer cannot be closed by the database; the stable provider key keeps a repeat idempotent.
4. **The migration's guards and RPCs** (transitions, membership uniqueness, freeze and settle with a live token, purge): the largest SQL surface; pgTAP 105 is the evidence.
5. **Fail-closed member checks before freeze and allowlisted rendering** — a failed read cancels nothing and sends nothing; a retry never re-renders.

## Known limitations / deferred
- Dormant: no schedule, no producer writes digest rows yet (N5-02); no per-user digest hour (fixed 09:00 Santiago); 90-day purge unscheduled.
- Routed, pre-existing, outside this unit: N22-F1 QA `due_date` rendered one day early (`lib/notificationEvents.ts`); N22-F2 `system_update` allowlist vs template keys (generic text); N22-F3 mobile MainLayout sidebar partly covering settings content.
- Browser evidence uses the mirror page served by a local stub, not a mail client; mailbox rendering and older-browser/assistive coverage are not claimed.
- No deployment, enablement or completion is claimed; PM review and PM CUA are pending.
