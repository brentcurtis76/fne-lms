# CODEX REVIEW — B1b round 1

VERDICT: FAIL

B1b cleanly deletes the two Next.js relay routes and removes `@sendgrid/mail`, and no live caller of either deleted route remains. The phase nevertheless fails [A1]: the shipped `/community/workspace` browser bundle still contains a Supabase edge-function call that sends browser-controlled `{to, subject, html}` to another endpoint named `send-email`. Calling a different deployment surface does not satisfy the final-tree requirement that no browser-controlled arbitrary-recipient send path survive.

BLOCKING:

- [B1] `components/meetings/MeetingDocumentationModal.tsx:45,773-779` imports and invokes `sendTaskAssignmentNotifications` from a client component. `utils/meetingUtils.ts:690-726` then uses the browser Supabase client to call `supabase.functions.invoke('send-email', { body: { to, subject, html } })`; `lib/supabase-wrapper.ts:11-28` confirms that this resolves to `createPagesBrowserClient()` in the browser. The helper's ordinary UI path first reads profile emails, but that is not a server security boundary: the browser owns the eventual function request and can alter its recipient and message fields. No implementation of the `send-email` edge function exists under `supabase/`, so this repository supplies no independently reviewable server-side authorization or recipient derivation that could constrain the payload. The production build proves the capability is live rather than dead source: `.next/static/chunks/pages/community/workspace-16ac580105a23b6b.js` contains `functions.invoke("send-email",{body:{to:e.email,subject:...,html:...}})`. This path predates the B1b diff, but [A1] is explicitly a final-tree condition; classifying it as a different system does not make the browser-controlled envelope acceptable. Required closure: remove the client invocation and its helper. If assignment emails must remain, replace it with an authenticated server route or server-side mutation that authorizes the meeting action, loads recipients and template inputs from persisted state, and accepts no recipient, subject, or HTML from the browser. Add a regression assertion that the production client chunks contain neither this edge-function call nor any browser mail transport, then refresh the proof/review request and rerun the gates.

SHOULD-FIX:

- None.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- The deleted-route portion of [A1] is verified independently on head `d3f4b25`. `pages/api/send-email.ts` and `pages/api/test-email.ts` are absent; source greps for `/api/send-email` and `/api/test-email` return only historical comments; neither path appears in `.next/routes-manifest.json` or `.next/server/pages-manifest.json`. `utils/meetingUtils.ts` is not a caller of either deleted Next.js route, but it is the separate browser-controlled send path described in [B1].
- [A2] is otherwise verified. `@sendgrid/mail` is absent from `package.json` and `package-lock.json`; `npm ls @sendgrid/mail --depth=0` is empty; the base commit has no source import; the lockfile removal is consistent with dropping the unused SendGrid dependency and its orphaned transitive packages.
- The accepted deviation is sound. The three remaining `SendGrid` matches at `pages/api/cron/email-digest.ts:233,245,254` are a TODO plus an example inside a block comment. The file imports no SendGrid package, the package is absent, and the production client chunks contain no `sendgrid` string. A literally empty case-insensitive source grep was requested in the executor prompt, but these comments create no caller or send capability and do not undermine [A2]; deleting them would be unrelated cleanup.
- The remaining executable mail transports were swept independently. `pages/api/contact.ts` sends only to the module constant `CONTACT_RECIPIENT`; `pages/api/admin/tractor-signups/grant.ts` is admin-guarded and derives the address from the selected signup row; `lib/email/expenseNotifications.ts` is server-only with persisted/server-configured recipients; and `lib/emailService.js` is called by the authenticated meeting-finalization route with server-derived community recipients. The legacy Formspree warning sender in `lib/formSubmissionTracker.ts` has no live call to `trackFormSubmission`, uses a fixed Formspree endpoint/template, and is not a browser import. The edge-function path in [B1] is the surviving exception.
- Independent local gates passed: type-check; zero-warning lint; Vitest **232 files / 3,445 tests**; production build. PR #32 is mergeable and all six CI checks plus Vercel are green on the same head. Green gates do not cover the [B1] final-tree security criterion.
- Scope is otherwise faithful: `baec41a..d3f4b25` changes only the two route deletions, dependency/lockfile removal, and the required evidence/review/ledger documentation. There are no migrations, middleware changes, or unrelated executable edits.
