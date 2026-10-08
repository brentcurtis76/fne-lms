# NOTIF-20 (N4-02) — review request: notification settings page

- **Branch:** `fix/notif20-rebuild` · **base/HEAD:** `3279712e525cf7cec4031e4e12422c28a6aba037` (accepted N4-01 rebuild on
  current main `d0e72ebdc`) · **commits:** 0 (uncommitted working tree; the PM commits on acceptance).
- **Objective (orders r0, r1, r2; r3 rebuild):** the authenticated es-CL page `/configuracion/notificaciones` and the `/configuracion` redirect, on
  N4-01's owner-only API. Users inspect the categories that apply to them and save/reload their email choice; the unavailable
  daily digest is never selectable; mandatory and legacy suppression are preserved and delivery limits are explained truthfully.
- **In scope:** the two pages, a Vitest suite through the real getServerSideProps and page, a Playwright spec on the real app,
  the CI mandatory-spec list, the N4-01 API spec's port guard (r1, N20-F1), this file and `PROJECT_STATE.md`.
- **r1 remediation (pm-review-r0):** N20-F1 — the N4-01 API spec now refuses the default ports only outside CI. N20-F2 — a
  stored digest while the digest is off shows as a neutral disabled "Opción anterior (se envía de inmediato)"; no option says
  Resumen diario.
- **r2 remediation (pm-review-r1):** N20-F3 — quiz reviewers now include equipo_directivo, matching the pending-quiz producer
  and its access check; group consultants stay admin/consultor.
- **r3 rebuild (same unit):** the reviewed r2 change (old commit `5e5b2bd4a`, used as reference only) redone on the accepted
  N4-01 base. No file the page or tests import differs between the two bases (`git diff 5e5b2bd4a^ 3279712e5` is empty for
  `lib/api-auth.ts`, `lib/auth`, `lib/notifications`, `lib/notificationEvents.ts`, `lib/notificationService.ts`, `lib/email`,
  `components/layout`, `hooks`, `types`, `middleware.ts`, `pages/api/quiz-reviews`, `pages/api/assignments`), so the pages and
  both test files are the reviewed r2 content. Merged by hand into current-main state: the two specs are appended to the
  current `MANDATORY_SPECS` (which gained the finance and document-links specs) and the `PROJECT_STATE.md` section is added
  above the current N4-01 rebuild entry; nothing else in either file changes.
- **Out of scope:** entry points and admin-tab retirement (N4-03), API/schema/RLS/sender changes, digest scheduler and hour
  (N5-01), real email, flag activation, refactors, release.

