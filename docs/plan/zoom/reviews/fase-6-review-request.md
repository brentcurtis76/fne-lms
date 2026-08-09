# Fase 6 (Zoom Z3) — review request

> Executor self-report for **Z3 — Embedded experience**, covering all four chunks
> (Z3-1 … Z3-4). Written at the close of Z3-4 per `CLAUDE.md` Executor Rule 6 and
> PLAN §15. This is a lead for the independent reviewer, never the boundary of the
> review: the diff is the artifact.

## Branch, base and commits

| | |
|---|---|
| Branch | `feat/zoom-embed` |
| Base (merge-base with `origin/main`) | `65c8114b5acf7b3242c5c78d8ec7466332045e26` |
| Commits | **4** |
| Worktree | `/Users/brentcurtis/dev/wt/zoom-embed` |

| # | SHA | Chunk | Subject |
|---|---|---|---|
| 1 | `5c3bbea1` | Z3-1 | `feat(zoom): mint an SDK join payload for participants behind FEATURE_ZOOM_EMBED` |
| 2 | `09d32643` | Z3-2 | `feat(zoom): issue a ZAK and role:1 to hosts under the §9 rule` |
| 3 | `db9fc6c7` | Z3-3 | `feat(zoom): render the embedded meeting, with a preflight and a link fallback` |
| 4 | *(this commit)* | Z3-4 | `feat(zoom): join through Client View where Component View cannot run` |

**One diff artifact to expect and discount.** `git diff --stat origin/main..HEAD` shows
`docs/plan/zoom/LEDGER.md` and `docs/plan/zoom/prompts/Z3-r{2,3,4}.md` as *deletions*.
Nothing on this branch deleted them: the PM committed them to `main` after this branch
was cut, so they exist ahead of the merge-base and not on it. Compare against the
merge-base (`git diff 65c8114b..HEAD`) rather than `origin/main..HEAD` when reading the
docs half of the diff.

## Objective and scope (PLAN §15, Z3 row — copied)

> **Z3 — Embedded experience** ~~(only if Z0B passes)~~ — **field gate WAIVED by owner
> decision 2026-08-08, see §16**; the per-route Permissions-Policy listed below
> **already shipped in Z0B** (`next.config.js:57-81`) · branch `feat/zoom-embed` ·
> `@zoom/meetingsdk` Component View (desktop) + Client View route (mobile);
> PreJoinCheck; per-route Permissions-Policy; es-ES i18n; SDK-failure auto-fallback to
> link · **DoD:** School user joins embedded w/o Zoom account; fallback flag flips
> cleanly · 5–8 d

### Scope IN, by chunk

- **Z3-1** — a second success shape on `POST /api/meet/session/[id]/join`: `mode: 'sdk'`
  carrying `signature`, `sdk_key`, `meeting_number`, `passcode`, `user_name`,
  `customer_key`, `role`, behind `FEATURE_ZOOM_EMBED`. Never a `join_url` (§5).
  Participants only — hosts stayed on link mode until Z3-2 existed.
- **Z3-2** — hosts additionally receive `zak` and a `role: 1` signature, but only where
  §9 allows it (facilitator on their own mapped host; admin on org-owned pool
  identities), fresh at start-click, with a `zak_issued` audit row in
  `zoom_internal.zoom_zak_issuances`.
- **Z3-3** — the desktop embed: the CDN loader for Component View, the browser-capability
  reads, `PreJoinCheck`, and `JoinMeetingButton`'s SDK branch with a link fallback via a
  second POST carrying `{ fallback: 'link' }`.
- **Z3-4** — Client View for every browser Component View cannot serve (mobile, tablets,
  **Firefox**), the two-view support matrix, and the popup-blocked retry that re-runs the
  fallback instead of the embed.

### Scope OUT — declared, and not touched

- `lib/utils/meeting-join-policy.ts` and `lib/utils/meeting-zak-policy.ts` — sealed after
  their own chunks; Z3-3 and Z3-4 changed neither.
- The join route's authorization gates — unchanged by Z3-3 and Z3-4. The §5 opening was
  widened exactly once, in Z3-1, and once more in Z3-2 for the ZAK.
- `tests/e2e/zoom-join-authz.spec.ts` and everything under `tests/e2e/` — CI Gate 4 is
  untouched by this phase. `git diff --stat origin/main..HEAD -- tests/e2e/` is empty.
- `pages/meet/diag.tsx` and `pages/api/meet/diag-signature.ts` — the consultores' field
  instrument for the hardware protocol, live and deliberately not refactored to share
  Z3-3's loader (see *Known limitations*).
- `next.config.js`, `package.json`. Z3-4 adds no migration; the phase's only migration is
  Z3-2's.

## Files, grouped by risk

