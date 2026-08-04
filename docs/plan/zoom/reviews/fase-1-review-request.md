# Fase 1 (Z1a) — Review request

**Phase:** Z1a — Disclosure remediation (WP-0) + auth
**Branch:** `fix/sess-leak`
**Branch point:** `959c1fe` (`fix(assessment-builder): indicator PUT camelCase mapping + review remediation (#23)`)
**`main` at PR open:** `d4a5d89` (`docs(planning): add C14 typed indicator request contract prompt`)
**Head:** `62a448d` (second-round remediation, Z1a-5)
**Commits:** 22 — 9 implementation (chunks Z1a-1/2/3) + 7 docs + 5 remediation (Z1a-4) + 1 remediation (Z1a-5)
**Diff vs branch point:** 61 files, +7427 / −769
&nbsp;&nbsp;• the Z1a-4 remediation alone (`2ef3a9e..5d117ca`): 21 files, +2176 / −665
&nbsp;&nbsp;• the Z1a-5 remediation alone (`9b8a9b9..62a448d`): 9 files, +1205 / −131

> **Figure history.** Earlier revisions of this file quoted 9 commits /
> 39 files / +3061 / −104, which was the count at chunk Z1a-3's tip
> (`edc1714`) and was never updated as the docs commits and then the
> remediation landed. At the R1-reviewed head (`4cde531`) the true figures were
> 12 commits / 43 files / +3944 / −104; at the R2-reviewed head (`2bd3211`),
> 20 commits / 55 files / +6591 / −711. The numbers above are recomputed at the
> current head with `git diff --shortstat 959c1fe...HEAD` and are re-checked at
> every chunk tip from now on rather than carried forward.

> **Ancestry note.** The phase brief quoted `d4a5d89` as the base SHA; that is
> `main`'s current head, not this branch's fork point. `main` is one commit
> ahead of the branch point, and that commit only adds a planning prompt file
> plus a few `.gitignore` / `CLAUDE.md` lines — no overlap with the files here,
> so the merge is conflict-free but **not a fast-forward**. Nothing was
> rebased: the earlier commits are recorded by SHA in the plan's PM ledger and
> rewriting them would invalidate those entries.

**Commits, newest last:**

| SHA | Chunk | Subject |
|---|---|---|
| `c06c0cd` | Z1a-1 | `fix(auth): only active role rows count for highest-role selection` |
| `db58c15` | Z1a-1 | `fix(sessions): close session-payload disclosures (WP-0)` |
| `5456b04` | Z1a-1 | `fix(hour-tracking): anchor calculateNoticeHours in Chile wall-clock` |
| `50a845e` | Z1a-2 | `feat(sessions): platform join_path replaces raw meeting_link in payloads` |
| `aa26579` | Z1a-2 | `feat(meet): SSR-gated interstitial at /meet/session/[id]` |
| `a50d9d9` | Z1a-2 | `fix(ical): platform links only, plus a real VTIMEZONE for Chile` |
| `33d0bf7` | Z1a-2 | `fix(notifications): reminder payloads carry the platform link` |
| `350e009` | Z1a-2 | `refactor(sessions): join UX links to /meet for every persona` |
| `edc1714` | Z1a-3 | `feat(auth): deep links survive the login bounce` |
| `26440dd` | Z1a-3 | `docs(review): phase Z1a review request` |
| `b244383` | Z1a-3 | `docs(planning): track the Zoom integration plan and team summary` |
| `4cde531` | Z1a-3 | `docs(review): fase-1 PM dossier + execution-ledger update` |
| `2ef3a9e` | Z1a-3 | `docs(review): archive Sol's fase-1 verdict + ledger triage update` |
| `b75aa6c` | Z1a-4 | `fix(auth): role revocation fails closed (Sol T1)` |
| `b149845` | Z1a-4 | `fix(sessions): single-report GET joins the shared disclosure policy (Sol T2)` |
| `61aa77b` | Z1a-4 | `fix(ical): ATTENDEE e-mails follow the participant-e-mail policy (Sol T3)` |
| `68934a1` | Z1a-4 | `fix(sessions): list scope = the union canViewSession grants (Sol T4)` |
| `5d117ca` | Z1a-4 | `fix(app-url): production requires a configured origin (Sol T5)` |
| `a946c52` | Z1a-4 | `docs(state): Z1a in PROJECT_STATE + review-request figures corrected (Sol T6)` |
| `2bd3211` | Z1a-4 | `docs(review): fase-1 dossier remediation record + Z1a-4 ledger approval` |
| `9b8a9b9` | Z1a-4 | `docs(review): archive Sol re-review R2 + Z1a-5 dispatch` |
| `62a448d` | Z1a-5 | `fix(auth): cached roles never authorize + batch iCal joins canonical scope` |

