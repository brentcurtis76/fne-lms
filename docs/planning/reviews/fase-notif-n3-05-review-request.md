# Review request — NOTIF N3-05 (notification email unsubscribe, dormant)

- **Branch:** `fix/notif13-render` · **Base:** HEAD `c67da226c2e243f7b8135f336ae999dc0106c3d4` (NOTIF-15, N3-04 worker failure semantics) · **Commits:** 0 by the executor (the PM commits after review)
- **Unit:** NOTIF-16, rounds r0 and r1 · ledger item N3-05 · plan `docs/planning/notifications-plan-2026-09-26.md`, Design D5
- **Authorship:** the migration and pgTAP SQL were authored by the repo's DB agent (a dedicated Claude Code subagent, under AGENTS.md) from the executor's written contracts (`RUN/evidence/db-contract-r0.md`, `db-contract-r1.md`); the executor reviewed the SQL and wrote the TypeScript, the Vitest suites and the Playwright spec.
- **Changed in r1:** r0 signed a link for a user with no preference row as "version 0", and the database inserted the row when there was still none. After the owner deleted the row, that link applied again (`RUN/evidence/logs/r1-version-zero-after-delete.log`). Now no link is signed for a missing row: the signer writes the row first, in `default` mode, and signs its version; the database function never inserts a row and refuses version 0. pgTAP 098's four pinned expectations were updated for the new column, trigger and function.

## Objective and scope (from the order)
Implement approved plan D5 / N3-05 on the dormant notification outbox: signed, purpose-scoped unsubscribe links for one user and category with a preference version; an RFC 8058 one-click POST; a GET confirmation page that makes no change; per-message `List-Unsubscribe` and `List-Unsubscribe-Post` headers; and atomic cancellation of that user's still-pending optional outbox mail in the selected category. Expose a safe per-category digest-link builder for N5-01's future digest body. The outbox flag stays off by default and the live synchronous sender keeps its current behavior.

- **In:** the twelve allowlisted paths (below; the twelfth is pgTAP 098).
- **Out:** marketing unsubscribe, a preferences UI, the digest scheduler, bounce handling, the live synchronous mail, source-reference population, cron registration, production enablement, real mail. `vercel.json`, `middleware.ts` and every `.env*` file are untouched.