### Highest risk — the credential opening and the ZAK rule

| File | Chunk | Purpose |
|---|---|---|
| `pages/api/meet/session/[id]/join.ts` (+461/−…) | Z3-1/2/3 | The single §5 opening. Now mints three outcomes (link, SDK-participant, SDK-host-with-ZAK) and honours the `{ fallback: 'link' }` intent. Every authorization gate ahead of outcome selection is Z2's, unchanged. |
| `lib/utils/meeting-zak-policy.ts` (+135) | Z3-2 | Pure §9 rule: who may receive a ZAK, for which host identity. No I/O, no session, no DB. |
| `supabase/migrations/20260810120000_zoom_zak_issuances.sql` (+66) | Z3-2 | `zoom_internal.zoom_zak_issuances` audit table. Additive, RLS on. |
| `lib/zoom/api.ts` (+34/−…), `lib/zoom/client.ts` (+33) | Z3-2 | `GET /users/{id}/token?type=zak`. |

### High risk — what runs in the browser holding a signature

| File | Chunk | Purpose |
|---|---|---|
| `components/sessions/JoinMeetingButton.tsx` (+370/−…, and again in Z3-4) | Z3-3/4 | The client half of the whole phase: the per-click POST, the credentials-in-a-ref discipline, the view branch, both roots, the fallback and the retry. |
| `lib/meet/embed-capabilities.ts` (+98, +Z3-4) | Z3-3/4 | The support matrix — `supportsComponentView`, `supportsClientView`, `selectEmbedView` — plus the non-intrusive permission reads. |
| `lib/meet/zoom-sdk-loader.ts` (+154, +Z3-4) | Z3-3/4 | Component View CDN loader, sequential vendor React before the bundle. Z3-4 exported `SDK_BASE` and `loadZoomCdnScript` from it. |
| `lib/meet/zoom-client-view-loader.ts` (new, Z3-4) | Z3-4 | Client View CDN loader (four vendor files), the `ZoomMtg` surface, and the callback→promise wrapper. |

### Lower risk

| File | Chunk | Purpose |
|---|---|---|
| `components/sessions/PreJoinCheck.tsx` (+214) | Z3-3 | Advisory preflight. Reads nothing that can block a join. |
| `lib/featureFlags.ts` (+9/−…) | Z3-1 | `FEATURE_ZOOM_EMBED`, server-side only. |
| `lib/zoom/fake.ts` (+70) | Z3-2 | Test double for the ZAK endpoint. |

### Tests

`__tests__/api/meet/session-join-sdk.test.ts` (768) · `session-join-zak.test.ts` (905) ·
`__tests__/lib/utils/meeting-zak-policy.test.ts` (233) · `__tests__/lib/zoom/fake.test.ts`
(114) · `__tests__/components/sessions/JoinMeetingButton.sdk.test.tsx` (495) ·
`JoinMeetingButton.clientview.test.tsx` (new, Z3-4) · `PreJoinCheck.test.tsx` (126) ·
`__tests__/lib/meet/embed-capabilities.test.ts` · `zoom-sdk-loader.test.ts` (143) ·
`zoom-client-view-loader.test.ts` (new, Z3-4) · `supabase/tests/002-zoom-internal-isolation.sql`
(+134).

## Test evidence at this head

| Gate | Command | Result |
|---|---|---|
| Type-check | `npm run type-check` | exit 0 |
| Lint | `npm run lint` (`--max-warnings=0`) | exit 0 |
| Unit/integration | `npm test` | **300 files / 6985 tests passed**, exit 0 |
| Build | `npm run build` | exit 0 |
| pgTAP / RLS | `npm run test:db` | `Files=11, Tests=484, Result: PASS`, exit 0 |
| testid (advisory) | `npm run lint:testid` | 2668 problems — the pre-existing baseline; **0 in this phase's files** |

Phase-relevant suites, by name and count:
`JoinMeetingButton.test.tsx` 19 · `JoinMeetingButton.sdk.test.tsx` 23 ·
`JoinMeetingButton.clientview.test.tsx` 21 · `PreJoinCheck.test.tsx` 7 ·
`embed-capabilities.test.ts` 30 · `zoom-sdk-loader.test.ts` 7 ·
`zoom-client-view-loader.test.ts` 10.

**Fail-on-old probes run in Z3-4** (each: break the invariant, confirm a non-zero exit,
revert, confirm byte-identity by `shasum -a 256`):

- Re-admitting Firefox to Component View (deleting one line from `supportsComponentView`)
  → **6 tests failed, exit 1**. Reverted; `embed-capabilities.ts` back to
  `8abd07ed…60d8eafc`.
- Mounting both roots together (both render guards changed to `embedActive`) →
  **3 tests failed, exit 1**. Reverted; `JoinMeetingButton.tsx` back to
  `23d8aef6…b4798cd4`.