---

## Objective and scope

**Objective** (plan §15, Z1a row): close the pre-existing session-payload
disclosures that the Zoom work would otherwise have been built on top of, move
every meeting link behind a re-checked platform surface, and give the auth layer
the deep-link round-trip that surface needs.

**In scope — delivered (chunks Z1a-1 … Z1a-3):**

- Session detail/list GETs gated by `canViewSession` with `is_active` respected.
- Reports filtered by visibility, sharing the filter with `reports.ts`.
- `meeting_link` / `meeting_transcript` / participant e-mails stripped per policy
  across five session GETs; `has_meeting` + `join_path` returned instead.
- `/meet/session/[id]` interstitial — the single surface that reveals a legacy
  manual meeting link, re-authorized server-side on every visit.
- iCal exports carry platform links plus a tzdata-driven `VTIMEZONE` for Chile.
- Reminder / notification payloads carry the platform link (typed, so a raw-link
  regression is a compile error).
- Join UX routed through `/meet` for every persona.
- `calculateNoticeHours` anchored in Chile wall-clock (live billing bug).
- Middleware matcher extended to `/meet` + `/consultor` (session presence only);
  unauthenticated redirect carries `?next=`; login honours it behind an
  open-redirect guard; session-invalidation tests.

**Out of scope — deliberately not done:**

- Role gating for `/consultor/**` (ticketed debt; today it is client-side only).
- `getUser()` migration for SSR/API auth (separate ticket, see limitations).
- Any Zoom work — this phase is the prerequisite, not the integration.
- New join affordances on workspace/dashboard (new-product decision, deferred).

**Added by Z1a-4 (post-review remediation of the 6 REQUEST-CHANGES findings):**

- **T1 — role revocation fails closed.** A successful `user_roles` query is now
  authoritative and final; `user_roles_cache` is consulted only when that query
  ERRORS. The cache mapper no longer stamps `is_active: true` on fabricated
  rows. Cache-refresh hygiene added to `remove-role`,
  `networks/supervisors` DELETE and `delete-user`.
- **T2 — `GET /api/sessions/[id]/reports/[rid]`** joins the shared policy
  (`canViewSession` / `canViewRestrictedReports` / `canViewParticipantEmails`);
  the author's e-mail no longer leaks to GC members.
- **T3 — iCal ATTENDEE.** `createSessionCalendar` gains a fail-closed
  `includeAttendees` option; the three .ics endpoints apply the
  participant-e-mail rule (per row on the batch endpoint).
- **T4 — list scope** rebuilt as the union `canViewSession` grants, in the
  query, so list and detail agree for mixed-role users.
- **T5 — `getAppBaseUrl`** requires a configured (or deployment-derived)
  origin in production and throws rather than trusting `Host`.
- **T6 —** this file and `PROJECT_STATE.md` corrected to the shipped reality.

**Added by Z1a-5 (second-round remediation of the 2 MAJOR re-review findings —
both overturn a deviation the PM had accepted):**

- **① Cached rows never authorize.** `getHighestRole()` excluded only
  `is_active === false`, so the `is_active: null` cache rows T1 introduced still
  won the priority scan and a stale cached `admin` kept every admin grant while
  the DB was down. It now excludes `from_cache === true` outright: a cache-only
  role list resolves to `null` and each endpoint denies through its existing 403
  branch. `is_active !== false` is retained for authoritative and fixture rows.
  `from_cache` / `cached_at` are formalized on the `UserRole` type.
