# Fase 1 (Z1a) — Review request

**Phase:** Z1a — Disclosure remediation (WP-0) + auth
**Branch:** `fix/sess-leak`
**Branch point:** `959c1fe` (`fix(assessment-builder): indicator PUT camelCase mapping + review remediation (#23)`)
**`main` at PR open:** `d4a5d89` (`docs(planning): add C14 typed indicator request contract prompt`)
**Commits:** 9 (3 + 5 + 1 across chunks Z1a-1 / Z1a-2 / Z1a-3)
**Diff vs `main`:** 39 files, +3061 / −104

> **Ancestry note.** The phase brief quoted `d4a5d89` as the base SHA; that is
> `main`'s current head, not this branch's fork point. `main` is one commit
> ahead of the branch point, and that commit only adds a planning prompt file
> plus a few `.gitignore` / `CLAUDE.md` lines — no overlap with the 39 files
> here, so the merge is conflict-free but **not a fast-forward**. Nothing was
> rebased: the eight earlier commits are recorded by SHA in the plan's PM
> ledger and rewriting them would invalidate those entries.

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

---

## Objective and scope

**Objective** (plan §15, Z1a row): close the pre-existing session-payload
disclosures that the Zoom work would otherwise have been built on top of, move
every meeting link behind a re-checked platform surface, and give the auth layer
the deep-link round-trip that surface needs.

**In scope — delivered:**

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
| `pages/api/sessions/[id]/index.ts` | `canViewSession` gating, link/transcript stripping, `has_meeting` + `join_path` |
| `pages/api/sessions/index.ts` | same for the list endpoint |
| `pages/api/sessions/[id]/reports.ts` | visibility filter shared with `reports.ts` |
| `pages/api/sessions/[id]/attendees.ts` | participant e-mail stripping; real facilitator lookup |
| `pages/api/sessions/[id]/materials.ts` | disclosure policy applied |

### Medium — SSR pages and outbound artifacts

| File | What changed |
|---|---|
| `pages/meet/session/[id].tsx` | **new** — the interstitial; unauthenticated redirect now carries `next` |
| `lib/utils/session-ical.ts`, `pages/api/sessions/**/ical.ts` | platform links + real `VTIMEZONE` |
| `lib/utils/app-url.ts` | **new** — absolute-URL helper for artifacts that leave the browser |
| `lib/notificationEvents.ts`, `pages/api/cron/session-reminders.ts` | `join_url` instead of the raw link |
| `lib/types/consultor-sessions.types.ts` | typed so raw-link regressions fail the type-check |
| `lib/services/hour-tracking.ts` | `calculateNoticeHours` anchored via `getSessionDateTime` |

### Low — client surfaces

`pages/admin/sessions/[id].tsx`, `pages/consultor/sessions/[id].tsx`,
`components/sessions/EditRequestModal.tsx` — join buttons point at `/meet`.

### Tests and dependencies

12 test files (7 new, 5 extended); `package.json` / `package-lock.json` gain
`@touch4it/ical-timezones` for the Chile `VTIMEZONE`.

---

## Test evidence

Gates run locally on `edc1714`; CI runs all six on the PR.

| Gate | Result |
|---|---|
| `npm run type-check` | clean |
| `npm run lint` (zero warnings) | clean |
| `npm test` | **2641 passed / 2641** across **204 files** |
| `npm run build` | success; `/meet/session/[id]` present as a dynamic SSR route; middleware bundle 73.7 kB |
| `npm run test:db` | not run locally — no migrations in this phase; CI runs `supabase test db` anyway |
| `npm run e2e` | not run locally — no seeded Supabase env on this machine; relying on the PR's CI e2e gate |

Growth across the phase (each figure from a full-suite run at that chunk's tip):

| Chunk | Tests | Files |
|---|---|---|
| Z1a-1 (`5456b04`) | 2544 | 200 |
| Z1a-2 (`350e009`) | 2590 | 202 |
| Z1a-3 (`edc1714`) | 2641 | 204 |

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
- `__tests__/api/sessions/sessions-gc-member.test.ts`,
  `session-ical-export.test.ts`, `session-notifications.test.ts`,
  `lib/utils/__tests__/session-ical.test.ts`,
  `__tests__/pages/consultor/sessions/detail.test.tsx` (extended)

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
   whether a revoked role still sees a session.

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
- **`NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_BASE_URL` must be set in Vercel prod.**
  `getAppBaseUrl` falls back to the request `Host` header, which is
  client-controlled and must not be the production source of truth.
- **No migrations in this phase**, so `test:db` was not run locally; CI's pgTAP
  gate is the verdict.
