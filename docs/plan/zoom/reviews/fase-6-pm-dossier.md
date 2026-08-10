# Fase 6 (Zoom Z3 — Embedded experience) — PM dossier

> Written per `PLAN.md` §0.2 step 2. This is the independent reviewer's map of the phase.
> Companion: `fase-6-review-request.md` (executor-authored). **Both are leads, never the
> boundary** — review the actual diff.

**Branch** `feat/zoom-embed` · **base** `65c8114b` · **head** `18441936` · **4 commits**
**Diff to review:** `git diff 65c8114b..18441936`

> ⚠️ **Do not diff against `origin/main` directly.** The PM's ledger and prompt commits
> landed on `main` after this branch was cut, so `git diff origin/main..HEAD` shows them as
> spurious deletions. Use the merge-base above.

**PR:** not yet opened at the time of writing. CI has **never run on this branch** — every
gate result below is local. See "Blocking before close".

---

## 1. Scope — the authority for this phase

The GENERA itinerary does not carry Zoom phases, so **this section plus `PLAN.md` §15's Z3
row is the scope authority** (§0.2 step 3).

**§15, verbatim:**

> **Z3 — Embedded experience** ~~(only if Z0B passes)~~ — field gate WAIVED by owner decision
> 2026-08-08, see §16 · `feat/zoom-embed` · `@zoom/meetingsdk` Component View (desktop) +
> Client View route (mobile); PreJoinCheck; per-route Permissions-Policy; es-ES i18n;
> SDK-failure auto-fallback to link · **DoD:** School user joins embedded w/o Zoom account;
> fallback flag flips cleanly · 5–8 d

**Per-chunk scope, as dispatched** (prompts committed at `docs/plan/zoom/prompts/Z3-r1..r4.md`):

| Chunk | Commit | Scope |
|---|---|---|
| Z3-1 | `5c3bbea1` | `FEATURE_ZOOM_EMBED`; the `mode:'sdk'` outcome on the join route, participants only |
| Z3-2 | `09d32643` | ZAK retrieval; the §9 issuance rule; the `zak_issued` audit table; `role:1` for hosts |
| Z3-3 | `db9fc6c7` | Component View embed, CDN loader, `PreJoinCheck`, es-ES, link fallback |
| Z3-4 | `18441936` | Client View for mobile + Firefox; popup-retry fix; `fase-6-review-request.md` |

**Explicitly OUT of scope, and why** — challenge any of these you think is wrong:

- **`lib/utils/meeting-join-policy.ts`** — the §5 persona matrix, sealed since Z2 and
  Sol-reviewed. Z3 consumes `decision.role`; it never changes how it is produced.
- **`tests/e2e/zoom-join-authz.spec.ts`** — blocking CI Gate 4. Verified untouched at every
  round: `git diff --stat 65c8114b..18441936 -- tests/e2e/` is **empty**.
- **`pages/meet/diag.tsx` / `diag-signature.ts`** — the consultores' field instrument. **PM
  ruling ⑤ at r3 forbade touching it** because the hardware protocol is still live (the gate
  was *waived*, not cleared). The cost is accepted duplication between diag's loader and
  `lib/meet/zoom-sdk-loader.ts`. Recorded debt, not an oversight.
- **The §9-facts-read-twice cleanup** (r2 SHOULD-FIX ①) — deferred deliberately; it wants a
  sealed module's return type widened.
- **`next.config.js`** — §15 lists a per-route Permissions-Policy in Z3's scope, but **Z0B
  already shipped it** (`next.config.js:57-81`). Confirmed present, unchanged.

---

## 2. File inventory by risk

**Tier 1 — the trust boundary. Read these first.**

| File | Purpose |
|---|---|
| `pages/api/meet/session/[id]/join.ts` (+461) | The single authorized opening (§5). Gains the SDK payload, the ZAK issuance, the audit write, and the `{fallback:'link'}` intent. Its ~120-line header is the operator contract. |
| `lib/utils/meeting-zak-policy.ts` (new, 135) | §9's issuance rule as a pure, total function. **The security core of the phase.** |
| `supabase/migrations/20260810120000_zoom_zak_issuances.sql` (new, 66) | The `zak_issued` audit table. Additive only; RLS on; §6 grants. |
| `supabase/tests/002-zoom-internal-isolation.sql` (+134/−2) | pgTAP. Only 2 deleted lines, both forced by an 8th table. |

**Tier 2 — credential handling in the browser.**

