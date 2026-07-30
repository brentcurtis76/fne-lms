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
