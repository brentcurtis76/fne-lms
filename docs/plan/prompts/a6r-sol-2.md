# CODEX SOL — RE-REVIEW, INSPIRA phase A6r (after your FAIL)

Re-review of phase **A6r** for INSPIRA, in `fne-lms`. Branch **`phase/a6r-design`**, head
**`073f0051`** (pushed), base `main` @ `b8f5c05d`, 10 commits. Worktree `~/dev/wt-a6r`;
`main` checkout `~/dev/fne-lms`.

Your previous review is committed at `docs/plan/reviews/REVIEW-A6R.md` — the PM committed
it, since you left it uncommitted and A6r's two earlier reviews exist only in chat.

**You have final say on BLOCKING items. The phase does not close until you pass it.**

Round caps were retired by the owner on 2026-08-06 (PLAN Decision Log): *"the cap is
irrelevant, we have to keep going till it's production ready."* Classify honestly; every
BLOCKING gets a round. Do not moderate findings to fit a budget.

## What r6 changed

Your B1, B2 and S1, and nothing else. **This is the first round since r3 that changes the
page**, so evidence captures, testids and e2e pins are live again.

- **B1 — the week cardinality.** `DESIGNED_WEEK_COUNT = 2` is now exported from
  `pages/pasantias.tsx` and asserted against `COHORT_WEEKS.length`; the *printed* count is
  derived from the module through an es-CL number word, so the constant and the copy
  cannot converge silently. The heading renders byte-identically at two weeks. You cited
  three sites; the PM found a fourth (the `<meta description>`), and it is covered —
  `next/head` contributes nothing to a static render, so `buildMetaDescription()` is
  exported and appended to the proved surface.
- **B1's structural half** — `const [immersionWeek, visitWeek] = COHORT_WEEKS` — is now a
  checked invariant: a third week fails a named test instead of rendering nothing.
- **The `weeks` exception was kept, with a rewritten reason.** The count reaches the
  reader as the word "Dos" and that mechanism counts digits, so it can only ever read the
  size as unpublished. The new reason names all four sites, names the two tests that do
  prove them, and ends: *"This exception is the limit of the digit mechanism, not
  permission to type the number in."* **This is the judgement most worth your
  disagreement** — you asked for the exception to be removed.
- **B2 — the two restatements are gone from the page.** Owner decisions, not the
  executor's: the FAQ drops the holiday clause (the fact keeps its home in the finde
  card, where your e2e pin is), and the italic visit-order note is deleted. A fragment
  rule now fails any run of a module string's own words that the page types out, with the
  floor **derived** from the source scan's existing `MIN_SCANNED_LENGTH` plus
  `MIN_FRAGMENT_TOKENS = 2`, reasoned rather than tuned.
- **S1 closed** — `counts no collection the per-site proof cannot read` fails the day a
  one-element collection appears.

## What the PM verified, by attacking real source rather than the rendered surface

Re-run anything you doubt. The round's own negative controls simulate a pin by rewriting
the rendered string; these changed the file.

- Heading pinned to `"Dos semanas, dos modos"` → fails by name. CTA paragraph pinned →
  fails. **`<meta description>` pinned → fails.**
- **A real third week added to `COHORT_WEEKS` → 8 tests fail**, including
  `renders every week the cohort has, or fails rather than dropping one`.
- Either deleted restatement put back → fails `restates no run of the module's own words`.
- **An attack nobody in this round had seen:** `"las metodologías activas"`, a two-word
  run from `COHORT_OBJECTIVES[3]` — a leaf r6 never touched — planted in the CTA
  paragraph. **Caught.** The rule answers the class, not the two instances you found.
- Gates re-run: 6163 tests / 262 files, type-check, lint, build, leak scan (263 files),
  16/16 e2e. Guard file alone: 36 tests (29 at r5).

## Known, disclosed, so you do not spend a finding on it

- **`docs/planning/reviews/fase-a6r-review-request.md` says 11 commits and four ledger
  entries. It is 10 and three** — r5's and r6's entries are folded into their code
  commits. Off by one in both, same class as the S1 you raised two reviews ago. The PM
  raised it as SHOULD-FIX; it rides along with any round this review produces.
- **The rewritten FAQ prints the month twice** — "del 10 de octubre al 12 de octubre".
  The PM's own target wording caused it, the executor flagged it and shipped what was
  specified rather than improvising. It matches the finde card, which has read that way
  since r1. Backlogged with a proposed range formatter.
- Unchanged and out of scope since earlier rounds: two empty photo slots,
  `styles/globals.css:1` pulling Inter from a CDN app-wide, the 1440×600 hero contrast
  case, no `prebuild` for the image manifest, and the
  `__tests__/support/cohort-contract.ts` extraction you yourself said to keep out of a
  correctness round.

## The check

1. Are B1, B2 and S1 actually closed — verified, not taken from this prompt?
2. Does the page still meet A6r [A1]–[A7]? [A2]–[A7] were satisfied at the last head, but
   **the page changed this round**: two copy edits, a deleted paragraph, and metadata now
   built by a function.
3. Run the tests yourself. Do they test behaviour?
4. Frozen decisions, correctness, security, edge cases.
5. Anything that makes A6b (the lead form, landing in `#programa` on this page) harder.
6. Scope creep.

Taste disagreements are NITs. Output in CODEX REVIEW format, and **commit your review** to
`docs/plan/reviews/REVIEW-A6R-R2.md`.
