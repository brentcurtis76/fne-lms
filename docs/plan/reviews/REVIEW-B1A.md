# CODEX REVIEW — B1a round 1

VERDICT: PASS

B1a meets [A1]–[A3]. The browser notification path now supplies only the report id; the route ignores the request body, derives the notification moment from persisted status, derives the recipient and message inputs server-side, and sends through Resend without crossing the arbitrary relay. The page's three state mutations are unchanged, the bot keeps its conditioned `draft` → `submitted` update, and the deleted browser helper has no remaining caller. No BLOCKING issue was found.

BLOCKING:

- None.

SHOULD-FIX:

- [S1] `lib/bots/expense-service.ts:370` now awaits `sendExpenseSubmissionNotification()` with no delivery deadline, and `lib/email/expenseNotifications.ts:235` awaits the Resend SDK's unbounded `fetch`. Before `f29c1ce`, the bot aborted its relay request after 8 seconds. A stalled provider request can now hold the Telegram webhook until its 60-second function limit, after the expense transition has committed but before the success reply and processed-update completion. Restore a bounded bot delivery wait (while preserving soft-fail semantics), and add a fake-timer regression test proving a hung sender cannot hold `submitReport()` indefinitely. This does not block B1a because the status mutation remains conditioned/idempotent, ordinary send failures are contained, and all three live suites pass; it is nevertheless a real resilience regression in the bot flow.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- [A1] Verified at `pages/expense-reports.tsx:225-238`: the browser sends `POST /api/expense-reports/{id}/notify` with no body. At `pages/api/expense-reports/[id]/notify.ts:135-210`, the server reads the report by id, chooses the moment from stored `status`, resolves the submission recipient from fixed server configuration and the decision recipient from the owner's joined profile, then passes only stored report facts into the server-only sender. Hostile `{to, subject, html, comments}` bodies are covered by the route tests. `utils/emailUtils.ts` is deleted, and the built-client evidence contains neither the relay path, templates, nor Resend SDK.
- [A2] The per-moment authorization is sound for this phase. `submitted` requires `submitted_by === user.id`; `approved`/`rejected` requires the configured approver identity or a verified active global-admin role. Allowing any global admin is wider than today's UI, but it matches the existing `expense_reports_admin_all` database authority. Since an admin can already make the underlying decision, narrowing only the notification side effect would provide UI parity rather than a material security boundary. The owner and an unrelated non-admin are denied, recipients come from server-held state, and missing-key soft-fail is tested.
- The request cannot select a recipient, subject template, HTML template, notification kind, reviewer name, or rejection comments. User-authored report facts such as `report_name` still appear inside the fixed subject/body templates by design; HTML interpolation is escaped. That is content derived from the persisted expense record, not an arbitrary mail-envelope or template input.
- The endpoint remains replayable for a legitimate actor. `RATE_LIMITS.expensive` limits one in-process IP bucket to five calls per minute, but it is neither durable nor cross-instance and therefore must not be described as deduplication. This is an accepted residual rather than a B1a blocker: exactly-once notification requires a state-transition-linked schema/idempotency design outside this non-DB phase, and the prior open relay was materially less constrained. The durable `notified_at`/event-ledger work is correctly backlogged.
- [A3] Independently reran the three changed suites on final branch head `cdcc176`: 3 files, 47/47 tests passed (`notify` 16, `expenseNotifications` 10, `expense-service` 21). PR #30 is mergeable and all checks are green on that same head: typecheck, zero-warning lint, Vitest, pgTAP, seeded Playwright, RLS migration guard, and Vercel preview. The code commit reviewed is `f29c1ce`; the two later commits are evidence/review-request and PM-ledger documentation only.
- Scope is faithful. The relay and `test-email` route remain for B1b, no campaign work or migration is present, and the bot's direct server-side send is necessary to remove the second live expense caller from the relay.
