# Agent Workflow — Standard Operating Procedure & Prompt Pack

Paste-in reference for any project. Section 1 is the contract; sections 2–4 are the
copy-paste prompts.

---

## 1. The contract

### 1.1 Roles and permissions

| Role | Agent | Can read | Can run | Can write |
|---|---|---|---|---|
| **Planner / PM** | Fable (Claude Code) | everything | tests, git, lint | `PLAN.md`, `LEDGER.md` **only — never source** |
| **Executor** | Opus (Claude Code, fresh convo per round) | everything | everything | source + tests + its own ledger entry |
| **Adversarial reviewer** | Codex Sol | everything | tests, git, lint | `REVIEW-<phase>.md` only |
| **Arbiter / trigger** | Brent | — | — | — |

The PM must **never** fix code it finds broken. It writes a finding; a fresh
executor fixes it. This is the whole reason the loop exists.

### 1.2 Files (adapt paths to whatever the project already uses)

```
<project>/docs/plan/PLAN.md        # the frozen plan + phase status
<project>/docs/plan/LEDGER.md      # append-only, one entry per ROUND
<project>/docs/plan/reviews/       # Codex review artifacts per phase
```

**The ledger is written at the end of every round, not every phase.** Any PM
conversation is disposable; a fresh one re-seeds from these two files.

### 1.3 Phase sizing rules (defaults — tune per project)

A phase is correctly sized when all of these hold:

- ≤ 10 files touched
- ≤ ~600 net lines changed
- exactly **one** architectural concern
- ends at a **green, mergeable state** — no phase leaves the tree broken
- its acceptance criteria fit in ≤ 15 lines

If the acceptance criteria don't fit in 15 lines, it's two phases.

Executors report whether context got tight, and that lands in the ledger — so after a
few phases you can tune the caps above from evidence instead of guessing.

### 1.4 Finding taxonomy (used by both reviewers)

- **BLOCKING** — phase cannot be marked Done. Correctness, contract violation,
  security, broken/missing tests, architectural violation of a frozen decision.
- **SHOULD-FIX** — real but deferrable. Goes to the ledger backlog, does not block.
- **NIT** — style/taste. Logged, never acted on mid-phase.

### 1.5 Loop caps

| Loop | Cap | On exceeding |
|---|---|---|
| Executor self-iterating on red tests | 3 attempts | report `BLOCKED`, do not report a red build as done |
| PM ↔ Executor rounds | 3 | PM writes a re-plan proposal, escalates to Brent |
| Codex ↔ PM ↔ Executor rounds | 2 | Brent decides: accept, re-plan, or backlog |

**Codex has final say on BLOCKING items.** Brent can override explicitly; the
override is logged as a decision in `PLAN.md`.

### 1.6 The escape hatch

An executor that discovers the plan is wrong **stops coding** and returns a
`FINDINGS` report instead of a diff. This is a success, not a failure. Heroically
building the wrong thing is the failure.

### 1.7 Flow

```
PLAN     Fable drafts PLAN.md  →  Codex plan review  →  loop until PASS  →  frozen
         ↓
PHASE    PM bootstrap (fresh Fable)
         → PM writes executor prompt  → [optional: Codex 60s sanity check on the prompt]
         → fresh Opus executes → EXECUTOR REPORT
         → PM verifies independently (re-runs tests, reads diff) → findings
         → fresh Opus remediates …loop (max 3)
         → PM says phase is clean → Brent triggers Codex final review
         → Codex FAIL → PM triages → fresh Opus …loop (max 2)
         → Codex PASS
         ↓
CLOSE    PM updates PLAN.md (Done) + LEDGER.md, opens backlog items, merges branch
```

---

## 2. Fixed formats

### 2.1 `PLAN.md` skeleton

