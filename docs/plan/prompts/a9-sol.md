SESSION: INSPIRA · A9 · Codex final review (round 1 of max 2)

Final review of phase **A9 — Track A release verification** for INSPIRA Comms (repo `fne-lms`;
Next.js Pages Router, TypeScript strict, Supabase, Vercel auto-deploy from `main`).

**You have final say on BLOCKING items. The phase does not close until you pass it.**

---

## WHAT TO REVIEW

- **Branch:** `phase/a9-verify`, head **`9b1ed1dd`** — pushed, worktree `~/dev/wt-a9`.
- **The diff:** `git diff 7c7059ff..9b1ed1dd`. Base `7c7059ff` is where it branched from `main`.
- **The code is one commit:** `82bc0e7b`. Everything above it is docs (ledger, PLAN row, this file).
- **[PR #46](https://github.com/brentcurtis76/fne-lms/pull/46)**, CI run **`31276283612`** — all six
  gates green. Note CI builds the PR **merge** commit, so it proved this branch against `main`
  *including* Z2's just-merged work (PR #45), not the branch head in isolation.

Six files, +692/−19:

| File | What |
|---|---|
| `tests/e2e/pasantias-flow.spec.ts` | new, 259 lines, 4 tests — the unmocked integration spec |
| `scripts/ci/e2e-mandatory.mjs` | +6 — registers it so it cannot go quiet by being skipped |
| `__tests__/pages/pasantias-site-links.test.ts` | +88/−19 — closes A7a's two guard gaps |
| `docs/plan/evidence/a9/release-checklist.md` | new — the executed release checklist |
| `docs/planning/reviews/fase-a9-review-request.md` | new — the executor's own review request |
| `docs/plan/LEDGER.md` | append only — executor round entry + PM verification entry |

---

## ⚠️ WHERE A9's ACCEPTANCE CRITERIA ACTUALLY LIVE — read this before opening `PLAN.md`

**`PLAN.md`'s A9 section is the plan's last "as v2" pointer.** It names only the criterion that
*changed* (`R2-S-01`) plus five amendments added at other phases' closes. Reading it alone will not
give you a criteria list, and A8 already paid for that: its `[A3]` turned out to be unsatisfiable
against its own scope precisely because nobody had read the criteria end to end.

**The full transcription is committed at `docs/plan/prompts/a9-1.md`** — v2's `[A1]`–`[A3]` inlined
verbatim alongside `[A-new-2]`–`[A-new-5]`. That file is the dispatch contract for this round and is
the criteria list to review against. The original v2 source, if you want to check the transcription
faithfully reproduced it (worth doing — it is a transcription, and transcriptions drift):
`git show 6b7e32a2:docs/plan/PLAN.md`, the `## Phase A9` section.

Condensed, so you know what you are holding the branch to:

- **[A1]** The integration spec is green **in CI**, no mocks on the lead path, synthetic data only,
  and on `MANDATORY_SPECS`.
- **[A2]** A release checklist is executed and committed under `docs/plan/evidence/a9/`, covering:
  `/pasantias` live with correct dates; ficha downloads; form → lead row + auto-reply at a test
  mailbox + internal notification; the brochure link from the email works; homepage card correct;
  WhatsApp unfurl on a named device (owner-run). Every row PASS with evidence, FAIL with what was
  seen, or OWNER-RUN — PENDING with exact steps.
- **[A3]** Any failure is a finding; the phase closes only when the checklist is fully green.
- **[A-new-2]** Admin-API assertions use **raw column names** — `brochure_sent_at`, not A8's UI
  label "Programa enviado".
- **[A-new-3]** Every assertion scoped to the lead the spec created (the table is **not** empty in
  CI — A8 seeds a permanent fixture), and A8's fixture left exactly as seeded.
- **[A-new-4]** No behavioural change from A8's backlog rode along. A9 changes **no product code**.
- **[A-new-5]** A7a's two guard gaps closed (or explicitly accepted in writing, with a reason).

---

## CONTEXT THAT DECIDES WHETHER THE SPEC IS RIGHT

Three facts about the code under test. All three were verified in source, and the first two were
then *observed* in the CI run.

1. **`POST /api/pasantias/lead` answers a uniform `200 {"success":true}`** on both the insert path
   and the already-known-address path (anti-enumeration). That is *why* `R2-S-01` requires
   persistence to be asserted through `GET /api/admin/pasantia-leads` as the admin fixture and
   explicitly **not** through the public response. D-04 also forbids a test reaching past the API
   into the table: RLS grants no authenticated write, admin is SELECT-only.

2. **`brochure_sent_at` is not a "brochure was sent" flag — it is the auto-reply's atomic 24 h
   claim stamp**, released again when the send provably never left the process
   (`pages/api/pasantias/lead.ts:176–210` claims, `:271–275` releases). CI sets no
   `RESEND_API_KEY`, so `sendLeadAutoReply` returns `failure:'not_configured'`,
   `canReleaseAutoReplyClaim` is true (`lib/pasantias/emails.ts:67–69`), and the column ends
   **`null`**. The spec asserts `null` as the release contract working — `emails.ts:60–62` says in
   prose that a missing key must not mark a lead "brochure sent" for a day, and this is the first
   time that sentence has executed end to end. **This was an inference at dispatch and is now an
   observation: the assertion passed in CI.**

3. **`pasantias_leads` is unique on `(email_normalized, cohort)`**, so a repeat submission takes the
   *update* path and can re-open a `dismissed` lead. Hence a minted `randomUUID()` address per test.

---

## CHECK

1. Does the code actually meet **every** acceptance criterion? Verify — do not take the ledger's or
   the review-request's word for it, and do not take mine.
2. **Run the tests yourself.** Do they test behaviour, or do they just execute code? The e2e needs
   CI's topology (see the hazard note below); the Vitest guard runs anywhere.
3. Any violation of the frozen architectural decisions — **D-01** (no commercial cohort import
   outside the two permitted files), **D-02** (prices only in brochure PDF bytes among
   repository-authored surfaces), **D-03/D-04** (transition graph, per-operation posture),
   **D-12** (split consent, no default asserting consent), **D-10** (es-CL UI, `data-testid`, no
   `waitForTimeout`, zero `middleware.ts` changes)?
4. Correctness, error handling, security, edge cases.
5. Anything that makes the **next** phase harder than it needs to be. Track B (B4a onward) is next;
   A9 should leave it no debt.
6. **Scope creep** — anything changed that was out of scope?

### ⚠️ Do not run the e2e spec against `.env.local`

Local Playwright runs `npm run dev:unsafe`, which loads `.env.local`, which points at the **real
shared GENERA Supabase project**. This spec POSTs leads, so a local run writes synthetic rows into
the production leads table — `CLAUDE.md` forbids that outright. Worktrees of this repo share
`supabase/config.toml`, so they share local Supabase containers too; check `supabase status` before
starting one. CI gate 4's ephemeral stack is where this spec is meant to run, and it has now run
there. If you want it run again, push a docs commit to the PR rather than running it locally.

---

## WHERE TO PUSH HARDEST — the judgement calls, named

These are the places I expect a real reviewer to disagree with me. I am naming them so you spend
your time on them rather than rediscovering them.

1. **A test was replaced, not added.** A7a's `it('the scan can see hrefs at all')` — its
   anti-vacuity check, asserting at least one `/pasantias` href in three named files — is **gone**,
   replaced by `it('every page keeps the /pasantias links it was given')`, which pins exact per-file
   counts across seven files. The executor flagged this itself; **I adjudicated it as acceptable**
   on three grounds: the new assertion implies the old one arithmetically (3≥1, 3≥1, 1≥1), it
   covers seven files where the old covered three, and I confirmed by mutation that breaking
   `hrefOccurrences`' regex now fails seven assertions instead of one, so the anti-vacuity duty is
   discharged more strictly. **My adjudication is the thing to attack.** If you think a reviewer's
   guard should never be deleted by a later phase regardless of implication, say so — restoring it
   alongside costs nothing.

2. **Fifteen hardcoded numbers are now load-bearing.** `PASANTIAS_HREF_COUNTS` pins exact per-file
   `/pasantias` href counts (index 3, programas 3, equipo 2, nosotros 2, noticias 2,
   noticias/[slug] 2, Footer 1 = 15). Any legitimate future edit adding or removing a link fails CI
   until the map is updated — that is the intent, but if a number is wrong the file is worse than
   before. **Re-derive all fifteen from the tree yourself.** Same for the two-entry
   `DIRECTIVOS_FLIPBOOKS` map (`d87d80f309` on `pages/index.tsx` *and* `pages/programas.tsx`;
   `92bf9eb5ee` on `index.tsx` only).

3. **A now-mandatory spec that writes rows.** `tests/e2e/pasantias-flow.spec.ts` is the only spec in
   the suite that inserts through a public route, and it is on `MANDATORY_SPECS`, so a flake in it
   blocks every future PR. `playwright.config.ts` sets `fullyParallel: true` with `workers: 1`
   **only on CI** — so locally the four tests can run concurrently against one database while test
   3 reads A8's shared fixture. I checked and believe it is safe (UUID addresses; every read scoped
   by `?search=`; `sanitizeSearchTerm` strips only `,()"\*`, so a UUID address survives intact and
   carries no `%`/`_` wildcard). **Check whether any `ilike` search here could ever match a second
   row, and whether anything else in the suite can race it.**

