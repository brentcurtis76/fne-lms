# Fase A7b — review request

**Branch:** `phase/a7b-contact` (worktree `../wt-a7b`, per the 2026-07-31 process amendment)
**Base:** `3cb3327` (origin/main at branch creation)
**Commits:** 1 code commit + this docs/ledger commit — see "Commits" below

## Objective and scope (from `docs/plan/PLAN.md`, Phase A7b — frozen v4)

> **Scope:** `pages/api/contact.ts`; `__tests__/api/contact.test.ts`.
> **Acceptance criteria:** v2 A7 [A2]–[A3] verbatim (interest map incl. legacy
> aliases; Resend transport with **all fields escaped**; Formspree call +
> 50/month block + `trackFormSubmission` call removed; best-effort rate limit;
> soft-fail; unit tests incl. hostile input). Single concern: transport swap on
> the money path.

**Explicitly out of scope** (frozen by the executor prompt): the form's UI and
fields, consent checkboxes, nav links, flipbooks (A7a), any other route, and the
removal of `lib/formSubmissionTracker.ts` itself (backlog item). None of those
were touched.

### What the route did before

`pages/api/contact.ts` validated the form, then: counted submissions through
`trackFormSubmission` and returned **429 once 50 submissions existed in the
month**; POSTed to `FORMSPREE_ENDPOINT`; built an `htmlContent` email that was
**never sent anywhere** (dead code, unescaped); built a second dead
`confirmationHtml`; had no rate limit and no escaping. Its `interestMap` keyed on
`pasantias` / `consultoria` / `formacion`, none of which the form submits —
verified in `pages/index.tsx:975-979`, which submits `inspira`, `inicia`,
`evoluciona`, `aula-generativa`, `otro`. So every Inspira lead arrived labelled
with the raw slug `inspira`.

## Files, grouped by risk

**Highest risk — the money path**
- `pages/api/contact.ts` (+84 / −170). Transport swapped Formspree → Resend; the
  previously-dead `htmlContent` template is now the body that is actually sent,
  with every user-supplied interpolation passed through `escapeHtml`. Rate limit
  added (5/min/IP, `lib/rateLimit`), 405 kept ahead of it, validation and
  response shapes unchanged, soft-fail preserved.

**Test-only**
- `__tests__/api/contact.test.ts` (new, 24 tests). Harness style cloned from
  `__tests__/api/registro-signup.test.ts`; `resend` mocked at module level;
  `lib/rateLimit` deliberately **not** mocked (see "scrutinise" §3).

Nothing else in the repo changed — `lib/formSubmissionTracker.ts`,
`pages/index.tsx`, and every other route are byte-identical to `origin/main`.

## Test evidence

All commands run in the isolated worktree on the branch commit.

| Gate | Command | Result |
|---|---|---|
| Targeted | `npx vitest run __tests__/api/contact.test.ts` | **24 passed (24)**, exit 0 |
| Type-check | `npm run type-check` | clean, exit 0 |
| Lint | `npm run lint` | clean (`--max-warnings=0`), exit 0 |
| Unit (full) | `npm test` | **226 files / 3394 tests passed**, 28.81s |
| Build | `npm run build` | exit 0, full route table emitted |

`npm run test:db` and `npm run e2e` were not run: no DB object, migration, or UI
surface is touched by this phase.

Criterion-by-criterion:

- **[A1] labels + aliases** — `it.each` over all eight keys asserts each maps to
  its label in both subject and body; plus a fallback case for an unknown value.
- **[A2] Resend + escaping** — payload assertions on `to` / `from` /
  `reply_to` / `subject`; `EMAIL_FROM_ADDRESS` override; a hostile-input case
  asserting `<script>alert(1)</script>`, `"`, `'`, `&`, and an `onerror` payload
  all render escaped, plus negative assertions that no live markup survives.
- **[A3] removals** — `grep -n "FORMSPREE\|Formspree\|trackFormSubmission\|formSubmissionTracker\|confirmationHtml" pages/api/contact.ts` → no match; a test sets `FORMSPREE_ENDPOINT` and asserts `globalThis.fetch` is never called.
- **[A4] rate limit + soft-fail** — five 200s then a 429 from the same IP with
  the send count frozen at five; no-key case asserts 200, `emailSent: false`, the
  log line, and that the Resend client is never even constructed; plus
  error-as-value and thrown-error cases.

