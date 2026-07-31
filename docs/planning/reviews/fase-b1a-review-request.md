# Fase B1a — review request

**Branch:** `phase/b1a-expmail`
**Base:** `origin/main` @ `3cb3327`
**Commits:** 2 — one code commit + this docs commit (see below)
**Executor round:** 1

---

## Objective and scope (copied from PLAN.md v4 §Phase B1a)

> **Scope:** server routes (or extensions of existing authenticated expense mutations) for the three notification moments (submitted/approved/rejected) with **recipients derived server-side** from the report record; `utils/emailUtils.ts` browser `sendEmail` removed (or reduced to calling the new authed routes without to/subject/html); `pages/expense-reports.tsx` updated call sites; tests.
>
> **Out of scope:** deleting the relay routes (B1b), campaign features.

Acceptance criteria A1–A3 as written in the plan.

## What the existing surface actually looked like

The prompt allowed extending "existing expense mutation API routes … if
submit/approve/reject already pass through server endpoints". **They do not.**
There is no `pages/api/expense-reports/**` at all: the page mutates
`expense_reports` directly from the browser via the RLS-governed Supabase
client, then fired e-mail as a side effect. So this phase took the second
option — one narrowly-scoped authed route — and deliberately did **not** move
the status mutations server-side (that is a different, larger change to a live
feature and is not in B1a's criteria).

## Design, in one paragraph

`POST /api/expense-reports/{id}/notify` sends the notification that belongs to
the report's **current persisted state**. The browser sends the id in the path
and nothing else — the request body is never read. The route reads the report
with the service role, branches on `status`, and derives everything:
recipient (`EXPENSE_APPROVER_EMAIL` for a submission; the owner's `profiles.email`
for a decision), subject, body, reviewer name (from `reviewed_by`) and rejection
comments (from `review_comments`). Because the notification moment is derived
from stored state rather than named by the caller, there is no "which e-mail"
parameter to abuse either.

Templates moved from `utils/emailUtils.ts` into a new **server-only**
`lib/email/expenseNotifications.ts`, which also owns the Resend call (lazy
client, `EMAIL_FROM_ADDRESS`, soft-fail without `RESEND_API_KEY`) — the pattern
from `pages/api/admin/tractor-signups/grant.ts`. `utils/emailUtils.ts` is
deleted outright, so no browser-reachable `sendEmail` exists any more.

## Files changed, grouped by risk

### Higher risk — live feature behaviour

| File | Δ | Note |
|---|---|---|
| `pages/expense-reports.tsx` | +28 / −87 | Three call sites now `void requestExpenseNotification(id)`. The three "load report details for the e-mail" client-side reads are gone with them. Mutation logic, RLS posture and UI gating are untouched. |
| `lib/bots/expense-service.ts` | +19 / −33 | `submitReport` calls `sendExpenseSubmissionNotification(...)` instead of `fetch(appUrl + '/api/send-email')`. The `appUrl` constructor parameter existed only for that fetch and is removed. |

### New surface

| File | Δ | Note |
|---|---|---|
| `pages/api/expense-reports/[id]/notify.ts` | +218 | The authed route. |
| `lib/email/expenseNotifications.ts` | +267 | Server-only templates + Resend delivery. |

### Removed

| File | Δ |
|---|---|
| `utils/emailUtils.ts` | −170 (deleted) |

### Tests and evidence

| File | Δ |
|---|---|
| `__tests__/api/expense-reports/notify.test.ts` | +342 (new, 16 tests) |
| `__tests__/lib/email/expenseNotifications.test.ts` | +151 (new, 10 tests) |
| `__tests__/lib/bots/expense-service.test.ts` | +78 / −65 (mocks moved from fetch-to-relay to the direct sender) |
| `docs/plan/evidence/b1a/bundle-and-caller-checks.md` | +53 |

## Test evidence

```
npm run type-check   → pass (no output)
npm run lint         → pass (no output, --max-warnings=0)
npm test             → 227 files / 3397 tests passed
npm run build        → exit 0; route registered as ƒ /api/expense-reports/[id]/notify
```

New/changed suites:

- `__tests__/api/expense-reports/notify.test.ts` — 16 tests: method/auth/id guards;
  404; rate-limit dampening; submission authorized only to the submitter (a
  global admin is refused); decision authorized to the designated approver or a
  global admin (the report owner is refused); recipient taken from the DB and a
  request body carrying `{to, subject, html, comments}` provably ignored;
  reviewer-name fallback; missing owner address; `draft` → 409; route stays 200
  when sending soft-fails.
- `__tests__/lib/email/expenseNotifications.test.ts` — 10 tests: submission always
  addressed to the configured approver; HTML escaping of report name, submitter
  name and reviewer comments; approval vs rejection rendering; soft-fail with no
  `RESEND_API_KEY` (no client constructed); Resend error-as-value and
  thrown-error paths; empty recipient refused.
- `__tests__/lib/bots/expense-service.test.ts` — 21 tests, still green; the two
  e-mail tests now assert **no fetch happens** and that the payload crossing into
  the sender is report facts only.

Bundle proof (full commands and output in `docs/plan/evidence/b1a/`): the client
bundle contains no `api/send-email`, no template strings, and no Resend SDK.

## Where an independent reviewer should push hardest

1. **Deriving the notification moment from `status` instead of taking it as a
   parameter.** This is the load-bearing judgment call. It removes a
   client-controlled input, but it couples "which e-mail" to a status the client
   just wrote via RLS. Worth checking: is there a state where the derived e-mail
   is the wrong one? I believe not — `submitted`/`approved`/`rejected` map 1:1
   and `draft` 409s — but a fourth status added later would silently 409 rather
   than notify.
2. **The decision-flow authorization is `designated approver OR global admin`,
   which is *wider* than today's UI.** Today only the designated approver sees
   approve/reject buttons. I widened it to admins because the DB already lets any
   admin approve (`expense_reports_admin_all`) and a hard email-equality check
   would be brittle. If you think parity with the current UI matters more, this
   should narrow to the approver only.
3. **The endpoint is replayable.** It reads state instead of changing it, so a
   legitimate actor can re-POST and re-send. I added `RATE_LIMITS.expensive`
   (5/min/IP, the house best-effort limiter) rather than a `notified_at` column,
   because a schema change is out of scope. If you consider unbounded
   re-notification a real problem, the durable fix is a column and it belongs in
   its own phase.
4. **Service-role reads on a user-facing endpoint.** The route reads
   `expense_reports` and `profiles` with the service role — necessary, because it
   must see the owner's e-mail regardless of the caller's RLS visibility (see the
   `profiles`-is-own-row-only constraint). That makes the two authorization
   branches, not RLS, the only gate. Both are tested with a hostile caller, but
   this is the part where a mistake is most expensive.
5. **HTML escaping was added while moving the templates.** The originals
   interpolated `report_name`, submitter name and reviewer comments raw. I escaped
   them via the existing `lib/utils/html-escape`. This is a deliberate
   (small) behaviour change beyond a pure move — it is in the spirit of the phase,
   but it *is* a change, and the rendered e-mail now shows `&`-style entities
   correctly rather than raw markup.

## Known limitations / deferred

- **`pages/api/test-email.ts` still calls `/api/send-email`.** That is the only
  live caller left, and B1b deletes both files together, so B1b's "no live caller"
  criterion is satisfiable. Deliberately untouched here (out of scope).
- **No e2e.** The repo has no expense-report e2e coverage to extend; building one
  (seeded reports + approver identity + mocked Resend boundary) is phase-sized.
  Backlog.
- **Deep links in the e-mail bodies still hardcode
  `https://fne-lms.vercel.app/expense-reports`**, carried over verbatim. Switching
  to `lib/utils/app-url` would be correct but changes a production failure mode
  (`getAppBaseUrl` throws in production without a configured origin), so it was
  left alone. Backlog.
- **A silently RLS-blocked approve/reject now produces no e-mail** (the route
  finds the report still `submitted` and refuses the caller). This is a
  behaviour *improvement* — previously the "approved" e-mail went out regardless —
  but it is a change worth knowing about.
- **Notifications are not retried.** Soft-fail is logged and reported to the
  caller as `sent: false`; nothing re-queues. Same as before.

## Commits

```
f29c1ce  feat(b1a): move expense-report mail server-side, off the open relay
<this commit>  docs(b1a): review request, evidence and ledger entry
```