4. **The checklist claims eight production PASS rows, from `curl` transcripts rather than
   screenshots.** The load-bearing one is **A2-5, "the ficha carries no prices"** — a negative,
   proven by regex over `pdftotext` output, which returns exactly one hit that both the executor and
   I judged to be the RUT `65.166.503-5` in the legal footer rather than an amount. I re-verified it
   independently (zero `€`/`EUR`/`USD`/`$` amounts; `65.166` the only thousands-separated numeral)
   and the brochure does carry `€2.500`/`€70`/`€120`. **That judgement is still a judgement — D-02
   is a legal boundary and it is worth your own look.**

5. **Whether `[A1]` is genuinely met.** It says "green in CI". The spec had never executed anywhere
   at dispatch; it executed for the first time in run `31276283612`. I checked that "gate 4 pass"
   meant *ran* rather than *skipped* — all four tests appear by name (674 ms / 652 ms / 17 ms /
   1.4 s), zero retries, `[e2e-mandatory] OK — 12 mandatory spec(s) ran with no skips`, 121 e2e
   tests passed. **Confirm that yourself in the run log rather than from the tick**, and judge
   whether four tests that pass on their first-ever run constitute "green" or merely "not yet flaky".

---

## FINDINGS ALREADY RAISED — challenge the classification, do not just re-find them

