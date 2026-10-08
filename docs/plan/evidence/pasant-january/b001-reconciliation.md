# PASANT-B001a — A9 continuation reconciliation

Discovery evidence for B001 (PASANT-C001). Observed 2026-10-08 by the PASANT-01 r0 executor. **No port, merge or
supersession was performed**; this records state and a recommendation for the B001 continuation decision.
The graph, blob IDs and verbatim A9 extracts behind §1, §4 and §5 are pinned in `b001-a9-snapshot.md`; repository
tests check this file against that snapshot, and the PASANT-01 RUN validator checks the snapshot against Git.

## 1. Refreshed refs (`git fetch origin main phase/a9-verify`, exit 0)

| Ref | SHA | Note |
|---|---|---|
| origin/main | `76349909621bc07a1c7ab8242cd3c3ececaed152` | equals the cached tip and this checkout's HEAD; `git ls-remote` agrees |
| origin/phase/a9-verify | `9008bacddcf40a79aa4c051b11ab3a5baf33939b` | equals the locally observed A9 head; `git ls-remote` agrees |
| merge base | `7c7059ffbf51b072cd38b00f5445e3ae972640c8` | 2026-08-08, "docs(z2): item 12b DONE" |

- `git rev-list --left-right --count origin/main...origin/phase/a9-verify` → `601	19`
  (601 main-only, 19 A9-only; all 19 non-merge, first-parent, and `git cherry` marks all 19 as not in main).
- **Count discrepancy (reported 20 vs observed 19):** the exact graph gives 19. Counting
  `7c7059ff^..origin/phase/a9-verify --first-parent` gives 20, i.e. the merge base included. That is a plausible
  source of the reported 20, not a proven one; the 19 is the exact A9-only count.
- A9 code commit `82bc0e7b7` ("test(a9): unmocked lead-flow e2e, per-file link guards, release checklist") is the
  oldest of the 19; the other 18 are `docs(a9)` commits ending at `9008bacdd`.

## 2. Relevant path differences

`git diff --name-status origin/main...origin/phase/a9-verify` (14 files, +2483/−20):
`M __tests__/pages/pasantias-site-links.test.ts` · `M docs/plan/LEDGER.md` · `M docs/plan/PLAN.md` ·
`A docs/plan/evidence/a9/ci-run-31276283612.md` · `A docs/plan/evidence/a9/release-checklist.md` ·
`A docs/plan/prompts/a9-{2,3,4}.md`, `a9-sol{,-2,-3}.md` · `A docs/planning/reviews/fase-a9-review-request.md` ·
`M scripts/ci/e2e-mandatory.mjs` · `A tests/e2e/pasantias-flow.spec.ts`.

Main-side drift since the merge base on Pasantías-relevant paths: `lib/pasantias/emails.ts`,
`pages/admin/pasantia-leads.tsx`, `scripts/ci/e2e-mandatory.mjs`, and the new `lib/email/provider.ts` /
`outbound-policy.ts` / `outbox.ts` family. `docs/plan/LEDGER.md` and `PLAN.md` are unchanged on main since the base.
`git merge-tree --write-tree origin/main origin/phase/a9-verify` (read-only probe) → exit 1, one conflict:
`scripts/ci/e2e-mandatory.mjs`, both sides appending entries to the mandatory-spec list (union resolution).
`tests/e2e/pasantias-flow.spec.ts` does not exist on origin/main.

## 3. PR #46 (read-only `gh pr view` / `gh pr checks`)

OPEN, not draft, base `main`, head `phase/a9-verify` @ `9008bacd`, `mergeable: CONFLICTING`, reviewDecision empty,
created 2026-08-08, updated 2026-08-10. Latest checks (run `31435202486`): Gates 1, 1b, 2, 3, 4 and RLS migration
guard **pass**; Vercel preview pass. These are historical A9 runs and do not substitute for January CI (C011).