- **② Batch iCal joins the canonical scope.** The T4 union builder is extracted
  to `lib/utils/session-scope.ts` and consumed by both `GET /api/sessions` and
  `GET /api/sessions/ical`, replacing the export's own one-branch filter (which
  scoped from every `community_id` row with no `is_active` check). Draft
  visibility, status/date filtering and the T3 per-row ATTENDEE policy are
  unchanged.

**Z1a-5 caller audit for finding ①** — every `getHighestRole` call site, re-walked
to decide whether the stricter rule breaks a display surface badly enough to
justify a separate non-authorizing helper. **Ruling: no such helper was added.**

| Caller | Kind | Effect of the stricter rule |
|---|---|---|
| 20+ session / hour-tracking / reporting API routes, `lib/api/meetings/load-context.ts`, `lib/utils/session-meet-access.ts` | authorization | Denies during an outage. This is the fix. |
| `utils/roleUtils.ts` — `getEffectiveRoleAndStatus`, `getUserPrimaryRole`, `getUserDataScope` | authorization-derived | Return `''` / `individual` scope. Consumers are gates; denying is correct. |
| `pages/detailed-reports.tsx` | client gate | Redirects to `/dashboard`. The server endpoint denies too, so the page would have been empty regardless. |
| `components/layout/MainLayout.tsx` | display | Singular `userRole` falls back to `''`, but the sidebar evaluates its gates against the PLURAL `auth.userRoles` array, which still contains the cached role types. Nav does not collapse. |
| `pages/quiz-reviews.tsx` | display | Passes `userRole=''` to `MainLayout`; same fallback as above. Its own content comes from API calls that fail during the outage anyway. |
| `components/admin/UnifiedUserManagement.tsx` | display | Reads OTHER users' `user_roles` from the admin APIs, which query `user_roles` directly. Those rows never carry `from_cache`. **Unaffected.** |
| `contexts/AuthContext.tsx:178` | dead local | Computed and never read (`setAuthState` does not include it). No behaviour change; left alone as out of scope. |

Reachability bound: `AuthContext` sources roles from `/api/auth/my-roles`, which
queries `user_roles` directly and 500s on error — it never returns cache rows.
Only its secondary `getUserProfileWithRoles` fallback can, so the display column
above requires a double failure. `useAuthEnhanced`, `pages/dashboard.tsx` and
`pages/api/admin/check-permissions.ts` consume `getUserPermissions` /
`hasAdminPrivileges` / raw role rows and never call `getHighestRole`, so they are
untouched by this change. (`getUserPermissions` still aggregates over cached rows
without checking `is_active` — it feeds UI affordance hints, not a server gate,
and is outside both findings; flagged here rather than changed.)

---

## Files changed, grouped by risk

### Highest — auth / middleware (a mistake here locks people out or lets them in)

| File | What changed |
|---|---|
| `middleware.ts` | `?next=` on the unauthenticated redirect; `/meet` + `/consultor` added to the matcher with a session-presence-only early return; existing `/admin`, `/community/workspace`, `/school` role logic untouched |
| `lib/utils/safe-redirect.ts` | **new** — `resolveSafeInternalPath`, the open-redirect guard |
| `pages/login.tsx` | three post-login `/dashboard` pushes now honour a guarded `next`; forced flows unchanged |
| `utils/roleUtils.ts` | `getHighestRole` ignores `is_active: false` rows; **Z1a-5:** it also ignores `from_cache` rows entirely, so the degraded path grants no role at all |

### High — server-side authorization and payload shaping

