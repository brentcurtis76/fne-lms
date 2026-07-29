# Fase 1 (Z1a) — PM dossier for the independent reviewer

> PM-authored per `zoom-integration-plan.md` §0.2. This is the reviewer's map of the phase: scope authority, commit map, file inventory, invariants with entry points, the PM's verification record (including what was NOT verified), and every deviation the PM accepted — all challengeable. Companion executor self-report: `fase-1-review-request.md`. Both are leads, never the boundary: review the actual diff.

## Identity

- **Phase**: Z1a — Disclosure remediation (WP-0) + auth (`zoom-integration-plan.md` §15, first agent phase)
- **Branch**: `fix/sess-leak` · **base/fork point**: `959c1fe` (= origin/main)
- **History**: 3 build chunks (12 commits through `4cde531`) → Sol verdict REQUEST CHANGES (`fase-1-review-verdict.md`, archived `2ef3a9e`) → remediation chunk Z1a-4 (6 commits `b75aa6c`…`a946c52`) → this dossier update
- **Figures, pinned** (headline totals move with every docs commit — the code figure is the stable one):
  - full branch at `a946c52`: **19 commits, 56 files, +6271/−725**
  - code + tests only (excluding `docs/` and `PROJECT_STATE.md`): **50 files, +5179/−711** — invariant across docs commits; matches the review-request's figure
  - the executor's in-file headline (18/55/+6112) was computed at `5d117ca`, before its own docs commit existed — self-reference, not error
- **PR**: [#24](https://github.com/brentcurtis76/fne-lms/pull/24) — OPEN, `mergeStateStatus: CLEAN`, all 6 CI gates pass at `a946c52` (PM re-checked via `gh pr checks`)
- **Diff command**: `git diff 959c1fe...origin/fix/sess-leak`
- **Local gates**: `npm run type-check && npm run lint && npm test && npm run build` (PM last ran on `a946c52`: clean / clean / 2697 passed, 208 files / build OK)

## Remediation record (Z1a-4 — response to the REQUEST CHANGES verdict)

| Sol finding | Fix commit | PM re-verification |
|---|---|---|
| ① MAJOR cache fail-open on revocation | `b75aa6c` | Diff read; contract is authoritative-success-final, cache only on query ERROR; cache rows now `is_active: null` + `from_cache: true` (no fabricated `true`); refresh hygiene added to `remove-role`/`delete-user`/`networks/supervisors`. **PM re-executed the fail-on-old proof: 7 failed / 3 passed on pre-fix `roleUtils.ts`, 10/10 after — matches the report exactly** |
| ② MAJOR single-report email leak | `b149845` | Diff read; GET on shared context + `canViewSession`/`canViewRestrictedReports`/`redactProfileEmails`; PUT untouched (author-only rule, not a policy copy — correct) |
| ③ MAJOR iCal ATTENDEE emails | `61aa77b` | Diff read; generator fail-closed default, per-caller policy at all 3 endpoints, leak-asserting test rewritten, no other email-bearing iCal fields (ORGANIZER/CN/X- swept) |
| ④ MAJOR list ≠ detail scope | `68934a1` | Diff read; union in the query via `.or()` — school ids `Number.isFinite`-gated, community ids UUID-gated + quoted, both sourced from `user_roles` not the request; count/pagination preserved; empty-scope semantics unchanged |
| ⑤ MINOR Host trust in prod | `5d117ca` | Diff read; `VERCEL_ENV` authority, origin validation, `VERCEL_PROJECT_PRODUCTION_URL` fallback, loud throw — Host never consulted in production |
| ⑥⑦ MINOR docs | `a946c52` | PROJECT_STATE Z1a entry truthful against the diff (invariants, test delta 2544→2697, gate evidence); review-request figures pinned per above |

**New accepted deviations (Z1a-4):** cache rows carry `is_active: null` rather than `false` (honest UNKNOWN; scope checks fail closed on it, `getHighestRole` keeps the session alive during a genuine outage); `[id]/ical.ts` inline authz replaced with `canViewSession` (tightening beyond the letter of T3); batch-iCal row scoping left on its one-branch shape (T4 scoped to the list GET — ticketed below); `sessions-gc-member.test.ts` rewritten rather than patched (asserted implementation details, not behavior). Style note (PM): `getAppBaseUrl`'s throw message is in Spanish — internal errors are conventionally English; cosmetic.

**New residual risks (documented, not fixed here):**
- ~~A stale cached `admin` row still grants `highestRole === 'admin'` during a query-ERROR window~~ — **PM ruling OVERTURNED by Sol R2, fixed in Z1a-5** (see remediation R2 below).
- **`user_roles_cache` is an RLS-less materialized view with `GRANT ALL … TO anon, authenticated`** — any user's roles are readable with the anon key. Pre-existing, discovered by the T1 caller audit; needs a migration (out of Z1a's no-migrations scope). Being handled in a parallel dedicated session.
- ~~Batch-iCal scopes rows by one role branch (feed completeness)~~ — **PM characterization OVERTURNED by Sol R2 (it was also an authorization hole under the cache fallback); fixed in Z1a-5.**
- Mixed-role consultors see `borrador` drafts of their community sessions in the list (draft visibility keyed on `highestRole`, unchanged in kind; detail never gated drafts). Noted for the reviewer.

