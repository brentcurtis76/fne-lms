# Fase B1b — review request

**Branch:** `phase/b1b-relay`
**Base:** `origin/main` @ `baec41a`
**Commits:** 2 — one code commit + this docs commit (see bottom)
**Executor round:** 1

---

## Objective and scope (copied from PLAN.md v4 §Phase B1b)

> **Scope:** delete `pages/api/send-email.ts` + `pages/api/test-email.ts`; drop `@sendgrid/mail`; repo-wide proof.
>
> **Acceptance criteria:**
> - [A1] Both routes deleted; `grep -rn "send-email\|test-email" --include="*.ts*"` shows no live caller; no unauthenticated or browser-controlled arbitrary-recipient send path exists in the repo.
> - [A2] `@sendgrid/mail` removed (never imported — re-verified); gates green.

Out of scope by construction: anything that is not a deletion. This phase adds
no code.

## What was deleted, and why it was safe

`pages/api/send-email.ts` was an open relay: `POST` with no session check, no
role check and no origin check, taking `{to, subject, html}` straight from the
request body into `resend.emails.send`. Anyone on the internet could send
arbitrary HTML from `notificaciones@nuevaeducacion.org` to any address.
`pages/api/test-email.ts` was a second unauthenticated route that built a fixed
template and POSTed it to the first — it was also the last remaining caller of
`/api/send-email` in the repo (B1a's review request flagged exactly this, and
it is why the two files had to be deleted together rather than in sequence).

`@sendgrid/mail` was declared in `package.json` at `^8.1.5` and imported by
nothing. Re-verified against the base commit, not just the working tree:
`git grep "@sendgrid" baec41a -- "*.ts" "*.tsx" "*.js" "*.mjs"` → exit 1.

## Files changed

| File | Δ | Note |
|---|---|---|
| `pages/api/send-email.ts` | −102 (deleted) | the open relay |
| `pages/api/test-email.ts` | −120 (deleted) | unauthenticated wrapper around it |
| `package.json` | −1 | `@sendgrid/mail` dependency line |
| `package-lock.json` | +8 / −71 | see below |

No file was edited. No file was added other than this review request, the
evidence file and the ledger entry.

**Lockfile churn, itemised** (all of it is `npm uninstall` fallout, none of it
is hand-edited): removes `@sendgrid/mail`, `@sendgrid/client`,
`@sendgrid/helpers`, plus `axios` and `follow-redirects` which were transitive
dependencies of `@sendgrid/client` only; and re-marks eight packages
(`asynckit`, `combined-stream`, `delayed-stream`, `es-set-tostringtag`,
`form-data` + its nested `mime-db`/`mime-types`, `has-tostringtag`) as
`"dev": true`, because with sendgrid gone their only remaining parents are
devDependencies. The eight `"dev": true` lines are the entire `+8`.

`axios` removal was checked separately — no source file imports it
(`grep "from 'axios'\|require('axios'"` over `*.ts,*.tsx,*.js,*.mjs` excluding
`node_modules` → exit 1). The build confirms it.

## Test evidence

```
npm run type-check   → pass (no output)
npm run lint         → pass (no output, --max-warnings=0)
npm test             → Test Files 232 passed (232) / Tests 3445 passed (3445)
npm run build        → exit 0; neither route appears in routes-manifest.json
                       or pages-manifest.json
```

No test was added, changed or removed: nothing in `__tests__/` or `tests/`
exercised either deleted route. The only test-file match for the grep is a
comment in `__tests__/lib/bots/expense-service.test.ts:20` explaining what B1a
changed. Full verbatim command output in
`docs/plan/evidence/b1b/relay-removal-proof.md`.

## Where an independent reviewer should push hardest

1. **The `sendgrid` grep is not empty, and I chose not to make it empty.**
   The prompt asked for `grep -rn "sendgrid" --include="*.ts*" .` → empty.
   Three hits remain, all comment-only, all in one unrelated file:
   `pages/api/cron/email-digest.ts:233` (a `TODO` naming SendGrid as one of
   several candidate providers), `:245` and `:254` (a commented-out
   `/* ... */` usage example). That route imports nothing from `@sendgrid/*`
   and sends no mail — it logs what it would send. Deleting dead comments in a
   route this phase does not otherwise touch is adjacent refactoring, which the
   prompt forbids, so I left them and am reporting it instead of quietly
   widening the diff. If the reviewer wants a literally-empty grep, it is a
   three-line comment deletion and I have no objection — it just is not mine to
   take unilaterally.

2. **`utils/meetingUtils.ts:713` matches the `send-email` grep and is not a
   relay caller.** It is `supabase.functions.invoke('send-email', …)` — a
   Supabase **edge function** that happens to share the name. Different system,
   different deployment surface, untouched. The prompt called this out in
   advance; I verified it independently rather than taking it on faith. Worth a
   second pair of eyes precisely because the string match is identical.

3. **The [A1] claim is broader than "these two files are gone" and I had to
   verify it, not assert it.** I enumerated every remaining `resend` send site
   in the repo (`emails.send` / `batch.send` / `new Resend(`) and checked each
   for a body-controlled recipient:
   - `pages/api/contact.ts` — public and unauthenticated, but the recipient is
     the module constant `CONTACT_RECIPIENT = 'info@nuevaeducacion.org'`; the
     body supplies form fields and `reply_to` only. Fixed recipient, so not an
     arbitrary-recipient path. (A7b's design; flagging it because "public route
     that sends mail" is the shape a reviewer should look at twice.)
   - `pages/api/admin/tractor-signups/grant.ts` — `checkIsAdmin` guard;
     recipient read from the `signupRow` the `signupId` resolves to.
   - `lib/email/expenseNotifications.ts` — B1a; recipient derived server-side.
   - `lib/emailService.js` → `pages/api/meetings/[id]/finalize.ts` — recipients
     from `getCommunityRecipients(...)`, subject/HTML from a fixed template.

   I did **not** audit the authorization of those routes beyond recipient
   derivation — that is other phases' territory and B1a's review already
   covered its own.

4. **Two production URLs disappear without a redirect or a deprecation
   window.** If anything outside this repo (a saved Postman call, an ops
   runbook, a Zapier hook) still POSTs `/api/send-email`, it now gets a 404
   instead of a send. That is the intended outcome, but it is a live-surface
   removal and nobody outside the repo was consulted. There is no way to
   grep for external callers from here.

## Known limitations / deferred

- The three comment-only `SendGrid` references in
  `pages/api/cron/email-digest.ts` remain (item 1 above).
- `pages/api/cron/email-digest.ts` itself is unauthenticated and reads
  `SUPABASE_SERVICE_ROLE_KEY`, but it sends nothing today (the send is
  commented out) — noticed in passing, out of scope, not part of any B1b
  criterion. Worth a backlog item before anyone uncomments that block.
- No e2e: the phase deletes routes and adds no surface to drive.

## Commits

```
f91e088  chore(b1b): delete the open mail relay and drop @sendgrid/mail
<this commit>  docs(b1b): review request, evidence and ledger entry
```
