# LEDGER — INSPIRA Comms

Append-only. One entry per round (PM, executor, or Codex), newest at the bottom.
Entry format (§2.2 of the SOP):

```markdown
### <ISO date> — P<n> round <r> — <actor>
- CONTEXT PRESSURE: <executor rounds only: comfortable | tight | ran out — at what point?>
- ACTION:
- COMMITS: <sha…>
- TESTS: <command> → <pass/fail, counts>
- FINDINGS RAISED: <blocking / should-fix / nit>
- DECISIONS:
- BACKLOG ADDED:
- OPEN AFTER THIS ROUND:
```

---

### 2026-07-30 — PLAN round 1 — Fable (Planner)
- CONTEXT PRESSURE: n/a (planning session)
- ACTION: Audited site/brochure/funnel (nuevaeducacion.org = this repo; stale cohort dates; Formspree 50/mo cap storing nothing; `interes:'inspira'` label bug; PPTX with enero-leftover + missing week 2; Oct 12 2026 = Fiesta Nacional España, schools closed — day-1 shape unconfirmed). Confirmed product decisions with Brent (no web prices; hybrid ficha/brochure; single October track; broadcast-simple email v1). Confirmed process decisions (docs/plan/ paths; one PLAN.md two tracks; per-phase explicit merge go). Drafted PLAN.md: 14 phases (Track A P1–P7 pasantías, Track B P8–P14 email platform), frozen decisions D-01…D-10, backlog seeded.
- COMMITS: (this docs commit)
- TESTS: none run this round (no source changes)
- FINDINGS RAISED: should-fix ×3 logged to Backlog (open relay send-email.ts; homepage Tailwind CDN; form_submissions migration drift)
- DECISIONS: 7 entries seeded in PLAN.md Decision log
- BACKLOG ADDED: 6 items (see PLAN.md Backlog)
- OPEN AFTER THIS ROUND: Codex plan review (§3.2) pending on branch `docs/comms-plan`; plan NOT frozen; no phase may start. GitHub push auth broken — commits local only. Content inputs pending from Brent: testimonios ×2–3, WhatsApp number, day-1 confirmation from BCN team.

### 2026-07-30 — PLAN round 2 — Fable (PM triage of Codex plan review)
- CONTEXT PRESSURE: n/a
- ACTION: Triaged REVIEW-PLAN.md (VERDICT FAIL, 13 BLOCKING / 11 SHOULD-FIX / 10 NIT). **All 13 BLOCKING accepted** — no disputes: B-01 price leakage via client bundle (agreed: split cohort modules + post-build leak assertion); B-02 consent model (agreed: consent-as-evidence D-12, notice versioning phase A0, basis-attested imports, tenancy exception D-11); B-03 erasure/table-quota (agreed: suppression tombstones + anonymize RPC + webhook-event dedup table; exact-cardinality dropped); B-04 SECURITY DEFINER hardening + behavioral pgTAP (agreed: PUBLIC revoke, empty search_path, B4 behavioral suite); B-05 unreliable sender (agreed: cron-driven drain, full campaign/send state machine, retry RPC, metrics RPC); B-06 open relay (agreed: promoted to Track B prerequisite B1); B-07 webhook contract (agreed: svix dep decided in-plan, svix_id dedup, full event set, 5xx-on-internal-failure); B-08 gating fiction (owner decision: UI-gated shareable link — documented); B-09 broken intermediate states (agreed: resequenced — A5 depends on A4, sidebar Correos moved to B9, no drop-scope clauses, draft-only invariant tested in B9); B-10 site mismatch (agreed: programas.tsx flipbook in A7 scope; trackFormSubmission call removed, tracker removal → backlog); B-11 CI gap (agreed: T2 fixture/mandatory-spec phase + unmocked A9 integration flow; middleware left untouched entirely by admin-only decision); B-12 state machine (agreed: canTransitionLead single authority, full edge tests); B-13 process conflicts (agreed: DB-agent rounds, forward-only rollbacks, CLAUDE.md review-request naming). SHOULD-FIX folded: S-01 (index resplit into 21 phases incl. A3/A4 and B9/B10/B11 splits), S-02 (rate limit = best-effort wording), S-03 (escaping matrix + sandboxed preview), S-04 (editor schema defined + deliberate Link extension), S-05 (metrics/tags RPCs in B4), S-06 (B2 spike), S-07 (PDF text extraction + visual QA gate + override approval rule), S-08 (Appendix A content brief, A0 gate), S-09 (OR-label + queued-count-authoritative), S-10 (pair-scoped unsubscribe stamp), S-11 (B11 preflight gate). NITs: SOP committed in-repo; 7-school list pinned to brief; RFC 5987 filenames; subjective criteria concretized; unfurl = owner post-deploy check; placeholder UI removed; estimate revised to 10–14 executor days. Owner decisions collected via 4 questions: UI-gated shareable brochure; anonymize+tombstone erasure; comms = FNE-global; **email platform admin-only v1** (drops community_manager grant → zero middleware.ts changes in plan).
- COMMITS: (this commit — PLAN.md v2, REVIEW-PLAN.md tracked, AGENT-WORKFLOW.md copy)
- TESTS: none run (docs only)
- FINDINGS RAISED: none new
- DECISIONS: 5 new Decision Log entries (v2 re-plan; gating; erasure; tenancy/access; SOP in-repo)
- BACKLOG ADDED: formSubmissionTracker/form-usage removal; community_manager tier v2
- OPEN AFTER THIS ROUND: Codex re-review of PLAN.md v2 (round 2 of 2 — if not PASS, Brent decides per SOP §1.5). Appendix A items A-4, A-5, A-9..A-12 pending owner/BCN input (block A0 close, not the re-review). Push auth restored — branch now pushed to origin.

