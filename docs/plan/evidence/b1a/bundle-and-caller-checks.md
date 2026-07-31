# B1a evidence — caller migration and client-bundle checks

Run on branch `phase/b1a-expmail`, after `npm run build` (exit 0).

## 1. Remaining `/api/send-email` references in source

```
$ grep -rn "api/send-email" --include="*.ts" --include="*.tsx" --include="*.js" . | grep -v node_modules
__tests__/lib/bots/expense-service.test.ts:20:// B1a: the bot no longer POSTs `{to, subject, html}` to /api/send-email — it
lib/email/expenseNotifications.ts:6: * `/api/send-email` relay. Recipient, subject and body are now decided on the
pages/api/test-email.ts:88:    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://fne-lms.vercel.app'}/api/send-email`, {
pages/api/expense-reports/[id]/notify.ts:9: * `/api/send-email` relay.
```

Three of the four hits are comments. The single live caller left is
`pages/api/test-email.ts`, which B1b deletes in the same change as the relay
itself — so after B1b there is no caller at all. Neither expense chain reaches
the relay any more.

## 2. Nothing browser-reachable can name a recipient, subject or body

```
$ grep -rl "api/send-email" .next/static            → NONE
$ grep -rl "expense-notifications" .next/static     → NONE
$ grep -rl "Nuevo Reporte de Gastos Pendiente" .next/static → NONE
$ grep -rl "resend.com/emails" .next/static         → NONE
```

The e-mail templates, the Resend SDK and the relay URL are all absent from the
client bundle. The page chunk
`.next/static/chunks/pages/expense-reports-*.js` only carries the
`/api/expense-reports/{id}/notify` path plus the report id.

## 3. Route registered by the build

```
├ ƒ /api/expense-reports/[id]/notify                0 B      150 kB
├ ○ /expense-reports                                15.3 kB  289 kB
```

## 4. Gates

| Gate | Result |
|---|---|
| `npm run type-check` | pass (no output) |
| `npm run lint` | pass (no output, `--max-warnings=0`) |
| `npm test` | 227 files / 3397 tests passed |
| `npm run build` | exit 0 |

`npm run test:db` not run: this phase adds no migration and no RLS surface.
No targeted e2e: the repo has no expense-report e2e coverage to extend, and
building one (seeded reports + approver identity + a mocked Resend boundary) is
a phase-sized piece of work — recorded as a backlog item instead.