```markdown
# PLAN — <project>

META
- REPO / ROOT:
- BRANCH CONVENTION: phase/<id>-<slug>
- PLAN FROZEN: <date>  (changes after this date require a Decision Log entry)

## Goal
## Non-goals
## Frozen architectural decisions
<decisions no phase may violate without a Decision Log entry>

## Phase index
| ID | Name | Status | Branch | Depends on |
|----|------|--------|--------|-----------|
| P1 | ...  | TODO / IN PROGRESS / IN REVIEW / DONE / BLOCKED | | |

## Phase P<n> — <name>
**Scope:** files/modules in play
**Out of scope:** explicit — this is what stops scope creep
**Acceptance criteria:** (≤15 lines, each independently checkable)
- [ ] ...
**Test plan:** named unit tests + exact command to run them
**Definition of done:** green tests, criteria checked, no BLOCKING findings, branch mergeable
**Risks / unknowns:**
**Rollback:** how to revert if the phase is abandoned

## Decision log
| Date | Decision | Rationale | Raised by |
```

### 2.2 `LEDGER.md` entry (append-only, one per round)

```markdown
### <ISO date> — P<n> round <r> — <actor>
- CONTEXT PRESSURE: <for executor rounds — this is your sizing evidence>
- ACTION:
- COMMITS: <sha…>
- TESTS: <command> → <pass/fail, counts>
- FINDINGS RAISED: <blocking / should-fix / nit>
- DECISIONS:
- BACKLOG ADDED:
- OPEN AFTER THIS ROUND:
```

### 2.3 Executor report (the executor must emit exactly this)

```markdown
## EXECUTOR REPORT — P<n> round <r>
STATUS: COMPLETE | BLOCKED | FINDINGS
CONTEXT PRESSURE: comfortable | tight | ran out — <one line: at what point?>
BRANCH: <branch>   COMMITS: <sha…>
FILES CHANGED: <path (+x/-y) …>
WHAT I DID: <bullets, one per acceptance criterion, each mapped to criterion ID>
TEST COMMAND: <verbatim>
TEST OUTPUT: <verbatim tail, unedited>
ACCEPTANCE CRITERIA: <ID: met / not met / partially — with reason>
DEVIATIONS FROM PROMPT: <or "none">
ASSUMPTIONS MADE: <or "none">
NOT DONE / OPEN:
```

### 2.4 Codex review block

```markdown
## CODEX REVIEW — P<n> round <r>
VERDICT: PASS | FAIL
BLOCKING:
- [B1] <finding> — <file:line> — <why it blocks>
SHOULD-FIX:
- [S1] ...
NITS:
- [N1] ...
NOTES ON THE PLAN ITSELF: <if the plan, not the code, is the problem>
```

---

## 3. The prompts

### 3.1 PLANNER — new Fable conversation

```
You are the planning agent for <PROJECT>. You will produce PLAN.md and nothing else.
You will not write any source code in this conversation.

Read the codebase first. Do not plan against assumptions — verify the current state
of anything you intend to change, and say what you verified.

Deliverable: docs/plan/PLAN.md following the skeleton below, decomposed into phases.

PHASE SIZING RULES — each phase must satisfy ALL of:
- ≤10 files touched, ≤~600 net lines
- exactly one architectural concern
- ends at a green, mergeable state (never leaves the tree broken)
- acceptance criteria fit in ≤15 independently checkable lines
- executable end-to-end by a single Claude Code session without context exhaustion
If acceptance criteria don't fit in 15 lines, split the phase.

Every phase MUST specify:
- Scope AND explicit out-of-scope
- Acceptance criteria as a checklist, each independently verifiable by running something
- Test plan: the actual unit tests to be written, by name, and the exact command to run them
- Definition of done
- Risks/unknowns and a rollback path
- Dependencies on earlier phases

Also produce: goal, non-goals, and a "frozen architectural decisions" section listing
choices no phase may violate without an explicit Decision Log entry.

Be adversarial with yourself. Where you are guessing, say so under Risks rather than
writing confident prose. A phase you cannot specify test criteria for is a phase you
do not understand yet — flag it instead of inventing criteria.

<paste PLAN.md skeleton here>
```

### 3.2 PLAN REVIEW — Codex Sol

```
Adversarial review of docs/plan/PLAN.md for <PROJECT>. You are not here to be
agreeable — you are the last check before we burn execution time on a bad plan.

Read the actual codebase, not just the plan. Assess:
1. Does the plan match reality? Anything it assumes about the code that isn't true?
2. Sequencing: any phase that depends on something a later phase builds?
3. Sizing: any phase too large for one session, or that leaves the tree broken?
4. Acceptance criteria: any that are unverifiable, vague, or self-graded?
5. Test plans: do they actually test the behaviour, or just that code runs?
6. Missing phases: anything required for the goal that no phase covers?
7. Architecture: any frozen decision you think is wrong? Say so now — it is
   cheaper here than in review.

Output using the CODEX REVIEW format. VERDICT: PASS only if you would be willing to
be held to this plan. Classify every finding BLOCKING / SHOULD-FIX / NIT.
```