### 2026-07-30 — PLAN round 3 — Fable (R2 triage + Brent arbitration + v3)
- CONTEXT PRESSURE: n/a
- ACTION: Triaged REVIEW-PLAN-R2.md (FAIL; 8 BLOCKING; r1 map: 8 CLOSED / 5 PARTIAL). Codex round cap reached → the 4 named disagreements went to Brent. **Arbitration (all four resolved, three matching Codex's stated position):** (1) consent: separate optional marketing opt-in with own evidence — D-12 rewritten (R2-B-01 accepted); (2) suppression: tombstones truly permanent, no authenticated DELETE — D-04 rewritten to per-operation SELECT-only posture across all comms tables, anonymization contract (anonymized_at + two-shape CHECK) specified (R2-B-02 accepted); (3) price boundary: D-02 narrowed to repository-authored surfaces + non-blocking composer warning (R2-B-07 resolved via Codex's "narrow" branch); (4) sizing: SOP caps honored — A6, A7, B1, B4, B7, B9, B10, B11 pre-split → 30-phase index (R2-B-08 accepted). **Mechanical fixes (accepted without arbitration):** R2-B-03 → `process_webhook_event` single-transaction dedup+effect RPC, payload column, sent/delivery_delayed defined as ledger-only, 5xx rolls back svix row; R2-B-04 → zero-queue stays draft (no draft→failed; campaign `failed` status removed), send re-POST → 409 w/ status, completion predicate = no pending AND no sending + `complete_campaign_if_done` RPC + two-worker pgTAP case, bounded drain ticks (≤2 campaigns × ≤3 claims); R2-B-05 → B1 split: B1a moves expense-report mail server-side (utils/emailUtils.ts + pages/expense-reports.tsx call sites, server-derived recipients) before B1b deletes the relay; R2-B-06 → T2 rebuilt: isolated local Supabase in CI gate 4, seed script, admin+docente fixtures, storageState helper, skip-guard (no assumed mechanism). SHOULD-FIX folded: S-01 (A9 asserts via admin API, public response stays uniform), S-02 (per-row exclusion + recorded attestation, RPC unreachable without it), S-03 (resolved structurally by D-04 — no authenticated write path to bypass the helper), S-04 (docente fixture in T2), S-05 (evidence committed under docs/plan/evidence/<id>/). NITs: phase count corrected (30 executable), B3 documents per-table operation matrix.
- COMMITS: (this commit — PLAN.md v3, REVIEW-PLAN-R2.md tracked)
- TESTS: none run (docs only)
- FINDINGS RAISED: none new
- DECISIONS: 2 Decision Log entries (arbitration; v3 mechanical fixes)
- BACKLOG ADDED: none (lead-import backlog item annotated marketing_opt_in-only)
- OPEN AFTER THIS ROUND: Codex confirmation review of v3 — beyond the 2-round cap, so it runs on Brent's authority as arbiter, scoped to verifying the 8 R2 findings + 4 arbitration implementations (not a fresh full review). Appendix A pendings unchanged (A-4, A-5, A-9..A-12, now A-14/A-15 drafting in A0). Plan remains NOT frozen until that PASS.

