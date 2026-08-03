# B1b evidence — round 2: the dead edge-function relay is gone

Closes REVIEW-B1B.md's single BLOCKING finding [B1]. All commands run in a
worktree at `phase/b1b-relay` after the round-2 deletion and a full
`npm run build`. Output is verbatim.

Round 1's proof (`relay-removal-proof.md`) stands unchanged; this file adds
only what [B1] required.

## 1. The source path is gone

```
$ grep -rn "functions.invoke('send-email'\|functions.invoke(\"send-email\"" utils lib components pages ; echo "exit=$?"
exit=1
```

Deleted: `utils/meetingUtils.ts::sendTaskAssignmentNotifications` (the helper
that built `{to, subject, html}` in the browser), together with its import and
its only call site in `components/meetings/MeetingDocumentationModal.tsx`.

```
$ grep -rn "sendTaskAssignmentNotifications" --include="*.ts" --include="*.tsx" . | grep -v node_modules ; echo "exit=$?"
exit=1
```

## 2. The capability is gone from the shipped bundle

The chunk Codex named — `.next/static/chunks/pages/community/workspace-16ac580105a23b6b.js`
— no longer exists; the rebuilt chunk is `workspace-675a131edf8dcce7.js`.

```
$ grep -c "send-email" .next/static/chunks/pages/community/workspace-675a131edf8dcce7.js
0

$ grep -rl "send-email" .next/static | wc -l
       0

$ grep -rl "functions.invoke" .next/static ; echo "exit=$?"
exit=1

$ grep -rli "sendgrid\|nodemailer\|api.resend.com" .next/static | wc -l
       0
```

No client chunk contains the edge-function call, any other
`supabase.functions.invoke(...)`, or any mail-provider transport.

## 3. A regression assertion, not just a grep

`__tests__/utils/no-browser-mail-transport.test.ts` (3 tests, runs in gate 2)
makes the two sweeps above permanent at source level:

- repo-wide: no file invokes a Supabase edge function named `send-email`;
- client surfaces (`components/`, `pages/` minus `pages/api/`, `hooks/`,
  `contexts/`, `utils/`): no relay URL, no Resend/SendGrid/Nodemailer import,
  no import of the server-side mail modules (`lib/emailService`, `lib/email/`).

It keys on **transport**, not on message shape: `pages/email-showcase.tsx`
assembles `subject`/`html` strings purely to render template previews and can
reach no sender, so a shape-based rule would fail it for no security reason.
A third test asserts the file collector actually walked >100 client files, so
a broken sweep cannot make the guard vacuously green.

Verified the guard would have caught the deleted code:

```
$ git show HEAD:utils/meetingUtils.ts > /tmp/old-meetingUtils.ts
$ node -e "const s=require('fs').readFileSync('/tmp/old-meetingUtils.ts','utf8');
  console.log(/functions\s*\.\s*invoke\s*\(\s*['\"\`]send-email['\"\`]/.test(s))"
true
```

## 4. In-app notification for task assignment: none exists

Prompt item 3, answered from the code rather than assumed.

The documentation-submit path is
`MeetingDocumentationModal → persistMeeting.ts → utils/meetingUtils.ts`. The
tables it writes are `community_meetings`, `meeting_attendees`,
`meeting_agreements`, `meeting_commitments`, `meeting_tasks` — it never writes
`notifications` and never calls `notificationService`. The deleted email was the
only assignee-facing signal in that flow, and it has never worked (the
`send-email` edge function does not exist in this project).

The nearest neighbours are both different moments:

- `pages/api/meetings/[id]/finalize.ts:279` fires
  `notificationService.triggerNotification('meeting_finalized', …)` — server
  side, authenticated, addressed to `getCommunityRecipients(...)`, at meeting
  **finalization**, not at task assignment.
- `assignment_created` in `lib/notificationEvents.ts:267` is the course
  assignment event (`defaultUrl: '/assignments'`), unrelated to meeting tasks.

**So the backlogged server-side rebuild is a real gap, not a nice-to-have** —
assignees currently learn of a new meeting task only by opening the workspace.
It is not a regression introduced here: the notification never reached anyone.
Nothing was built for it in this round, per the prompt.

## 5. Gates

```
npm run type-check   → pass (no output)
npm run lint         → pass (no output, --max-warnings=0)
npm test             → Test Files 233 passed (233) / Tests 3448 passed (3448)
npm run build        → exit 0
```

(Round 1 was 232 files / 3445 tests; the delta is the new guard file.)