### 3.3 PM BOOTSTRAP — new Fable conversation, once per phase (or whenever the PM session gets heavy)

```
You are the PM for <PROJECT>. Start by reading, in this order:
- docs/plan/PLAN.md
- docs/plan/LEDGER.md (last 10 entries minimum; all entries for the current phase)
- docs/plan/reviews/ for the current phase, if any

Then state in one paragraph: current phase, its status, what happened in the last
round, and what is open. Do not proceed until you have done this.

YOUR PERMISSIONS
- You MAY read any file, run tests, run git, run lint.
- You MAY write ONLY docs/plan/PLAN.md and docs/plan/LEDGER.md.
- You MUST NOT write, edit, or patch source code or tests. Ever. If you find a
  defect, you write a finding; a fresh executor fixes it. Fixing it yourself means
  you are grading your own work, which invalidates the entire review chain.

YOUR JOB THIS PHASE
1. Produce a self-contained executor prompt for a fresh Claude Code session, using the
   EXECUTOR PROMPT TEMPLATE below. The executor has no memory of this conversation and
   no context beyond that prompt plus the repo.
2. When the executor's report comes back, VERIFY IT INDEPENDENTLY BEFORE JUDGING IT:
   - re-run the test command yourself and read the real output
   - read the actual diff (git diff / git show), not the summary
   - check each acceptance criterion against the code, not against the report
   A report is a claim, not evidence. State explicitly what you verified yourself.
3. Return findings classified BLOCKING / SHOULD-FIX / NIT. Only BLOCKING items get a
   remediation round; SHOULD-FIX goes to the ledger backlog; NITs are logged only.
4. Write a LEDGER.md entry at the end of EVERY round, not just at phase end.
5. Max 3 executor rounds. If the phase isn't clean by then, stop and write a re-plan
   proposal for Brent instead of a fourth round.
6. When you believe the phase is clean, say so plainly and tell Brent it's ready for
   Codex final review. Do not mark the phase Done — only Codex passing does that.

If at any point you conclude the plan itself is wrong, say so immediately and stop.
Amending the plan is cheaper than executing a wrong one.

<paste EXECUTOR PROMPT TEMPLATE + EXECUTOR REPORT format here>
```

### 3.4 EXECUTOR PROMPT TEMPLATE — the PM fills this in; Brent pastes it into a fresh Opus session

```
You are the executor for <PROJECT>, phase P<n> round <r>. You have no prior context.
Everything you need is below or in the repo.

BRANCH: <branch> (create from <base> if it does not exist; commit as you go)

CONTEXT YOU NEED
<PM supplies: relevant frozen architectural decisions, prior-phase outcomes that
affect this one, exact file paths, existing patterns to match. Inline the source or
give exact paths — never make the executor go hunting.>

SCOPE
<what to build>

EXPLICITLY OUT OF SCOPE
<what not to touch — do not refactor adjacent code, do not "improve while you're in there">

ACCEPTANCE CRITERIA — each must be independently verifiable
- [A1] ...
- [A2] ...

TESTS YOU MUST WRITE
<named tests>
TEST COMMAND: <verbatim>

RULES
- Surgical changes only. No bulk file modifications. Match existing patterns.
- Do not grade your own work in prose. Show the diff and the raw test output.
- If tests are red, iterate up to 3 times. If still red, report STATUS: BLOCKED with
  the real error — never report a red build as complete.
- If you discover the plan is wrong (the schema won't support this, a dependency
  doesn't exist, an assumption is false): STOP CODING. Report STATUS: FINDINGS with
  what you found and what you'd propose instead. This is the correct outcome, not a
  failure. Do not work around a broken plan.
- Do not expand scope. If something out of scope is broken, note it under NOT DONE.
- <project-specific rules, e.g. Spanish-only UI text>

WHEN DONE
Append your round entry to docs/plan/LEDGER.md, then output exactly this report:

<paste EXECUTOR REPORT format>
```

