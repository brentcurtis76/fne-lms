SESSION: INSPIRA · A8 · Codex re-check · REVIEW

**Targeted re-check of the A8 r3 diff only.** You already passed this phase at `fd33706c`
(`docs/plan/reviews/REVIEW-A8.md`, VERDICT: PASS, zero BLOCKING). Nothing in that verdict is
reopened here.

Brent elected to fix your two SHOULD-FIX items **before merge** rather than defer them, so the
branch now carries one post-PASS commit. This asks you to check that commit and nothing else.

```
git diff fd33706c 0cb0cf58
```

Branch `phase/a8-leads-ui`, head **`0cb0cf58`**. Six files: two source, two test, two docs.

Please append your verdict to `docs/plan/reviews/REVIEW-A8.md` rather than opening a new file —
one review artifact per phase.

---

## What r3 changed, and why each

**Item 1 — your S-01.** `handlePatch` now carries the validated status into the write:
`.update(update).eq('id', id).eq('status', currentStatus)`. The empty `maybeSingle()` became
reachable and answers **409** with the guard status; `updated ?? null` is gone, so a lost race
can no longer surface as a 200 with a null lead. `.eq` and not `.or`, per the binding
2026-08-03 rule.

**Item 2 — your S-02.** `sourcePathRepeatsUtm` parses the stored path's query with
`URLSearchParams` (substring after the first `?`; no `?` → `false`, no throw) and compares
**per key on decoded values**, replacing the substring scan.

**Item 3 — your NIT.** The `<label htmlFor>` moved inside the branch that renders the `<select>`;
the terminal branch renders the same caption as a plain `<div>`.

**Deliberately NOT done**, as instructed: the `useId` refactor (you scheduled it before B5) and
the `max_rows = 1000` count cap (needs a query-shape decision; backlogged).

---

## What I already verified, so you can skip it

Re-run by me on `0cb0cf58`: targeted **56/56** (was 43, none removed); full suite **265 files /
6255 tests**; `type-check`, `lint`, `lint:testid` clean; `next build` compiled with both A8
artifacts emitted.

**I mutated all three fixes back and all three died:** removing the status guard from the UPDATE
→ 3 failed; reverting `sourcePathRepeatsUtm` to the substring scan → 4 failed (the same four the
executor reported as its pre-fix failure, independently reproduced); restoring the dangling
`htmlFor` → 1 failed. Tree verified clean after each.

I also checked that deletion cannot be mistaken for a concurrent move — D-04 gives this table no
delete path at all, so an empty update result can only mean the status changed.

---

## The three things I want your judgment on

**1. The 409 body carries the guard value, not a re-read.** `status` in the 409 is what the lead
held when this request was validated, not the row's actual current status — after a lost race
that is unknown to us, and re-reading is one more racy round trip. The executor declared this as
an assumption. D-07's shape ("409 with current status in the body") is written for campaign
routes that do not exist yet, so there is no precedent in the repo to match. Is this the right
reading of D-07, and is it the right answer for a future client that will act on the field?

**2. A notes-only PATCH is now subject to the status guard**, so it 409s if another admin moved
the lead meanwhile — even though notes and status do not conflict. I accepted this as optimistic
row locking: the alternative (guard only when `hasStatus`) lets a stale-view notes overwrite
through. The test that pins it PATCHes notes on a **`converted`** lead, which is the case that
breaks first if anyone later narrows the guard. Your call on whether row-level is the right
granularity.

**3. `currentStatus` is typed `string | null`** (defensive; the column is `NOT NULL`). A null
would make the guard match nothing and answer 409 rather than commit — the safe direction, but
it means an impossible state degrades to a confusing message rather than a loud one.

Lower stakes, already backlogged: `sourcePathRepeatsUtm` still does not strip a `#` fragment, so
`/pasantias?utm_source=x#frag` yields `x#frag` and misses a genuine repeat — the same
false-negative class r3 just fixed for encoding, one step further out.

---

## Scope of this re-check

Only `git diff fd33706c 0cb0cf58`. If something outside that diff troubles you, say so as a NOTE
rather than a finding — the phase passed at `fd33706c` and re-litigating it would cost a round
this phase does not have. **Executor rounds are exhausted (3 of 3):** a BLOCKING finding here
means a re-plan proposal to Brent, not an r4. Please weigh severity with that in mind, without
letting it soften a genuine BLOCKING call.

Output using the CODEX REVIEW format.