| File | Purpose |
|---|---|
| `components/sessions/JoinMeetingButton.tsx` (+492/−…) | Chooses the view, mounts one root, holds credentials in a ref the join empties. |
| `lib/meet/zoom-sdk-loader.ts` / `zoom-client-view-loader.ts` (new) | CDN loaders. Vendor React sequentially **before** the bundle — the Z0B trap. |
| `lib/meet/embed-capabilities.ts` (new, 150) | `selectEmbedView()` — the whole support matrix, one place. |
| `components/sessions/PreJoinCheck.tsx` (new, 214) | Device preflight. Reads nothing that can block a join. |

**Tier 3 — integration layer and config.**
`lib/zoom/api.ts`, `client.ts`, `fake.ts` (ZAK: interface, REST call, faithful fake) ·
`lib/featureFlags.ts` (+9, `FEATURE_ZOOM_EMBED`).

**Tier 4 — tests only** (10 files, ~3,700 lines). No production behaviour.

**Deleted files: none.**

---

## 3. Invariants, with entry points for verifying each

| # | Invariant | Where to check |
|---|---|---|
| I1 | **`join_url` never appears in an SDK payload** (§5) | `join.ts` — the SDK return spreads an object with no such field. Test `[A3]` asserts `Object.keys(body)` not `toBeUndefined()`. |
| I2 | **Authorization resolves before any meeting fact is read** | `join.ts` gate order 1–8; the flag and the fallback intent are read *inside* outcome 8. `[A8]`/`[C6]` run the denial matrix with the flag ON. |
| I3 | **An admin never receives a consultant's personal ZAK** (§9) | `meeting-zak-policy.ts:121-132`. `[B5]` asserts the ZAK client was **not called**. |
| I4 | **Every issuance writes an audit row; a failed write withholds the credential** | `join.ts` `issueHostCredential` ordering. `[B8]`. |
| I5 | **The ZAK is never persisted, logged or echoed** (§5) | No column exists for it; `[B7]` greps audit inserts *and* stderr. |
| I6 | **The numeric role never reaches the wire** | Payload carries descriptive `'host'\|'participant'`; `role:0/1` lives only inside the signed JWT. `[A5]` decodes it. |
| I7 | **The client never reads the embed flag** — `mode` is the only signal | `[C11]`/`[D8]` read component sources off disk. |
| I8 | **`zoom_internal` stays unreachable** — anon/authenticated no USAGE, no grants | migration tail + pgTAP section G (18 asserts). |
| I9 | **Flag off ⇒ Z2 behaviour byte-identical** | `[A1]`, `[C1]`, `[D1]`; the Z2 suite is untouched. |

---

## 4. What the PM verified independently — commands and results

Every gate was re-run by the PM in the executor's worktree at **every chunk head**, unpiped,
per-gate exit codes. At the final head `18441936`:

```
npm run type-check   → 0
npm run lint         → 0
npm test             → 0   ·  6985 passed / 300 files  (×3 consecutive clean runs)
npm run test:db      → 0   ·  Files=11, Tests=484, Result: PASS
npm run build        → 0   ·  ✓ Compiled successfully
```

Baseline arithmetic closed at every round: 6781/291 → 6804/292 → 6875/294 → 6939/298 →
6985/300.