## 4. A9 acceptance to preserve

- Mandatory unmocked flow spec `tests/e2e/pasantias-flow.spec.ts` (4 tests), its registration in
  `scripts/ci/e2e-mandatory.mjs`, and the per-file guards in `__tests__/pages/pasantias-site-links.test.ts`.
- PLAN row A9 = **IN REVIEW** on the A9 branch (head `5550de57`, code `82bc0e7b`, base `7c7059ff`); still `TODO` on main.
- Cumulative attempts (A9 LEDGER): executor rounds r1–r4; Codex (Sol) final review rounds 1, 2, 3 all FAIL, caps
  overridden by Brent twice; r4 PM-verified clean; the next Sol review was never dispatched.
- Owner: A9 PM session "SESSION: INSPIRA · A9 · PM" (Fable). **Writer release: UNKNOWN. Receiver ACK: UNKNOWN.**
  No release or ACK record was found on the A9 branch or origin/main; missing evidence is not a release.
- Mail: A9 LEDGER root cause "2026-08-08 — The mail outage's root cause is a DNS host that cannot express what Resend
  needs". origin/main PROJECT_STATE.md (update 2026-08-25) says `RESEND_API_KEY`/`EMAIL_FROM_ADDRESS` are configured;
  that is not evidence of domain verification or January delivery. Current mail state: UNKNOWN.

## 5. A9 release-checklist row register

The checklist at the A9 head still labels the owner-run rows PENDING; the later LEDGER results take precedence.

| Row | Checklist (A9 head) | Later LEDGER result | January destination (proposed) |
|---|---|---|---|
| A2-1 | PASS | — | re-run on January production (Brent release track) |
| A2-2 | PASS (October dates) | — | re-run with January dates (C004) |
| A2-3 | PASS | — | re-run; add October-absence check (C004) |
| A2-4 | PASS | — | re-run with January ficha (C006) |
| A2-5 | PASS | — | re-run: January dates, no prices (C006) |
| A2-6 | PASS | — | re-run per DEC-05 publication mode (C006) |
| A2-7a | PASS (CI) | — | port flow spec; program interest (C011) |
| A2-7b | PASS (CI) | — | port flow spec (C011) |
| A2-7c | PASS (CI) | — | port flow spec; program-scoped claims (C008/C011) |
| A2-7d | PASS (CI) | — | port flow spec; fixtures (C011) |
| A2-4/6 (CI) | PASS (CI) | — | port flow spec (C011) |
| A2-8 | PASS | — | re-run homepage card for January (C004) |
| A2-9 | OWNER-RUN — PENDING | **PASS** | retained historical PASS; January unfurl is a Brent release obligation |
| A2-10 | PASS (metadata) | — | re-run January metadata (C004) |
| A2-11 | OWNER-RUN — PENDING | **FAIL** | Brent release obligation (mail) |
| A2-12 | OWNER-RUN — PENDING | **FAIL** | Brent release obligation (mail) |
| A2-13 | OWNER-RUN — PENDING | **BLOCKED** | Brent release obligation (after A2-11) |

## 6. Recommendation (for B001 / Brent; not implemented)

**Provenance-preserving port**: on a January branch from refreshed origin/main `76349909`, `git cherry-pick -x` the
19 A9 commits in order, union-resolve `scripts/ci/e2e-mandatory.mjs`, then re-verify the flow spec against the
current provider and SSR auth (both changed on main since the base). Reasons: merging PR #46 is a Brent-owned
release action that deploys main; January work (B003/B006) must amend the spec anyway; `-x` keeps the original SHAs.
PR #46 would then be closed as superseded by Brent, with this file as the provenance link. An established merge of
PR #46 (Brent resolves the one conflict and merges first) is an equally valid alternative and keeps the original
SHAs on main. Either way A2-9 PASS, A2-11/A2-12 FAIL and A2-13 BLOCKED stay as recorded.