### 3.5 PM REVIEW TRIGGER — paste into the live PM convo with the executor's report

```
Executor report for P<n> round <r> below. Before judging it:
- re-run the test command yourself and paste what YOU got
- read the actual diff
- check each acceptance criterion against the code

Then give me: what you verified independently, findings classified
BLOCKING / SHOULD-FIX / NIT, and either (a) the next executor prompt, or (b) a
statement that the phase is clean and ready for Codex.
Write the ledger entry either way.

---
<paste report>
```

### 3.6 CODEX FINAL REVIEW

```
Final review of phase P<n> for <PROJECT>. Read docs/plan/PLAN.md for the acceptance
criteria and frozen decisions, then review branch <branch>.

You have final say on BLOCKING items. The phase does not close until you pass it.

Check:
1. Does the code actually meet every acceptance criterion? Verify, don't take the
   ledger's word for it.
2. Run the tests yourself. Do the tests test behaviour, or do they just execute code?
3. Any violation of the frozen architectural decisions?
4. Correctness, error handling, security, edge cases.
5. Anything that will make the NEXT phase harder than it needs to be.
6. Scope creep — anything changed that was out of scope?

Review against the plan's contract, not against your own preferences. Taste
disagreements are NITs. Only correctness, contract violations, security, and
architectural violations are BLOCKING.

Output using the CODEX REVIEW format.
```

### 3.7 REMEDIATION — paste Codex's review into the PM convo

```
Codex review for P<n> below. Triage it:
- For each BLOCKING item: do you agree? If you disagree, say why — but Codex has
  final say, so if it stands, it gets fixed.
- SHOULD-FIX → ledger backlog, do not fix now.
- NIT → log only.
Produce one consolidated executor prompt covering ALL blocking items in a single
round. Do not trickle fixes one at a time. Write the ledger entry.

This is Codex round <r> of max 2. If we don't pass on the next round, stop and tell
me what the disagreement actually is.

---
<paste review>
```

### 3.8 PHASE CLOSE — PM convo, after Codex PASS

```
Codex passed P<n>. Close it out:
1. Mark P<n> DONE in PLAN.md with the date and passing commit SHA.
2. Final LEDGER.md entry for the phase: what was built, what changed vs. the original
   plan, and why.
3. Move all SHOULD-FIX items into the backlog section with the phase they came from.
4. Add any Decision Log entries for choices made during execution that deviate from
   the original plan.
5. Re-read the NEXT phase in PLAN.md in light of what we actually built. Tell me if
   its scope, criteria, or sizing need amending before we start — this is the cheapest
   moment to catch plan drift.
6. Give me the merge command for <branch>.
```

### 3.9 RE-PLAN — when an executor returns FINDINGS, or a loop cap is hit

```
P<n> came back with FINDINGS / hit its round cap. Do not attempt another execution round.

1. State plainly what the plan got wrong and what evidence we have for that.
2. Propose the amendment: does P<n> get re-scoped, split, resequenced, or dropped?
3. Say which LATER phases are invalidated by this — that's the expensive part.
4. Write the Decision Log entry.
5. Give me a Codex prompt to review the amendment before we re-execute.

Amend PLAN.md only after I approve.
```

---

## 4. Operating notes

- **Fresh executor every round.** Never continue a session that already carries a
  failed attempt — it will defend its earlier choices.
- **The PM session is disposable too.** If it starts getting vague, forgetting
  decisions, or agreeing too easily, kill it and re-bootstrap from `PLAN.md` +
  `LEDGER.md`. That's what the files are for.
- **Optional but cheap:** before firing the executor, paste the phase prompt to Codex
  with *"sanity-check this prompt against the codebase — anything wrong before we
  spend a session on it?"* Catching a wrong abstraction costs one message here and a
  whole phase later.
- **Recalibrate sizing after ~3 phases.** Read the CONTEXT PRESSURE lines in the
  ledger. All "comfortable"? Your phases are too small and you're paying loop overhead
  for nothing — raise the caps. Any "ran out"? Find what that phase had that the
  others didn't; usually it's file count, not line count.
- **Watch for the PM going soft.** If two rounds pass with no findings and Codex then
  returns blocking items, your PM is rubber-stamping. Re-bootstrap it.
```
