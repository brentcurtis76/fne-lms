# NOTIF N3-02 (unit NOTIF-13) — review request

## Identity

- Branch `fix/notif13-render`, base `ea265ceae3c3763de886ee9abd0a834499e35f95` (NOTIF-12 ledger commit).
- Commit count on top of the base at hand-over: 0. The executor does not commit; the change is the working-tree
  diff against the base (8 product/test files plus this file). The PM commits on acceptance.

- Round r1 (remediation 1) corrects the three blocking findings of the r0 review; see "Round r1 corrections".

## Objective and scope (from the itinerary / order r0)

Create a shared `lib/email/render.ts` and use it for the existing notification and invitation/recovery HTML.
Centralize `EMAIL_FROM_ADDRESS` resolution so meeting-summary, notification, invitation/recovery and expense mail
accept one documented format, one safe default and one invalid-value behavior. Preserve public function
contracts, es-CL copy, links, authorization, QA suppression, provider result semantics and the flag-off
synchronous notification path.

- In scope: renderer extraction, sender extraction, tests in the two allowlisted test files.
- Out of scope: the worker (N3-03), producer cutover, new outbox writes, digest, unsubscribe, schema or
  migration, real provider operation, preference or access redesign, UI page changes.

## What changed, grouped by risk

**Higher — every outbound message passes through it**

- `lib/email/provider.ts`: the sender contract now lives here. `deliverOutboundEmail` accepts a message without
  `from` and resolves it from `EMAIL_FROM_ADDRESS`: `Name <address>` verbatim, a bare address as
  `Genera <address>`, unset or empty as `Genera <notificaciones@nuevaeducacion.org>`. Any other value, or any
  value with a control character, returns `{ status: 'not_configured', detail: 'invalid_sender' }` before the
  API-key check and before the transport. A `from` passed by the caller goes through the same rule (r1).
  `resolveSender` is exported so a consumer can check the configured sender before it does anything else.

**Medium — rendered HTML of live mail**

- `lib/email/render.ts` (new): the one shell (header, body paragraphs, button, visible fallback URL, closing
  line). It escapes every value itself.
- `lib/email/notifications.ts`: `buildNotificationEmail` renders through the shell; no `from` of its own.
  `sendNotificationEmail` returns `not_configured` + `invalid_sender` before its first database read when the
  configured sender is invalid (r1).
- `lib/email/invitations.ts`: the three senders render through the shell; the greeting rule ("Hola Hola,")
  stays here; `escapeHtml` is re-exported from `lib/utils/html-escape` instead of being a second copy. The
  E2E outbox mirror is written only for authorized mail whose configured sender is valid (r1).

**Lower**

- `lib/emailService.js`: its own sender parser and default are removed; it omits `from`.
- `lib/email/expenseNotifications.ts`: omits `from`; an invalid sender is reported as a failure
  (`error: 'invalid_sender'`), not as the "skipped, no API key" case.
- `__tests__/lib/emailService.sender.test.ts`, `__tests__/lib/email/invitations.test.ts`: extended.

## Observable changes (deliberate)

1. **Meeting-summary default sender.** With `EMAIL_FROM_ADDRESS` unset it was
   `Genera <notificaciones@fne-lms.com>` and is now `Genera <notificaciones@nuevaeducacion.org>`, the default the
   other four senders (and the contact and pasantías senders) already used. Deployments that set the variable are
   unaffected.
2. **Meeting summary with a malformed sender.** The per-recipient error was the thrown text
   `EMAIL_FROM_ADDRESS is not a valid sender` plus a `console.error` carrying the address; it is now the delivery
   status `not_configured`, like every other non-accepted outcome of that function, and nothing is logged.
3. **Notification, invitation/recovery and expense mail with a malformed or bare sender.** Before, the raw
   value went to the provider (a bare address without display name; a malformed or CR/LF value as-is). Now a bare
   address gets the Genera display name and a malformed value is never sent: `not_configured` +
   `invalid_sender`. For invitations that maps to the existing es-CL toast "el servicio de correo no está
   configurado. Avisa al equipo técnico."
4. **Notification e-mail markup.** The closing paragraph's top margin is 20px (was 24px) and its two sentences
   are one text node. Text, button, link and fallback are unchanged. Invitation markup is unchanged apart from
   whitespace.
5. **Contact and pasantías mail (r1).** Both pass `EMAIL_FROM_ADDRESS || default` as `from`, which used to go to
   the provider untouched. Now a bare value is sent as `Genera <address>` and a malformed or CR/LF value is not
   sent. Contact logs `status: 'not_configured'` and still answers the visitor with success, as for any mail
   failure. Pasantías returns `failure: 'not_configured'` with its existing text "RESEND_API_KEY no
   configurado", which is inaccurate for this cause; both files are outside the allowlist and unchanged.
