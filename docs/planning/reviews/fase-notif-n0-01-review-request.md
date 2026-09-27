# NOTIF N0-01 — review request (r3, current-main rebuild)

**Unit:** NOTIF-01 (ledger item N0-01), order `order-r3.md`. Initial execution r0 (`pm-review-r0.md`), remediations r1/r2 (`pm-review-r1.md`, `pm-review-r2.md`, APPROVED_WITH_NOTES on `ws/notifications`). r3 ports the same bounded behaviour to fetched `origin/main` because `pm-ship` could not apply the old branch chain.
**Branch:** `fix/notif01-main` · **Base/HEAD:** `a1bf4005c1bbbe756e7c52fac4aa603434f6463c` · **Commits:** 0. The order prohibits git add/commit, so all changes are uncommitted working-tree edits on exactly the seven allowlisted paths.

## Objective (from the order)
Contain the live feedback notification relay: authenticate its caller, derive active admin recipients and generic safe text from the persisted feedback row, accept only `feedback_id` from the browser, and add `NOTIFICATION_EMAIL_ENABLED` to the existing immediate-email path. Unset keeps current mail; explicit off suppresses immediate mail while in-app preference behaviour is unchanged.

**Scope in:** `pages/api/feedback/notify-admins.ts`, `components/feedback/FeedbackModal.tsx`, `lib/notificationService.ts`, the two Vitest files, the scoped Playwright spec, this file.
**Scope out:** messaging (N0-02), DB grants/RLS (N0-03), schema, outbox, template redesign, other producers, real email, dependency or workflow changes, pre-existing untracked ledger/plan files.

## How the port was done
`git diff c1a404ebe a1bf4005c` is empty for all seven paths: current main never touched them after the old base, and the only main changes since then are the login-page rewrite, its e2e spec and unrelated pgTAP/docs. The six code/test paths therefore carry the prior reviewed content, applied as a working-tree patch (no cherry-pick, no history, nothing staged), then checked against current-main callers: the modal is still the route's only client, `lib/api-auth` still exports the four helpers the route uses, `lib/email/notifications` and `tests/e2e/helpers/auth` are unchanged, and the rewritten login page still lands seeded fixtures on `/dashboard` (proven by the browser run below). Nothing else needed adapting.

## Files by risk
**High (authority and outbound mail)**
- `pages/api/feedback/notify-admins.ts`: rewritten. getApiUser (401) → forced-password-change gate → `feedback_id` UUID validation (400) → service-role read of `platform_feedback` `id, created_by, type` (500/404) → creator check (403) → active `admin` role rows (500 / 200-zero) → `triggerNotification('new_feedback', { feedback_id, feedback_type, feedback_preview: "Nuevo reporte de tipo <label>", assigned_users })`. All errors are generic es-CL; the unexpected-exception log is a constant line.
- `lib/notificationService.ts`: `sendImmediateEmail` returns `{ sent: false, status: 'disabled' }` before the recipient lookup or provider when `NOTIFICATION_EMAIL_ENABLED` is `off`/`false`/`0` (trimmed, case-insensitive); unset or any other value keeps mail on. `triggerNotification` no longer logs `eventData` (recipient ids). Every log line the `new_feedback` path can reach that printed a raw error or a recipient id is constant text plus at most `loggableError(error)`, which keeps only a SQLSTATE/PostgREST-shaped `code`. Return values and fallbacks are unchanged for every event.

**Medium**
- `components/feedback/FeedbackModal.tsx`: posts `{ feedback_id }` only; the client-side `profiles` and `user_roles` reads are gone.

**Tests**
- `__tests__/api/feedback/notify-admins.test.ts` (new, 41 tests): drives the real handler and the real notificationService through the real `sendNotificationEmail`/`authorizeUserEmail`; fakes are identity, one in-memory DB and the transport. Covers D1 (derivation, wording per type), D2 (401/403/forced-password/tampered payload/DB template), D3 (400/404/405/zero admins/500s), D5 (provider refusal, transport exception) and the r1/r2 log-safety fault injections (returned and thrown errors bearing a synthetic credential, admin UUID and address at every reachable branch).
- `__tests__/lib/notificationService.email.test.ts` (+16 tests, 38 total): D4 flag matrix (unset/on/true/empty keep mail; off/false/0/OFF/" False " suppress before any lookup; in-app × email combinations with the switch off), D5 refusal, two log-safety cases.
- `tests/e2e/feedback-notify-admins.spec.ts` (new, 2 tests): UI1 desktop 1366×768, UI2 mobile 390×844, seeded synthetic personas only.

## Test evidence
- Focused: `mise exec node@22.16.0 -- npx vitest run __tests__/api/feedback/notify-admins.test.ts __tests__/lib/notificationService.email.test.ts` → 79 passed (41 + 38).
- Full gates: untouched-main baseline and exact final-state counts are in `RUN/evidence/baseline.md` (r3 section) and `RUN/executor-report-r3.md`. The build runs with synthetic loopback public env on the command line (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421`, a non-secret placeholder anon key); no `.env*` is read.
- Browser: `pm-unit ui-run NOTIF-01 --paths-file commit-paths.txt -- npx playwright test tests/e2e/feedback-notify-admins.spec.ts` → 2 passed on the local stack (port 3104). Screenshots, `ui-evidence.json` and traces are under `RUN/ui/<run>/`; the run ids are in the executor report.

## Scrutinize hardest
1. **The browser never lets the modal's real notify request reach the success path.** UI1 aborts it after checking the body is exactly `{feedback_id}`; UI2 rewrites it to an absent id (404). The local `.env.development.local` may hold a provider key and cannot be read, so an unscoped admin submit could be a real mail. The success path is proven only by the route test through the real handler and real mail pipeline with a fake transport.
2. **Recipient derivation includes the creator if they are an admin**, as before. Re-posting the same id sends again once the minute-granular idempotency key rolls over; no freshness window on the row. Routed to N2-01 in r0.
3. **Wording:** `lib/notificationEvents.ts` (not allowlisted) appends `...` to `feedback_preview`, so the description reads "Nuevo reporte de tipo Problema...". Title is the generic "Nuevo feedback recibido".
4. **Log hygiene is shared with every event.** The change only removes data from log output; `getRecipients`'s catch stays raw because its `new_feedback` branch only loops over the route-built id array. `logNotificationEvent` still writes eventData (admin ids) to the audit RPC — a DB write, not a log (N2-01).
5. **Kill-switch semantics:** only `off`/`false`/`0` disable; a typo keeps mail ON, deliberately (plan: defaults ON when unset).
6. **Port method:** a content patch rather than a hand retype. Correct only because the seven paths are byte-identical between the old base and current main (verified); the reviewer should confirm that diff is empty.

## Known limitations / deferred
- No commit (order). This file cannot be "committed with the phase" by the executor.
- The browser runs create synthetic `platform_feedback` rows through the product UI on the local stack. Every r3 row is listed in `RUN/fixtures-manifest.json` and deleted by exact id, owner and marker on 127.0.0.1:54422 after the last executor run, with before/after receipts under `RUN/evidence/`.
- `pm-unit ui-run` runs Playwright as `npx playwright test` under the ambient node, not under the `mise` prefix.
- During the r3 desktop journey the browser console showed a transient PostgREST `PGRST303 JWT issued at future` plus two 401s right after login (local stack clock skew); the journey still landed, persisted and reloaded correctly. Not caused by these files; noted for the PM's independent journey.
