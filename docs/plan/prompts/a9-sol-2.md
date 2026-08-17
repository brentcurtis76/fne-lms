SESSION: INSPIRA · A9 · Codex re-review (round 2 of max 2)

Re-review of phase **A9 — Track A release verification** for INSPIRA Comms (repo `fne-lms`) after
remediation round r2.

**This is review round 2 of a maximum of 2.** If A9 does not pass here, the SOP forbids a third:
the PM must stop and write a re-plan proposal for Brent instead. So if you intend to fail it again,
say plainly *what the disagreement actually is* rather than only what is wrong — that sentence is
what Brent will arbitrate on.

Your round-1 review is at `docs/plan/reviews/REVIEW-A9.md` if it has been committed; your verdict
was **FAIL** on one BLOCKING item, plus 1 SHOULD-FIX and 3 NITs.

---

## WHAT CHANGED, AND WHAT DID NOT

- **Branch:** `phase/a9-verify`, head **`f7845196`**, pushed. Worktree `~/dev/wt-a9`.
- **The remediation is one commit: `f7845196`.** Review it with
  `git show f7845196` — or `git diff bcc9e142..f7845196` for the same thing.
  (`bcc9e142` immediately below it is the PM's own r2 prompt, `docs/plan/prompts/a9-2.md`.)
- **Full range since base:** `git diff 7c7059ff..f7845196`. Still exactly **one code-bearing
  commit in the whole phase — `82bc0e7b`** (6 files, +692/−19). Everything else is documentation.

**r2 changed no code and no test.** Verify it yourself rather than taking it from me:

```bash
git diff --stat b0cc9728..f7845196 -- . ':!docs'     # empty
git diff --stat 7c7059ff..f7845196 -- pages components lib   # empty
```

The first is the stronger statement: **the code is byte-identical across every CI run this branch
has had.** So gate 4's proof from run `31276283612` still describes the code on the head you are
reviewing.

**CI on the new head is green:** run **`31285321076`** @ `f7845196`, all six gates. The
code-bearing run remains `31276283612` @ `b0cc9728`, and the evidence cites that one deliberately,
per A7a's precedent.

---

## B1 — WHAT WAS DONE

Your finding:

> The committed checklist remains stale after CI succeeded. `[A2]` permits only `PASS`, `FAIL`, or
> `OWNER-RUN — PENDING`, but five rows still say `PENDING CI`. […] A9's principal deliverable is
> accurate evidence, so this contract violation blocks approval.

**Accepted in full. It overturned a PM call** — at r1 I deferred flipping those rows to the closing
pass on grounds of round economy, and your counter is stronger: the evidence file *is* the phase's
product, so it cannot contradict what was verified.

Four files changed (`docs/` only):

1. **`docs/plan/evidence/a9/release-checklist.md`**
   - The five §B rows (A2-7a–d, `A2-4/6 (CI)`) now read **PASS**, each carrying run
     `31276283612`, gate 4's result (pass, 7m25s), and its own named test with its timing.
   - The anti-skip guard line `[e2e-mandatory] OK — 12 mandatory spec(s) ran with no skips` is
     recorded under the table, so the rows are visibly proven by tests that *ran* rather than by a
     job that passed because they were skipped.
   - **§E recounted:** 13 PASS (8 production + 5 CI), 0 awaiting CI, 4 OWNER-RUN — PENDING. It still
     states the checklist is **not** fully green and that `[A3]` therefore does not close the phase.
   - **§D** keeps "never run locally" and the reason, now in past tense with the outcome — and adds
     the residue: *one green run is evidence the spec works, not evidence it is stable under
     repetition.*
2. **`docs/plan/evidence/a9/ci-run-31276283612.md`** — new, and A9's first committed CI evidence,
   which the `PLAN.md` META rule requires ("no evidence lives only in a chat transcript"). Written
   against the shape of `docs/plan/evidence/a7a/ci-run-31264578140.md` and
   `docs/plan/evidence/a8/ci-run-31262431697.md`. It records what gate 4 proved, **what it did not
   prove**, the 11-vs-12 merge-commit arithmetic, the later byte-identical runs, and
   run `31276763085` @ `5550de57` explicitly as **CANCELLED** — recorded so nobody reading the PR's
   check history mistakes it for a failure or cites it as green.
3. **`docs/planning/reviews/fase-a9-review-request.md`** — your N1, plus two stale statements you
   did not cite: the test-evidence table's e2e row read `NOT RUN`, and the Known-limitations bullet
   said the spec "has not been executed". Both now carry the run and its four timings.
4. **`docs/plan/LEDGER.md`** — your N2, plus r2's round entry.

### The PM's own state audit of the checklist, for you to redo

```
$ grep -c 'PENDING CI' docs/plan/evidence/a9/release-checklist.md
0
$ grep -n 'PENDING' docs/plan/evidence/a9/release-checklist.md
11:   the legend explaining the three permitted states
56:   the "## C. OWNER-RUN — PENDING" heading
63,81,100,109:  the four owner-run rows
150:   §E's count
```

Every row is now `PASS` or `OWNER-RUN — PENDING`. **Confirm that independently** — this is the
defect you blocked on and it is the one place a self-satisfied grep would be worth nothing.

---

## THINGS I RULED ON THAT YOU MAY OVERTURN

1. **Your N2 is not fully discharged, on purpose.** The r1 entry's diffstat is corrected in place
   and visibly marked (`6 files, +692/−19 — corrected at r2; this entry originally said 5 files,
   +665/−19`), and its `<this commit>` is now prose naming `b0cc9728`. But **one literal
   `<this commit>` survives at `LEDGER.md:2678`** — inside the PM's verification entry, in the
   sentence that *describes* N-02 as a finding. Removing it would erase the record of what the
   finding was. The executor flagged this and reported the criterion "partially met"; **I ruled it
   correctly met and my own acceptance criterion over-broad** — I wrote "no literal `<this commit>`
   remains" without noticing my own entry quotes the string while describing it. If you think an
   append-only ledger should never be corrected in place at all, that is a different and legitimate
   objection — make it.

2. **Two deviations from the r2 prompt, both of which I judged improvements.**
   - The checklist header read "round r1"; it now reads "executed at round r1, CI rows flipped at
     round r2". Not one of the prompt's four bullets, but a file whose §B was rewritten at r2 should
     not present itself as an r1 artifact.
   - §E's two *meta-references* to the string `PENDING CI` were reworded ("still awaiting their CI
     run"), because otherwise the B1 grep would have returned 2 self-referential hits and been
     satisfied vacuously. The executor fixed the criterion's intent rather than its letter. **Check
     that this did not soften any statement of fact** — that is the risk with a rewording like this.

3. **One assumption, and it was my error not the executor's.** The r2 prompt stated the range to
   head was 5 commits; it was 6 by the time the round ran, because the prompt's own commit landed
   after the number was written. The executor treated that as the prompt aging rather than a factual
   disagreement, verified the substantive claim (exactly one code-bearing commit), and rewrote the
   review-request so **no total can go stale again** — it names `82bc0e7b` instead of counting.
   It verified every other fact in the prompt against git and found no disagreement.

4. **N3 and S1 were deliberately not fixed**, as the r2 prompt directed:
   - **N3** (each PDF request allows 90 s inside a 120 s test) is real but cosmetic, and it sits in
     a spec that is now on `MANDATORY_SPECS` and green. Editing CI-proven code that will gate every
     future PR, for an incoherence that is moot in practice (1.4 s observed), is a bad trade. **In
     the backlog.** If you think a mandatory spec must not carry an incoherent timeout at all, say so.
   - **S1** (the 1,539,868-byte / 2400×1350 `og:image`) is a product asset, which `[A-new-4]` forbids
     A9 from touching, and it belongs to whatever the owner-run A2-9 row returns. **In the backlog.**

---

## CHECK

1. **Is B1 discharged?** Are the five rows genuinely PASS with evidence that supports them, is §E's
   arithmetic right, and is any statement now *overclaiming* what CI proved? Overclaiming would be a
   worse outcome than the staleness you blocked on — a release gate that oversells its own evidence
   is the failure this phase exists to prevent.
2. **Did anything else move?** r2 was supposed to be documentation only. Prove it, don't assume it.
3. **Does the new `ci-run-31276283612.md` match A7a's and A8's form**, and are its facts right?
   Every number in it came from the run logs via the PM; re-derive the ones that matter.
4. Do the round-1 conclusions still hold on the current head — the guard's exact per-file counts,
   the four e2e tests, no frozen-decision violation, no product-code scope breach?
5. Anything in r2 that makes the **next** phase (Track B, B4a onward) harder.

Do not run `tests/e2e/pasantias-flow.spec.ts` locally: local Playwright loads `.env.local`, which
points at the live shared GENERA Supabase project, and the spec POSTs leads. CI's ephemeral stack is
where it belongs, and it has run there five times.

---

## STILL TRUE, AND NOT SOMETHING r2 COULD FIX

**A PASS from you does not close A9.** `[A3]` requires the checklist fully green and **four rows are
OWNER-RUN — PENDING** because they need a real mailbox or a real handset: A2-9 (WhatsApp unfurl on a
named device), A2-11 (auto-reply to a test mailbox), A2-12 (internal notification), A2-13 (the
brochure link inside the received email). Brent runs those; the steps are in §C of the checklist.
Your round-1 note already said these are not B1 and are explicitly allowed after r1 — that has not
changed, and r2 left them untouched by instruction.

A8's two deferred SHOULD-FIX items (a D-03 terminality breach, a UI-caveat correctness fix) remain
untouched per `[A-new-4]` and still need their own round before Track A ships.

---

Review against the plan's contract, not your own preferences. Taste disagreements are NITs. Only
correctness, contract violations, security, and architectural violations are BLOCKING.

Output using the CODEX REVIEW format:

```markdown
## CODEX REVIEW — A9 round 2
VERDICT: PASS | FAIL
BLOCKING:
- [B1] <finding> — <file:line> — <why it blocks>
SHOULD-FIX:
- [S1] ...
NITS:
- [N1] ...
NOTES ON THE PLAN ITSELF: <if the plan, not the code, is the problem>
```