## Files by risk
**High — privileged DB objects, the token and the public endpoint**
- `supabase/migrations/20260930040000_notification_unsubscribe.sql` (new, additive). A sequence (closed to PUBLIC, anon, authenticated); column `user_notification_category_prefs.pref_version bigint NOT NULL DEFAULT 1`; a SECURITY DEFINER trigger function and a BEFORE INSERT OR UPDATE trigger that set the version from the sequence on INSERT and whenever `email_mode`, `category` or `user_id` changes, and otherwise keep the old value, ignoring whatever the client sent; and `apply_notification_unsubscribe(p_user_id, p_categories, p_versions)` (SECURITY INVOKER, service_role only), which updates an existing row by compare-and-set and never inserts one; a version below 1 is an invalid argument. No table, policy, constraint or index change; RLS unchanged on both tables.
- `lib/email/notification-unsubscribe.ts` (new, server-only). Token `code.body.mac`: HMAC-SHA256 with the dedicated `NOTIFICATION_UNSUBSCRIBE_SECRET` (at least 32 characters, no fallback) over a domain string, the purpose code (`c` one category, `d` digest) and the body (user, expiry, category/version pairs). Shape and length are checked before the MAC, the MAC is compared in constant time, and the content is validated after it. 60-day expiry. A version below 1 is never signed and never verifies. `preferenceVersionForLink` returns the version to sign and writes a `default` row for a recipient who has none (`INSERT … ON CONFLICT DO NOTHING` through the service-role client). Also the header and link builders, the digest helper and the RPC call.
- `pages/api/notifications/unsubscribe.ts` (new, public). POST with the exact one-click body (urlencoded or `multipart/form-data`) → verify → one RPC. GET → 303 to the confirmation page; GET with `info=1` → verify → the link's categories as JSON, with no database client (the page's read). No session, cookie or CSRF token is read. `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. The token is never logged.
- `lib/email/notification-worker.ts` (modified). An email the recipient can switch off (a catalog event that is not mandatory) is frozen with both headers, signed for the row's user, the event's category and the `pref_version` read with the preference, or the version of the `default` row written for a recipient who has none (after the recipient lookup, so a missing address still fails as before); if no token can be signed it is not frozen and nothing is sent (`retry / unsubscribe_unavailable`). A retry sends the frozen headers. Mandatory mail carries no unsubscribe header.

**Medium — visible page**
- `pages/notificaciones/baja.tsx` (new, public, es-CL). `getServerSideProps` only sets the response headers and hands over the raw `t`. In the browser the page asks the route what the link is for (`GET ?info=1`) and renders the confirmation, or an invalid / expired / error message. Only the button sends the POST. Both requests go out with `credentials: 'omit'` and `referrerPolicy: 'no-referrer'`. The page imports nothing from `lib/email/`: `__tests__/utils/no-browser-mail-transport.test.ts` forbids that for every page, also for server-only use.

**Low — tests/docs**
- `supabase/tests/102-notification-unsubscribe.sql`, `supabase/tests/098-notification-category-prefs.sql` (tests 3, 4, 16 and 18 only), `__tests__/lib/email/notification-unsubscribe.test.ts`, `__tests__/api/notifications/unsubscribe.test.ts`, `__tests__/lib/email/notification-worker.test.ts`, `tests/e2e/notification-unsubscribe.spec.ts`, this file.

## Behaviour in one table
| Request | Database | Answer |
|---|---|---|
| POST, valid token, version still current | category `off`, version advanced, that user's rows in the category with `status = 'pending'`, no snapshot and `email_reason <> 'mandatory'` → `cancelled / unsubscribed`; one transaction | 200 `unsubscribed` |
| POST, link of an email sent to a user who had no row | the signer wrote a `default` row before signing; that row goes `off`; same cancellation | 200 `unsubscribed` |
| POST replay, category already off | nothing written | 200 `already_off` |
| POST, the preference changed after the email (another version, or the row was deleted) | nothing written, no row created | 409 `stale` |
| POST, digest token | each category by its own version, in one transaction | 200 with one outcome per category; 409 if all stale |
| POST, tampered / wrong purpose / malformed token, or one signed for version 0 | not reached | 400 |
| POST, expired token | not reached | 410 |
| POST, body other than the one-click field | not reached | 400 |
| POST, no signing secret | not reached | 503 |
| Other methods | not reached | 405 |
| GET (link, preview, reload) | not reached | 303 to the page, which only asks |
| GET `info=1` (the page's read) | not reached | 200 with the categories; 400 / 410 / 503 like the POST |
| Database error | whole call rolled back | 500, nothing named |

Never touched by an unsubscribe: another user, another category, mandatory rows, rows without a category, `sending` rows, pending rows that hold a snapshot (ambiguous), terminal rows.

## Test evidence
Exits, counts and durations of every gate on the final state are in `RUN/executor-report-r1.md`; logs in `RUN/evidence/logs/`.
- Vitest, three focused files, 299 tests.
  - Token library, 69: tampering of user, category, version, expiry and signature; wrong purpose, domain and secret; correctly signed but invalid content, version 0 included; shape; missing secret; digest links; `preferenceVersionForLink` (row written once, existing row untouched, write or read failure, unusable stored version, no write without a secret); the RPC result mapping; the synchronous sender with no secret.
  - Endpoint, 54, through the handler with a recording database stand-in: both body encodings, replay, stale, digest, every refusal before the database (a correctly signed version-0 token among them), GET and `info=1`, database failures, no token or user id in an answer or a log line.
  - Worker, 176 (162 at the base), through `runNotificationEmailWorker`: first send with a row and without one (the `default` row is written and signed), the row cannot be written, a retry after the version and the secret changed, a missing or short secret (nothing written, nothing frozen), an unusable stored version, mandatory mail, flag off.
- pgTAP on the private stack `notif16isolated` (DB 127.0.0.1:55182): 102 has 115 assertions, 098 has 69, the full suite is 58 files and 5694 assertions.
  - 102: shape and ACL; the version under the authenticated owner and real RLS (forged values on INSERT, UPDATE and upsert, DELETE then INSERT); D1–D3 with whole-row images of every kept row; the RPC never creates a row; version 0 refused; a later choice by the owner, a DELETE included; one call for four categories; rollback when the cancel fails; role × operation matrix.
  - DB agent evidence: 36 of 36 mutants of the migration caught (`dbagent-r1-mutations.log`), 10 of 10 mutants of the re-pinned 098 expectations caught, and twelve real concurrent connections give exactly one `unsubscribed` per race, all `stale` when a DELETE or a later change commits first (`dbagent-r1-race.log`).
- Playwright `tests/e2e/notification-unsubscribe.spec.ts`, 6 tests, anonymous Chromium at 1366×768 and 390×844 against the app on the private stack: GET, two reloads and script-less GETs change nothing; keyboard-only confirmation; replay; a user with no row; a stale link after the owner's later choice and after the row is deleted; tampered, expired and missing tokens; a provider-style multipart POST; a failed request and its retry. The token only ever goes to the app's origin and never as a referrer; no script error, and the only console errors are the browser's lines for the refusals each test provokes. Fixtures are deleted by id; the manifest, with the console lines, is in the evidence directory.
- Browser bundle: no file under `.next/static` holds the secret's name, the signing domain or the RPC name, checked on the final build (`final-bundle-check.log`).

## Where to look hardest
1. **The rule for a recipient with no preference row (new in r1).** The worker now writes to `user_notification_category_prefs`: a `default` row, once per user and category, before the first optional email is frozen. Check that `default` decides nothing (`lib/notifications/resolve-preference.ts` and `enqueue_notification` both treat it as no row), that the write happens after the recipient lookup and never without a signing secret, and the regression cases in 102 (the owner's DELETE after an unsubscribe and after an own INSERT: every old version is `stale` and no row comes back).
2. **The version must be impossible to forge and never reused.** The owner holds INSERT, UPDATE and DELETE on their own rows. The trigger overrides the column on every write; the sequence, not `+1`, means a deleted and re-inserted row cannot get back a version an old link was signed with. Check the trigger's three branches and that nothing else writes the column.
3. **Compare-and-set, not read-then-write.** The RPC decides by its own `UPDATE … WHERE pref_version = v AND email_mode <> 'off'`, so two concurrent calls cannot both apply and a later choice is never overwritten. Check the cancel's five filters (user, category, pending, no snapshot, not mandatory).
4. **A public, unauthenticated write.** The token is the only authorization. Check the order in the handler (method, body, shape, secret, MAC, content, expiry, then the database), that the multipart pattern accepts exactly one part, and that neither GET form can reach the database. `info=1` tells the holder of a validly signed link its categories, and anyone whether a token verifies; the POST already told the second.
5. **What the worker refuses to send, and what 098 now pins.** Optional mail without a signable link waits unfrozen; mandatory mail goes out with no header. Check that no path freezes an optional message without headers. In 098, test 16 was widened to include the SECURITY DEFINER function behind the table's trigger (its source names the sequence, not the table); check that the four expectations are exact lists and that no other assertion changed.

## Known limitations / deferred
- The worker leaves `default` rows behind for users who never chose anything. A preferences UI (N4) must not read "a row exists" as "the user made a choice". The digest sender (N5-01) must get each category's version from `preferenceVersionForLink` before `buildDigestUnsubscribeLinks`; the builder signs nothing for a version below 1.
- A retry resends the frozen headers. If the recipient changed the preference (not to `off`) between the first attempt and the retry of an ambiguous one, the link in that email is stale and answers 409.
- An enqueue racing an unsubscribe can commit a pending optional row after the cancel. The worker's send-time preference check cancels it (`preference_off`), so nothing is sent; the digest sender (N5-01) must make the same check.
- RFC 8058 carries the token in the request URL, so the platform's access log and the dev server's request log see it. Application code and `middleware.ts` log nothing of it, and the three Sentry configs cut every URL down to its origin, with tracing and replay off. The token body is readable (user id, category, version, expiry); it grants only switching that category off while the version is current.
- A logged-in browser whose account must change its password would be refused by the API gate in `middleware.ts`; the page therefore sends its requests without cookies.
- A link with an old version for a category that is already off answers `already_off` (200), not `stale`.
- HEAD is answered 405. `Retry` after a 5xx is the visitor's own click. The page needs JavaScript: without it the reader sees "Verificando el enlace…" and nothing changes.
- `NOTIFICATION_UNSUBSCRIBE_SECRET` is documented here only: no `.env*` file was edited. It must be set before N5-02 turns the outbox on; rotating it invalidates the links of mail already sent.
- The Playwright spec is not in CI's mandatory list (`scripts/ci/e2e-mandatory.mjs`, outside the allowlist) and needs the secret in the app's environment.
- The migration is applied only to the private `notif16isolated` stack, kept for PM review.