---

# Round 3 — the guard's sweep now covers the whole client source surface

Closes REVIEW-B1B-R2.md's single BLOCKING finding [B1]: the round-2 collector
hand-picked five directories and omitted `src/`, whose components are imported
by `components/` and `pages/` and ship in the same chunks.

Only `__tests__/utils/no-browser-mail-transport.test.ts` changed this round.

## 6. The swept set is derived, not hand-picked

`CLIENT_SURFACES` is now computed at run time as

> every top-level directory − dot-directories − the plain-name roots in
> `tsconfig.json`'s `exclude` − `NON_CLIENT_ROOTS` (each with its reason)

so a directory is swept **unless someone justifies leaving it out**. That is the
inverse of the round-2 list, where a directory was swept only if someone
remembered it. Printed from the test's own derivation:

```
DERIVED CLIENT_SURFACES: components config constants contexts hooks pages public src styles types utils
client files swept: 546 | repo-wide files swept: 1124
```

(round 2: 500 client files from `components pages hooks contexts utils`.)

Excluded top-level directories and why — the four kept out by name, plus the
roots `tsconfig.json` already excludes:

| Root | Why it is not a client surface |
|---|---|
| `lib` | shared + server modules; the legitimate home of a mail transport (`lib/emailService.js`, `lib/email/expenseNotifications.ts`) — API routes derive the recipient from persisted state behind an auth check. Client surfaces are forbidden from *importing* it; still swept by the repo-wide test. |
| `scripts` | node-only build/maintenance scripts, never bundled; still swept repo-wide. |
| `supabase` | SQL migrations, pgTAP suites, Deno edge functions — never in a browser bundle; still swept repo-wide. |
| `tests` | Playwright + Vitest suites — test code, not shipped; still swept repo-wide. |
| `docs` | markdown, no modules. |
| `node_modules`, `node_modules.old`, `cc-bridge-mcp-server`, `e2e`, `__tests__` | not compiled — read from `tsconfig.json`'s own `exclude`, not restated, so the two cannot drift. |

`public/` **is** swept: `public/sw.js` is a service worker the browser executes,
so it belongs to the same capability class even though nothing bundles it.

## 7. The extended sweep bites (scratch-add, run, revert)

Injected the exact reviewed-away transport into the file Codex named,
`src/components/TipTapEditor.tsx`:

```ts
async function scratchNotify(supabase: any, to: string) {
  await supabase.functions.invoke('send-email', {
    body: { to, subject: 'x', html: '<p>x</p>' },
  });
}
```

Both transport assertions fail — verbatim:

```
 FAIL  __tests__/utils/no-browser-mail-transport.test.ts > no browser-controlled mail transport (B1b) > no source file invokes a Supabase edge function named send-email
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- Array []
+ Array [
+   "src/components/TipTapEditor.tsx",
+ ]

 FAIL  __tests__/utils/no-browser-mail-transport.test.ts > no browser-controlled mail transport (B1b) > client-bundled surfaces reach no mail transport
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- Array []
+ Array [
+   "src/components/TipTapEditor.tsx → Supabase send-email edge function",
+ ]

 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
```

The round-2 collector, run against the same injected file, sees nothing:

```
$ node -e "<round-2 set: components pages hooks contexts utils, same regex>"
round-2 set: ["components","pages","hooks","contexts","utils"]
files swept: 500
offenders found: []
src/components/TipTapEditor.tsx swept? false
```

Reverted (`git checkout -- src/components/TipTapEditor.tsx`), re-run green:

```
 ✓ __tests__/utils/no-browser-mail-transport.test.ts  (3 tests) 108ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

The third test is the non-vacuity guard Codex asked for: it asserts
`CLIENT_SURFACES` contains `src`, that `src/components/TipTapEditor.tsx` and
`components/meetings/MeetingDocumentationModal.tsx` are both in the swept list,
and that the collector walked >100 files.

## 8. Gates — round 3

```
$ npm run type-check
> NODE_OPTIONS='--max-old-space-size=8192' tsc --noEmit
(no output)

$ npm run lint
> eslint --ext .js,.jsx,.ts,.tsx --max-warnings=0 .
(no output)

$ npm test
 Test Files  233 passed (233)
      Tests  3448 passed (3448)

$ npm run build > /tmp/b1b3-build.log 2>&1; echo "BUILD_EXIT=$?"
BUILD_EXIT=0
```

Test counts are unchanged from round 2 (233/3448) — this round edited an
existing test file and added no new test.