## Scrutinise these hardest

1. **The subject line is deliberately *not* HTML-escaped.** The prompt's escaping
   clause is attached to the HTML template; a mail subject is plain text, so
   `escapeHtml` there would put literal `&amp;` / `&#39;` in FNE's inbox for any
   name with an apostrophe — a guaranteed cosmetic defect in exchange for no
   security gain (a subject is never rendered as markup). Instead the subject
   strips `\r` / `\n` from the three interpolations so a hostile value cannot
   shape the line, and there is a test for that. If you consider hostile text in
   a plaintext subject a finding, the fix is one line — but please rule on it
   rather than assuming the escaping was missed.
2. **`reply_to: email` is an addition not named in the acceptance criteria.**
   Formspree's `_replyto: email` gave staff a working "Reply" button; without it,
   replying to a lead notification would answer
   `notificaciones@nuevaeducacion.org`. I judged preserving that to be part of a
   faithful transport swap rather than scope expansion. Note the field is
   snake_case: resend 3.5.0's `CreateEmailOptions` declares `reply_to`, not
   `replyTo` (`node_modules/resend/dist/index.d.ts:196`) — verified against the
   installed SDK, not from memory.
3. **The test suite exercises the real rate limiter instead of stubbing it.**
   `registro-signup.test.ts` mocks `lib/rateLimit` away; this suite cannot, because
   [A4] requires proving the 429 path. The limiter is a module-level LRU shared
   across the file, so every non-throttling case sends a unique synthetic
   `x-forwarded-for` and the 429 case pins one IP. This is stronger coverage but
   it makes the suite order-sensitive in a way a stub would not be: if a future
   case forgets its own IP it will silently share a bucket. The `nextIp()` helper
   is the only thing keeping that honest.
4. **`emailSent`'s value semantics changed even though the response shape did
   not.** The old code returned `emailSent: emailSent || !emailError`, so the
   "no transport configured" path reported `emailSent: true` — untrue. It now
   reports the real outcome (`false` when nothing was sent). `pages/index.tsx`
   reads only `result.message` / `result.error`, so no caller is affected;
   flagging it because it is a behaviour change hiding inside an unchanged shape.
5. **A Resend failure still returns 200 to the visitor.** Both the error-as-value
   and thrown-error paths log and continue, exactly as the Formspree code did.
   That is the documented soft-fail requirement, but it means a broken sender is
   invisible to the visitor *and* to the caller (only the server log and
   `emailSent: false` carry the signal). Leads are not persisted anywhere by this
   route, so a silent sender outage loses leads. That is pre-existing, and A5
   fixes it properly for the `/pasantias` funnel by writing to `pasantias_leads`;
   the homepage form's dual-write is already a backlog item.
6. **Legacy aliases kept their original labels, not the new ones.** `pasantias`
   still maps to "Pasantías en Barcelona" rather than "Inspira (Pasantía en
   Barcelona)". The prompt called them "harmless aliases"; keeping the old label
   means a legacy payload renders exactly as it always did. If the intent was for
   `pasantias` to render as Inspira, that is a one-line change.

## Known limitations / deferred

- **`lib/formSubmissionTracker.ts` and `pages/admin/form-usage.tsx` still exist**
  and are now unreferenced by this route — removal is the standing SHOULD-FIX
  backlog item, deliberately not done here.
- **No dual-write into `pasantias_leads`.** The homepage contact form remains
  send-only; capturing it as a lead is the existing v2 backlog item.
- **The 50/month cap is gone with nothing replacing its cost ceiling** except the
  best-effort 5/min/IP limiter. That matches D-04's stance (rate limiting is
  dampening, not a durable control), and Resend's own plan quota is now the real
  ceiling.
- **`FORMSPREE_ENDPOINT` may still be set in the Vercel project.** It is now
  inert; cleaning up the env var is an ops task, not a code change.
- **Not verified against live Resend.** No `RESEND_API_KEY` exists locally, so
  the send path is proven only against the mocked SDK; a real send is A9's gate.