## Where an independent reviewer should push hardest

1. **`supportsClientView()` is thin, and it is the only thing standing between a browser
   and a 3.7 MB download.** It refuses on SSR and on a missing WebAssembly and nothing
   else — so it says yes to any browser with a media engine, including ones Zoom's matrix
   has never been tested against (in-app webviews, Android 8 stock browsers, kiosk
   shells). I chose breadth deliberately: Zoom documents Client View as supported on all
   four desktop browsers and both mobile ones, and the failure mode is the link fallback,
   not a dead end. But the asymmetry with `supportsComponentView` — which refuses on four
   separate readings — is real, and if you think the honest answer is a positive support
   test rather than a negative one, say so. Entry point:
   `lib/meet/embed-capabilities.ts:78-111`.

2. **Component View is gated on WebAssembly and Client View is — deliberately
   inconsistently — not.** `selectEmbedView` tries Component View first and that function
   does *not* read `supportsWebAssembly()`, so a desktop Chrome with the engine missing
   still selects Component View and fails into the link, exactly as it did in Z3-3. I left
   it that way because `PreJoinCheck` documents "nothing it reads can BLOCK the join", and
   moving the engine test up would make its `Motor de video → No compatible` row
   unreachable. The cost is that the `'none'` branch is only reachable from the Client View
   side. This is my judgement call and the one I would most expect to be overruled.

3. **The credentials discipline on the Client View path is asserted, not structural.**
   `passWord`/`zak`/`signature` go into `sdk.join(...)` from a local `const` read out of a
   ref that was emptied in the same breath — the same shape Z3-3 shipped — but Client View
   then takes the whole page over with vendor code we do not control, and jsdom cannot
   prove what that code does with what it was handed. `[D7]` proves our markup and our
   console stay clean; it does not prove Zoom's do. `components/sessions/JoinMeetingButton.tsx`
   `joinWithClientView`.

4. **Two chunks widened the §5 opening, and only the second one is guarded by a policy
   module.** Z3-1's SDK payload is assembled inline in the route; Z3-2's ZAK goes through
   `meeting-zak-policy.ts`. Worth checking that the participant payload has no path that
   can reach a value the §9 rule would have refused — particularly `customer_key` and
   `user_name`, which come from `profiles` rather than from the policy layer.

5. **`[C11]` guards by reading source files off disk, and its file list is hand-maintained.**
   It now covers `components/sessions/*`, both loaders and `embed-capabilities.ts`, with a
   floor of 9 files. A new client module added outside those paths would not be checked —
   the guard is only as good as its list, and the list is the thing to distrust.

## Known limitations and deferred items

1. **No real-browser verification of either view.** Every assertion in this phase is
   jsdom or Node. Nobody has watched a meeting render — the PLAN §16 hardware/network
   verdict was **waived, not cleared** (amended 2026-08-08), so the field protocol may
   still be run. Z3-4 confirmed Zoom's *documented* browser matrix and confirmed all six
   CDN URLs return 200; it verified no runtime behaviour.
2. **`pages/meet/diag.tsx` duplicates the Component View loader on purpose.** It is the
   consultores' field instrument and the protocol is live. Recorded debt, not an oversight;
   Z3-4 was explicitly told not to collapse it, and it did not.
3. **Client View's own init options are minimally configured.** `leaveUrl`, `patchJsMedia`,
   `leaveOnPageUnload` and the es-ES i18n load, and nothing else. Zoom exposes ~30 further
   `init` options (chat, breakout, recording UI, `disableInvite`); none is set, so the
   surface a student sees is Zoom's default. That is a product decision nobody has made yet.
4. **`sdkKey` is passed to `ZoomMtg.join` although Zoom's reference marks it deprecated for
   `joinOptions` since v4.0.0** ("you can just use signature"). It is kept for symmetry with
   the Component View call and because Zoom's own current samples still pass it. Harmless,
   but it is a guess about a deprecated-not-removed parameter.
5. **The §9-facts-read-twice backlog item** (r2 SHOULD-FIX ①) is still open. It wants a
   sealed module's return type widened and was deliberately excluded from Z3-3 and Z3-4.
6. **`[C9]`'s two assertions were rewritten in Z3-4**, because the chunk reverses their
   destination: a refused browser now takes Client View, not the link. The claim they
   guard — that the Component View bundle is never fetched on a machine that cannot render
   it — is unchanged and is now asserted against the loader rather than the DOM. Before and
   after are quoted in the Z3-4 executor report.
7. **`FEATURE_ZOOM_EMBED` is still off.** Nothing in this phase reaches a user until the
   flag flips, and the flag is server-side only — the client never reads it (`[C11]`).
