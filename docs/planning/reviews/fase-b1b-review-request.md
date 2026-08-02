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
62dc523  docs(b1b): review request, evidence and ledger entry
```

---

# Round 2 — remediation of REVIEW-B1B.md [B1]

**Executor round:** 2
**Base for this round:** `1a6ecb2` (round-1 head + PM triage)
**Prompt:** `docs/plan/prompts/b1b-2.md`

## The finding, and what closed it

[B1] found that round 1 satisfied the *route* half of [A1] while the same
capability class stayed alive through a different door:
`utils/meetingUtils.ts::sendTaskAssignmentNotifications` built
`{to, subject, html}` in the browser and handed it to a Supabase edge function
also named `send-email`, and the shipped `/community/workspace` chunk proved it
was live code, not dead source. Round 1's review request (item 2 above) called
that path "different system, out of scope" on the strength of the round-1
prompt. Codex's class-based reading of [A1] is the correct one; the round-1
framing was wrong.

The edge function does not exist in this Supabase project (PM checked
`list_edge_functions`: only `generate-scene-images` and `process-reflexion-pdf`),
so every invocation since the code was written has 404'd into a swallowed
`console.error`. The feature has never delivered an email to anyone. Round 2
therefore deletes the path rather than rebuilding it server-side; the rebuild is
a backlog feature request, per the PM's triage.

## Files changed this round

| File | Δ | Note |
|---|---|---|
| `utils/meetingUtils.ts` | −54 | `sendTaskAssignmentNotifications` deleted whole |
| `components/meetings/MeetingDocumentationModal.tsx` | +3 / −15 | import, call block, now-unused `isDraft`/`collectAssignedUserIds` import, stale comment |
| `__tests__/…/MeetingDocumentationModal.save-draft.test.tsx` | −8 | mock + two assertions that the deleted function was not called |
| `__tests__/…/MeetingDocumentationModal.end-dedup.test.tsx` | −1 | mock entry |
| `__tests__/…/MeetingDocumentationModal.clear-rich-text.test.tsx` | −1 | mock entry |
| `__tests__/utils/no-browser-mail-transport.test.ts` | +102 (new) | the regression assertion [B1] asked for |
| `docs/plan/evidence/b1b/dead-edge-relay-removal.md` | new | verbatim proof |

The task-assignment flow itself is untouched: assignees are still persisted to
`meeting_commitments` / `meeting_tasks` by `persistMeeting.ts`; only the mail
call after the successful write is gone.

## Test evidence

```
npm run type-check   → pass (no output)
npm run lint         → pass (no output, --max-warnings=0)
npm test             → Test Files 233 passed (233) / Tests 3448 passed (3448)
npm run build        → exit 0
```

Bundle sweep after the build — `grep -rl "send-email" .next/static` → 0 files;
`grep -rl "functions.invoke" .next/static` → exit 1; the chunk named in [B1]
(`workspace-16ac580105a23b6b.js`) is replaced by `workspace-675a131edf8dcce7.js`
with zero matches. Verbatim in `docs/plan/evidence/b1b/dead-edge-relay-removal.md`.

## Prompt item 3 — is there an in-app notification for task assignment?

**No.** The submit path writes only the five meeting tables; it never touches
`notifications` or `notificationService`. `meeting_finalized`
(`pages/api/meetings/[id]/finalize.ts:279`) is a different moment and a
different audience (community recipients at finalization);
`assignment_created` is the course-assignment event. So the backlogged
server-side rebuild closes a **real gap**, not a nice-to-have — though not a
regression, since the deleted email never reached anyone. Nothing was built.

## Where an independent reviewer should push hardest — round 2

1. **I added a test file to a deletion round.** The prompt asked for grep proof
   in an evidence file; [B1] asked for "a regression assertion". An evidence
   file proves one commit, so I wrote
   `__tests__/utils/no-browser-mail-transport.test.ts` as well. Judgment calls
   inside it worth challenging: it asserts over **source**, not over
   `.next/static`, because no post-build assertion harness exists yet (the plan
   introduces the first one, `scripts/check-price-leak.mjs`, in A1) and a test
   that needs a prior production build cannot run in gate 2. And it keys on
   **transport** rather than on `{to, subject, html}` shape — a shape rule fails
   `pages/email-showcase.tsx`, which assembles subject/HTML strings only to
   render previews and can reach no sender. If the reviewer wants the bundle-level
   assertion instead, it belongs in A1's post-build script, not here.

2. **`collectAssignedUserIds` is now an unused export.** It lived in
   `components/meetings/persistMeeting.ts:334`, was consumed only by the deleted
   call block, and still has its own unit tests
   (`__tests__/components/meetings/persistMeeting.test.ts:119-149`). I left the
   helper and its tests in place: it is a pure function with no send capability,
   and deleting a tested helper plus its tests is wider than the prompt's scope.
   Flagging it as a deliberate leave-behind rather than an oversight — it is the
   input the server-side rebuild will want.

3. **`getMeetingWithDetails` is in the same position.** Exported from
   `utils/meetingUtils.ts:228`, and after this deletion it has no in-repo
   consumer. Left for the same reason. Both are one-line deletions if the
   reviewer prefers a clean tree.

4. **I removed two assertions rather than rewriting them.** The save-draft
   suite asserted "a draft save does not fire assignee notifications" at two
   points. With the function gone those assertions are vacuously true, and a
   vacuous assertion reads as coverage it no longer provides. There is nothing
   left to assert about a behaviour that no longer exists, so they are gone
   rather than reworded. The suite's real subject — that a draft save persists
   step-3 content with `status='borrador'` — is untouched and still green.

5. **The client-surface list in the new guard is a judgment call.**
   `components/`, `pages/` (minus `pages/api/`), `hooks/`, `contexts/`, `utils/`.
   `lib/` is excluded because that is where the legitimate server-side senders
   live (`lib/emailService.js`, `lib/email/expenseNotifications.ts`) — so the
   guard instead forbids client surfaces from *importing* those modules. A
   server module that is neither in `lib/` nor `pages/api/` would be missed;
   none exists today.

## Known limitations / deferred — round 2

- Meeting task assignees get no notification of any kind. Backlog item, per PM
  triage: rebuild server-side (authenticated route, recipients derived from the
  persisted meeting rows, Resend) once B2 locks the SDK contracts.
- Round 1's deferred items stand: the three comment-only `SendGrid` references
  in `pages/api/cron/email-digest.ts` (Codex accepted), and that route's
  unauthenticated service-role posture (out of scope, still worth a backlog
  item before anyone uncomments its send block).
- Still no e2e: this round only deletes.

## Commits — round 2

```
<code commit>  chore(b1b): delete the dead browser-controlled edge-function mail path
<docs commit>  docs(b1b): round-2 evidence, review request and ledger entry
```

---

# Round 3 — guard sweep extended to the full client source surface

**Branch:** `phase/b1b-relay` · base for this round: `2407d43` · 1 commit.
**Owner-authorized third round** (§1.5 — Codex round cap of 2 was reached).

## Objective

Close REVIEW-B1B-R2.md's single BLOCKING [B1]: the round-2 regression guard's
collector defined the browser-source universe as `components`, `pages`, `hooks`,
`contexts`, `utils` and omitted `src/`, so the exact reviewed-away transport
placed in `src/components/TipTapEditor.tsx` would have passed all three tests
while Next emitted it into browser chunks.

**In scope:** one test file + evidence. **Out of scope:** everything else — no
source change, no new deletion, no re-litigating the round-2 design choices
Codex explicitly accepted (transport-keyed rule, source-level assertion).

## Files changed

| File | Δ | Risk |
|---|---|---|
| `__tests__/utils/no-browser-mail-transport.test.ts` | +72 / −10 | test-only; no runtime code touched |
| `docs/plan/evidence/b1b/dead-edge-relay-removal.md` | +~120 | docs |
| `docs/planning/reviews/fase-b1b-review-request.md` | this section | docs |
| `docs/plan/LEDGER.md` | round entry | docs |

## What changed in the guard

`CLIENT_SURFACES` is no longer a literal. It is derived at run time:

```
top-level directories
  − dot-directories (.github, .claude — tooling config)
  − plain-name roots read from tsconfig.json's own `exclude`
  − NON_CLIENT_ROOTS (lib, scripts, supabase, tests, docs — each with its reason)