### 2026-07-30 — PLAN round 4 — Fable (R3 residues → Brent §1.5 → v4 + FREEZE)
- CONTEXT PRESSURE: n/a
- ACTION: REVIEW-PLAN-R3.md closure matrix: 6/8 R2 blockers CLOSED, all 5 SHOULD-FIX CLOSED, 2 remediation-introduced residues taken to Brent per §1.5. **Residue decisions (both = Codex's recommended remedy):** (1) webhook PII → sanitized ledger: `email_webhook_events.detail` holds an allowlisted non-PII operational subset only; projection happens INSIDE `process_webhook_event` (raw payload never written); pgTAP sweep asserts post-anonymization no recipient email in contacts/sends/webhook events (D-06, B3, B4b amended). (2) composer price warning → generic client-side currency pattern (`detectCurrencyAmounts`; no protected values, no commercial import client-side; broader warnings accepted) (D-02, B8, B9b amended). NITs fixed: D-12 reworded ("no default may assert consent or a legal basis"); Decision Log corrected to 8 pre-split phases. **PLAN FROZEN v4** on Brent's arbiter authority — every R1/R2/R3 finding is now closed or resolved by logged owner decision; no live disagreement remains.
- COMMITS: (this commit — PLAN.md v4, REVIEW-PLAN-R3.md tracked)
- TESTS: none run (docs only)
- FINDINGS RAISED: none
- DECISIONS: 1 Decision Log entry (residue resolution + freeze)
- BACKLOG ADDED: none
- OPEN AFTER THIS ROUND: Execution begins. Next: A0 (content brief inputs from Brent + privacy-versioning executor round) and T2 (CI topology) — independent, can run in parallel. A0's Appendix A inputs still pending from Brent/BCN team (A-4, A-5, A-9..A-12). PM to dispatch executor prompts.

### 2026-07-31 — T2 round 1 — Opus (executor)
- CONTEXT PRESSURE: comfortable — the phase is small in code (8 files, ~525 net lines) but long in wall-clock, because every verification is a full CI cycle. Nothing was cut for context.
- ACTION: Built the CI e2e fixture topology (it did not exist — gate 4 previously built against placeholder env and ran only `smoke.spec.ts` against no Supabase stack). Gate 4 now: `supabase start -x <9 unused services>` → `supabase db reset` (both migrations from scratch) → `.env.local` from `supabase status -o json` → `npm run build` → `node scripts/ci/seed-e2e.mjs` → mandatory spec list → skip guard → `supabase stop --no-backup` (`if: always()`). New: `scripts/ci/e2e-fixtures.json` (shared fixture constants, so seeder and specs cannot drift), `scripts/ci/seed-e2e.mjs` (idempotent admin+docente+school seeder that hard-refuses any non-local Supabase host), `tests/e2e/helpers/auth.ts` (UI login → storageState per fixture), `tests/e2e/ci-fixture.spec.ts` (6 tests), `scripts/ci/e2e-mandatory.mjs` (list + fail-on-skip guard). Playwright config emits a JSON report under CI so the guard has something to read. CLI pinned to 2.110.0 for gate 4 only (it passes service names to `-x`; gate 3 still uses `latest`).
- COMMITS: `decf9e4` (topology), `c6e3c99` (locator fix), `7a95272` (plan docs onto branch), `48c5806` (scratch skip — guard demo), `8ca8c49` (revert of the scratch skip), `c123727` + `42a3a8c` (evidence/review-request/ledger), plus this ledger correction — full list on PR #27
- TESTS: `npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` → **8 passed (8.6s)** on run 30602316662 (`smoke.spec.ts` 2 + `ci-fixture.spec.ts` 6). Guard on the real report → `OK — 2 mandatory spec(s) ran with no skips`. Skip demo (run 30602616645) → specs step succeeds, guard step fails, as designed. Gates 1/1b/2/3 green in CI on the branch commit. Seeder verified idempotent (created → reused) and verified to refuse a production URL. Evidence: `docs/plan/evidence/t2/ci-runs.md`.
- FINDINGS RAISED: (should-fix) `pages/login.tsx` has no `data-testid` on its email/password inputs and its labels are not associated with them, so the auth helper must locate the password field by CSS — fix before A6b builds on this helper. (nit) `/admin/schools` renders the same `<h1>` twice (layout header + page heading), which is both an a11y smell and a Playwright strict-mode trap. (process, not code) the repo worktree is shared by concurrent executor sessions: during this phase another session committed its A0 work onto `phase/t2-ci` (preserved at `rescue/a0-6e69c9e`, branch rebuilt to T2-only), ran `supabase test db` against the shared local stack and wiped a seeded fixture set mid-verification, and ran a second concurrent `next build` in the same `.next/`. Recommend one git worktree per concurrent phase.
- DECISIONS: (1) storageState is produced by driving the real login form, not by minting a token — it exercises the auth-helpers cookie chain the middleware actually reads. (2) `beforeAll` + `test.use({storageState})` instead of a Playwright setup project, so no login dependency is attached to the default `chromium` project that ~57 legacy specs use. (3) gate 4 pins the Supabase CLI; gate 3 left on `latest` (out of scope). (4) gates verified in CI rather than locally — the shared worktree carried another phase's uncommitted source, so a local run would have graded a tree that is not this branch.
- BACKLOG ADDED: `data-testid` on the login form inputs (blocks nothing now; wanted before A6b). Duplicate `<h1>` on `/admin/schools`. Gate 3's `supabase db start` + `latest` CLI could adopt the same pinned/`-x` treatment for consistency.
- OPEN AFTER THIS ROUND: PM independent verification, then Codex final review. Later phases add their own specs to `MANDATORY_SPECS` in `scripts/ci/e2e-mandatory.mjs`.

### 2026-07-31 — T2 round 1 — Fable (PM verification)
- CONTEXT PRESSURE: n/a
- ACTION: Independent verification per SOP §3.3.2. Verified first-hand: (1) full code diff read (8 files) against [A1]–[A5] — ci.yml conforms exactly (pinned CLI with recorded rationale, ephemeral stack with unused services excluded, `db reset` from migrations, env derived from `supabase status -o json` before the build — NEXT_PUBLIC inlining respected, seed step, mandatory-list runner, `if: always()` skip-guard AND teardown, failure-only report artifact); `seed-e2e.mjs` is idempotent and hard-refuses non-local hosts; `auth.ts` drives the real login form (exercises the middleware cookie chain); `ci-fixture.spec.ts` proves admin reach + docente bounce; `.gitignore` negation for the fixtures JSON is correct given the repo's blanket `*.json` ignore. (2) CI evidence verified via `gh`, not quoted: PR #27 head `eb908ed` — six of six checks pass (Gate 4 e2e 6m40s on the seeded ephemeral stack); run 30603388897 = success on that head; guard-demo run 30602616645 = failure exactly as designed (skip → guard red). Deliberately did NOT re-run gates locally: CI on the pushed commit is the phase's specified verification surface, and shared-local-stack runs are the collision class this phase just documented.
- COMMITS: (this ledger commit)
- TESTS: `gh pr checks 27` → 6/6 pass (PM-verified).
- FINDINGS RAISED: zero code findings. Confirms the shared-worktree/shared-stack process finding (prevention recorded in the A0 round-1 PM entry: one worktree per executor session; DB-touching gates serialize).
- DECISIONS: executor's four recorded decisions accepted (real-login storageState; no setup-project coupling to legacy specs; gate-4-only CLI pin; CI-as-evidence given the polluted local tree).
- BACKLOG ADDED: (1) `data-testid` + label association on `pages/login.tsx` inputs — wanted before A6b builds on the auth helper; (2) duplicate `<h1>` on `/admin/schools` (a11y + strict-mode trap); (3) consider gate 3 adopting the same pinned-CLI/`-x` treatment.
- OPEN AFTER THIS ROUND: **T2 is clean — ready for Codex final review (Brent triggers).** No merge until Codex PASS + Brent's explicit go. Recommended merge order: T2 first (lands the plan docs on main), then A0 reconciles its ledger tail on top.
