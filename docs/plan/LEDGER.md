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