6. **Notification with an invalid sender (r1).** The result is `not_configured` + `invalid_sender` for every
   recipient, including one whose mail would otherwise be `suppressed_qa`, `refused`, `missing_recipient` or
   `recipient_lookup_failed`: the recipient is no longer read, so those cannot be told apart. With a valid
   sender all four results are unchanged.

## Round r1 corrections

| Finding | Fix | Test |
|---|---|---|
| N13-R0-01 invalid invitation mirrored | `send` in `invitations.ts` mirrors only when `resolveSender()` is not null | `invitations.test.ts`: "an authorized call with a malformed sender (CRLF / doubled brackets): no transport call and no outbox mirror" (three real senders, mirror active); "without an API key (local test mode) an authorized message is still mirrored once" |
| N13-R0-02 recipient read before sender check | `sendNotificationEmail` checks the sender first | `emailService.sender.test.ts`: "<case> reports not_configured without a recipient read or a transport call" (9 values, `client.from` spy) |
| N13-R0-03 explicit `from` bypass | `deliverOutboundEmail` calls `resolveSender(message.from)` | `emailService.sender.test.ts`: "an explicit from obeys the same sender contract" (named, bare, empty, 9 malformed, and the real pasantías auto-reply with a bare and a CRLF value) |

The PM probe `runs/NOTIF-13/evidence/pm-negative.ts` now prints `mirrored: 0, delivered: 0, reads: 0` and a
returned notification result instead of a throw.

## Test evidence

- Focused (5 files), r1 final state: 186 passed, 0 failed (r0 169, untouched baseline 130). Full unit suite, r1
  final state: 379 files, 10413 passed, 1 skipped. The r0 figures below are kept for the r0 cases.
- Focused at r0: 169 passed. New cases: sender matrix named / bare / unset / empty
  and nine malformed values incl. CR, LF, CRLF for meeting summary, expense and notification
  (`emailService.sender.test.ts`, 48 tests) and for the three invitation senders; recovery rendering; shared
  shell equality between invitation and notification; QA / refused authorization leaves no transport call and no
  outbox mirror; an authorized call sends and mirrors exactly one message (`invitations.test.ts`, 43 tests).
- Full unit suite at r0: 379 files, 10396 passed, 1 skipped (baseline 10357 passed, 1 skipped).
- Type-check, zero-warning lint, `guard:browser`, build (with the synthetic public Supabase env; the bare build
  fails at baseline on missing env) and `git diff --check`: pass.
- Browser: `runs/NOTIF-13/ui/mail-render-journey.cjs` through `pm-unit ui-run`. It runs the real entry points
  in-process with a capture transport (no provider, no database), renders each captured body at 1366x768 and
  390x844, clicks each button against the local app, and asserts that QA, refused and malformed-sender cases
  leave no captured mail. In r1 it adds an authorized invitation with a CRLF sender while the outbox mirror is
  active (no mirror line) and a notification with a malformed sender on a client that counts reads (none).
  Exact commands, exit codes and the evidence directory are in `runs/NOTIF-13/executor-report-r1.md`.

## Where to look hardest

1. **`not_configured` for an invalid sender.** I reused an existing status with a `detail` instead of adding a
   new one, to avoid widening four status unions, the es-CL message table and anything that stores the status.
   Check every consumer of `not_configured`: `lib/auth/recovery-request-queue.ts` treats it as it treats a
   missing API key, and `lib/pasantias/emails.ts` reports it as "RESEND_API_KEY no configurado" (since r1 it
   can reach this branch through its explicit `from`).
2. **Explicit `from` (r1).** `pages/api/contact.ts` and `lib/pasantias/emails.ts` still build
   `process.env.EMAIL_FROM_ADDRESS || default` themselves; the provider now validates and normalizes that value.
   An explicit value wins over the environment; an empty one falls back to it.
3. **Sender check ordering.** In the provider, QA suppression and refusal are decided before the sender is
   resolved, and the sender check comes before the API-key check. The notification sender is the exception since
   r1: it checks the sender before it reads the recipient, so an invalid sender masks QA/refusal there
   (observable change 6).
4. **Invitation mirror (r1).** `captureOutboundEmail` runs for an authorized invitation only when the configured
   sender is valid. The missing-API-key case, which the e2e relies on, still mirrors. The sender is resolved
   twice per invitation (once for the mirror, once in the provider), from the same environment value.
5. **Paragraph spacing in `renderEmail`.** The last body paragraph gets 20px and earlier ones 16px, which
   reproduces both previous layouts. Compare the screenshots if pixel parity of the notification mail matters.

## Known limitations and deferred items

- No real provider send and no seeded admin login: the mail journey is in-process with synthetic data.
- Contact and pasantías still build their own `from`; only the provider-side rule applies to them. The
  pasantías wording for an invalid sender and the invitation toast ("el servicio de correo no está
  configurado") are copy items for a later unit (PM advisory N13-R0-A01).
- `buildExpense*Message` HTML is a different template and does not use the shared shell; the order names only
  notification and invitation/recovery HTML.
- The worker and any outbox-driven delivery belong to N3-03.
