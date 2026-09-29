# W-PC-03 sender-domain read plan — 2026-09-28

## Scope and source identity

This is the repository-only SM-B002 preparation packet for claim IDs `SWEEP-NONFUNCTIONAL-EMAIL-DELIVERABILITY-INFRA` and `SWEEP-NONFUNCTIONAL-EMAIL-FROM-CONTRACT`. Source inspected: `fix/pc03` commit `0723d1468faf97e2f1ffa052170061f87827ff9b`. That SHA identifies repository code, **not** the Production deployment. No Vercel or Resend Production read has been authorized or performed for this packet. The machine ledger currently lists W-PC-03 as `waiting`, `authorization_status: UNAUTHORIZED`, with Brent as authorization owner and no execution owner.

## Six active sender paths and call sites

| Path | Call site and send use | `EMAIL_FROM_ADDRESS` behavior when nonempty | Empty/unset fallback |
|---|---|---|---|
| `lib/emailService.js` | `pages/api/meetings/[id]/finalize.ts` calls `sendMeetingSummary`; `EmailNotificationService.sendImmediateNotification` and `.sendDigestEmail` also use its `resolveSender()` | Valid bare address becomes `Genera <address>`; valid named address is passed as supplied. Local parser rejects malformed values, including CR/LF and other control characters, before provider handoff. | `Genera <notificaciones@fne-lms.com>` |
| `lib/email/invitations.ts` | `pages/api/admin/tractor-signups/grant.ts` and `resend-invite.ts` use access-grant send functions; `lib/auth/recovery-request-queue.ts` calls `sendPasswordRecoveryEmail` for requests from `pages/api/auth/recovery-request.ts` and `pages/api/cron/recovery-outbox.ts` | Passes configured string directly to `deliverOutboundEmail`; no sender parser or control-character check at this call site | `Genera <notificaciones@nuevaeducacion.org>` |
| `lib/email/notifications.ts` | `lib/notificationService.ts` calls `sendNotificationEmail` | Passes configured string directly; no sender parser or control-character check at this call site | `Genera <notificaciones@nuevaeducacion.org>` |
| `lib/email/expenseNotifications.ts` | `lib/bots/expense-service.ts` and `pages/api/expense-reports/[id]/notify.ts` call submission/decision functions | Passes configured string directly; no sender parser or control-character check at this call site | `Genera <notificaciones@nuevaeducacion.org>` |
| `lib/pasantias/emails.ts` | `pages/api/pasantias/lead.ts` calls auto-reply and lead-notification functions through `sendSoft` | Passes configured string directly; no sender parser or control-character check at this call site | `Genera <notificaciones@nuevaeducacion.org>` |
| `pages/api/contact.ts` | Contact form API sends internal notification | Passes configured string directly; no sender parser or control-character check at this call site | `Genera <notificaciones@nuevaeducacion.org>` |

All six use a falsy check (`if (!configured)` or `|| DEFAULT_FROM`), so the empty string behaves as unset. A bare address is wrapped only by `emailService.js`; the other five pass it unchanged. A named address is accepted by `emailService.js` when it matches its local pattern; the other five pass it unchanged. For malformed nonempty values, `emailService.js` throws locally; the five direct paths pass the raw value onward. Their provider response to malformed input is **unobserved** here. The code inventory does not prove that either fallback domain is verified in Resend or is effective in Production.

## Exact proposed future reads and pre-read record

For **each** read below, Brent must first give separate dated authorization of the exact source and scope, name the executor, and accept this committed `fix/pc03` file as the pre-read authorization record. Record the authorization and its conversation/time reference here, then commit that dated update **before** the matching read. The 2026-09-28 plan approval alone is not read authorization. Brent's recorded preference is to perform guided dashboard reads himself, with no API key; a different executor or source requires its own authorization. No hosted write, email send, credential value capture, or environment edit is proposed.

1. **Vercel Production dashboard, GENERA project:** inspect only whether `EMAIL_FROM_ADDRESS` is set, empty, or unset and, if set, its display form and sender domain. Do not copy other environment variables or secrets. Record Production deployment commit SHA from Brent-supplied evidence or a separately authorized read-only Vercel deployment view; otherwise record `unknown`. Do not infer the deployed SHA from the repository.
2. **Resend dashboard, authorized sender domain:** inspect only the named domain's verification status and available SPF, DKIM, DMARC, and region observations. Mark fields the dashboard does not expose as `unknown`. Public DNS may corroborate but cannot replace Resend's status. No domain, DNS, key, webhook, or provider setting change is proposed.

### Per-read authorization and observation template (unfilled)

| Field | Vercel Production read | Resend domain read |
|---|---|---|
| Brent authorization time/reference | **PENDING** | **PENDING** |
| Exact authorized source, scope, and named executor | **PENDING** | **PENDING** |
| Brent acceptance of this committed pre-read file and commit SHA | **PENDING** | **PENDING** |
| Actual read time, executor, and dashboard page/read-only source | **NOT PERFORMED** | **NOT PERFORMED** |
| Observed result | Set/empty/unset; if set, display form and domain; deployment SHA with source or `unknown` | Domain, verification status; SPF/DKIM/DMARC/region observations or `unknown` |

The later dated evidence record `docs/reviews/w-pc-03-sender-domain-verification-*.md` must cite the authorizer, actual executor and source for each read; deployment SHA or `unknown`; configured sender or empty/unset; the sender domain of record; code contract for bare, named, malformed and control-character values; both fallback domains; Resend observations; both claim IDs above; and a verdict of verified, not verified, mismatch, unset, or insufficient evidence. It must distinguish parser rejection from an unvalidated raw value and must not claim inbox delivery or Production behavior unsupported by the identified deployment code. Do not include secrets, credentials, student data, or minor PII.

## Recorded choices and unresolved gates

Brent approved the revised plan on 2026-09-28: he chose guided dashboard checks by himself without an API key; the sender domain of record is whatever Vercel Production actually configures; a mismatch or not-verified result closes W-PC-03 as `checked: not verified` with remediation as a separate item; and Brent is the Engineering signer for the older gate unless he names another. Those choices are recorded in `reviews/workflow-v2-20260928/planning/SM-brent-approval-20260928.md` in the workflow repository. Each hosted read still requires its own authorization, executor naming, and acceptance of this committed record. The actual Production domain, deployment SHA, Resend status, and signing action remain unobserved.

The machine ledger marks `W-B3b-02` **done**, but its exit gate still requires a Resend-verified sender (PC-03) and Engineering sign-off. The separate W-PC-03 row remains **waiting/UNAUTHORIZED**. This packet records that discrepancy; it does not change either row or supply a sign-off. The release protocol (`docs/reviews/santa-marta-release-protocol-2026-08-25.md`, gate 3) also names the Resend verification check. NOTIF N5-07 may receive the later evidence path through its own PM workflow; this packet asserts no Production activation or institutional-mailbox delivery.