- **S-01 (SHOULD-FIX, backlog).** `/pasantias` serves `og:image` = `bcn-skyline.jpg` at
  **1,539,868 B / 2400×1350** (verified independently: `200 image/jpeg`, byte count and dimensions
  read off the file). That is well above the budget WhatsApp is commonly observed to honour, so the
  likely outcome of the owner-run A2-9 unfurl row is a card with correct text and **no image**.
  Classified SHOULD-FIX rather than BLOCKING because fixing it means touching a product asset, which
  `[A-new-4]` forbids A9 from doing. **If you think a release gate that predicts its own share-card
  failure and ships anyway is BLOCKING, say so** — that is a defensible reading and it is your call.
- **N-01** the review-request says `Commits: 1`; it is 2. **N-02** the ledger carries a literal
  `<this commit>` placeholder. **N-03** test 4 gives each PDF request a 90 s timeout inside a
  file-level 120 s test timeout, so the second request can never use its full budget — moot in
  practice (1.4 s in CI) but incoherent.

---

## THE HONEST LIMITATION — a PASS from you does not close this phase

`[A3]` requires the checklist fully green, and **four rows are OWNER-RUN — PENDING** because they
need a real mailbox or a real handset: **A2-9** (WhatsApp unfurl on a named device), **A2-11**
(auto-reply arrives at a test mailbox), **A2-12** (internal notification arrives), **A2-13** (the
brochure link *inside* the received email resolves). Brent runs those; the steps are written out in
`docs/plan/evidence/a9/release-checklist.md` §C.

Also still true and not A9's to fix: the five `PENDING CI` rows in that file are now proven by run
`31276283612` but the file still reads PENDING — deliberately left for the one closing pass that
will also record the owner results, rather than spending a remediation round on a markdown table.
A `docs/plan/evidence/a9/ci-run-31276283612.md` belongs in that same pass. **If you think the
checklist must be self-consistent before a PASS, that is a legitimate BLOCKING call — make it.**

A8's two deferred SHOULD-FIX items (a D-03 terminality breach and a UI-caveat correctness fix) are
untouched per `[A-new-4]` and still need their own round before Track A ships.

---

Review against the plan's contract, not against your own preferences. Taste disagreements are NITs.
Only correctness, contract violations, security, and architectural violations are BLOCKING.

Output using the CODEX REVIEW format:

```markdown
## CODEX REVIEW — A9 round 1
VERDICT: PASS | FAIL
BLOCKING:
- [B1] <finding> — <file:line> — <why it blocks>
SHOULD-FIX:
- [S1] ...
NITS:
- [N1] ...
NOTES ON THE PLAN ITSELF: <if the plan, not the code, is the problem>
```
