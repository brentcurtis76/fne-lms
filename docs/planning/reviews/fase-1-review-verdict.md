# Fase 1 (Z1a) — Independent review verdict (Sol)

> Archived verbatim by the PM per plan §0.2 (the reviewer is read-only and does not commit). Round 1 received 2026-07-28 against `4cde531`; round 2 (re-review, below) against `2bd3211`. PM triage R1: all 7 findings valid → Z1a-4. PM triage R2: **both findings valid — two PM rulings overturned and accepted** → Z1a-5.

## Round 2 — Re-review after Z1a-4 (verdict: REQUEST CHANGES)

**MAJOR — Cached administrator rows still authorize after revocation** (`utils/roleUtils.ts:381,393`): cached rows are `is_active: null`/`from_cache: true`, but `getHighestRole()` treats them as active — a stale cached `admin` receives every `highestRole === 'admin'` grant when the authoritative query errors. *The PM's accepted deviation is not acceptable as a phase-level availability decision*: continuity does not require authorization from an unverifiable, possibly-revoked admin role; contradicts the fail-closed contract in PROJECT_STATE. Finding ① only partially resolved.

**MAJOR — Batch iCal bypasses canonical active-role scope** (`pages/api/sessions/ical.ts:88`): the non-consultor branch scopes from every row with `community_id`, without `is_active` and without `canViewSession()` — under the new cache fallback this is an authorization leak (error path + stale community row returns session metadata to a revoked user), not merely feed-incompleteness as the PM characterized it; the mixed-role divergence also persists.

**Re-review evidence:** findings ②–⑦ resolved; the authoritative-success half of ① fixed; T1 proof independently reproduced in an isolated clone (7F/3P → 10/10); local gates green (2697/2697, 208 files); CI 6/6 at `2bd3211`. Fix block dispatched as **Z1a-5**.

**PM concession note:** both overturned rulings were mine (dossier "new accepted deviations"/"residual risks", 2026-07-28). Sol's counter-argument is accepted in full: (a) a degraded path where ordinary users lose data access but admins keep everything is fail-open exactly where fail-closed matters most; (b) the batch-iCal branch's missing `is_active` check makes it a live scope hole under the cache fallback, not a completeness nit. Recorded as review-process evidence.

**Verdict: REQUEST CHANGES**

## Findings

**MAJOR — Role revocation can continue authorizing a user through stale cache data**
`utils/roleUtils.ts:194` and `utils/roleUtils.ts:253`
When the authoritative `user_roles` query returns no active rows, `getUserRoles()` falls back to `user_roles_cache` and forcibly labels every cached row `is_active: true`. The role-removal path deactivates the role without refreshing that materialized view (`pages/api/admin/remove-role.ts:127`). Consequently, a user whose only role is revoked can retain session access until the cache is refreshed. The new invalidation tests mock `getUserRoles()`/`getHighestRole()`, so they do not exercise this failure. This violates Z1a's session-invalidation requirement and the authorization invariant.

**MAJOR — The single-report endpoint still leaks author email addresses**
`pages/api/sessions/[id]/reports/[rid].ts:67` and `:154`
This route selects `profiles:author_id(..., email)` and returns the report unchanged. An ordinary active community member may retrieve an `all_participants` report and receive the author's email. The collection endpoint was remediated, but this sibling path bypasses `session-disclosure.ts`, contradicting the dossier's invariant that no non-privileged session payload contains participant emails.

**MAJOR — Non-privileged iCal exports still disclose facilitator emails**
`pages/api/sessions/[id]/ical.ts:95`, `pages/api/sessions/ical.ts:193`, `lib/utils/session-ical.ts:192`
Both non-admin iCal endpoints load facilitator emails and pass them to the calendar generator, which emits them as `ATTENDEE` records. Active community members can therefore export facilitator addresses. The tests explicitly preserve this behavior in `lib/utils/__tests__/session-ical.test.ts:107`, despite Z1a's scope requiring participant-email stripping from non-privileged outputs. Replacing the raw meeting link did not close the broader disclosure.

**MAJOR — The session-list GET was not moved to `canViewSession()`**
`pages/api/sessions/index.ts:357` and `:466`
The list endpoint still implements separate role branches and only uses `SessionAccessContext` for payload redaction. It never calls `canViewSession()`, contrary to both the Z1a scope and the dossier's "authorization single-source" claim. This already produces inconsistent behavior for mixed-role users: a school-scoped consultor who is also an active member of a community at another school may open that community's session through the detail policy, but the list query omits it because the consultor branch ignores community memberships.

**MINOR — Production URL generation silently trusts the request `Host`**
`lib/utils/app-url.ts:20`
When no public base URL is configured, outbound iCal and reminder links are built from the client-controlled `Host` header. The code comments recognize that this must not happen in production, but nothing enforces the requirement.

**MINOR — `PROJECT_STATE.md` was not updated for this phase**
`PROJECT_STATE.md:4` and `:8`
The state file still reports Fase 0 as the latest completed work and contains no Z1a status, invariants, tests, or deferred items.

**MINOR — Both review entry points misstate the final diff**
`docs/planning/reviews/fase-1-review-request.md:7` and `fase-1-pm-dossier.md:6`
The review request reports 9 commits and 39 files; the dossier reports 42 files and `+3820/−104`. The actual `959c1fe...HEAD` diff is 11 commits, 43 files, `+3944/−104` [PM note: commit count is 12 including the dossier commit the file/line totals already reflect].

## Verification evidence (reviewer-run)

- `npm run type-check` — PASS · `npm run lint` — PASS, zero warnings · `npm test` — PASS, 2,641 tests / 204 files · `npm run build` — PASS, `/meet/session/[id]` SSR
- No migrations or Zoom implementation files added; no tracked worktree files modified during review.

## Fix block

Dispatched verbatim as executor chunk **Z1a-4** (see the PM prompt of 2026-07-28); DoD as stated by the reviewer:
- New regression tests cover every issue and fail on the reviewed commit.
- All four local gates pass.
- No non-privileged JSON or iCal response contains participant/facilitator email, meeting_link, meeting_transcript, or facilitators_only content.
- A revoked sole role cannot authorize detail, list, iCal, or /meet access even while `user_roles_cache` is stale.