## Remediation record R2 (Z1a-5 — response to the re-review's 2 MAJOR findings)

Sol's R2 overturned two PM rulings; the PM conceded both on the merits (concession note in `fase-1-review-verdict.md`). Fixes: commits `62a448d` (code) + `caac1e1` (docs).

| R2 finding | Fix | PM re-verification |
|---|---|---|
| ① Cached admin authorizes on error path | `getHighestRole()` skips `from_cache === true` rows outright (both guards: `from_cache !== true` AND `is_active !== false`); `from_cache`/`cached_at` formalized on `UserRole` with never-authorize documentation; cache-only role lists resolve to `null` → existing 403s | Diff read; **PM re-executed the proof: 8 failed / 2 passed on pre-fix `roleUtils.ts`, 10/10 after — matches report**. Caller audit reviewed: no display surface breaks (sidebar reads the plural roles array; `getDisplayRole()` correctly NOT added speculatively) |
| ② Batch iCal outside canonical scope | T4 union extracted to shared `lib/utils/session-scope.ts` (`buildSessionScope` + `hidesDraftSessions`, same Number.isFinite/isUUID guards); consumed by BOTH list GET and batch iCal — shared code, not a copy; draft visibility verified identical before/after | Diff read; both endpoints consume the module; single/series iCal verified already on `canViewSession`/admin gating; executor's mid-run botched restore (`HEAD` instead of fix state) checked — final code contains both fixes whole |
| tests | +38 tests / +3 files (2735/2735 in 211): Sol's 4 groups incl. error-path denial across all 6 surfaces, empty-calendar-zero-metadata, 3-way union agreement, preserved successful-empty suite; 2 Z1a-4 assertions that codified the overturned semantics rewritten (flagged in review-request) | Gates re-run by PM (2735/2735, type-check/lint/build clean); CI 6/6 at `caac1e1` re-checked via `gh` |

Accepted nuance: Sol's group-2 test ("batch iCal returns empty calendar") is satisfied by a stronger outcome — the request now dies at the `highestRole` gate (403) before the scope builder runs; the 200-empty-calendar shape is asserted separately on the input that still reaches it. Also verified-and-left: `reports/analytics.ts` scopes non-admins to facilitated sessions — a deliberately stricter policy, not a divergent copy.

## Scope authority (the itinerary does not carry Zoom phases — scope-fidelity runs against THIS)

**In scope (plan §15 Z1a row, split into 3 chunks):** session detail/list GETs moved to `canViewSession` + `is_active`; visibility-filtered reports; strip `meeting_link`/`meeting_transcript`/participant emails from non-privileged payloads; `has_meeting` + `join_path`; legacy manual-link interstitial `/meet/session/[id]` (SSR-gated); iCal → platform links + VTIMEZONE; reminder payloads → platform links; middleware matcher + `/meet` + `/consultor` session-presence; login `next=` + open-redirect guard; session-invalidation tests; `calculateNoticeHours` TZ fix + clause regression tests.

**Explicitly OUT of scope (finding if present in diff):** anything Zoom (tables, migrations, `lib/zoom/`, feature flags, §5 join matrix); `/consultor` SSR *role* gating (ticketed post-Z2); new join affordances on workspace/dashboard surfaces; `getUser()` auth migration. There are **no migrations** in this phase — any schema change in the diff is a BLOCKER.

## Chunk → commit map

| Chunk | Commits | Content |
|---|---|---|
| Z1a-1 | `c06c0cd`, `db58c15`, `5456b04` | `getHighestRole` is_active; canViewSession unification + report visibility + email stripping (5 GETs, `lib/utils/session-disclosure.ts`); notice-hours TZ fix + 16-case suite |
| Z1a-2 | `50a845e`, `aa26579`, `a50d9d9`, `33d0bf7`, `350e009` | meeting_link/transcript stripping + `has_meeting`/`join_path`; `/meet` interstitial + `session-meet-access.ts`; iCal platform links + VTIMEZONE; reminder/notification `join_url`; join-UX cutover |
| Z1a-3 | `edc1714`, `26440dd`, `b244383` | middleware matcher + `next=`; `safe-redirect.ts` guard; login `next=`; `/meet` SSR `next=`; review-request + planning docs |

