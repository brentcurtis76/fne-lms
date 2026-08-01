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