| File | What changed |
|---|---|
| `lib/utils/session-disclosure.ts` | **new** — the single policy for what a caller may see of a session |
| `lib/utils/session-meet-access.ts` | **new** — SSR authorization for the interstitial; defers to `canViewSession` |
| `utils/roleUtils.ts` | `getHighestRole` ignores `is_active: false`; **Z1a-4:** `getUserRoles` fails closed on a successful-but-empty query, cache reachable only on a DB error, cached rows carry `is_active: null` + `from_cache`; **Z1a-5:** `getHighestRole` rejects `from_cache` rows, making the degraded path authorization-inert |
| `lib/utils/session-scope.ts` | **new (Z1a-5)** — the single translation of `canViewSession()` into a collection query filter (`buildSessionScope`, `hidesDraftSessions`), shared by the list GET and the batch .ics export |
| `pages/api/sessions/ical.ts` | **Z1a-5:** the bespoke role branching is replaced by the shared scope builder |
| `pages/api/sessions/[id]/index.ts` | `canViewSession` gating, link/transcript stripping, `has_meeting` + `join_path` |
| `pages/api/sessions/index.ts` | same for the list endpoint; **Z1a-4:** query scope rebuilt as the `canViewSession` union via `.or(...)` |
| `pages/api/sessions/[id]/reports.ts` | visibility filter shared with `reports.ts` |
| `pages/api/sessions/[id]/reports/[rid].ts` | **Z1a-4:** inline authz replaced by the shared context; author e-mail redacted |
| `pages/api/sessions/[id]/attendees.ts` | participant e-mail stripping; real facilitator lookup |
| `pages/api/sessions/[id]/materials.ts` | disclosure policy applied |
| `pages/api/admin/remove-role.ts`, `pages/api/admin/networks/supervisors.ts`, `pages/api/admin/delete-user.ts` | **Z1a-4:** `refresh_user_roles_cache()` after a revocation (hygiene, not the mechanism) |

### Medium — SSR pages and outbound artifacts

| File | What changed |
|---|---|
| `pages/meet/session/[id].tsx` | **new** — the interstitial; unauthenticated redirect now carries `next` |
| `lib/utils/session-ical.ts`, `pages/api/sessions/**/ical.ts` | platform links + real `VTIMEZONE`; **Z1a-4:** fail-closed `includeAttendees`, per-endpoint (and per-row) e-mail policy, `canViewSession` on the single endpoint |
| `lib/utils/app-url.ts` | **new** — absolute-URL helper for artifacts that leave the browser; **Z1a-4:** production requires a configured/deployment origin and throws otherwise |
| `lib/notificationEvents.ts`, `pages/api/cron/session-reminders.ts` | `join_url` instead of the raw link |
| `lib/types/consultor-sessions.types.ts` | typed so raw-link regressions fail the type-check |
| `lib/services/hour-tracking.ts` | `calculateNoticeHours` anchored via `getSessionDateTime` |

### Low — client surfaces

`pages/admin/sessions/[id].tsx`, `pages/consultor/sessions/[id].tsx`,
`components/sessions/EditRequestModal.tsx` — join buttons point at `/meet`.

### Tests and dependencies

18 test files (11 new, 7 extended); `package.json` / `package-lock.json` gain
`@touch4it/ical-timezones` for the Chile `VTIMEZONE`.

---

## Test evidence

Gates run locally on `62a448d`; CI runs all six on the PR.

| Gate | Result |
|---|---|
| `npm run type-check` | clean |
| `npm run lint` (zero warnings) | clean |
| `npm test` | **2735 passed / 2735** across **211 files** |
| `npm run build` | success; `/meet/session/[id]` present as a dynamic SSR route; middleware bundle 73.7 kB |
| `npm run test:db` | not run locally — no migrations in this phase; CI runs `supabase test db` anyway |
| `npm run e2e` | not run locally — no seeded Supabase env on this machine; relying on the PR's CI e2e gate |