## File inventory (grouped by risk; ⊕ new)

**Middleware / auth (highest)**
- `middleware.ts` — `next=` on unauth redirect; session-presence-only early return for `/meet`+`/consultor` (exact-or-slash prefixes); matcher 3→5 entries; role blocks byte-untouched below the early return
- ⊕ `lib/utils/safe-redirect.ts` — `resolveSafeInternalPath` open-redirect guard (single-decode contract)
- `pages/login.tsx` — `next` honored at the 3 finished-login sites only; forced flows (change-password, profile completion) keep priority
- `utils/roleUtils.ts` — `getHighestRole` skips `is_active === false` rows (missing field = active, matches cache shape)

**Authorization / payload policy (high)**
- ⊕ `lib/utils/session-disclosure.ts` — the phase's core policy module: `canViewRestrictedReports`, `filterReportsByVisibility`, `canViewParticipantEmails`, `redactProfileEmails` (recursive, keys on `profiles` embeds), `canViewRawMeetingLink`, `canViewMeetingTranscript`, `buildSessionJoinPath`, `applySessionMeetingDisclosure`
- `pages/api/sessions/[id]/index.ts` — inline authz → `canViewSession`; reports filtered; emails/link/transcript per policy; `has_meeting`/`join_path`
- `pages/api/sessions/index.ts` — GC `is_active` in query scope; per-row email redaction + meeting disclosure
- `pages/api/sessions/[id]/{reports,materials,attendees}.ts` — shared visibility helper; email redaction; attendees.ts gained a real facilitator lookup (was hardcoded `false`)
- ⊕ `lib/utils/session-meet-access.ts` — `/meet` SSR resolver: UUID check, single byte-identical `not-found`, archived rule, `canViewSession`

**SSR page / outbound artifacts (medium)**
- ⊕ `pages/meet/session/[id].tsx` — interstitial (the ONLY surface revealing the legacy raw link); unauth → `/login?next=` (defence-in-depth copy of middleware)
- `lib/utils/session-ical.ts` — `meeting_link` REMOVED from `ICalSessionInput` (type-level); `join_url` in DESCRIPTION/LOCATION/URL; VTIMEZONE via `@touch4it/ical-timezones` generator
- `pages/api/sessions/{ical,[id]/ical,series/[groupId]/ical}.ts` — pass `join_url`
- `pages/api/cron/session-reminders.ts`, `lib/notificationEvents.ts` — `join_url` (typed) replaces `meeting_link` in payloads
- ⊕ `lib/utils/app-url.ts` — absolute-URL helper: env vars → Host header fallback (dev only)
- `lib/services/hour-tracking.ts` — `calculateNoticeHours` through `getSessionDateTime` (Chile wall-clock); throws on malformed input (inherited from the canonical helper; both callers inside try/catch)

**Client surfaces (low)**
- `pages/consultor/sessions/[id].tsx`, `pages/admin/sessions/[id].tsx` — join UX → `join_path` for every persona incl. admins
- `components/sessions/EditRequestModal.tsx` — prop narrowed to the 4 structural fields
- `lib/types/consultor-sessions.types.ts` — optional link/transcript; `has_meeting`/`join_path`

**Tests (11 files)** — new: `session-detail-disclosure` (15), `notice-hours-timezone` (16), `session-disclosure` (19→+), `app-url`, `session-meet-access`, `safe-redirect` (32), `pages/meet/session-ssr` (5); extended: `middleware.test.ts` (10→24), `sessions-gc-member`, `session-ical`, iCal endpoint + notification suites. **Docs**: `fase-1-review-request.md`, this file, the plan + team PDF.

## Invariants to verify (with entry points)

