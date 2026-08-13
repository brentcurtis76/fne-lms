# Executor prompt — RM round 1 (2026-08-13)

Written by the PM from the frozen-enough RM contract in `../PLAN.md`. Committed per the workflow
convention. Pasted verbatim into a fresh Claude Code session.

---

SESSION: RLS · RM · EXEC

You are the executor for the GENERA (FNE-LMS) "RLS" workstream, phase RM, round 1. You have no
prior context. Everything you need is below or in the repo.

WORKTREE AND BRANCH — confirm before reading anything else

  cd /Users/brentcurtis/dev/wt/rls-public
  git rev-parse --show-toplevel     # expect /Users/brentcurtis/dev/wt/rls-public
  git branch --show-current         # expect fix/rls-public

  Work on `fix/rls-public`. Do not create a new branch — every phase in this workstream lands
  there as sequential commits. Commit as you go.

  THE PLAN LIVES ONLY ON THIS BRANCH. It is not on `main`. Read it at
  docs/plan/rls/PLAN.md — phase RM's full contract is the section headed
  "# Phase RM — Reconcile `AGENTS.md` to `CLAUDE.md`". Read that section and the "Frozen
  architectural decisions" section before you start. This prompt is a summary; the plan is the
  contract, and where they differ the plan wins — tell me if you find a difference.

  `node_modules` is absent in this worktree. Run `npm ci` first.

WHAT THIS PHASE IS

  `AGENTS.md:3` says: "Mirror of CLAUDE.md for Codex-family agents. If the two ever diverge,
  CLAUDE.md wins — fix the divergence in the same PR."

  The two have materially diverged. `CLAUDE.md` is 112 lines, `AGENTS.md` is 73. Your job is to
  restore that invariant: a reader opening either file should get the same rules.

  Measured divergence, for orientation — verify it yourself rather than trusting this table:

    In CLAUDE.md, absent from AGENTS.md:  "Who Are You?", "Bridge Workflow", "Memory Discipline",
                                          "Architecture", and the split "Database Safety" /
                                          "Privacy — Ley 21.719" hard-rule sections
    In AGENTS.md, absent from CLAUDE.md:  "Auth Middleware Warning"

THE ONE JUDGMENT CALL — do not resolve it yourself

  Divergence has three shapes and they are handled differently:

    1. The two CONFLICT on the same rule        → CLAUDE.md wins. Amend AGENTS.md.
    2. Content in CLAUDE.md, missing from AGENTS.md → add it to AGENTS.md.
    3. Content in AGENTS.md, missing from CLAUDE.md → this is OWNER GATE Q6. Do NOT delete it and
       do NOT decide it. Prepare BOTH branches and surface them to Brent:
         - if Brent APPROVES: add it to CLAUDE.md as canonical, then mirror into AGENTS.md
         - if Brent REJECTS: remove it from AGENTS.md as governing guidance and relocate it to
           docs/plan/rls/evidence/RM-retired-guidance.md with the reason and date

  Both branches restore the invariant. Neither leaves the divergence in place. You may do all
  other work while Q6 is open — it gates the phase CLOSE, not the start.

