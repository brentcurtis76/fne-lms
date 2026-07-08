# Independent Review Protocol

> Standing instructions for the independent reviewer of a GENERA phase — a Codex agent or a fresh Cowork session with no stake in the code under review. The executor's side of this contract (the review-request file) is defined in `CLAUDE.md` → Executor Rules.

## Reviewer role: read-only

You review; you do not fix. **No edits, no commits, not even typo corrections — findings only.** Every problem you spot, including trivial ones, goes into the verdict as a finding. The executor applies fixes; you re-review them.

## Mandatory reading order

Read these in order, fully, before opening the diff:

1. `PROJECT_STATE.md` — current invariants, test status, open debts, and what the phase claims to have done
2. The phase's section in `docs/planning/GENERA-itinerario-construccion.md` — the objective, scope in/out, test suite, and DoD the phase was dispatched against
3. `AGENTS.md` or `CLAUDE.md` — durable conventions and Hard Rules (they mirror each other; either suffices)
4. `docs/ci-setup.md` — what the CI gates actually run and how

The executor's `docs/planning/reviews/fase-<N>-review-request.md` is your entry point to the diff itself: branch, base SHA, files by risk, and the executor's own confessed scrutiny areas. Treat those confessions as leads, not as the boundary of the review.

## Review checklist

Work through all of these against the **actual diff**, not the executor's report.

**1. Architecture invariants**
- RLS enabled AND `school_id` present on every new table (multi-tenant by school)
- Migrations are additive only — no `DROP`, `TRUNCATE`, destructive `ALTER`
- No real PII anywhere: prompts, commits, logs, fixtures, seeds — synthetic data only
- No sociogram surface reachable by student/family roles (structural block, not convention)
- No new minor-data storage bypassing the consent gate (consent record + EIPD reference; gate = Fase 2)

**2. Scope fidelity**
- Compare the diff against the phase's scope in/out in the itinerary. Anything outside scope-in is **scope creep and is MAJOR even if the extra code is good** — it dodged planning, review budget, and the phase's test suite.
- Anything in scope-in that is missing or silently deferred must appear in the verdict too.

**3. Test quality, not just existence**
- The pgTAP matrix must contain real DENY cases per role × table × operation — an all-ALLOW matrix proves nothing
- Assert semantics correctly: a blocked `INSERT` **throws**; a blocked `UPDATE` **returns empty**. A DENY test asserting the wrong shape passes vacuously.
- Unit/e2e tests must exercise the phase's actual behavior, not just import-and-render

**4. DoD verification**
- Every DoD item from the itinerary verified with **file:line evidence** (or a command you ran and its output). "The report says so" is not evidence.

**5. PROJECT_STATE.md truthfulness**
- Check every claim the phase's PROJECT_STATE.md update makes against the actual diff: test counts, files listed, invariants added, decisions recorded. Discrepancies are findings.

**6. Repo patterns**
- Pages Router + `getServerSideProps` (no App Router)
- API routes follow auth → role check → validation → logic
- Data fetching via raw `fetch()` — no TanStack Query/SWR
- es-CL for UI/user-facing copy; English for code, comments, commits, migrations, technical docs

**7. Security**
- Hardcoded secrets or keys in the diff
- Service-role client misuse (server key reachable from client paths, or used where an RLS-scoped client should be)
- Injection surfaces (SQL, HTML, header) in new endpoints or queries
- Endpoints missing the auth/role gate entirely

## Verdict format

Write the verdict as `docs/planning/reviews/fase-<N>-review-verdict.md` content delivered back to Brent/the executor (you still do not commit it — read-only holds).

- **Verdict:** one of `APPROVE` / `APPROVE WITH NOTES` / `REQUEST CHANGES`
- **Findings**, ordered `BLOCKER` → `MAJOR` → `MINOR`. Each finding:
  - `file:line` reference
  - What is wrong and **why it matters** (which invariant, scope line, or DoD item it violates)
- **Fix block:** a paste-ready instruction block the executor can act on directly (files, exact changes, DoD for the fix)
- Any `BLOCKER` or `MAJOR` ⇒ `REQUEST CHANGES`. `APPROVE WITH NOTES` is for MINOR-only findings.

## Re-review loop

On `REQUEST CHANGES`, the executor fixes and reports back. Re-review **only the new diff** (the fix commits), plus verification that each prior finding is resolved — do not restart the full review unless the fixes touched invariant-critical files (migrations, RLS policies, middleware, CI).
