# Fase 1 (Z1a) — Review request

**Phase:** Z1a — Disclosure remediation (WP-0) + auth
**Branch:** `fix/sess-leak`
**Branch point:** `959c1fe` (`fix(assessment-builder): indicator PUT camelCase mapping + review remediation (#23)`)
**`main` at PR open:** `d4a5d89` (`docs(planning): add C14 typed indicator request contract prompt`)
**Head:** `5d117ca` (post-review remediation, Z1a-4)
**Commits:** 18 — 9 implementation (chunks Z1a-1/2/3) + 4 docs + 5 remediation (Z1a-4)
**Diff vs branch point:** 55 files, +6112 / −711
&nbsp;&nbsp;• code + tests only (excluding `docs/`): 50 files, +5179 / −711
&nbsp;&nbsp;• the Z1a-4 remediation alone (`2ef3a9e..HEAD`): 21 files, +2176 / −665

> **Figure history.** Earlier revisions of this file quoted 9 commits /
> 39 files / +3061 / −104, which was the count at chunk Z1a-3's tip
> (`edc1714`) and was never updated as the docs commits and then the
> remediation landed. At the reviewed head (`4cde531`) the true figures were
> 12 commits / 43 files / +3944 / −104. The numbers above are recomputed at
> the current head with `git diff --shortstat 959c1fe...HEAD`.

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

---

## Files changed, grouped by risk

### Highest — auth / middleware (a mistake here locks people out or lets them in)

| File | What changed |
|---|---|
| `middleware.ts` | `?next=` on the unauthenticated redirect; `/meet` + `/consultor` added to the matcher with a session-presence-only early return; existing `/admin`, `/community/workspace`, `/school` role logic untouched |
| `lib/utils/safe-redirect.ts` | **new** — `resolveSafeInternalPath`, the open-redirect guard |
| `pages/login.tsx` | three post-login `/dashboard` pushes now honour a guarded `next`; forced flows unchanged |
| `utils/roleUtils.ts` | `getHighestRole` ignores `is_active: false` rows |

### High — server-side authorization and payload shaping

| File | What changed |
|---|---|
| `lib/utils/session-disclosure.ts` | **new** — the single policy for what a caller may see of a session |
| `lib/utils/session-meet-access.ts` | **new** — SSR authorization for the interstitial; defers to `canViewSession` |
| `utils/roleUtils.ts` | `getHighestRole` ignores `is_active: false`; **Z1a-4:** `getUserRoles` fails closed on a successful-but-empty query, cache reachable only on a DB error, cached rows carry `is_active: null` + `from_cache` |
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

Gates run locally on `5d117ca`; CI runs all six on the PR.

| Gate | Result |
|---|---|
| `npm run type-check` | clean |
| `npm run lint` (zero warnings) | clean |
| `npm test` | **2697 passed / 2697** across **208 files** |
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

Every Z1a-4 suite was proved to FAIL on the reviewed head before its fix
landed (implement test → revert the fix → record the failure count → restore):

| Finding | New/changed tests | Failing on `4cde531` |
|---|---|---|
| T1 role revocation | `role-revocation-fail-closed.test.ts` (10) | 7 failed / 3 passed |
| T2 report author e-mail | `report-detail-disclosure.test.ts` (10) | 2 failed / 8 passed |
| T3 iCal ATTENDEE | `ical-attendee-disclosure.test.ts` (12) + `session-ical.test.ts` | 4 failed |
| T4 list scope union | `sessions-list-scope-union.test.ts` (12) | 5 failed / 7 passed |
| T5 absolute URL | `app-url.test.ts` (17) | 9 failed / 8 passed |

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
   That matches the existing data but is a deliberate leniency, and it decides
   whether a revoked role still sees a session. *(Z1a-4: the reviewer was right
   that this was load-bearing. `getUserRoles` now fails closed, so the only
   producer of `is_active: null` rows is the cache fallback, reachable only on
   a DB error — see item 6.)*

6. **`getUserRoles`' degraded path (Z1a-4).** When the authoritative
   `user_roles` query ERRORS, the `user_roles_cache` materialized view is still
   consulted so an outage does not sign everyone out. Those rows now carry
   `is_active: null` + `from_cache: true`, which is falsy for `getConsultorAccess`
   and `canViewSession`'s GC branch — so they grant no school or community
   scope — but `getHighestRole` still reads them (`!== false`). **Residual
   risk:** a stale cached `admin` row would therefore still yield
   `highestRole === 'admin'` during a DB outage. Closing that means dropping
   the fallback entirely, which is a product/availability call rather than a
   remediation one. Worth a second opinion.

7. **The `.or()` scope string (Z1a-4).** `pages/api/sessions/index.ts` now
   builds its scope filter by string interpolation. School ids are coerced
   through `Number.isFinite` and community ids through `Validators.isUUID`
   before they reach the string, and both come from `user_roles` rather than
   from the request — but this is the one place in the phase where a filter is
   assembled textually, so it deserves a look.

8. **`user_roles_cache` is a materialized view** (`baseline.sql:11406`), so it
   cannot carry RLS, and it is `GRANT ALL … TO anon, authenticated`. Its
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
- **`getUserRoles` degraded-path admin risk** — see "push hardest" item 6.
- **No migrations in this phase**, so `test:db` was not run locally; CI's pgTAP
  gate is the verdict. The `user_roles_cache` findings in Z1a-4 are handled in
  application code for exactly this reason; the schema-level fix is a debt.