SCOPE — files you may write

  AGENTS.md
  CLAUDE.md                                        (only under Q6's approval branch)
  docs/plan/rls/evidence/RM-retired-guidance.md    (only under Q6's rejection branch)
  docs/planning/reviews/fase-RM-review-request.md  (required close artifact — canonical path)
  PROJECT_STATE.md                                 (required: updated on phase end)
  docs/plan/rls/LEDGER.md                          (your round entry)

EXPLICITLY OUT OF SCOPE

  - Changing the SUBSTANCE of any rule. This is a reconciliation, not a rewrite. If a rule looks
    wrong, outdated or unwise, that is a FINDING for the review request — not an edit.
  - Any application, database, migration or test source.
  - Any RLS, function or allowlist work. That is later phases; this one is a prerequisite.
  - Any file not in the list above.

  A HAZARD SPECIFIC TO THIS PHASE: you are editing the files that contain your own instructions.
  Do not "improve" them. Do not soften a rule because it seems inconvenient, and do not tighten
  one because it seems safer. Reconcile only.

ACCEPTANCE CRITERIA — each independently checkable

  [ARM-1] Every section of CLAUDE.md has a corresponding section in AGENTS.md conveying the same
          rules. The review request carries a section-correspondence table mapping each one and
          naming its shape (conflict / missing-from-AGENTS / missing-from-CLAUDE).
  [ARM-2] Every Hard Rule in CLAUDE.md — NO DEPLOYMENTS, Database Safety, Privacy (Ley 21.719),
          Memory Discipline — is present in AGENTS.md with identical force. No hard rule is
          softened, conditioned, or summarised into ambiguity.
          READ THESE FOUR HARDEST. This plan has narrowed a conditional rule three times across
          its reviews, every time by a reasonable-sounding interpretation. Do not add a fourth.
  [ARM-3] The four-gate CI rule and the executor-rule sequence match, including the conditional
          wording "+ test:db/e2e when DB/UI touched" VERBATIM. That exact phrase is what three
          separate review rounds turned on — copy it, do not paraphrase it.
  [ARM-4] No rule's substance changed. The review request lists every edit as
          added / reworded-same-meaning / conflict-resolved-toward-CLAUDE. There is no fourth
          category; if an edit does not fit one of those three, you have exceeded scope.
  [ARM-5] Content unique to AGENTS.md is preserved and routed through Q6, never silently deleted.
  [ARM-6] CLAUDE.md stays under 200 lines (its own Memory Discipline rule) and AGENTS.md does not
          exceed it.
  [ARM-7] docs/planning/reviews/fase-RM-review-request.md exists with the content CLAUDE.md:43 /
          AGENTS.md:32 require: branch + base SHA + commit count; objective and scope in/out;
          files created/modified grouped by risk; test evidence (suite names + counts); the 3–5
          areas a reviewer should scrutinise hardest with one honest line each; known limitations.
  [ARM-8] PROJECT_STATE.md updated for the phase end (CLAUDE.md:4, AGENTS.md:4).
  [ARM-9] Gates green — below.

GATES — exact commands

  npm ci
  npm run type-check && npm run lint && npm test && npm run build

  `test:db` and `e2e` are NOT required, and the reasoning is stated so you can check it rather
  than take it on trust: AGENTS.md:30 requires them "when DB/UI touched". RM edits Markdown only
  — it starts no database, resets none, runs no query, and renders no UI. The condition is not
  met. An independent reviewer has confirmed this reading. If you believe otherwise, say so in
  your report rather than adding gates silently.

  KNOWN GATE HAZARD: `npm test` is the only script in package.json without the canvas preload,
  and tests/mocks/register-canvas.js swallows the load failure, so a green summary can silently
  drop 51 jsdom files. RM changes no source, so this cannot be a regression you caused — but if
  the gate is RED, distinguish a base failure from anything you did: reproduce it at the merge
  base (`git merge-base main HEAD`) before reporting. Report the count as evidence the command
  ran; do not claim it proves suite completeness.

RULES

  - Surgical changes only. No bulk rewrites. Match the existing voice and structure of each file.
  - Do not grade your own work in prose. Show the diff and the raw gate output.
  - If gates are red, iterate up to 3 times. If still red, report STATUS: BLOCKED with the real
    error. Never report a red build as complete.
  - If you discover the plan is wrong — the divergence is not what it describes, or reconciling
    faithfully would require changing a rule's substance — STOP. Report STATUS: FINDINGS with what
    you found and what you would propose. That is the correct outcome, not a failure.
  - Do not expand scope. Anything broken but out of scope goes under NOT DONE.
  - UI and user-facing copy in this project are Chilean Spanish; code, comments, commits and
    technical docs in English. These two files are technical docs — English.
  - Never merge to main. Never deploy. Never touch the production database.

WHEN DONE

  Append your round entry to docs/plan/rls/LEDGER.md, then output exactly this report:

  ## EXECUTOR REPORT — RM round 1
  STATUS: COMPLETE | BLOCKED | FINDINGS
  CONTEXT PRESSURE: comfortable | tight | ran out — <one line: at what point?>
  BRANCH: fix/rls-public   COMMITS: <sha…>
  FILES CHANGED: <path (+x/-y) …>
  WHAT I DID: <bullets, one per acceptance criterion, each mapped to its ARM id>
  Q6 — CONTENT UNIQUE TO AGENTS.md: <what you found, and both branches prepared for Brent>
  TEST COMMAND: <verbatim>
  TEST OUTPUT: <verbatim tail, unedited>
  ACCEPTANCE CRITERIA: <ARM-1..9: met / not met / partially — with reason>
  DEVIATIONS FROM PROMPT: <or "none">
  ASSUMPTIONS MADE: <or "none">
  NOT DONE / OPEN:
  WEAKEST PART OF THIS DIFF: <your honest read — where would a reviewer find a problem?>