## How it works
- **getServerSideProps:** `getServerSideUser` (auth server, never the cookie's user) → no user: `/login?next=…`. Then
  `getForcedPasswordChangeVerdict` on the service role → `/change-password` (or `?estado=no-verificado` when unreadable). Then
  the caller's active `user_roles` (`role_type, school_id, community_id`) and `profiles.can_run_qa_tests`, both filtered by the
  verified id. Props: `ownerId` and the applicable categories with their applicable events and labels; `null` on a read error.
- **Browser:** GET/PUT `/api/user/notification-preferences` only (type-only imports of the API types). PUT sends only shown
  categories whose choice changed; hidden and unchanged rows (a stored `digest` included) are never sent. A request counter
  drops stale answers; a session that changes or ends in another tab (`useSessionContext` user ≠ `ownerId`) clears the page.

## Role/scope mapping (presentation only; grants nothing)
| Audience (catalog) | Shown when | Source |
|---|---|---|
| assigned_users, student, group_invitees, all_active_users | any active role | getRecipients: individual assignees of any role |
| message_recipient, mentioned_user, meeting_recipients | admin, a role with `community_id`, or consultor with `school_id` | `can_access_workspace` |
| session_participants | admin, consultor, or a role with `community_id` | `canViewSession` (facilitators + community attendees) |
| edit_requester | admin or consultor | session facilitator (role-level approximation) |
| group_consultants | admin or consultor | `submit-group.ts` recipients, notification-access `groupConsultantAccess` (role-level; assignment not looked up) |
| quiz_reviewers | admin, consultor or equipo_directivo | `REVIEWER_ROLES` in `quiz-reviews/notify-pending.ts` and notification-access `quizReviewerAccess` (role-level; assignment not looked up) |
| admins | admin | `getLicitacionRecipients`, notification-access `adminOnly` |
| tester | admin or `can_run_qa_tests` | notification-access `testerAccess` |
| school_encargados / …_and_admins | encargado_licitacion with `school_id` (/ or admin) | `getLicitacionRecipients` |
| unwired | never | no recipient rule (`learning_path_assigned`) |

`Record<Audience, …>` makes a new audience a type error until it is mapped. A category is shown when any of its events applies.

## Files, by risk
- **High — auth boundary:** `pages/configuracion/notificaciones.tsx` (new, 432 lines incl. ~150 of JSX): SSR auth/forced-password,
  role/scope mapping, page state. `pages/configuracion/index.tsx` (new, redirect only).
- **Medium — CI:** `scripts/ci/e2e-mandatory.mjs`: both notification specs added to `MANDATORY_SPECS`.
  `tests/e2e/notification-preferences-api.spec.ts` (N4-01): one-line guard change, `!process.env.CI &&` as in the page spec.
- **Tests:** `__tests__/pages/notification-settings.test.tsx` (new, 45 tests), `tests/e2e/notification-settings.spec.ts` (new, 3 tests).
- **Docs:** this file, `PROJECT_STATE.md` (one section). `middleware.ts` is unchanged (see scrutiny 1).

## Test evidence
- Focused `npx vitest run __tests__/pages/notification-settings.test.tsx`: 45 passed (D1 6; D2 22 server incl. 14 role cases + 4 reviewer-event cases + 4 page; D3 5; D4 8).
  Eight hand mutants (stale-read guard, unwired audience, forced-password check, send-all, community attendees, digest offered,
  save enabled while saving; r1: the stored-digest option labelled "Resumen diario (no disponible)"; r2: quiz reviewers without
  equipo_directivo) each fail 1–5 tests.
- Guard proof (r1, both specs' beforeAll, bogus keys, no web server; `runs/NOTIF-20/evidence/guard/`): no CI + 54321 or
  54322 → "refuses the shared default stack"; CI + 10.255.255.1:54321 → "refuses a non-local database"; CI + 127.0.0.1:54322
  → guard passes, the first request fails (`fetch failed`).
- Playwright via `pm-unit ui-run` (r3: new private `notif20r3` stack, API 56521 / DB 56522, app :3109; r0–r2: `notif20`,
  55521/55522, :3107): page spec 3 passed + N4-01 API spec 2 passed. Desktop 1366×768 (A: consultor + encargado of a synthetic school): signed-out redirect, loading, scoped
  categories, mandatory, legacy, keyboard save, reload, Predeterminado, failed save, read error + retry, forced password.
  Mobile 390×844 (B: docente, with a stored advisory digest): the neutral disabled option, no "Resumen diario" option, the
  digest row kept by an unrelated save; own settings only, save, no overflow, a cookie naming A with B's token shows nothing of A's,
  a revoked token goes to login, no pending-quiz event. Desktop (r2, C: equipo_directivo of the school): pending-quiz event shown,
  group submissions and sessions not. Fixtures deleted by exact id (school, users, roles, rows); zero remain.
- Type-check, lint, `npm test`, build, CI list: see the executor reports (`runs/NOTIF-20/executor-report-r0.md` … `-r3.md`;
  r3 measured on this base, baseline in `runs/NOTIF-20/evidence/baseline.md` § r3). The bare `npm run build` fails at base
  and after for missing public Supabase env only; the synthetic loopback public-env build passes.

## Scrutinize hardest
1. **No middleware change.** Adding `/configuracion` to `config.matcher` alone does nothing (the gate checks
   `GATED_PAGE_PREFIXES` in `lib/auth/forced-password-change.ts`, outside the allowlist) and fails the existing
   "matcher contains nothing that is not gated" test. The page applies the same verdict itself. A revoked cookie is not expired
   by the page; `/login` verifies and clears it (exercised in the e2e). PM r0: SSR enforcement satisfies D1; middleware
   defence in depth (prefix in both lists) is an advisory for N4-03. No matcher was added.
2. **CI port guard (r1).** Both specs now accept 54321/54322 when `CI` is set (GitHub Actions sets `CI=true`; there the
   default ports are the runner's own `supabase start`). Locally they still refuse them, and a non-local host is refused
   everywhere. Anyone running locally with `CI` set against the shared stack would bypass the refusal.
3. **Role mapping approximations:** edit requester, group consultants (admin/consultor) and quiz reviewers
   (admin/consultor/equipo_directivo, r2) are role-level (no assignment lookup); all affect events inside categories every user already sees except sessions. Attendees from a school-only role
   (equipo_directivo) do not see sessions, matching `canViewSession`.
4. **Session change detection** compares the browser session's user with the SSR owner. A legacy cookie naming another user
   therefore shows "Tu sesión cambió" instead of the owner's settings (safe, but a reload loops to the same panel).
5. **Stored digest while the flag is off** is shown as a disabled, neutral "Opción anterior (se envía de inmediato)" option so
   the select keeps the stored value; it is never sent unless the user changes it, and once changed away it cannot be chosen
   again. The note under the category still names the earlier Resumen diario choice to explain it.

## Known limitations / deferred
- No digest hour is stored or shown as configurable (N5-01); the text says so when the digest is available.
- `address_suppression` is `unavailable` locally (no `NOTIFICATION_SUPPRESSION_SECRET`); `suppressed`/`clear` are unit-tested.
- Cross-tab sign-out is unit-tested only; auth-helpers' cookie storage gives no reliable cross-tab event to drive in Playwright.
- Some registry titles lack accents ("Manana vence plazo…"); they come from `lib/notificationEvents.ts`, not this unit.
- Entry points (bell gear, `/notifications` cog, Mi Perfil, email footers) and admin-tab retirement: N4-03.
