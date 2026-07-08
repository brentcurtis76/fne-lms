# GENERA: Critical Plan Analysis, Phased AI-Buildable Construction Itinerary, and Test Suites

*Prepared for Brent Curtis — July 2026*

## TL;DR
- **The December 2026 beta is achievable only if scope is cut to a single institutional (B2B) product for ~2–3 pilot schools, with the B2C family subscription, the RAG pipeline, and the React Native apps explicitly deferred to 2027.** Building both products plus RAG plus mobile in five months with a solo orchestrator is the plan's single largest risk.
- **Ley 21.719 consent-and-erasure architecture is a hard dependency that must be built before any new minor data is stored** — the law (in force 1 December 2026, the same month as your beta) requires documented parental consent for all under-16 sensitive data, a mandatory Data Protection Impact Assessment (EIPD) *before* processing, and there is *no government consent portal* (that premise in the plan is a misconception).
- **The itinerary below decomposes the build into 15 phases sized to ~150–220K-token agent sessions, each ending production-ready with self-verifiable test gates**; Claude Opus 4.8 is recommended for schema, RLS, and multi-file refactors (leads SWE-bench Pro 69.2% vs 58.6%), and GPT-5.5-Codex for terminal-heavy scaffolding, test generation, and long autonomous CLI loops (leads Terminal-Bench 2.1 78.2% vs 74.6%).

---

# PART 1 — CRITICAL ANALYSIS OF THE PLAN (Falencias y Mejoras)

## 1.1 Scope realism: the biggest risk is trying to build everything

The plan bundles at least five hard subsystems — institutional platform, B2C family product with a real payment gateway, sociogram engine, RAG ingestion pipeline, and two React Native apps — behind a single December 2026 beta, executed by one person orchestrating AI agents. Every credible source on EdTech implementation says the tool is rarely the failure point; the operating model around it is. Per the EdTech Evidence Exchange's July 2021 EdTech Genome Project report (led by Bart Epstein, UVA), educators estimate that 85% of edtech tools are poor fits or poorly implemented (against $25–41B/yr US ed-tech spend). And per Gallup & NewSchools Venture Fund's "Education Technology Use in Schools" (surveyed Jan 29–Mar 25, 2019; 3,210 teachers, 1,163 principals, 1,219 administrators, 2,696 students), 65% of educators "have jettisoned a digital tool that they had initially piloted or adopted." In Latin America specifically, connectivity gaps, teacher-training deficits, and the "champion leaves and the initiative dies" pattern dominate failure analyses.

**Recommendation:** Ruthlessly cut the December 2026 beta to **one institutional product, individual + group levels, for 2–3 pilot schools**, and defer: B2C family subscription, Transbank, RAG bulk ingestion, and both mobile apps. This is not a reduction in ambition; it's sequencing to survive the pilot.

## 1.2 Technical architecture risks

**RLS complexity.** With 9 existing roles plus 4 GENERA user types and three-level visibility rules (individual/group/signals), plus the hard rule that asesores see *synthesized* data but not *raw session content*, and leadership/FNE see *only macro metrics*, the row-level-security surface is the single most dangerous technical area. RLS bugs are silent — users see each other's data and you find out from an incident, not a crash. The mitigation is non-negotiable automated RLS testing (pgTAP) with a policy-per-role-per-operation matrix, plus the discipline that every table in the public schema has RLS enabled (a table with RLS on and zero policies is inaccessible, which is safe; a table with RLS off is world-readable through PostgREST).

**Sociogram data modeling.** Peer-nomination data is both a modeling and an ethics problem (see 1.4). Modeling-wise, nominations are directed edges with temporal validity, age-appropriate collection modes, and per-student roster randomization (to defeat alphabetical-order nomination bias in grades 6–8). This is a graph inside Postgres; keep it relational (`nominator_id, nominee_id, prompt_id, wave_id, created_at`) and compute status classifications (popular/rejected/neglected/controversial/average) in a view or job, never storing a raw "rejected" label on a child's row.

**Longitudinal data across 15 years.** A student record that follows a child from age 3 to 18 across grade transitions, asesor changes, and possibly campus changes is a slowly-changing-dimension problem. Model the *person* as stable and the *enrollments/assignments* as time-bounded. This also collides directly with Ley 21.719 retention limits (1.3).

**RAG pipeline complexity.** Multi-format ingestion (PDFs, scanned books needing OCR, videos needing transcription) is its own engineering track with legal due-diligence gating. pgvector on Supabase is the right call — mature, HNSW-indexed (cosine distance for typical embeddings, `m=16, ef_construction=64` as a starting point), RLS-enforceable, and comfortably handles well under 10M vectors, which this corpus will be. But it should never block the institutional beta.

**Multi-tenant isolation.** School-level tenancy must be enforced at the RLS layer with a `school_id` on every row and a `has_role_on_school()` security-definer function, wrapped in `(select ...)` to trigger the initplan caching optimization, with indexes on every column referenced in a policy. Missing indexes on RLS predicate columns are the top performance killer (documented improvements exceed 100× on large tables).

## 1.3 Privacy/compliance gaps — Ley 21.719 (corrected and specified)

Dedicated compliance research corrected and sharpened several premises in the plan:

- **Age thresholds (Art. 16 quáter):** *niños/niñas* = under 14; *adolescentes* = 14–17. Consent rules: **parental/guardian consent for ALL personal data of under-14s**; adolescents 14–17 may consent under adult rules for non-sensitive data; but **sensitive data of adolescents under 16 requires parental consent**. Because GENERA's content (self-knowledge reflections, socioemotional wellbeing, sociometric data) is almost certainly *sensitive* data, the practical rule is: **parental consent for everyone under 16, and explicit consent (parental or the adolescent's own) for 16–17-year-olds.** The best-interest-of-the-child and progressive-autonomy standard applies at all ages, and the law explicitly names *educational establishments* as bearing a heightened duty.