```

which yields `components config constants contexts hooks pages public src styles
types utils` — 546 client files, up from 500. The repo-wide sweep now covers
every compiled root (1124 files) rather than `clientFiles + lib + scripts`, so
its stated claim ("nothing *anywhere* invokes the edge function") is now true of
the code it actually reads. The tsconfig excludes are parsed, not restated, so
the two cannot drift.

The direction of the default is the point: a directory is now swept unless
someone writes down why it should not be. A new top-level client tree is covered
the day it appears.

## Test evidence

- Focused: `npx vitest run __tests__/utils/no-browser-mail-transport.test.ts` →
  3 passed.
- Non-vacuity, per your §1.5 note: the third test asserts `src` is in
  `CLIENT_SURFACES` and that `src/components/TipTapEditor.tsx` (the file you
  named) and `components/meetings/MeetingDocumentationModal.tsx` are both in the
  swept list, alongside the existing >100-file floor.
- Bite proof, verbatim in evidence §7: injecting
  `supabase.functions.invoke('send-email', { body: { to, subject, html } })` into
  `src/components/TipTapEditor.tsx` fails **both** transport assertions; the
  round-2 collector run against the same injected file reports 0 offenders and
  `src/components/TipTapEditor.tsx swept? false`. Reverted, re-run green.
- Four gates: type-check pass, lint pass (`--max-warnings=0`), `npm test`
  233 files / 3448 tests passed, `npm run build` exit 0.

## Scrutinize hardest

1. **`public/` is now in the client set — my call, and arguable.** Nothing
   bundles `public/`; Next serves it verbatim. I swept it anyway because
   `public/sw.js` is a service worker the browser executes, which is the same
   capability class. If you consider `public/` outside the criterion, it belongs
   in `NON_CLIENT_ROOTS` with a reason; nothing else changes.
2. **`lib/` stays out of the client sweep, unchanged from round 2.** It is the
   only exclusion that hides real transports (`lib/emailService.js`,
   `lib/email/expenseNotifications.ts`), and it is genuinely shared — client
   modules import non-mail things from `lib/`. The compensating rule is the
   `server-side mail modules` pattern: a client file importing `lib/emailService`
   or `lib/email/` is an offender. A *new* server sender placed outside `lib/`
   and `pages/api/` would land in the client set and fail the guard, which is the
   right failure, but it would fail for the wrong-looking reason.
3. **`tests/` and `scripts/` are excluded as "not shipped".** True today. Both
   are still swept repo-wide for the edge-function call, so the exclusion only
   affects the SDK-import patterns — a Playwright helper importing `resend` would
   not be flagged. I judged that correct (test code legitimately touches
   providers); say so if you disagree.
4. **The tsconfig parse is narrow by design.** It takes only `exclude` entries
   with no glob and no extension. Glob entries (`**/*.test.ts`) and file entries
   (`playwright.config.ts`) are ignored, so they never remove a *directory* from
   the sweep. If someone later excludes a directory as `"src/legacy/**"`, the
   parse will not see it and the tree stays swept — fail-closed, but worth
   knowing.
5. **Round-2 review-request item 5 is now resolved.** I flagged the hand-picked
   list as a judgment call last round; you found the hole in it. The replacement
   removes the judgment rather than re-exercising it.

## Known limitations / deferred — round 3

- The guard remains source-level. A post-build assertion over `.next/static`
  would be stronger; the repo grows its first such harness in A1
  (`scripts/check-price-leak.mjs`), and wiring one for mail transport is a
  separate phase's work, not this round's.
- All round-2 deferrals stand unchanged: the backlogged server-side rebuild of
  task-assignment notification, the comment-only SendGrid references in
  `pages/api/cron/email-digest.ts`, and that route's unauthenticated
  service-role posture.
- No e2e: this round changes only a test file.
