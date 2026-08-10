# Fase 6 (Zoom Z3 — Embedded experience, DESKTOP) — PM dossier

> Written per `PLAN.md` §0.2 step 2, and **rebuilt from measurement on 2026-08-08** at
> `2a459a33`. Companion: `fase-6-review-request.md` (executor-authored). **Both are leads,
> never the boundary** — review the actual diff.
>
> **Every number in this file was measured at the current head, not remembered.** That
> sentence is here because the PM shipped a stale version of this document **five times**
> during this phase — three of them on a reviewer's entry document, once in the ledger — and
> a verdict once repeated a stale claim back. **If any figure disagrees with what you
> measure, trust your measurement and file it.**

**Branch** `feat/zoom-embed` · **merge-base** `65c8114b5acf7b3242c5c78d8ec7466332045e26` ·
**head** `2a459a33` · **10 commits**

**Diff to review:** `git diff 65c8114b..2a459a33`

> ⚠️ **Not `origin/main..HEAD`.** PM ledger, plan and prompt commits landed on `main` after
> this branch was cut and appear there as spurious deletions.

**PR** [#47](https://github.com/brentcurtis76/fne-lms/pull/47) — **all six CI gates SUCCESS at
this head**, `MERGEABLE`. The migration is applied to production and PM-verified read-only.

**Measured at `2a459a33`:** 49 files changed, **+9548 / −83**. Excluding `docs/`: 30 files,
**+8626 / −83**. Tests: 15 files, **+5515 / −0**. **Zero files deleted.**
`git diff --stat 65c8114b..2a459a33 -- tests/e2e/` is **empty**.

---

## 1. Scope — the authority for this phase

The GENERA itinerary does not carry Zoom phases, so **this section plus `PLAN.md` §15's Z3
row is the scope authority** (§0.2 step 3). **Read `PLAN.md` §15.1 first** — it is short and
it explains why this phase is now desktop-only.

**Z3 was SPLIT by owner decision on 2026-08-08**, after this reviewer's second
`REQUEST CHANGES`. The amendment was itself independently reviewed — `REQUEST CHANGES`, then
`APPROVE WITH NOTES` after correction.

- **Z3 (this phase)** — Component View, **desktop only**; `PreJoinCheck`; es-ES; SDK-failure
  auto-fallback to link. **Mobile, tablet, Firefox and narrow-desktop windows receive the Z2
  platform link** — what production already serves.
- **Z3b (new, not this phase)** — Client View, carrying this reviewer's **M1, M2 and M3**,
  gated on a **revised, Client-View-specific** field protocol.

**Chunk → commit map, measured:**

| Round | Commit | What |
|---|---|---|
| Z3-1 | `5c3bbea1` | `FEATURE_ZOOM_EMBED`; the `mode:'sdk'` join outcome, participants only |
| Z3-2 | `09d32643` | ZAK retrieval; §9 issuance rule; the `zak_issued` audit table; `role:1` |
| Z3-3 | `db9fc6c7` | Component View, CDN loader, `PreJoinCheck`, es-ES, link fallback |
| Z3-4 | `18441936` | Client View for mobile/Firefox; popup-retry fix |
| r5 | `1d259a72` | Sol M1–M4 remediation; the Client View iframe |
| r6 | `15981fbc` | M5 runtime proof (evidence only) — found the stall and the CSS 403 |
| r7 | `137a6120` | Falsified the PM's device hypothesis; fixed the CSS; made a failed stylesheet observable |
| r8 | `fc8a564d` | Owner ruling: bound the machine, never the person. Closed M5. Fixed an `about:blank` iframe race |
| r9 | `6ca38a38` | **This round's substance**: Sol M4's request budget, structural unreachability, m2 |
| r9 | `2a459a33` | Review-request rebuilt from measurement (m1) |

**Explicitly OUT of scope — challenge any of these:**

- **Sol M1, M2, M3** — moved to Z3b **with the code they belong to.** Legal only because
  **structural unreachability is proven** (§3, I10). If you find any path that still reaches
  Client View, **the split does not hold and those findings return here.**
- `lib/utils/meeting-join-policy.ts`, `lib/utils/meeting-zak-policy.ts`, the join route's gate
  order, the §9 rule, the audit write's ordering, the migration, `supabase/tests/`.
- `tests/e2e/zoom-join-authz.spec.ts` — blocking CI Gate 4, **verified untouched** (above).
- `pages/meet/diag.tsx` / `diag-signature.ts` — the field instrument. Accepted duplication with
  `lib/meet/zoom-sdk-loader.ts`; recorded debt, not oversight.
- The §9-facts-read-twice cleanup (r2 backlog) — wants a sealed module's return type widened.

---

## 2. File inventory by risk — measured churn

**Tier 1 — the trust boundary. Read these first.**

| File | Churn | Purpose |
|---|---|---|
| `pages/api/meet/session/[id]/join.ts` | **+500/−13** | The single authorized opening (§5). SDK payload, ZAK issuance + audit, the `{fallback:'link'}` intent, and r9's request budget. Its header is the operator contract |
| `lib/utils/meeting-zak-policy.ts` | **+135/−0** | §9's issuance rule as a pure, total function. **The security core** |
| `supabase/migrations/20260810120000_zoom_zak_issuances.sql` | **+66/−0** | The audit table. Additive only; RLS on; §6 grants |
| `supabase/tests/002-zoom-internal-isolation.sql` | **+132/−2** | pgTAP. Only 2 deleted lines, both forced by an 8th table |

**Tier 2 — credential handling and view selection in the browser.**

| File | Churn | Purpose |
|---|---|---|
| `components/sessions/JoinMeetingButton.tsx` | **+777/−48** | Chooses the view **before posting**, mounts one root, holds credentials in a ref the join empties |
| `lib/meet/embed-capabilities.ts` | **+150/−0** | `selectEmbedView()` (`:109`) — the whole support matrix, one place |
| `lib/meet/zoom-sdk-loader.ts` | **+233/−0** | Component View CDN loader; vendor React **before** the bundle (the Z0B trap) |
| `components/sessions/PreJoinCheck.tsx` | **+214/−0** | Device preflight. Reads nothing that can block a join |

**Tier 3 — integration layer.** `lib/zoom/client.ts` **+179/−11** (r9's `AbortSignal` and
budget) · `token.ts` **+51/−7** · `api.ts` **+50/−1** · `fake.ts` **+70/−0** ·
`lib/featureFlags.ts` **+8/−1**.

**Tier 4 — Z3b's starting point, shipped UNREACHABLE.** `lib/meet/zoom-client-view-loader.ts`
**+506/−0** and `public/meet/zoom-client-view.html` **+40/−0**. These compile, their module
suites are green, and **no code path reaches them** — see §3 I10.

**Tests:** 15 files, **+5515/−0**. **Zero files deleted anywhere in the phase.**

---

## 3. Invariants, with entry points

| # | Invariant | Where to check |
|---|---|---|
| I1 | **`join_url` never appears in an SDK payload** (§5) | The SDK return spreads an object with no such field. `[A3]` asserts `Object.keys(body)`, not `toBeUndefined()` |
| I2 | **Authorization resolves before any meeting fact is read** | `join.ts` gate order; the flag and the fallback intent are read *inside* outcome 8 (`:661`). `[A8]`/`[C6]` run the denial matrix with the flag ON |
| I3 | **An admin never receives a consultant's personal ZAK** (§9) | `meeting-zak-policy.ts:93` (`resolveZakIssuance`), the admin branch at `:126`. `[B5]` asserts the ZAK client was **not called** |
| I4 | **Every issuance writes an audit row; a failed write withholds the credential** | `join.ts` — `getUserZak` at `:524`, the insert at `:539`. `[B8]` |
| I5 | **The ZAK is never persisted, logged or echoed** (§5) | No column exists for it; `[B7]` greps audit inserts *and* stderr |
| I6 | **The numeric role never reaches the wire** | `role:0/1` lives only inside the signed JWT. `[A5]` decodes it |
| I7 | **The client never reads the embed flag** — `mode` is the only signal | `[C11]`/`[D8]` read component sources off disk. **`grep -c "view"` over `join.ts` = 0**: the server is never told which view was chosen |
| I8 | **`zoom_internal` stays unreachable** — anon/authenticated: no USAGE, no grants | migration tail + pgTAP section G. **Verified in production, read-only** |
| I9 | **Flag off ⇒ Z2 behaviour byte-identical** | `[A1]`, `[C1]`, `[D1]`; the Z2 suite is byte-untouched |
| **I10** | **Client View is STRUCTURALLY UNREACHABLE** — every non-`component` branch requests link mode **before** any bundle, iframe, worker, join, ZAK or audit row | **The one to attack.** `JoinMeetingButton.tsx` calls `selectEmbedView()` *before* posting; `clientview.test.tsx` holds a **truth table** — 8 branches + 2 adversarial + 2 positive controls — each asserting seven named non-calls |
| **I11** | **The request-path ZAK is bounded** | `ZAK_REQUEST_BUDGET_MS = 8_000` (`join.ts:208`); `AbortSignal` asserted **by identity** into `fetchImpl`; exhaustion → **200 link payload, no audit row** |

---

## 4. What the PM verified independently

All five gates re-run in the executor's worktree at **every round head**, unpiped, per-gate
exit codes. At `2a459a33`:

```
npm run type-check → 0
npm run lint       → 0
npm test           → 0   ·  7060 passed | 11 skipped (7071) / 305 files
npm run test:db    → 0   ·  Files=11, Tests=484, Result: PASS
npm run build      → 0
```

**And on CI at this head: all six gates SUCCESS.**

Baseline arithmetic closed at all ten rounds: 6781/291 → 6804/292 → 6875/294 → 6939/298 →
6985/300 → 7004/302 → 7008/302 → 7030/304 → **7060/305**.

**Fifteen PM mutation probes across ten rounds**, each distinct from the executor's, each
proving a criterion load-bearing rather than decorative. Highlights: signing `role:1` instead
of `0` (**[A5]** fails — silent role escalation cannot pass); removing the audit-as-precondition
(**[B8]**); deleting the host-identity guard the executor called "impossible today" (**still
fails — covered, not dead code**); leaking the ZAK to a log (**[B7]**); importing `featureFlags`
into a client module (**[C11]**/**[D8]**); reversing the SDK vendor load order (**[C3]**);
forcing the readiness signal true (6 tests); and at r9 — **forcing the server to ignore the
link intent, which fails three `[B12]` tests, locking unreachability on the server side
independently of the client.** Every probe reverted with byte-identity re-proved by SHA-256.

**Read line by line, not sampled:** every chunk's source diff; the migration; the two deleted
lines in the sealed pgTAP file; the 47 restructured lines in `JoinMeetingButton` at r5; the
`about:blank` readiness fix at r8; and all evidence screenshots, one of which the executor had
correctly redacted because a camera-off participant renders a real person's profile photo.

**Investigated rather than accepted:** the r6 intermittent test failure — the PM checked out
the base and ran the suite three times, it failed once on a *different* file via a cross-file
`vi.mock` leak, so the flakiness is **pre-existing** and HEAD was measurably no worse.

## 4b. What the PM did NOT verify — the hunting ground

- **No Client View code path has been exercised end-to-end since r8**, because r9 made it
  unreachable. Its module suites pass; **11 component-level tests are PARKED** in five
  `describe.skip('[Z3b, PARKED]')` blocks. A skipped test proves nothing. **If unreachability
  is imperfect, that coverage is gone and the defect is live.**
- **Component View's own field behaviour is unknown.** §16's hardware verdict was **WAIVED,
  not cleared** for this phase (owner decision). Nothing has run on 4 GB dual-core Windows 10,
  a Chromebook, or a bad school network. Desktop joins are proven **in an office, on a laptop,
  with fake devices**.
- **The token-wait asymmetry** (r9): the budget bounds the caller's *wait* on the shared OAuth
  grant, not the grant's own fetch. A stalled provider therefore degrades every request to
  link mode **silently**. PM ruled the choice correct and routed the observability gap to Z12.
- **No exhaustiveness check ties the truth table to `selectEmbedView()`.** A new branch added
  later would not appear in the table and nothing would fail.
- **Coverage is mocked at the Supabase boundary throughout**, as the Z2 suites are.
- **CI's Vitest gate has no retries** and this repo has demonstrated cross-file state
  pollution (two signatures, measured 1-in-3 on one commit). An unrelated red is possible.

---

## 5. Accepted deviations — challenge the rulings, not just the code

| # | Deviation | PM ruling |
|---|---|---|
| 1 | Z3-1 shipped participants only; hosts kept link mode until Z3-2 | **PM-directed.** §9 sets `join_before_host:false`, so `role:1` without a ZAK fails the person the meeting depends on |
| 2 | §9's rule in a **new pure module**, not in `join.ts` | **Better than the prompt.** A pure function is exhaustively testable; the route suite reaches only arranged combinations |
| 3 | `zoom_zak_issuances.profile_id` has **no FK** | **Accepted.** An audit row must outlive the row it names. Documented in a `COMMENT ON COLUMN` |
| 4 | A failed audit write **withholds** the ZAK | **Accepted.** §9 says *every* issuance writes an event; otherwise that sentence is false |
| 5 | `is_active` not consulted before requesting a ZAK | **Accepted.** §9 never mentions it; Zoom refuses and the fallback catches it |
| 6 | An existing pgTAP file modified rather than a new one added | **Accepted.** 2 deleted lines, both forced. Zero assertions weakened |
| 7 | Desktop **Firefox routes to Client View**, not the link (r4) | **Accepted then; MOOT now** — under I10 Firefox takes the link |
| 8 | Component View **not** gated on WebAssembly while Client View is | **Accepted, but not for the executor's reason.** WASM is universal in any browser passing Component View's other gates, so the test would be dead code there |
| 9 | The r5 escape hatch renders in `joining`, not `joined` | **Accepted.** Once entered, Zoom's «Salir» owns that state |
| 10 | **11 tests PARKED, not fixed** (r9) | **Accepted, and made a Z3b entry criterion.** The alternatives were a test-only door back into Client View — which would have **falsified the unreachability it was meant to prove** — or deleting Z3b's starting point |
| 11 | The budget bounds the caller's wait on the shared OAuth grant, not the grant (r9) | **Accepted.** Aborting a single-flight grant on one request's budget would fail cron jobs riding it. Observability gap → Z12 |

---

## 6. Open items and residual risks

1. **🔴 Vitest cross-file state pollution — not this phase's, and it can red this PR.** Two
   signatures: a `vi.mock` registry leak on `@/lib/api-auth`, and a `process.env` leak
   reaching `pasantias-pdf.test.ts`. `ci.yml` gives `retries: 2` to **Playwright only**.
   Corroborated independently at r9, where the executor hit the same jsdom global leak.
2. **11 parked tests** must be un-parked as a **Z3b entry criterion**, or they rot.
3. **§16's hardware verdict remains WAIVED** for desktop — not cleared. Z3b requires a
   **revised, Client-View-specific** protocol; the existing one drives Component View via
   `/meet/diag` and is decided on P0 desktop.
4. **The split's product cost, stated because the PM first got this wrong:** §12 disables
   recording in link-out mode and G1 failed definitively, so mobile/tablet/Firefox users left
   on the Z2 link receive **no Z4 recording workflow** and contribute **no Z5 transcript or Z8
   minuta input** until Z3b ships.
5. **The §9 facts are read twice** — `join.ts` re-derives what `authorizeMeetingJoin` already
   read. Two modules answer the same question independently.
6. **Loader duplication with `diag.tsx`** — accepted debt of the r3 ruling.
7. **`sdkKey` passed to `ZoomMtg.join`** though Zoom marks it deprecated; their own samples
   still pass it.
8. **Carried from earlier phases, unowned:** the 22-table production RLS finding; INSPIRA's
   unapplied `20260803170000_add_email_marketing_tables`.

---

## 7. Exact local gate commands

```bash
git -C /Users/brentcurtis/dev/fne-lms worktree add /Users/brentcurtis/dev/wt/z3-review feat/zoom-embed
cd /Users/brentcurtis/dev/wt/z3-review && npm ci
npm run type-check && npm run lint && npm test && npm run build
npm run test:db          # local stack must be up; do NOT run `supabase db reset` — worktrees share it
npm run lint:testid      # advisory; 2668-problem baseline is pre-existing, this phase adds 0
```

---

## 8. Blocking before this phase can close

1. ✅ **PR open, CI green** — #47, **all six gates SUCCESS at `2a459a33`**, `MERGEABLE`.
2. ✅ **Migration applied to production and PM-verified read-only** (§0.1(d)): table present,
   RLS on, zero policies, no credential column, version row recorded, and the schema-wide
   `REVOKE`/`GRANT` tail confirmed not to have re-tiered Z1b's 7 tables or 9 functions.
3. ⬜ **Sol's `APPROVE` / `APPROVE WITH NOTES`.** First pass: 5 MAJOR. Second: 4 MAJOR + 2
   MINOR. **M4, m1 and m2 are closed; M1/M2/M3 moved to Z3b under an approved amendment.**
4. ⬜ **Brent's merge** (§0.2 step 5). Only then does the ledger row flip to ✅ DONE.

**The single question that decides this review: is Client View genuinely unreachable?** If it
is, M1/M2/M3 legitimately belong to Z3b and this phase is done. If it is not, they are live
defects in shipped code and this phase is not.