**Eleven PM mutation probes across four rounds**, each distinct from the executor's and each
proving a criterion is load-bearing rather than decorative — among them: breaking
`customer_key` hyphen-stripping (2 tests fail); signing `role:1` instead of `0` (**[A5]**
fails — a silent role escalation cannot pass); widening the profile select to `email`;
removing the audit-as-precondition (**[B8]**); deleting the host-identity guard the executor
called "impossible today" (**still fails — it is covered, not dead code**); leaking the ZAK to
a log (**[B7]**); importing `featureFlags` into a client component and into the new Client
View loader (**[C11]**/**[D8]**); reversing the SDK vendor load order (**[C3]**). Every probe
reverted with byte-identity re-proved by SHA-256.

**Read line by line, not sampled:** the full source diff of every chunk; the migration; the
two deleted lines in the sealed pgTAP file; the 47 restructured lines in `JoinMeetingButton`
(all Z2 behaviours confirmed surviving at `:219`, `:224`, `:231`, `:242`, `:394`); and the
exact set of deleted lines in r3's test file when r4 edited two `[C9]` assertions.

**The r4 intermittent failure was investigated, not accepted.** The executor disclosed 8
failures in `pasantias-pdf.test.ts` in 1 of 3 runs and stated they had not tested the base.
The PM checked out the base `db9fc6c7` and ran the full suite 3×: **it failed once**, on a
*different* file, with a cross-file `vi.mock` registry leak. HEAD then ran 3× clean (4×
counting the gate run). **Conclusion: pre-existing suite-wide flakiness; HEAD is no worse
than its base.**

## 4b. What the PM did NOT verify — the highest-yield hunting ground

- **Nothing in this phase has run against the real Zoom SDK or a real browser.** `init`/`join`
  are mocked; the loaders are proven against driven events, not `source.zoom.us`. The CDN URLs
  were checked for reachability by the executor, not by the PM.
- **The hardware verdict was WAIVED, not cleared** (§16, owner decision 2026-08-08). Behaviour
  on 4 GB dual-core Windows 10, Chromebooks, Android tablets and a bad school network is
  **unknown by construction**. If you think the waiver was wrong, say so — it is an owner
  decision, but its consequences are this phase's.
- **CI has never run on this branch.** All results above are one laptop.
- **The production schema does not yet contain the migration.** §0.1(d) makes verifying it a
  close condition; it is not done.
- **One vendor citation could not be reproduced.** The r4 report presents a per-view matrix
  including *"Component View — Firefox ✘"*. The PM fetched Zoom's browser-support page and got
  the Client View/Firefox support and the verbatim *"not supported on mobile or tablet
  browsers"*, **but not that Firefox row**. The decision is safe under both readings (Firefox
  goes to Client View, which Zoom definitely supports), but **treat it as a safe choice under
  uncertainty, not settled fact.**
- **Coverage is mocked at the Supabase boundary throughout**, as the Z2 suites are. No test
  exercises a real `zoom_internal` row; the bigint→string meeting-number conversion is proven
  against fixtures only.
- **`supportsClientView()` is effectively "a browser with WebAssembly."** Whether a locked-down
  school kiosk browser or in-app webview falls into it is unmodelled.

---

## 5. Accepted deviations — the PM ruled on these; challenge the rulings, not just the code

| # | Deviation | PM ruling and why |
|---|---|---|
| 1 | Z3-1 shipped the **participant** embed only; hosts kept link mode until Z3-2 | **Accepted, PM-directed.** §9 sets `join_before_host:false`, so `role:1` without a ZAK hands the person the meeting depends on a join that fails. |
| 2 | §9's rule went into a **new pure module**, not into `join.ts` | **Accepted, better than the prompt.** A pure function is exhaustively testable over the fact space; the route suite reaches only arranged combinations. |
| 3 | `zoom_zak_issuances.profile_id` has **no FK** to `public.profiles` | **Accepted.** SET NULL would erase the audit's subject; RESTRICT would let an old issuance block a legitimate deletion. An audit row must outlive what it names. Documented in a `COMMENT ON COLUMN`. |
| 4 | A failed audit write **withholds** the ZAK | **Accepted.** §9 says *every* issuance writes an event; otherwise that sentence is false. Fails to link mode, which works. |
| 5 | `is_active` is **not** consulted before requesting a ZAK | **Accepted.** §9 never mentions it; Zoom refuses an inactive identity and the existing fallback catches it. |
| 6 | An existing pgTAP file was **modified** rather than a new one added | **Accepted.** Only 2 deleted lines, both forced by an 8th table. Zero assertions weakened. |
| 7 | Two symbols **exported** from `zoom-sdk-loader.ts` so the Client View loader could reuse them | **Accepted.** The alternative was duplicating 28 lines; no behaviour changed. |
| 8 | r4 **edited two pre-existing `[C9]` assertions** | **Accepted — the contradiction was the PM's.** `[D1]` said "unchanged" while the scope required that behaviour to change. The executor quoted before/after and re-asserted the claim against the loader rather than the DOM: strictly stronger. |
| 9 | Desktop **Firefox routes to Client View**, not to the link | **Accepted, and it improves on the PM's own ruling**, which would have dropped Firefox users to a link unnecessarily. |
| 10 | Component View is **not** gated on WebAssembly while Client View is | **Accepted, but not for the executor's stated reason.** They justified it by keeping a `PreJoinCheck` row reachable and correctly distrusted that. The real reason: WASM is universal in any browser passing Component View's other gates, so the test would be dead code there. |

---

## 6. Open items and residual risks

1. **🔴 Vitest cross-file state pollution — not Z3's, and it can red this PR.** Two demonstrated
   signatures: a `vi.mock` registry leak on `@/lib/api-auth`, and a `process.env.VERCEL_ENV`
   leak affecting `pasantias-pdf.test.ts`. `ci.yml` gives `retries: 2` to **Playwright only**.
   First question for whoever owns it: which files mock `@/lib/api-auth` partially, and which
   write `process.env` without restoring it?
2. **The migration is unapplied in production.** §0.1(d) — a close condition.
3. **The §9 facts are read twice** (r2 SHOULD-FIX ①) — `join.ts` re-derives what
   `authorizeMeetingJoin` already read. Two modules now answer "is this the assigned
   facilitator?" independently. Deferred: the fix widens a sealed module's return type.
4. **Loader duplication with `diag.tsx`** — accepted debt of PM ruling ⑤; collapse it when the
   hardware protocol closes.
5. **`sdkKey` passed to `ZoomMtg.join`** though Zoom marks it deprecated since v4.0.0. Zoom's
   own samples still pass it.
6. **Client View's ~30 other `init` options** sit at Zoom's defaults — no product decision has
   been made about chat, breakout, `disableInvite` or recording UI.
7. **Credential dwell during the preflight.** Between the POST and the user pressing "Entrar",
   `signature`/`passcode`/`zak` sit in a ref. **PM ruled to keep it**: §5 already records, as
   accepted residual risk, that an authorized attendee can extract mn+passcode from devtools —
   dwell does not widen the trust boundary. The design that removes it entirely fetches the
   payload *after* the preflight, at the cost of a round trip.
8. **Carried from earlier phases, unowned:** the 22-table production RLS finding; INSPIRA's
   unapplied `20260803170000_add_email_marketing_tables`.

---

## 7. Exact local gate commands

```bash
git -C /Users/brentcurtis/dev/fne-lms worktree add /Users/brentcurtis/dev/wt/z3-review feat/zoom-embed
cd /Users/brentcurtis/dev/wt/z3-review && npm ci
npm run type-check && npm run lint && npm test && npm run build
npm run test:db          # local Supabase stack must be up; do NOT run `supabase db reset` — six worktrees share it
npm run lint:testid      # advisory; 2668-problem baseline is pre-existing, this phase adds 0
```

---

## 8. Blocking before this phase can close

> **UPDATED 2026-08-08, after Sol's first review.** Items 1 and 2 were written before either
> happened and were still worded as pending when Sol read this file — Sol's verdict repeats
> that stale wording back. Both are now **done**. The correction is the PM's, and it is
> recorded in the ledger rather than quietly overwritten.

1. ✅ **PR opened and CI green** — [#47](https://github.com/brentcurtis76/fne-lms/pull/47),
   head `18441936`, **all six gates SUCCESS on the first run**
   ([31291550337](https://github.com/brentcurtis76/fne-lms/actions/runs/31291550337)),
   `MERGEABLE / CLEAN`. The documented Vitest flake did **not** fire — which is a data point,
   not an acquittal: the PM measured it at 1-in-3 on this branch's base, and one green run is
   what that looks like two times in three.
2. ✅ **`20260810120000_zoom_zak_issuances.sql` applied to production** by Brent and
   **verified read-only by the PM** (§0.1(d)): table present, RLS on, zero policies, no
   credential column, version row recorded, and the schema-wide `REVOKE`/`GRANT` tail
   confirmed not to have re-tiered Z1b's 7 tables or 9 functions (0 readable by
   `anon`/`authenticated`, 0 without RLS, 0 functions executable by either).
3. 🔄 **Sol's `APPROVE` / `APPROVE WITH NOTES`** — first pass returned **`REQUEST CHANGES`,
   five MAJOR**, all five PM-verified as valid. **All five are now closed** across rounds
   r5–r8; head is **`fc8a564d`**, and **CI is green on all six gates at that head**. Two of
   the five (M1's `noopener` logic, M4's Client View placement) traced to PM errors rather
   than executor deviations, and r7 falsified a third PM ruling — see the ledger. **Ready
   for re-review.**
4. ⬜ **Brent's merge** (§0.2 step 5). Only then does the ledger row flip to ✅ DONE.

> **Note for the re-review — three defects surfaced that were nobody's finding**: the Client
> View stylesheets 403'd silently at the pinned CDN path (r7); the iframe appended Zoom to a
> discarded `about:blank` document (r8); and M3's own deadline was applied to `join`, a step
> that waits for a **person** (r7 diagnosis → r8 fix, owner-ruled). The last of these means
> **the bounded/unbounded split is now the thing most worth attacking**: machine failures
> stay bounded at 45 s, a deliberating human is never interrupted, and the signal that
> separates them is a DOM reading — deliberately generic, evidenced over five real runs at a
> 15× margin, and PM-probed for the "matches too early" direction.