- **The "government portal with 2-week turnaround" is a misconception.** Nothing in Ley 21.719 establishes a state consent portal or a mandated turnaround. The obligation is on GENERA (the *responsable*, per Art. 12) to capture, document, and be able to prove valid consent that is *libre, específica, inequívoca e informada* via a clear affirmative action — no pre-ticked boxes, sensitive-data consent given separately, revocable at any time, burden of proof on the controller. **Fix the plan: build your own verifiable parental-consent capture and audit-log mechanism; do not architect around a nonexistent portal.**

- **EIPD (Data Protection Impact Assessment) is legally required *before* processing (Art. 15 ter).** Large-scale processing of sensitive minor data plus profiling squarely triggers it; "datos de menores a gran escala" is an explicitly cited trigger. If residual risk stays high after mitigation, you must consult the APDP before proceeding. This is a *gating artifact*, not a nice-to-have.

- **Retention / erasure (Art. 17).** There is no fixed statutory maximum, but retention is bounded by *finalidad/proporcionalidad* — data kept only as long as necessary for the declared purpose. When a student leaves the school or consent is withdrawn, the lawful basis generally lapses and data should be suppressed unless another basis applies. **A 15-year longitudinal record is not automatically permitted;** the most plausible basis for long-term retention is the research/statistics exception (Art. 16 quinquies), which demands pseudonymization/anonymization and documented risk mitigation. Design data-subject-rights (ARCO + portability + blocking) endpoints with a 30-day response deadline from day one.

