# B1b evidence — relay removal proof

All commands run in the `phase/b1b-relay` worktree at commit `f91e088`
(post-deletion, post-`npm uninstall @sendgrid/mail`). Output is verbatim.

## 1. Both routes are gone from the tree and from the build

```
$ ls pages/api/send-email.ts pages/api/test-email.ts
ls: pages/api/send-email.ts: No such file or directory
ls: pages/api/test-email.ts: No such file or directory

$ grep -o "/api/send-email\|/api/test-email" .next/routes-manifest.json .next/server/pages-manifest.json ; echo "exit=$?"
exit=1
```

## 2. No live caller of the relay remains

```
$ grep -rn "api/send-email" --include="*.ts" --include="*.tsx" --include="*.js" pages lib utils components scripts
pages/api/expense-reports/[id]/notify.ts:9: * `/api/send-email` relay.
lib/email/expenseNotifications.ts:6: * `/api/send-email` relay. Recipient, subject and body are now decided on the
```

Both hits are historical doc comments in B1a-authored files, not calls:
they explain what the module replaced. No code path constructs a request
to either route.

```
$ grep -rn "send-email\|test-email" --include="*.ts" --include="*.tsx" . | grep -v node_modules
utils/meetingUtils.ts:713:        const { error: emailError } = await supabase.functions.invoke('send-email', {
__tests__/lib/bots/expense-service.test.ts:20:// B1a: the bot no longer POSTs `{to, subject, html}` to /api/send-email — it
lib/email/expenseNotifications.ts:6: * `/api/send-email` relay. Recipient, subject and body are now decided on the
pages/api/expense-reports/[id]/notify.ts:9: * `/api/send-email` relay.
```

The fourth hit, `utils/meetingUtils.ts:713`, is a **Supabase edge function**
named `send-email` invoked via `supabase.functions.invoke(...)` — a different
system, out of scope (called out in the B1b prompt). The fifth is a comment
in a B1a test.

## 3. `@sendgrid/mail` is gone

```
$ grep -n "sendgrid" package.json package-lock.json ; echo "exit=$?"
exit=1

$ grep -rni "sendgrid" --include="*.ts*" . | grep -v node_modules | grep -v docs/plan
pages/api/cron/email-digest.ts:233:    // TODO: Integrate with actual email service (SendGrid, AWS SES, etc.)
pages/api/cron/email-digest.ts:245:    // Example with SendGrid:
pages/api/cron/email-digest.ts:254:    await sendgrid.send(msg);
```

The three remaining hits are **comment-only** in an unrelated cron route:
a `TODO` naming SendGrid as one candidate provider, and a commented-out
`/* ... */` example block. `pages/api/cron/email-digest.ts` imports nothing
from `@sendgrid/*` and sends no mail (it logs what it would send). Left in
place deliberately — editing an unrelated route is outside a deletion phase.

## 4. Nothing imported the package before removal

```
$ git grep -n "@sendgrid" baec41a -- "*.ts" "*.tsx" "*.js" "*.mjs" ; echo "exit=$?"
exit=1
```

(`baec41a` = `origin/main`, the base of this branch. No source file
referenced the package at any point before its removal.)

## 5. `axios` was safe to drop

`npm uninstall` also removed `axios` and `follow-redirects` from the lockfile —
they were transitive dependencies of `@sendgrid/client` only.

```
$ grep -rn "from 'axios'\|require('axios'" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" . | grep -v node_modules ; echo "exit=$?"
exit=1
```

## 6. Gates

```
npm run type-check   → pass (no output)
npm run lint         → pass (no output, --max-warnings=0)
npm test             → Test Files 232 passed (232) / Tests 3445 passed (3445)
npm run build        → exit 0; no /api/send-email or /api/test-email route emitted
```
