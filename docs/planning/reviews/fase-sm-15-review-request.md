# SM-15 — review request (W-B10b-01)

## State

- Branch `fix/sm09-ci`, base/HEAD `12f2ba678b02f877746c9d1ea2c3af46b70553e7`.
- **Commit count: 0.** The order forbids Git mutation, so this unit is delivered as a working-tree
  change for the PM to review and commit. `docs/ledger/santa-marta.md` was already dirty before
  dispatch and is not touched here.

## Remediation r1 (PM review r0 → CHANGES_REQUIRED)

Three blocking findings from `pm-review-r0.md` are fixed here; nothing else changed, and the
four-file / no-schema boundary holds.

- **SM15-R0-1** — callers that omit `idempotency_key` now get a deterministic bounded provider key
  derived from the notification's identity (`providerIdempotencyKey`, `lib/email/notifications.ts`);
  an explicit key is still passed through verbatim. No caller was edited.
- **SM15-R0-2** — the two email outcome log lines no longer print the recipient's user id; they carry
  the delivery status only. Under Ley 21.719 a notification recipient may be a student, so their
  user id is personal data. The negative log test now asserts the user id, the address, the domain
  and the provider credential all stay out of every log line, and that the refusal status still
  reaches one.
- **SM15-R0-3** — the full-suite counts below are corrected and baseline is distinguished from final.

## Objective

Make the existing `NotificationService.createNotification` path truthfully deliver eligible immediate
email through the repository's authorized outbound-email boundary, while preserving in-app
notifications and removing reliance on three preference/digest RPCs that do not exist in the schema.

**In scope:** per-recipient preference resolution and delivery after `createNotification` is called.
**Out of scope:** event registration, recipient derivation, every API call site, migrations, RPCs,
`lib/notificationServiceEnhanced.ts` (a separate module that carries its own copy of the dead
preference/digest logic and was left untouched).

## Files, grouped by risk

**Higher risk — outbound email reaches real people**

- `lib/email/notifications.ts` *(new, 227 lines)* — builds the message and hands it to
  `authorizeUserEmail` + `deliverOutboundEmail`. Recipient address is looked up server-side from
  `profiles`; title/description are HTML-escaped; only a platform-relative path is ever linked.

**Medium risk — the shared notification path every trigger runs through**

- `lib/notificationService.ts` *(modified, +157/−211)* — `createNotification` now resolves the two real
  preference columns, runs the in-app and email channels independently, and delegates the send. The
  three calls to nonexistent RPCs (`should_send_notification`, `is_quiet_hours`, `add_to_digest_queue`),
  the `delayed_notifications` write against a nonexistent table, and the `UserPreferences` /
  `SendCheckResult` types that described schema state that was never there are removed.

**No product risk**

- `__tests__/lib/notificationService.email.test.ts` *(new, 22 tests)*
- `docs/planning/reviews/fase-sm-15-review-request.md` *(this file)*

## Test evidence

| Suite | Command | Result |
|---|---|---|
| Focused | `mise exec node@22.16.0 -- npx vitest run __tests__/lib/notificationService.email.test.ts` | 22 passed |
| Full unit — **baseline** (before this unit) | `mise exec node@22.16.0 -- npm test` | 359 files, 9363 passed, 1 skipped, 0 failed |
| Full unit — **final** (this unit applied) | `mise exec node@22.16.0 -- npm test` | 360 files, 9385 passed, 1 skipped, 0 failed — baseline plus this unit's 22 tests (9363 + 22 = 9385), no test that passed at baseline fails |
| Types | `mise exec node@22.16.0 -- npm run type-check` | exit 0 |
| Lint | `mise exec node@22.16.0 -- npm run lint` (`--max-warnings=0`) | exit 0 |
| Build | `CI=1 … npm run build` with Supabase env exported | exit 0 |
| Browser | `pm-unit ui-run SM-15 -- node RUN/ui/notification-email-journey.cjs` | 12 assertions passed, 3 screenshots |

A mutation check was run before validation: restoring the old `&& createdNotification` guard on the
email branch fails 4 of the 21 tests, so the suite bites on the defect this unit fixes.

## Scrutinize these hardest

1. **`platformPath` (lib/email/notifications.ts).** It is the only thing standing between a
   template-substituted `related_url` and a link in an e-mail that outlives the request. It accepts a
   path starting with a single `/` and rejects everything else — including `/\host`, which a browser
   treats as protocol-relative. Judge whether the rejection set is right and whether falling back to
   `/notifications` (my choice) is better than dropping the CTA entirely.
2. **Channel independence and the held in-app error.** `createNotification` now catches an in-app
   insert failure, runs the email channel anyway, and rethrows afterwards. This preserves the old
   throw contract for callers, but it means a notification can e-mail successfully while its in-app
   row failed. I believe that is the correct trade for an email-only preference; it is a behavior
   change worth a second opinion.
3. **Preference default when the row is missing or the read fails.** Both default to *enabled*, matching
   the column defaults and the existing `getCommunityRecipients` behavior. That means a read error
   makes the platform send rather than stay silent. Deliberate, and the opposite of fail-closed.
4. **The `deps` injection seam on `createNotification`.** Production passes nothing and gets the
   module-level service-role client and the real provider, mirroring `lib/email/invitations.ts`. Verify
   there is no environment switch by which a deployed build could reach the fake transport.
5. **Idempotency, including the derived fallback.** An explicit `idempotency_key` is still reused
   verbatim as the provider's `Idempotency-Key`. Most real callers supply none —
   `pages/api/assignments/collaborative-submit.ts:122-129,151-158` do not — so
   `providerIdempotencyKey` now derives `notif-<sha256>` from (user id, title, description,
   platform path). Judge the identity tuple: a notification whose description embeds a timestamp or a
   counter gets a new key on a retry, and two genuinely distinct notifications that agree on all four
   fields share one. Also confirm the explicit path is still byte-for-byte unchanged —
   `generateIdempotencyKey` truncates to the minute, so a retry more than a minute later still
   produces a new key and a second message for callers that do supply one.

## Finding for the PM (no scope change made)

`scripts/ci/check-browser-boundaries.mjs` treats a **type-only** import as a real edge. Because
`pages/admin/qa/assignments.tsx:35` does `import type { QAScenarioAssignment } from
'@/pages/api/qa/assignments'`, that entire API route — and everything it imports, including
`lib/notificationService.ts` — is inside the scanner's browser-reachable closure. The first version of
this unit mirrored authorized mail into the local E2E outbox exactly as `lib/email/invitations.ts`
does, and `__tests__/security/browser-boundary.test.ts` failed with
`BROWSER_IMPORTS_SERVER_MODULE` for `lib/email/notifications.ts` → `lib/email/outbox`. The scanner is
outside this unit's write allowlist, so the import was dropped rather than the scanner fixed. The
consequence is that notification mail cannot be observed by an e2e spec through the outbox. Fixing the
scanner to skip `importClause.isTypeOnly` edges, then re-adding the mirror, is a separate unit.

## Known limitations / deferred

- `lib/notificationServiceEnhanced.ts` still calls the same three nonexistent RPCs and still writes to
  `delayed_notifications`. It is outside the write allowlist and was left alone; it deserves its own unit.
- Quiet hours, do-not-disturb and daily/weekly digests are **gone**, not reimplemented. No schema ever
  backed them. Any future version needs columns and a migration first.
- The subject line is the notification title verbatim (whitespace-collapsed). No per-category subject
  prefixes were invented.
- Nothing was committed and nothing was pushed.