- **Security (Art. 14 quinquies) & breach notice (Art. 14 sexies).** The law names *seudonimización y cifrado* as example measures under a risk-proportionate standard; for large-scale sensitive minor data these are effectively required. Breach notice is *"sin dilaciones indebidas"* — **the 72-hour figure is a myth for this law** (it belongs to GDPR and to Chile's separate Ley 21.663 cybersecurity regime toward the ANCI). Affected titulares must also be notified when sensitive data is involved.

- **Fines.** Ley 21.719: gravísima up to **20,000 UTM** (Art. 34 quáter) — ≈ USD $1.2M at 1 UTM ≈ USD $61 (Anguita Osorio); leves up to 5,000 UTM, graves up to 10,000 UTM. Per Thomson Reuters Chile and compliance guides, for repeat offenders within 5 years the fine is tripled (up to 60,000 UTM) or 2% (grave)/4% (gravísima) of prior-year Chilean sales/services revenue, whichever is greater, for non-SME (Ley 20.416) firms. Affecting minor/sensitive data is an explicit aggravating factor.

**COPPA-equivalent / sociometric ethics** are covered in 1.4.

## 1.4 Sociometric data ethics — the sharpest pedagogical-ethical risk

Peer-nomination data can reveal a child as isolated, neglected, or rejected. The research literature classifies students into popular/rejected/neglected/controversial/average statuses, and warns of **stigmatization risk** and the **high stability of rejected status** (e.g., children with ADHD remain more likely to be rejected even after intensive intervention). Negative ("dislike") nominations especially can reinforce negative peer relations. The literature does find that, *with proper procedural safeguards*, the risk to elementary-age children of completing sociometric measures is minimal — but that finding is explicitly conditional on those safeguards.

**Design mandates that follow:**
1. **Never surface raw status labels** ("rejected", "neglected") to any human user, including the asesor. Surface it as a signal to *look*, never as a verdict.
2. **Never expose the sociogram to students or families.** Add an explicit product rule and an RLS/authorization block; sociogram read access is asesor-and-above only, and even then as aggregate/derived views.
3. **Roster randomization per student** for grades 6–8 to defeat alphabetical bias (already in the plan — good).
4. **Consider positive-only nominations** for younger cohorts; if negative nominations are collected, gate them behind additional review.
5. The **KiVa-validated Spanish instruments** (OBVQ-R, validated in Chile by Gaete et al.) are a strong, defensible basis for early-warning surveys — but note the caution from Gaete et al., Prevention Science (2022), "Effectiveness of the KiVa Antibullying Program with and without the Online Game in Chile" (NCT02898324; 39 socially vulnerable Santiago schools, grades 5–6, 5,923 baseline participants): partial KiVa had lower victimization vs control (OBVQ-R adjusted mean diff −0.14, 95% CI −0.26 to −0.01, p=0.035), with "no effect of the full KiVa group for bullying victimization." The digital-game arm underperforming the game-free arm is a pointed data point that reinforces GENERA's anti-ClassDojo, anti-gamification stance.

## 1.5 The two-product B2B/B2C split

Building both simultaneously doubles the surface: consumer-grade UX, a real payment gateway (Transbank Webpay via the maintained `transbank-sdk` npm package), subscription lifecycle, dunning, and B2C support — none of which the institutional beta needs. **Launch the family subscription later, after the institutional product is validated with pilot schools.** The family *read/co-construction role* can exist in the institutional product (families as co-constructors in early years, audience later) without a paywall; monetization comes in a 2027 phase.

## 1.6 Pedagogical-technical tensions

- **The circle "put the device down" paradox.** An app for a ritual that shouldn't use apps is a real contradiction. Resolve it with a dedicated **"circle mode"**: the student facilitator opens the circle on one device, the app then goes into a full-screen low-interaction state (a timer, the ritual prompts, and a single "capture what the group chose to share" field at the end), actively discouraging use during the circle. The interface must be operable by a *student* facilitator, not an adult — large targets, no admin chrome, no free-text surveillance affordances.
- **Student-led interfaces for ages 8–12.** This is where direct self-reporting begins; the UI must be reading-level appropriate, icon-forward, and refuse to collect more than the child chose to share.
- **Family presentation tooling.** The equipo base presents to families; the tool should assemble a student-authored narrative (portfolio-style, à la Storypark's family-owned narrative model) rather than a data dashboard. The student is author.
- **"Capture later" pattern** (voice memo / quick note after session, structured retroactively) is both better pedagogy and better data quality — build it as the default asesor documentation flow, not live note-taking.

## 1.7 Missing pieces in the plan

1. **Offline support.** Chilean connectivity is uneven, with large device-and-connectivity gaps by socioeconomic quartile (PISA data shows >25% differences in computer access between top and bottom quartiles). Supabase has no native offline sync. For the *mobile* phases, adopt an explicit offline-first layer (PowerSync reads the Postgres WAL and respects RLS; or WatermelonDB with a custom sync protocol; last-write-wins with `updated_at`). Do **not** try to make the Next.js web app offline-first; instead ensure the circle-mode and capture-later flows degrade gracefully and queue.
2. **Teacher/asesor training & onboarding.** The most-cited LatAm EdTech failure factor. Budget explicit in-app onboarding, an asesor training track, and a "champion continuity" plan.
3. **Content moderation** for student-generated content (self-knowledge reflections, circle notes) — you need a lightweight flagging path and a clear "stop recording, follow school protocols" interstitial when serious content (bullying/abuse) appears, consistent with the plan's stated non-protocol stance.
4. **Asesor departure mid-year.** Reassignment of 15–20 students and 3–4 equipos base to a new asesor, with continuity of the longitudinal record and a re-consent check if the data-access party changes materially.
5. **Sociogram misuse guardrails** (see 1.4) — an asesor sharing a sociogram with students or families must be structurally impossible, not merely discouraged.
6. **User management via Excel import** needs validation, dry-run preview, idempotency, and error reporting — a common source of multi-tenant data corruption.

---

# PART 2 — PHASED CONSTRUCTION ITINERARY (the centerpiece)

## 2.1 Model capabilities and session budgeting (July 2026)

**Claude Opus 4.8** (released 28 May 2026): 1M-token context by default on the Claude API/Bedrock/Vertex (200K on Microsoft Foundry), 128K max output, adaptive thinking, mid-conversation system messages, and "dynamic workflows" in Claude Code (planning + parallel subagents). Anthropic reports it is "around four times less likely than its predecessor to allow flaws in code it has written to pass unremarked." Leads **SWE-bench Pro 69.2% vs 58.6%**, OSWorld 83.4% vs 78.7%, MCP-Atlas tool use 82.2% vs 75.3%. Long-context input pricing applies over 200K tokens ($5/$25 per M input/output).

**GPT-5.5 / Codex** (GPT-5.5 released 23 April 2026): 1M-token API context, but **inside Codex the window is capped at 400K with roughly 258K practically usable** in a live session (272K input + 128K reserved output, minus ~5% headroom). Codex is natively trained for compaction across context windows and multi-hour autonomous loops (OpenAI reports 24-hour+ runs). Leads **Terminal-Bench 2.1 78.2% vs 74.6%** and is reported stronger at test-suite generation and cross-language translation; Opus is reported stronger on multi-file refactoring, bug localization, and constrained implementation.

**Practical per-session budget:** Because Codex's *usable* window is ~258K and Opus degrades as context fills (context rot: frontier models can drop from ~95% to ~60% accuracy past a threshold), **size each phase to consume ~150–220K tokens including code reading, tool output, and the CLAUDE.md/AGENTS.md files.** Keep the always-loaded memory file under ~200 lines (frontier models reliably follow only ~150–200 instructions; Claude Code's own system prompt uses ~50). Curating context beats filling the window.

**Model assignment rule of thumb:** Opus 4.8 for schema design, RLS policy authoring, large multi-file refactors, and correctness-critical logic; GPT-5.5-Codex for scaffolding, test generation, terminal-heavy CLI loops, and long autonomous iteration. Use one model's fresh subagent to review the other's diff ("prove to me this works; diff against main").

## 2.2 The living state document — `PROJECT_STATE.md`

Every phase ends by updating a checked-in state document so the next session onboards with zero human re-explanation. Structure:

```
# PROJECT_STATE.md
## Meta
- Last phase completed: <id + name>
- Date / model used / commit SHA
## Architecture invariants (never violate)
- RLS on every public-schema table; school_id on every row
- Asesor never reads raw session content; leadership sees macro only
- Sociogram never exposed to student/family roles
- No new minor data stored without consent record + EIPD reference
## Data model (current)
- Tables added this phase, key columns, FKs, RLS policies (count + matrix ref)
## Modules (current)
- Path, purpose, public interface, test file location
## Test status
- Suites and pass counts: "unit 142/142, pgTAP RLS 47/47, e2e 12/12"
- Known-skipped/xfail with reasons
## Consent & compliance ledger
- Which tables hold sensitive minor data; consent basis; retention rule
## Open decisions / debts (with owner)
## Next phase: objective, files likely touched, dependencies, model
## Human-review queue (batched): UX / pedagogical fit / Spanish quality items
```

`CLAUDE.md` holds durable conventions + commands; `PROJECT_STATE.md` holds evolving state; `AGENTS.md` mirrors CLAUDE.md for Codex compatibility. Guardrails that *must* happen (e.g., "block a migration that disables RLS") belong in a Claude Code **hook**, not in CLAUDE.md — instructions in memory files are requests, not guarantees.

## 2.3 Regression strategy (applies to every phase)

Each phase's Definition of Done re-runs **all prior phases' suites**: `pnpm typecheck && pnpm test:unit && supabase test db && pnpm test:e2e`. Wire pgTAP into CI via `supabase test db` (GitHub Actions, Supabase CLI ≥ 1.11.4). E2E runs against a production build with a seeded synthetic tenant. A phase is not done if any prior suite regresses. Use `retries: 2` in CI to separate genuine failures from infra flake; shard E2E when the suite exceeds ~15 minutes.

## 2.4 Synthetic test fixtures (built once, in Phase 1)

A `seed:test` script creating: 3 synthetic schools (tenants), ~6 asesores, ~90 students spanning ages 3–18 across developmental stages, ~20 equipos base, families, and one FNE/leadership user. Every RLS test authenticates as a specific synthetic user via Supabase test helpers (`tests.create_supabase_user`, `tests.authenticate_as`). Fixtures are pseudonymous and contain no real minor data — itself a compliance requirement.

---

## PHASE TRACK A — FOUNDATIONS (institutional beta critical path)

### Phase 0 — Repo hardening, CI, and state scaffolding
- **Objective:** Establish the AI-agent working environment on top of `fne-lms-working`.
- **Scope (in):** Create CLAUDE.md + AGENTS.md + PROJECT_STATE.md; wire CI (typecheck, unit, `supabase test db`, Playwright); add pgTAP + Supabase test helpers; add a `data-testid` lint rule; add a hook blocking migrations that disable RLS; set up branch protection requiring green checks.
- **Scope (out):** Any feature code, any schema change.
- **Files/modules:** `/.github/workflows/*`, `/CLAUDE.md`, `/AGENTS.md`, `/PROJECT_STATE.md`, `/supabase/tests/000-setup.sql`, `playwright.config.ts`.
- **Dependencies:** none.
- **Context budget:** ~120K (read existing repo structure, no deep logic).
- **Recommended model:** **GPT-5.5-Codex** (terminal/CI scaffolding, its strength).
- **Test suite:** CI pipeline green on an empty smoke test; `supabase test db` runs the `rls_enabled('public')` check on existing tables.
- **DoD:** builds pass; typecheck passes; CI runs all four gates on PR; a deliberately world-readable table fails the `rls_enabled` test.
- **State update:** record CI commands, test-runner versions, repo module map.

### Phase 1 — Core GENERA data model + multi-tenant RLS foundation + synthetic seed
- **Objective:** Stable person/enrollment/tenant model and the RLS backbone all later phases depend on.
- **Scope (in):** `persons` (stable identity), `school_tenants`, `enrollments` (time-bounded), `asesor_assignments` (time-bounded, 3–4 equipos base), `developmental_stage` enum, `guardianship` links; `has_role_on_school()` security-definer function; RLS policies for all four GENERA roles across SELECT/INSERT/UPDATE/DELETE; `seed:test` synthetic data script.
- **Scope (out):** plan personal, sociogram, signals, RAG — no feature tables yet.
- **Files/modules:** `/supabase/migrations/*`, `/lib/auth/roles.ts`, `/supabase/tests/002-rls-core.sql`, `/scripts/seed-test.ts`.
- **Dependencies:** Phase 0.
- **Context budget:** ~200K (schema design + policy matrix is dense).
- **Recommended model:** **Opus 4.8** (schema + RLS correctness is its strongest area).
- **Test suite:** pgTAP policy matrix — for each role × table × operation, assert allow/deny; e.g., "asesor SELECT on student in own assignment → allowed", "asesor SELECT on student in another asesor's assignment → 0 rows", "student SELECT on another student → 0 rows", "leadership SELECT on any raw record → 0 rows". Target: all N policy tests pass (expect ~40–60). Consider an `rlsautotest`-style generator to keep the matrix in sync with policy changes.
- **DoD:** all pgTAP RLS tests green; every public table has RLS enabled; every policy-referenced column indexed; `seed:test` produces the 3-school fixture idempotently.
- **State update:** full table list + RLS matrix count; document the tenancy invariant.

### Phase 2 — Consent & compliance architecture (Ley 21.719) — HARD GATE
- **Objective:** No new minor data may be stored until this exists. Consent capture, audit ledger, retention/erasure, DSR endpoints, encryption of sensitive fields.
- **Scope (in):** `consent_records` (subject, guardian, scope, basis, timestamp, revocation, proof artifact), age-aware consent logic (under-16 → parental required for sensitive; 16–17 → own explicit consent allowed), application-level encryption/pseudonymization for sensitive columns, ARCO+portability+blocking endpoints with 30-day SLA tracking, retention-rule metadata per sensitive table, breach-notification runbook stub, and an EIPD reference field linking processing activities to the assessment document.
- **Scope (out):** the EIPD legal document itself (human/legal deliverable, batched to human review), Transbank.
- **Files/modules:** `/modules/consent/*`, `/lib/crypto/field-encryption.ts`, `/app/api/dsr/*`, `/supabase/migrations/*consent*`, `/supabase/tests/003-consent-rls.sql`.
- **Dependencies:** Phase 1.
- **Context budget:** ~200K.
- **Recommended model:** **Opus 4.8** (compliance logic + crypto correctness).
- **Test suite:** unit tests for age-threshold consent logic (13yo sensitive → requires guardian consent; 15yo sensitive → requires guardian; 16yo → own consent valid; 17yo non-sensitive → own consent valid); integration test that a write to any sensitive minor table **fails without a valid consent record**; DSR erasure test (suppression cascades, audit entry created); encryption round-trip test.
- **DoD:** all consent unit/integration tests green; a guarded INSERT without consent returns an authorization error; erasure endpoint verified to remove/anonymize; typecheck + all prior suites green.
- **State update:** consent ledger schema; list every sensitive-minor table and its consent basis + retention rule; note EIPD as an outstanding legal artifact in the human-review queue.

---

## PHASE TRACK B — INDIVIDUAL LEVEL

### Phase 3 — Proyecto de Autoconocimiento + Plan Personal
- **Objective:** The self-knowledge project and personal-growth objectives, adapted by developmental stage.
- **Scope (in):** `self_knowledge_projects` (stage-adapted templates), `personal_plans`, `plan_categories` (school-customizable: rename/show/hide, underlying structure stable — the Arnoldo compromise), `plan_objectives`, `plan_reviews`. Age-shifting authorship: early childhood (data from asesor/family), ~age 8 (self-reporting begins), adolescence (full ownership).
- **Scope (out):** cross-school comparability (explicitly a non-goal — do not build fixed global categories).
- **Files/modules:** `/modules/individual/plan/*`, migrations, `/supabase/tests/004-plan-rls.sql`.
- **Dependencies:** Phases 1–2 (consent gate).
- **Context budget:** ~200K.
- **Recommended model:** **Opus 4.8** (data model + stage logic), Codex for the CRUD UI + tests.
- **Test suite:** unit tests for category customization (rename/hide preserves underlying key); RLS tests (student edits own plan; asesor reads but a leadership role cannot read raw objectives); e2e: create plan → add objective → review cycle.
- **DoD:** category-customization unit tests green; RLS matrix for plan tables green; e2e plan lifecycle passes; all prior suites green.
- **State update:** plan schema; document the category-customization decision and the comparability non-goal.

### Phase 4 — Session records + "capture later" documentation + longitudinal trajectory
- **Objective:** Asesor one-on-one session records with the retroactive capture pattern and a longitudinal growth view.
- **Scope (in):** `sessions`, `session_captures` (voice-memo ref + quick note, structured retroactively), `growth_trajectory` view spanning enrollments/years. Enforce: asesor writes captures; raw content is **not** exposed to leadership.
- **Scope (out):** signals/alerts (Phase 8), audio transcription pipeline (defer or stub).
- **Files/modules:** `/modules/individual/sessions/*`, `/modules/individual/trajectory/*`, tests.
- **Dependencies:** Phases 1–3.
- **Context budget:** ~180K.
- **Recommended model:** **Codex** (CRUD + capture UX + test generation).
- **Test suite:** RLS tests (asesor read/write own students' sessions; leadership → 0 raw rows; macro count view → allowed); unit test that trajectory view correctly stitches records across an enrollment/grade change; e2e capture-later flow.
- **DoD:** RLS green; trajectory stitching unit test green; e2e passes; prior suites green.
- **State update:** session/capture schema; note transcription as deferred.

---

## PHASE TRACK C — GROUP LEVEL

### Phase 5 — Equipo base + Circle records + "put the device down" circle mode
- **Objective:** Stable groups of 3–6 students, student-led weekly circle ritual, minimal-interaction circle mode.
- **Scope (in):** `equipos_base`, `equipo_membership` (3–6 students), `circle_sessions` (opened/closed by student facilitator), `circle_shared_notes` (only what the group chooses to share); circle-mode UI (full-screen, timer, ritual prompts, single end-of-circle capture field, student-operable, no admin chrome).
- **Scope (out):** sociogram (Phase 6), family presentations (Phase 7).
- **Files/modules:** `/modules/group/equipo/*`, `/modules/group/circle/*`, `/app/(circle-mode)/*`, tests.
- **Dependencies:** Phases 1–2.
- **Context budget:** ~200K.
- **Recommended model:** **Opus 4.8** for the facilitation/authorization logic; Codex for circle-mode UI + e2e.
- **Test suite:** RLS (student facilitator can open/close own circle; cannot access another equipo's notes; asesor rotates across 3–4 groups with read access); unit test enforcing 3–6 membership bound; e2e circle open→share→close as a student role.
- **DoD:** membership-bound test green; RLS green; circle-mode e2e passes with no admin affordances present; prior suites green.
- **State update:** equipo/circle schema; document circle-mode interaction constraints.

### Phase 6 — Sociogram engine (with ethics guardrails) — HIGH RISK
- **Objective:** Sociogram from BOTH asesor observation AND age-appropriate student self-reporting, with structural misuse prevention.
- **Scope (in):** `nominations` (nominator, nominee, prompt, wave, source=asesor|student, created_at); per-student **roster randomization** for grades 6–8; status computation in a **view/job only** (never a stored label on a child); authorization that makes sociogram read **impossible** for student/family roles; positive-only mode for younger cohorts.
- **Scope (out):** signals synthesis (Phase 8); any student/family-facing sociogram view (permanently out).
- **Files/modules:** `/modules/group/sociogram/*`, migrations, `/supabase/tests/007-sociogram-rls.sql`.
- **Dependencies:** Phases 1–2, 5.
- **Context budget:** ~200K.
- **Recommended model:** **Opus 4.8** (correctness + authorization criticality).
- **Test suite:** RLS assertion "sociogram API returns 403/0 rows for student role accessing another student's nominations"; "family role → 0 rows on any sociogram endpoint"; unit test that roster randomization yields non-alphabetical order per student and is deterministic per (student, wave) for reproducibility; schema assertion that status classification lives only in the derived view and no raw status column exists.
- **DoD:** every student/family sociogram-access test denies; randomization test green; no raw status label column exists; prior suites green.
- **State update:** sociogram schema + the hard rule "never exposed to student/family"; add to architecture invariants.

### Phase 7 — Family presentations (student-authored narrative)
- **Objective:** Equipo base collectively presents growth to families + guests, replacing parent-teacher meetings; student as author.
- **Scope (in):** `family_presentations`, `presentation_artifacts` (student-authored portfolio items), guest-invite tokens, family read/co-construction role (no paywall yet).
- **Scope (out):** B2C subscription/Transbank (Track E).
- **Files/modules:** `/modules/group/presentations/*`, `/modules/family/*` (read/co-construct), tests.
- **Dependencies:** Phases 3–6.
- **Context budget:** ~180K.
- **Recommended model:** **Codex** (narrative UI + tests).
- **Test suite:** RLS (family reads own child's presentation; cannot read other families' or any sociogram); unit test that guest tokens are scoped and expiring; e2e presentation assembly.
- **DoD:** family-scope RLS green; token-scope test green; e2e passes; prior suites green.
- **State update:** presentation/family schema; note family role is unmonetized in beta.

---

## PHASE TRACK D — SIGNALS & DASHBOARD

### Phase 8 — Signals (early-warning flags) + age-context interpretation
- **Objective:** Flags from combining individual + group data, where a flag means something different at age 6 vs 16, and diagnoses (ASD, etc.) are *interpretive context*, not a separate module.
- **Scope (in):** `signal_definitions`, `signal_evaluations` (computed, human-review-required, never auto-actioned), age/stage-aware thresholds, diagnosis-context table that modifies interpretation of other data. KiVa/OBVQ-R-based survey instruments (validated Spanish) as inputs.
- **Scope (out):** any automatic alert requiring action without human review (explicitly forbidden — "the dashboard activates, the asesor decides"); serious-incident protocol handling (out of product scope — show "stop recording, follow school protocols" interstitial).
- **Files/modules:** `/modules/signals/*`, migrations, tests.
- **Dependencies:** Phases 3–7.
- **Context budget:** ~200K.
- **Recommended model:** **Opus 4.8** (interpretive logic correctness).
- **Test suite:** unit tests that the same underlying datum yields different signal states by age/stage; that a diagnosis-context record changes interpretation rather than creating an independent flag; integration test that no signal triggers an automated action (only surfaces for review).
- **DoD:** age-context unit tests green; "no auto-action" assertion green; serious-content interstitial e2e present; prior suites green.
- **State update:** signals schema; document the "no surveillance / human decides" invariant.

### Phase 9 — Asesor unified dashboard + semáforo, and macro-metrics view for leadership/FNE
- **Objective:** The synthesized asesor dashboard (individual growth + group dynamics + signals) with a red/yellow/green semáforo, and a strictly macro-only leadership/FNE view.
- **Scope (in):** dashboard aggregations, semáforo across students and groups, leadership macro view (session frequency, plan-completion %, group health — **no content**). Enforce that the asesor sees *synthesis*, not raw session content of others; leadership sees only macros.
- **Scope (out):** mobile (Track F).
- **Files/modules:** `/modules/dashboard/*`, `/app/(asesor)/dashboard/*`, `/app/(leadership)/*`, tests.
- **Dependencies:** Phases 3–8.
- **Context budget:** ~200K.
- **Recommended model:** **Codex** (dashboard UI + e2e) with **Opus 4.8** reviewing the leadership data-minimization boundary.
- **Test suite:** RLS/integration that leadership endpoints return only aggregates (assert no content fields present in payload); semáforo unit tests (threshold → color); e2e asesor dashboard load with synthetic tenant.
- **DoD:** leadership "aggregate-only" payload assertion green; semáforo tests green; e2e passes; prior suites green. **This is the institutional beta cut line — ship here for December 2026.**
- **State update:** mark institutional beta complete; snapshot the full test-count baseline.

---

## PHASE TRACK E — RAG (independent track, deferrable; do not block beta)

### Phase 10 — RAG schema + retrieval (internal-only) on pgvector
- **Objective:** Internal knowledge base feeding contextual tips to asesores (not user-facing exploration).
- **Scope (in):** `documents`, `document_sections` (chunk + embedding via pgvector HNSW, cosine), retrieval RPC with RLS-enforced access, tenant/role filtering; contextual-tip surface for asesores.
- **Scope (out):** bulk ingestion of third-party copyrighted material (legal due-diligence GATE first); family-facing personalized content (later).
- **Files/modules:** `/modules/rag/*`, `pgvector` migration, tests.
- **Dependencies:** Phases 1–2; **legal due-diligence sign-off (human gate).**
- **Context budget:** ~180K.
- **Recommended model:** **Codex** (pipeline + tests); Opus for RLS on vector access.
- **Test suite:** unit test that retrieval respects RLS (a user cannot retrieve chunks from documents they lack access to — the Supabase "RAG with permissions" pattern); HNSW index present; retrieval returns ranked results on seed corpus.
- **DoD:** RAG-permission RLS test green; index assertion green; retrieval smoke test green; prior suites green.
- **State update:** RAG schema; record the copyright due-diligence gate status.

### Phase 11 — Multi-format ingestion pipeline (OCR + transcription)
- **Objective:** Ingest PDFs, scanned books (OCR), and videos (transcription) into the RAG store.
- **Scope (in):** ingestion jobs, OCR + transcription adapters, chunking, embedding, idempotent re-ingestion, provenance metadata.
- **Scope (out):** user-facing exploration; anything blocked by unresolved copyright.
- **Files/modules:** `/modules/rag/ingest/*`, worker/edge functions, tests.
- **Dependencies:** Phase 10 + legal sign-off.
- **Context budget:** ~200K.
- **Recommended model:** **Codex** (long autonomous pipeline loops, its strength).
- **Test suite:** integration tests per format (PDF→chunks, image→OCR→chunks, video→transcript→chunks) on small fixtures; idempotency test (re-ingest yields no duplicates); provenance recorded.
- **DoD:** per-format integration tests green; idempotency green; prior suites green.
- **State update:** ingestion coverage matrix; note copyrighted-source status.

---

## PHASE TRACK F — MOBILE (React Native + Expo; 2027)

### Phase 12 — Family mobile app (offline-first)
- **Objective:** Family app first (co-construction/audience). Web stays Next.js.
- **Scope (in):** Expo app, shared API layer, **offline-first sync** (PowerSync reading Postgres WAL with RLS respected, or WatermelonDB + last-write-wins on `updated_at`), key family flows working offline with queue-and-replay.
- **Scope (out):** everything not validated on web first; asesor app (Phase 13).
- **Files/modules:** `/apps/family-mobile/*`, shared `/packages/api/*`, Maestro flows.
- **Dependencies:** Phase 7 production-ready.
- **Context budget:** ~200K.
- **Recommended model:** **Codex** (RN scaffolding + Maestro test generation); Opus for sync-conflict logic.
- **Test suite:** **Maestro** YAML flows (login, view child growth, view presentation), using `testID` targeting; offline test: airplane mode → action → reconnect → verify sync; unit tests on the conflict resolver.
- **DoD:** Maestro critical-path flows green in CI (EAS Build); offline queue-replay test green; prior web suites green.
- **State update:** family-mobile module map; sync strategy + conflict rules.

### Phase 13 — Asesor mobile app (fieldwork, capture-later on mobile)
- **Objective:** Asesor app for fieldwork, with the capture-later flow working offline.
- **Scope (in):** Expo asesor app, capture-later (voice memo + quick note) offline with queue-and-replay, dashboard read.
- **Scope (out):** B2C billing (Phase 14).
- **Files/modules:** `/apps/asesor-mobile/*`, shared API, Maestro flows.
- **Dependencies:** Phases 4, 9, 12 (shared sync layer).
- **Context budget:** ~200K.
- **Recommended model:** **Codex** (RN + Maestro); Opus for sync-conflict logic.
- **Test suite:** Maestro flows (capture-later offline, dashboard load); offline queue-replay test; conflict-resolver unit tests.
- **DoD:** Maestro flows green; offline capture verified to sync server-side after reconnect; prior suites green.
- **State update:** asesor-mobile module map.

### Phase 14 — B2C "Acompañamiento Personalizado" + Transbank + family RAG content
- **Objective:** Monetize the family product with subscription and a real Chilean payment gateway.
- **Scope (in):** subscription lifecycle, `transbank-sdk` (Webpay) integration with the test environment first, dunning, receipts; family-facing personalized RAG content.
- **Scope (out):** none — final phase.
- **Files/modules:** `/modules/billing/*`, `/app/api/webpay/*`, tests.
- **Dependencies:** Phases 10–13.
- **Context budget:** ~200K.
- **Recommended model:** **Codex** (payment flow + e2e) with **Opus 4.8** reviewing money-handling correctness.
- **Test suite:** integration tests against Transbank's testing configuration (create transaction → return URL → responseCode 0 success path; declined path); subscription state-machine unit tests; e2e purchase with test card.
- **DoD:** Webpay test-env success + failure paths green; subscription state tests green; prior suites green.
- **State update:** billing schema; production-readiness checklist for Transbank go-live.

---

# PART 3 — TEST SUITES AND DEFINITIONS OF DONE

## 3.1 Tooling stack (verified July 2026)
- **Unit/component:** Vitest (or Jest) for logic, hooks, components. Target ratio ~70% unit / 30% E2E.
- **RLS/policy:** **pgTAP** via `supabase test db`, using Basejump/Supabase test helpers (`tests.create_supabase_user`, `tests.authenticate_as`, `tests.rls_enabled`). For a 20+ table schema, consider a generator (e.g., `rlsautotest`) that produces per-table/per-role/per-operation tests so the matrix stays in sync with policy changes. Wire into GitHub Actions (Supabase CLI ≥ 1.11.4). Note: `INSERT` blocked by RLS *throws*, but blocked `UPDATE` returns empty — test updates with `is_empty(...returning...)`.
- **Web E2E:** **Playwright** against a production build; `getByRole`/`getByTestId` selectors; `storageState` auth fixtures per role (regenerate tokens each CI run); `retries: 2` in CI; shard when > 15 min; mock the RPC boundary (not server actions) for Next.js App Router; use web-first `expect(locator).toBeVisible()` auto-waits, never `waitForTimeout`.
- **Mobile E2E:** **Maestro** (YAML, black-box, Expo-friendly, low setup, ~1% flakiness, CI ~8–12 min); use `testID` props, not visible text; Detox only if gray-box JS-thread sync assertions become necessary (Detox has deeper RN integration but ~40-min CI and RN-version coupling).

## 3.2 Self-verifiable expected results (examples the model checks itself)
- "pgTAP RLS suite: all 47 policy tests pass."
- "Sociogram API returns 0 rows / 403 for `student` role accessing another student's nominations, and for any `family` role."
- "Leadership macro endpoint payload contains no content fields (assert keys ⊆ {counts, percentages, group_health})."
- "Consent-guarded INSERT into a sensitive minor table fails without a valid consent record."
- "Roster randomization is non-alphabetical per student and deterministic per (student, wave)."
- "Offline capture created in airplane mode appears server-side after reconnect (last-write-wins on `updated_at`)."

## 3.3 Per-phase Definition of Done checklist (template)
1. `pnpm build` passes; `pnpm typecheck` passes with zero errors.
2. `pnpm test:unit` green; `supabase test db` (pgTAP) green; `pnpm test:e2e` (Playwright) green; mobile phases add `maestro test` green.
3. No console errors/warnings in e2e runs.
4. Every new public-schema table has RLS enabled and every policy-referenced column is indexed.
5. Phase-specific acceptance assertions (Part 3.2) pass by running named commands.
6. **All prior phases' suites re-run green (regression gate).**
7. `PROJECT_STATE.md` updated; CLAUDE.md/AGENTS.md updated if conventions changed.

## 3.4 What still requires human judgment (batch these)
- **UX quality** (is circle-mode genuinely "device-down"? is the student-facilitator flow operable by a 9-year-old?).
- **Pedagogical fit** (does the plan-personal category model match FNE's intent? does the signals interpretation respect the "human decides" ethic?).
- **Spanish language quality** (all learner- and family-facing copy; reading-level appropriateness by developmental stage).
- **Sociogram ethics review** (any surface that could reveal a child's status).
- **Legal artifacts** the code references but cannot produce: the **EIPD document**, the **RAG copyright due-diligence sign-off**, and the parental-consent wording.

**How to batch:** each phase appends its human-review items to a single `## Human-review queue` section in PROJECT_STATE.md with a screenshot/e2e-trace link, the exact copy strings in a `/i18n/es` diff, and a one-line question per item. Brent reviews the queue once per phase (or weekly), not per change — keeping human evaluation to a fixed, predictable cadence.

## 3.5 Fixtures for a multi-tenant school platform
Built in Phase 1, reused everywhere: 3 synthetic schools; ~90 pseudonymous students spanning ages 3–18 (to exercise every developmental-stage branch and the under-14 / 14–15 / 16–17 consent boundaries); ~6 asesores each assigned 3–4 equipos base; families; one FNE/leadership user; consent records covering all valid/invalid permutations. No real minor data ever enters test fixtures — a compliance requirement, not just hygiene.

---

# RECOMMENDATIONS (staged, with thresholds)

**Stage 1 (now → Aug 2026):** Execute Phases 0–2. Do **not** write a single new feature table before Phase 2's consent gate exists. Commission the **EIPD** and legal consent wording in parallel (human track). *Threshold to proceed:* all Phase 0–2 gates green and EIPD drafted.

**Stage 2 (Aug → Nov 2026):** Execute Phases 3–9 (individual → group → signals → dashboard). *Threshold to ship beta:* Phase 9 DoD green with 2–3 pilot schools' synthetic tenants, and asesor onboarding/training material drafted. **Cut everything else.**

**Stage 3 (Dec 2026):** Institutional beta with pilot schools. Instrument adoption (are asesores actually using capture-later weekly?). *Threshold to expand:* sustained weekly asesor usage in ≥2 schools and zero RLS/privacy incidents.

**Stage 4 (2027):** RAG track (Phases 10–11, gated on copyright sign-off), then mobile (12–13), then B2C monetization (14). *Threshold for B2C:* institutional retention validated and Transbank test-env suites green.

**Change triggers:** If any pilot school shows the "champion-dependent" failure pattern (usage concentrated in one asesor), pause feature work and invest in training/continuity. If RLS incidents occur, freeze new tables until the pgTAP matrix is exhaustive. If context-window pressure causes agent errors, split the offending phase into sub-phases rather than pushing past ~220K tokens.

---

# CAVEATS
- **Model specifics are July-2026 snapshots.** Codex's usable context (~258K within a 400K cap) and the Opus/Codex benchmark gaps will move; re-baseline before procurement. Several benchmark figures come from vendor and secondary sources and are harness-dependent (e.g., GPT-5.5's Terminal-Bench figure is higher on its native Codex CLI harness) — hold the scaffold constant when comparing.
- **Legal article numbers for the EIPD (Art. 15 ter), fines (Art. 34 bis/ter/quáter), and suppression (Art. 17)** are high-confidence but partly from secondary Chilean legal sources; verify against the BCN official text (idNorma=1209272) with counsel before relying on them for the EIPD. The age-threshold and consent rules (Art. 16 quáter) and breach-notice standard (Art. 14 sexies, "sin dilaciones indebidas") are confirmed against statutory-text sources.
- **Ley 21.719 guidance from the APDP** (orientative EIPD lists, minimum security standards via Art. 14 septies) will only emerge around/after 1 Dec 2026; treat the compliance design as a strong baseline to revise when the APDP issues instructions.
- **Sociometric ethics** research supports minimal risk *only with safeguards*; the guardrails in Phase 6 are load-bearing, not optional.
- **Offline-first** adds real complexity and conflict-resolution edge cases; the last-write-wins default is acceptable for single-author capture flows but must be revisited for any co-edited data.
- **The KiVa "full vs partial" finding** is a single Chilean RCT; treat it as suggestive (reinforcing the anti-gamification stance) rather than dispositive.