Growth across the phase (each figure from a full-suite run at that chunk's tip):

| Chunk | Tests | Files |
|---|---|---|
| Z1a-1 (`5456b04`) | 2544 | 200 |
| Z1a-2 (`350e009`) | 2590 | 202 |
| Z1a-3 (`edc1714`) | 2641 | 204 |
| Z1a-4 (`5d117ca`) | 2697 | 208 |
| Z1a-5 (`62a448d`) | 2735 | 211 |

Every Z1a-4 suite was proved to FAIL on the reviewed head before its fix
landed (implement test → revert the fix → record the failure count → restore):

| Finding | New/changed tests | Failing on `4cde531` |
|---|---|---|
| T1 role revocation | `role-revocation-fail-closed.test.ts` (10) | 7 failed / 3 passed |
| T2 report author e-mail | `report-detail-disclosure.test.ts` (10) | 2 failed / 8 passed |
| T3 iCal ATTENDEE | `ical-attendee-disclosure.test.ts` (12) + `session-ical.test.ts` | 4 failed |
| T4 list scope union | `sessions-list-scope-union.test.ts` (12) | 5 failed / 7 passed |
| T5 absolute URL | `app-url.test.ts` (17) | 9 failed / 8 passed |

Z1a-5 repeats the protocol against the RE-reviewed head (`9b8a9b9`), reverting
one fix at a time so each finding's proof is isolated
(`git checkout 9b8a9b9 -- <file>` → run → restore):

| Finding | Reverted file | New/changed tests | Failing on `9b8a9b9` |
|---|---|---|---|
| ① cached rows authorize | `utils/roleUtils.ts` | `cached-roles-never-authorize.test.ts` (10) | 8 failed / 2 passed |
| ① (same revert) | `utils/roleUtils.ts` | `role-revocation-fail-closed.test.ts` (10, 2 rewritten) | 2 failed / 8 passed |
| ② batch iCal scope | `pages/api/sessions/ical.ts` | `ical-scope-union.test.ts` (13) | 6 failed / 7 passed |
| — | — | `session-scope.test.ts` (15) | n/a — covers a module that does not exist on `9b8a9b9` |

The two `role-revocation-fail-closed` cases that flip are the ones Z1a-4 wrote
to *codify* the now-overturned semantics (`getHighestRole(cachedRows) ===
'consultor'`, and the denial arriving from `canViewSession` rather than from the
role gate). They are rewritten to the new policy, not weakened: both still
assert a 403, one gate earlier.

Suites added or extended in this phase:

- `__tests__/api/sessions/session-detail-disclosure.test.ts` (new, +717 lines)
- `__tests__/lib/utils/session-disclosure.test.ts` (new, 345 lines)
- `__tests__/lib/utils/session-meet-access.test.ts` (new, 271 lines)
- `__tests__/api/hour-tracking/notice-hours-timezone.test.ts` (new, 16 cases;
  verified under `TZ=UTC`, `America/Santiago`, `Europe/Madrid`)
- `__tests__/lib/utils/app-url.test.ts` (new)
- `__tests__/lib/utils/safe-redirect.test.ts` (new, 32 cases — attack vectors:
  `//evil.com`, `/\evil.com`, `https://evil.com`, `javascript:`, `data:`,
  tab/newline/CR/NUL smuggling, the decoded form of `%2F%2Fevil.com`, non-string
  and repeated-param inputs)
- `__tests__/pages/meet/session-ssr.test.ts` (new, 5 cases — SSR mapping incl.
  the `next=` round-trip)
- `__tests__/middleware.test.ts` (10 → 24 cases)
- `__tests__/api/sessions/session-ical-export.test.ts`,
  `session-notifications.test.ts`,
  `__tests__/pages/consultor/sessions/detail.test.tsx` (extended)

Z1a-5 adds:

- `__tests__/api/sessions/cached-roles-never-authorize.test.ts` (new, 10 cases
  — real boundary again: Supabase mocked, `roleUtils` not, so the cache
  fallback is exercised through `getUserRoles()` itself. Covers detail, list,
  report disclosure, single iCal, batch iCal and the `/meet` resolver)
- `__tests__/api/sessions/ical-scope-union.test.ts` (new, 13 cases — asserts the
  filter that reaches Supabase from BOTH collection endpoints and compares them
  directly, so a future divergence fails the build)
- `__tests__/lib/utils/session-scope.test.ts` (new, 15 cases — the shared
  builder in isolation, including the interpolation guard the endpoint tests
  cannot reach)
- `__tests__/api/sessions/role-revocation-fail-closed.test.ts` — 2 assertions
  rewritten to the Z1a-5 policy (see the proof table above)

Z1a-4 adds:

- `__tests__/api/sessions/role-revocation-fail-closed.test.ts` (new, 10 cases —
  asserted at the real boundary: the Supabase client is mocked, `roleUtils` is
  NOT, so the fail-closed rule is exercised through `getUserRoles` itself)
- `__tests__/api/sessions/report-detail-disclosure.test.ts` (new, 10 cases)
- `__tests__/api/sessions/ical-attendee-disclosure.test.ts` (new, 12 cases —
  assertions run against the full serialized .ics per endpoint)
- `__tests__/api/sessions/sessions-list-scope-union.test.ts` (new, 12 cases —
  asserts the filter that reaches Supabase, not only the rows returned)
- `__tests__/lib/utils/app-url.test.ts` (5 → 17 cases)
- `lib/utils/__tests__/session-ical.test.ts` — the case asserting the ATTENDEE
  e-mail leak as desired behaviour is **rewritten** to the new policy
  (fail-closed default + privileged opt-in), not weakened
- `__tests__/api/sessions/sessions-gc-member.test.ts` — rewritten onto a
  recording stub; the old one hardcoded the exact `in → neq → range → order`
  chain and used non-UUID community ids. Every behavioural assertion preserved
- `__tests__/api/sessions/reports-detail.test.ts`,
  `__tests__/api/admin/remove-role.test.ts`,
  `__tests__/api/admin/delete-user.test.ts` (extended — the last two now assert
  the cache refresh)

---

## Where an independent reviewer should push hardest

1. **`middleware.ts` — the session-presence-only early return.** It returns
   before every role block, so if either prefix ever needs role gating the
   exemption has to be revisited, not extended. I used exact-or-slash matching
   (`=== '/meet' || startsWith('/meet/')`) rather than `startsWith('/meet')`
   precisely so a future `/meetings` page cannot silently inherit the exemption
   — worth confirming that reads as intended, and that `/consultor` being
   client-side-gated-only is genuinely acceptable until the ticketed SSR work
   lands. This is the file CLAUDE.md flags as the most bug-prone in the repo.

2. **`resolveSafeInternalPath` — is the deny-list actually complete?** It is a
   guard on attacker-controlled input, so the interesting question is what gets
   through, not what is blocked. I layered four syntactic checks plus a URL-parse
   origin check; the judgment call is that the input arrives *already
   percent-decoded once* (that is what `router.query.next` delivers), so
   double-decoding tricks are out of scope by construction. If any caller ever
   passes a raw, still-encoded value, that assumption breaks.

3. **Which login branches honour `next` — and which must not.** Three of the
   eight redirect sites consult it; the forced flows (change-password, profile
   completion) deliberately ignore it so a crafted URL cannot skip them. The
   mount-time branch (`useEffect`, already-authenticated) also honours `next`,
   which is worth a second opinion: it does not consult `must_change_password`
   — but neither did the pre-existing code that pushed to `/dashboard` there, so
   this changes the destination, not the enforcement. Verify I read that
   correctly.

4. **`session-disclosure.ts` as a single policy with several callers.** Five
   GETs now share it. The risk is a caller that forgets to apply it, or applies
   it after already having leaked into a nested object. Worth grepping the
   session endpoints for any payload path that bypasses the helper.

5. **The `is_active` semantics I chose.** Both `getHighestRole` and the meet
   resolver treat `is_active !== false` as active, so a `null` reads as active.
   *(Z1a-4: the reviewer was right that this was load-bearing. Z1a-5: the
   leniency is now unreachable in the app — the cache was the only producer of
   `null`, and cached rows are rejected before the `is_active` test. What
   remains is defense-in-depth for fixture-assembled role lists.)*

6. **`getUserRoles`' degraded path — what the fallback is still FOR (Z1a-5).**
   The residual risk flagged here in Z1a-4 (a stale cached `admin` still
   yielding `highestRole === 'admin'`) is closed: `getHighestRole` skips
   `from_cache` rows, so during a DB outage every authorization gate denies with
   403 "Usuario sin roles asignados". The fallback itself is deliberately kept,
   which is the part worth a second opinion: it now returns rows that authorize
   nothing, so its only remaining job is to keep the signed-in shell coherent
   (`getUserPermissions`, the dashboard's community list). If a reviewer thinks
   a fallback with no authorization power is dead weight, deleting it is a
   one-line change — I kept it because removing it also removes the "stay signed
   in during an outage" property, and that is an availability decision, not a
   security one.

7. **The `.or()` scope string, now shared (Z1a-4 → Z1a-5).**
   `lib/utils/session-scope.ts` builds the scope filter by string
   interpolation. School ids are coerced through `Number.isFinite` and community
   ids through `Validators.isUUID` before they reach the string, and both come
   from `user_roles` rather than from the request — but this is the one place in
   the phase where a filter is assembled textually, and it is now consumed by
   two endpoints instead of one, so a hole here is twice as wide.
   `__tests__/lib/utils/session-scope.test.ts` pins the guard directly.

8. **Whether extracting the scope builder changed anything by accident
   (Z1a-5).** The batch .ics export previously had its own branching, including
   two early "empty calendar" returns and a `neq('status','borrador')` reachable
   only in the non-consultor branch. I claim the draft rule is unchanged (both
   old and new hide drafts from exactly "not admin and not consultor") and that
   the only behavioural deltas are the intended ones: `is_active` is now
   honoured, and consultors get the community half of the union. Worth checking
   that claim against the diff rather than the prose — the status/date filters,
   the 100-row cap and the per-row ATTENDEE policy downstream were not meant to
   move at all.

9. **The two rewritten Z1a-4 assertions (Z1a-5).** Rewriting a test that a
   previous chunk wrote deliberately is exactly the move a reviewer should
   distrust. Both live in `role-revocation-fail-closed.test.ts`, both still
   assert a 403, and the change is *which gate* denies — but please confirm
   they were tightened rather than relaxed.

10. **`user_roles_cache` is a materialized view** (`baseline.sql:11406`), so
    it cannot carry RLS, and it is `GRANT ALL … TO anon, authenticated`. Its
    refresh trigger on `profiles` only calls `pg_notify`; nothing listens. Out
    of scope here (no migrations in this phase) but flagged — see PROJECT_STATE
    debts.

---

## Known limitations and deferred items

- **Privileged callers still receive the raw `meeting_link`** — by design. The
  disclosure policy strips it from everyone else; the interstitial exists so
  even privileged access is re-checked at view time rather than frozen into an
  artifact.
- **No join affordance on workspace/dashboard.** Those surfaces never had one;
  adding it is a new-product decision, deferred out of a remediation phase.
- **Platform-wide cookie-`getSession()` auth debt.** Every SSR page and API
  route in the repo (including the new ones) trusts the cookie session rather
  than calling `getUser()`. Migrating is a separate ticket; this phase did not
  widen the debt but did not close it either.
- **E2E specs for these surfaces are skipped stubs until Z1c.** `/meet`, the
  login `next=` round-trip and the middleware deep-links are covered by unit and
  SSR tests only; browser-level coverage lands with Z1c.
- **`/consultor/**` has no server-side role gating.** The middleware now
  requires a session, which is strictly more than before, but role enforcement
  is still client-side. Ticketed as post-Z2 debt.
- **Global consultors (`school_id` NULL) receive participant e-mails** —
  consistent with the existing `canViewSession` model; zero such rows in
  production today. Flagged for Brent as a product question, not a defect.
- **`NEXT_PUBLIC_BASE_URL` (or `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL`)
  must be set in Vercel prod — this is now a hard requirement, not advice.**
  Since Z1a-4, `getAppBaseUrl` THROWS in production when no configured origin
  is present and `VERCEL_PROJECT_PRODUCTION_URL` is unset; it no longer falls
  back to the client-controlled `Host` header. **Action for Brent before
  merge:** confirm one of those vars is set on the production environment.
  `VERCEL_PROJECT_PRODUCTION_URL` is injected by Vercel by default, so this is
  expected to be satisfied already, but it has not been verified from here.
- **`getUserRoles` degraded-path admin risk** — **closed in Z1a-5**; the
  fallback survives with no authorization power. See "push hardest" item 6.
- **Sol's group-2 acceptance criterion is met by a stronger outcome than the
  one written.** The dispatch asked for "batch iCal returns an empty calendar,
  zero session metadata" on an authoritative error plus a stale cached community
  row. With finding ① fixed, that input never reaches the scope builder — the
  request is denied at the `highestRole` gate with a 403 instead. Both the
  denial and the zero-metadata requirement are asserted; the 200-empty-calendar
  shape is asserted separately on the input that still reaches it (an active
  role that simply grants no session scope).
- **No migrations in this phase**, so `test:db` was not run locally; CI's pgTAP
  gate is the verdict. The `user_roles_cache` findings in Z1a-4 are handled in
  application code for exactly this reason; the schema-level fix is a debt.