1. **No payload to a non-privileged caller contains** `meeting_link`, `meeting_transcript`, participant emails, or `facilitators_only` reports — `lib/utils/session-disclosure.ts` is the single policy; verify all five GETs route through it and nothing bypasses (grep for `profiles(` embeds and `select('*')` on session tables outside the helper's reach).
2. **Authorization single-source**: every session GET builds `SessionAccessContext` and calls `canViewSession`; only `is_active` rows grant scope (`lib/utils/session-policy.ts:114`, `utils/roleUtils.ts` `getHighestRole`).
3. **No existence oracle**: `/meet` returns one shared `not-found` object for nonexistent/unauthorized/malformed/archived (`lib/utils/session-meet-access.ts:39`); API keeps 404-for-other-school.
4. **Open-redirect guard**: `lib/utils/safe-redirect.ts` — deny-list completeness under the single-decode contract; only 3 login branches consult `next` (`pages/login.tsx`, grep `postLoginDestination`).
5. **Middleware role logic unchanged** for `/admin`, `/community/workspace`, `/school`; the new early return is session-presence-only and prefix-exact; `next=` ONLY on the unauthenticated redirect.
6. **Billing**: `calculateNoticeHours` anchored `America/Santiago` (`lib/services/hour-tracking.ts:158`); clause boundaries 48h/336h hold under TZ=UTC/Santiago/Madrid.
7. **Outbound artifacts carry platform links only**: no `.ics` or notification payload contains a raw meeting link; VTIMEZONE present with tzdata-driven rules (no hardcoded transition dates).

## PM verification record

**Verified by the PM (per chunk, on the actual branch):** full diff read commit-by-commit ×3 chunks; gates re-run locally after each chunk (final: type-check clean, lint clean, 2641/2641, build OK); notice-hours suite re-run under 3 TZs (16/16 each); CI on PR #24 re-checked via `gh pr checks` (6/6 pass); fork point verified via `git merge-base`; attack-vector trace of `resolveSafeInternalPath` (double-encode, encoded-tab, `//`, backslash, scheme, `/foo//host`); `session_attendees`/`session_facilitators` confirmed email-column-free in the baseline schema (redaction key coverage); `materials.ts` facilitator lookup confirmed pre-existing; both `calculateNoticeHours` callers confirmed inside try/catch; e2e `reservation.spec.ts` failures confirmed pre-existing (unseeded QA fixtures, spec-documented prerequisite).

**NOT verified by the PM (highest-yield hunting ground):**
- All API tests are **handler-level with mocked Supabase/roles** — they prove policy wiring, not RLS or real-tenant behavior. No integration test hits a seeded DB (lands Z1c).
- **No browser-level test** exercises the interstitial, the login `next=` flow, or the middleware redirects end-to-end (CI e2e is a smoke suite; the session e2e specs are skipped stubs).
- **VTIMEZONE output not validated against real calendar clients** (only unit-asserted structure).
- **`getSessionDateTime`'s own correctness treated as trusted** (pre-existing, has its own tests) — the phase re-anchored callers onto it without re-auditing it.
- The executor's claim that old-code fails 11/16 TZ tests was **method-reviewed, not re-executed** by the PM.
- Production env (`NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_BASE_URL` on Vercel) not confirmed — open item for Brent.

## Accepted deviations (PM rulings — challengeable)

1. Email stripping widened from 2 to 5 endpoints (bypass closure via `/attendees` etc.) — accepted as spirit-of-scope.
2. `attendees.ts` gained a real facilitator lookup (hardcoded `false` would have over-stripped facilitators).
3. `calculateNoticeHours` now throws on malformed input (inherited from canonical helper; NaN previously resolved silently to *penalizada* — loud failure preferred on a billing path).
4. `getHighestRole` treats missing `is_active` as active (`!== false`) — matches `user_roles_cache` fallback shape; explicit-false rejected. Decides whether a revoked role sees a session — worth adversarial attention.
5. Global consultors (`school_id NULL`) receive participant emails — consistent with existing `canViewSession`; zero such rows in prod.
6. `ICalSessionInput.meeting_link` removed entirely (type-level enforcement) rather than left unused.
7. `lib/utils/app-url.ts` extracted from the only existing base-URL pattern in the repo; Host-header fallback documented dev-only.
8. Workspace tab / dashboard cards NOT given join affordances (they never had join UX — new-product decision deferred to Brent).
9. Base-SHA correction: fork point is `959c1fe` (= origin/main), not `d4a5d89` (a local-only commit; see open items).

## Open items / residual risk

- **Local `main` holds 3 unpushed commits** (`d4a5d89`, `9efbce0`, `5573a85` — docs/chore only). PR #24 merges clean against origin/main; Brent must push or rebase local main at merge time.
- `resolveSafeInternalPath` single-decode contract — safe for `router.query.next`; a future caller passing still-encoded input breaks the assumption.
- Platform-wide auth uses cookie `getSession()` (API + SSR alike) — `getUser()` migration is ticketed debt, NOT a phase finding unless the diff worsened it.
- `must_change_password` enforced only in the credentials flow (pre-existing; mount-branch destination changed, enforcement unchanged).
- Raw link still served to privileged callers (admin/facilitator/scoped-consultor) **by design** — forms need it; only join UX moved to `/meet`.
- `playwright-report/` untracked (gitignore fix sits in unpushed local `9efbce0`).
