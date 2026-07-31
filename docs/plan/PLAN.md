# PLAN — INSPIRA Comms (Pasantías Barcelona web/leads + Email platform) — v2

META
- REPO / ROOT: fne-lms-working (nuevaeducacion.org — hybrid public marketing site + Genera LMS; Next.js Pages Router, TypeScript, Tailwind, Supabase, Vercel auto-deploy from `main`)
- BRANCH CONVENTION: `phase/<id>-<slug>`, total ≤20 chars. Each phase branches from current `main`; a phase starts only after its dependencies are DONE (merged).
- PROCESS: SOP at `docs/plan/AGENT-WORKFLOW.md` (authoritative in-repo copy). PM: Fable (writes PLAN.md/LEDGER.md only). Executors: fresh Opus session per round. Reviewer: Codex Sol (final say on BLOCKING). Arbiter: Brent. Caps: 3 executor attempts / 3 PM rounds / 2 Codex rounds.
- MERGES: per-phase explicit go from Brent only; `main` auto-deploys. PM never merges on own authority.
- MIGRATIONS: dispatched through the repo DB-agent flow (dedicated single-purpose DB executor round; DDL in this plan is the spec, not hand-off-free SQL). Additive only; **no DROP/TRUNCATE/destructive ALTER ever, including in rollback paths** — rollback of DB phases = disable consuming routes/UI (forward-only), never schema removal.
- REVIEW ARTIFACTS: executor phase review-requests at `docs/planning/reviews/fase-<phase-id>-review-request.md` (CLAUDE.md rule 6 location/naming); Codex phase reviews at `docs/plan/reviews/REVIEW-<phase-id>.md`.
- PLAN v1 REVIEW: FAIL (13 BLOCKING) — `docs/plan/reviews/REVIEW-PLAN.md`. This v2 is the remediation; triage in LEDGER round 2.
- PLAN FROZEN: — (DRAFT; freezes on Codex plan-review PASS)

## Goal

Improve communication and sales of Pasantías INSPIRA Barcelona for the **October 2026 cohort** (week 1 Mon Oct 12–Fri 16; week 2 Tue Oct 20–Fri 23), and give FNE a permanent in-house capability to (a) capture/track interest leads and (b) design and send broadcast emails to its contact base — safely: no price leakage to the web, provable consent, durable suppression, reliable sending.

1. Dedicated landing page `/pasantias` with correct dates (homepage currently advertises Abril 2026 — past — and Noviembre 2026 — wrong).
2. Generated downloadables from a single content source: open ficha (no prices) + full brochure (prices; UI-gated, publicly shareable link — owner decision).
3. Lead capture with explicit consent evidence, auto-reply, internal notification, admin triage.
4. "Correos": admin-only broadcast platform — contacts + tags + CSV import, fixed-frame composer, cron-driven reliable sending via Resend, one-click unsubscribe, per-campaign metrics.

## Non-goals

- No CRM beyond lead triage; no automation sequences, scheduling, merge tags, per-link analytics, A/B tests (v2; schema must not preclude).
- No prices in any web bundle, page, or email body — brochure PDF bytes only.
- No changes to the Directivos offer (October = single track) or the B2B quoting backend.
- No CMS; cohort content is typed constants gated by an owner-approved content brief.
- No Resend Audiences/Broadcasts; contact data lives in our Supabase.
- No school-scoped access to the email platform (admin-only v1 — owner decision; school targeting via tags).

## Frozen architectural decisions

- **D-01 Split cohort data by exposure.** `lib/pasantias/cohort-public.ts` — client-safe (dates, schools, experts, objectives, day structure, lodging area, Madrid school names; zero monetary fields) — is the only cohort module public pages may import. `lib/pasantias/cohort-commercial.ts` — prices, payment terms, monetary includes/excludes, plus sentinel constant `__INSPIRA_COMMERCIAL__` — may be imported **only** by the server-side brochure generator. Enforced by a post-build assertion (`scripts/check-price-leak.mjs`: sentinel and price literals absent from `.next/static/**`) wired into CI, plus a unit test that the serialized public module contains no monetary keys/values.
- **D-02 Prices exist only in brochure PDF bytes.** Verified by PDF text extraction (brochure contains €1.560; ficha does not), the D-01 bundle assertion, and email-content tests (no price strings).
- **D-03 Leads.** Dedicated `pasantias_leads` table. Transition graph (authoritative helper `canTransitionLead(from,to)` in `lib/pasantias/leads.ts`, used by every writer; each edge tested, allowed and denied): `new→contacted`, `new→dismissed`, `contacted→converted`, `contacted→dismissed`, `dismissed→new` (admin re-open, or automatic on public resubmission). `converted` is terminal. No flow creates platform users from a lead.
- **D-04 Write/access posture.** Public-facing writes go through server routes using `createServiceRoleClient()`. All new tables: RLS enabled, **admin-only** policies (Track A and Track B — owner decision "solo admins"), no anon policies, no `community_manager` grant (v2 backlog), therefore **no `middleware.ts` changes anywhere in this plan**. In-memory `lib/rateLimit.ts` is best-effort dampening only — never a security-relevant acceptance criterion; durable cost controls are structural (bucket-cached PDFs, per-lead email dedup, cron-paced sending).
- **D-05 Generated downloadables.** React-PDF from cohort modules; cached in `propuestas` bucket keyed by `BROCHURE_VERSION`; served by streaming routes with stable public URLs and `Cache-Control: public` (consistent with the owner's gating decision: form is the UI path, link is shareable). Manual override files require explicit per-file owner approval recorded in the ledger (an unreviewed override can violate D-02).
- **D-06 Email schema sized to obligations, not a table quota.** Core: `email_contacts`, `email_campaigns`, `email_campaign_sends`, plus `email_suppression` (SHA-256 email-hash tombstones that survive erasure and block resurrection at import AND queue time) and `email_webhook_events` (`svix_id` unique — at-least-once dedup ledger). SQL surface the API layer cannot express ships as SECURITY DEFINER functions/RPCs: `queue_campaign_sends`, `claim_campaign_sends`, `import_email_contacts`, `get_campaign_metrics`, `list_contact_tags`, `retry_failed_sends`, `anonymize_email_contact`. All SECURITY DEFINER: `SET search_path = ''` with schema-qualified references, `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` (baseline default-grants make PUBLIC revocation mandatory), EXECUTE granted to `service_role` only. Campaign metrics always computed from sends (no denormalized counters).
- **D-07 Sending is server-driven and durable.** A drain route (`/api/cron/email-drain`, `Bearer CRON_SECRET`, per existing cron-route pattern) processes all `sending` campaigns in short idempotent ticks: claim ≤200 (`FOR UPDATE SKIP LOCKED`; stale `sending` rows >15 min reclaimable), send ≤100-recipient `resend.batch.send` calls, write the ledger per batch (index-aligned ids). Invoked by Vercel cron (cadence per B2 spike findings on the account's plan) AND by an authenticated admin "Procesar ahora" action — the UI observes state, it never owns liveness. **Campaign state machine:** `draft→sending` (queue, >0 recipients) · `draft→failed` (queue error/empty audience) · `sending→sent` (complete, 0 failed) · `sending→sent_with_errors` (complete, ≥1 failed) · `sent_with_errors→sending` (explicit retry API flips `failed→pending`). Send-row machine: `pending→sending→sent|failed|skipped`; `failed→pending` via retry RPC only. Completion requires no pending AND no claimable rows. Accepted tradeoff (documented): a mid-tick crash can duplicate ≤1 batch after reclaim — chosen over silent non-delivery.
- **D-08 Compliance is structural and evidenced.** Every campaign email: per-recipient unsubscribe URL + `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click`. Unsubscribe: GET never mutates; POST (JSON and RFC 8058 form-encoded) is idempotent, exempt from shared-IP throttling, returns generic 200 for unknown tokens but **5xx on internal failure** (caller can retry). Webhooks verified with the `svix` package (Resend 3.5.0 has no verifier — dependency decided here), raw body capped (256 KB), timestamp tolerance ±5 min past **and** future, `svix_id` deduplicated via insert-first into `email_webhook_events`; event state table covers `sent, delivered, delivery_delayed, failed, suppressed, bounced, complained, opened, clicked` (failed/suppressed/bounced/complained also suppress the contact); unknown types/duplicates → 200; internal failure → 5xx.
- **D-09 Reuse with verified assumptions.** Resend for all sending — after B1 closes the open relay and B2 locks the installed SDK's real contracts (batch response nesting, headers, error-as-value shapes, idempotency support; upgrade only if the spike says so). Campaign editor schema = the shared TipTap config's real capabilities (headings 2–3, bold/italic/underline, lists, paragraphs) **plus a deliberately added Link extension with regression tests**; no H1, no inline images (hero slot covers imagery); the renderer implements exactly this schema. `renderCampaignHtml` is a marketing-specific sibling of `emailLayout` (different footer obligations). URLs via `lib/utils/app-url.ts`. Admin UI follows the hand-rolled Tailwind + MainLayout house pattern.
- **D-10 Repo hard rules.** RLS + pgTAP for every new table (privilege matrix AND behavioral contracts); migrations via DB-agent flow, additive, forward-only rollbacks; es-CL UI copy, English code/commits; `data-testid` on new interactive elements; e2e via `getByRole`/`getByTestId`, no `waitForTimeout`; no agent deployments.
- **D-11 Tenancy exception (owner-approved 2026-07-30).** Comms data (leads, contacts, campaigns) is FNE-global — no `school_id`. Substitute access rule: admin-only RLS + service-role writes (D-04). School-level segmentation via contact tags. The GENERA `school_id` invariant is untouched for academic data. Minor-data guard: comms tables hold adult professional contacts only; platform imports exclude non-staff roles (allowlist of current staff role types); no student/family identities may enter these tables (EIPD position: out of comms scope by construction).
- **D-12 Consent is evidence, not a default.** `consent_accepted_at` has **no DB default** — always explicitly supplied. Every consent-bearing row records `consent_notice_version` (from `PRIVACY_NOTICE_VERSION`, introduced in A0 with a stable, dated privacy notice — the current page renders today's date on every request and must be fixed first). `email_contacts` records `legal_basis` CHECK (`consent_form | customer_relationship | manual_verified`) + `basis_note` + `basis_recorded_at` (NOT NULL, no defaults on basis fields). Platform approval ≠ marketing permission: imports require an explicit admin-attested basis; lead-form consent text covers response + requested materials + related program updates (the recorded basis for later broadcasts to leads).

## Working constraints (verified 2026-07-30)

- GitHub push auth restored ~15:20 — branches push; CI runs on PRs. CI today runs type-check, Vitest, `supabase test db`, and **only** `tests/e2e/smoke.spec.ts` (`.github/workflows/ci.yml:85-112`) — phase T2 makes new specs mandatory.
- Local `.env.local` lacks `RESEND_API_KEY` — email code paths must fail soft locally; real sends verified on preview/prod (A9/B11 gates).
- `supabase test db` needs Supabase CLI + Docker. Full local e2e is false-green-prone (~57 legacy env failures) — run targeted specs, grep "N failed".
- Resend 3.5.0 installed: batch response nested `{data:{data:[{id}]}}`, no webhook verifier — B2 spike locks final shapes before any sending code.

## Phase index

Track T = shared infrastructure, A = pasantías, B = email platform.

| ID | Name | Status | Branch | Depends on |
|----|------|--------|--------|-----------|
| A0 | Content brief sign-off + privacy notice versioning | TODO | `phase/a0-content` | — |
| T1 | (reserved — merged into A0/B2) | — | — | — |
| T2 | CI: synthetic admin fixture + mandatory non-skipping specs | TODO | `phase/t2-ci` | — |
| A1 | Cohort data modules + leak guard + homepage date fix | TODO | `phase/a1-cohort` | A0 |
| A2 | `pasantias_leads` migration + RLS + pgTAP (DB-agent) | TODO | `phase/a2-leads-db` | A0 |
| A3 | Brochure + ficha generators + PDF text/visual QA | TODO | `phase/a3-pdfgen` | A1 |
| A4 | PDF serving endpoints (cache/headers) + leak checks | TODO | `phase/a4-pdfsrv` | A3 |
| A5 | Lead API + transition helper + auto-reply/notification | TODO | `phase/a5-lead-api` | A2, A4 |
| A6 | `/pasantias` landing page + LeadForm + UI e2e | TODO | `phase/a6-landing` | A5, T2 |
| A7 | Link rewiring (incl. programas flipbooks) + contact.ts swap | TODO | `phase/a7-links` | A6 |
| A8 | Admin leads triage (transition-enforced) | TODO | `phase/a8-leads-ui` | A5, T2 |
| A9 | Track A release verification (integration e2e + prod checklist) | TODO | `phase/a9-verify` | A6, A7, A8 |
| B1 | Open-relay remediation (prerequisite for all Track B) | TODO | `phase/b1-relay` | — |
| B2 | Resend SDK / svix / Vercel-cron compatibility spike | TODO | `phase/b2-spike` | B1 |
| B3 | Email schema: tables + RLS + privilege pgTAP (DB-agent) | TODO | `phase/b3-email-db` | A0, B2 |
| B4 | Email SQL functions + behavioral pgTAP (DB-agent) | TODO | `phase/b4-email-fn` | B3 |
| B5 | Contacts admin (CRUD, tags, anonymize-erasure) | TODO | `phase/b5-contacts` | B4, T2 |
| B6 | Imports: CSV + platform sources with basis attestation | TODO | `phase/b6-import` | B5 |
| B7 | Unsubscribe + webhooks (svix, dedup, full event set) | TODO | `phase/b7-unsub` | B4 |
| B8 | Renderer + editor Link extension + sandboxed preview | TODO | `phase/b8-render` | B2 |
| B9 | Campaigns API + composer UI + test-send | TODO | `phase/b9-compose` | B5, B8 |
| B10 | Send backend: drain route + state machine + retry | TODO | `phase/b10-send` | B7, B9 |
| B11 | Send/progress/metrics UI + campaign e2e + preflight gate | TODO | `phase/b11-sendui` | B10 |

Sequencing per Codex: Track A starts only after A0 (content/privacy). Track B starts with B1→B2; schema follows the consent model; webhook/unsubscribe before sending; backend before UI; no visible link/control before its target works. Honest effort note: ~10–14 focused executor days plus PM/Codex loop overhead; no calendar commitment.

---

## Phase A0 — Content brief sign-off + privacy notice versioning

**Scope:** Appendix A of this file (content brief — PM-written from owner inputs, owner-approved, versioned); executor work: `components/PrivacyPolicyContent.tsx` (stable dated version + exported `PRIVACY_NOTICE_VERSION`), consent copy constants (es-CL) for the lead form, legal footer identity block (name + physical address from brief).
**Out of scope:** any cohort/lead/email code.
**Acceptance criteria:**
- [A1] Appendix A completed and marked APPROVED by Brent in the Decision Log, covering: exact 7-school list, day-1 shape (Oct 12 = Fiesta Nacional — schools closed), full itinerary, experts + titles, prices/payment terms (for brochure only), claims ("400+ pasantes" etc.), legal org identity + postal address, WhatsApp number, testimonios (or explicit "launch without").
- [A2] Privacy page shows a fixed "Última actualización" date and version string sourced from `PRIVACY_NOTICE_VERSION` (no more render-time current date); es-CL consent sentence for the lead form exists as an exported constant and states: response to the request, delivery of the requested program, and related program updates; unsubscribe promise.
- [A3] Gates green (`npm run type-check && npm run lint && npm test && npm run build`).
**Test plan:** snapshot/unit test that the privacy component renders the fixed version+date. Command: targeted vitest + full gates.
**Definition of done:** brief APPROVED logged; criteria met; review-request `fase-a0-review-request.md`; mergeable.
**Risks:** owner availability for the brief — blocks both tracks' schema/copy phases by design.
**Rollback:** revert branch (copy-only phase).

## Phase T2 — CI: synthetic fixtures + mandatory non-skipping specs

**Scope:** `.github/workflows/ci.yml` e2e step; e2e seed additions for a synthetic admin user (existing seeded-synthetic-tenant mechanism); `tests/e2e/helpers/` auth fixture; a fail-on-skip guard for the mandatory spec list (introduced per phase as specs land).
**Out of scope:** the product specs themselves (their phases own them).
**Acceptance criteria:**
- [A1] CI e2e step runs an explicit mandatory spec list (initially smoke; later phases append) and **fails if any mandatory spec is skipped** (skip-guard verified by a deliberate `test.skip` in a scratch run, then removed).
- [A2] A seeded synthetic admin fixture logs in headlessly in CI (no real credentials; no PII) and is usable via a helper; a spec proving login works is in the mandatory list.
- [A3] Gates green including the e2e job on the PR.
**Test plan:** the fixture-login spec itself + CI run evidence (PR checks). Command: `npx playwright test tests/e2e/ci-fixture.spec.ts` locally + CI.
**Definition of done:** standard + review-request.
**Risks:** CI environment seeding differences — executor must read the existing e2e workflow seeding path first and report findings if the synthetic tenant lacks an admin.
**Rollback:** revert branch (CI config + test files only).

## Phase A1 — Cohort data modules + leak guard + homepage date fix

**Scope:** `lib/pasantias/cohort-public.ts`, `lib/pasantias/cohort-commercial.ts`, `scripts/check-price-leak.mjs` (+ wire into `ci.yml` build step and `npm run build:check` script), `__tests__/lib/pasantias-cohort.test.ts`, `pages/index.tsx` (dates card only).
**Out of scope:** nav links, flipbooks, contact form, new pages, PDFs.
**Acceptance criteria:**
- [A1] Public module: cohort id/label, weeks (2026-10-12→16; 2026-10-20→23; day-1 labeled per Appendix A; "lunes 19 feriado" note), the approved 7 schools, 8 experts, 13 objectives, day structure, lodging area, Madrid school names. **Zero monetary values or fields.** Commercial module: program/lodging/total/Madrid prices, payment terms, monetary includes/excludes, `BROCHURE_VERSION`, `BROCHURE_FILENAME`, and `COMMERCIAL_SENTINEL = '__INSPIRA_COMMERCIAL__'` embedded in a value.
- [A2] `check-price-leak.mjs` scans `.next/static/**` after build and fails on sentinel or price literals (`1560`, `1.560`, `€1.000`, `810`, `560` as standalone monetary tokens); wired into CI after `next build`; passes on this branch.
- [A3] Unit guard: commercial math (1000+560=1560), no Oct 19 session, valid ISO dates, week 2 starts Tuesday; public module serialization contains no `/€|price|precio|eur/i` keys and no monetary numbers; **all content values assert against Appendix A rows, cited by anchor, not self-invented numbers**.
- [A4] Homepage card shows "Octubre 2026 · 12–16 y 20–23 de octubre" rendered from the **public** module; "Abril 2026"/"Noviembre 2026" remain only in the two flipbook modal titles (A7 removes them); no prices.
- [A5] Gates green + leak script green.
**Test plan:** `__tests__/lib/pasantias-cohort.test.ts` as above; leak script run in build. Commands: `npx vitest run __tests__/lib/pasantias-cohort.test.ts`; `npm run build && node scripts/check-price-leak.mjs`.
**Definition of done:** standard + review-request.
**Risks:** false positives on numeric tokens in unrelated chunks — scope the scan to token+context (regex with € or price-key adjacency) and document exclusions in the script.
**Rollback:** revert branch.

## Phase A2 — `pasantias_leads` migration + RLS + pgTAP (DB-agent)

**Scope (DB-agent round):** migration `add_pasantias_leads.sql`; `supabase/tests/030-pasantias-leads-rls.sql`.
**Out of scope:** API/UI/email code; any change to existing tables.
**Acceptance criteria:**
- [A1] Table per spec: identity/contact/institution fields as v1, plus `consent_accepted_at timestamptz NOT NULL` (**no default**), `consent_notice_version text NOT NULL`, status CHECK (`new|contacted|converted|dismissed`) default `new`, `brochure_sent_at`, timestamps + `set_updated_at`; CHECK on `email_normalized`; UNIQUE `(email_normalized, cohort)`; indexes status / created_at DESC.
- [A2] RLS enabled; admin-only ALL policy (active admin role, USING + WITH CHECK); no anon/other-role policies.
- [A3] Migration additive; no RLS disable; **rollback section states forward-only** (disable consuming routes; no drop).
- [A4] pgTAP: rls_enabled; admin SELECT/INSERT/UPDATE/DELETE allowed; docente + anon fully blocked (INSERT throws 42501 / SELECT empty / UPDATE matches 0); insert without explicit `consent_accepted_at` fails (NOT NULL proves no default). ~13 asserts, `020-tractor-signups-rls.sql` conventions.
- [A5] `npm run test:db` green + full gates.
**Test plan:** the 030 suite. Command: `npm run test:db`.
**Definition of done:** standard + review-request.
**Risks:** none new — additive, unreferenced until A5.
**Rollback:** forward-only (no consumer exists yet; abandoning = leave table dormant).

## Phase A3 — Brochure + ficha generators + PDF text/visual QA

**Scope:** `lib/pasantias/brochure.tsx`, `lib/pasantias/ficha.tsx`, shared section components under `lib/pasantias/pdf/`; `lib/pasantias/__tests__/pdf.test.ts`; visual QA artifacts (rendered page images attached to the executor report).
**Out of scope:** serving endpoints/caching (A4), lead API, landing page.
**Acceptance criteria:**
- [A1] `generateBrochure()` (server-only; imports commercial module): portada, qué es + objetivos, día tipo, itinerario 2 semanas (day-1 per brief; lunes 19 feriado), 7 escuelas, equipo, alojamiento, inversión + forma de pago, incluye/no incluye, contacto (legal identity from A0). `generateFicha()` (public module only): 1–2 pages, no prices.
- [A2] PDF **text-extraction** tests (real extraction, not component-tree): brochure text contains "1.560" and payment terms; ficha text contains no monetary tokens; both start `%PDF`; brochure ≥5 pages, ficha ≤2.
- [A3] Visual QA performed: every page rendered to PNG at 144 DPI, attached to the report; no clipped/overflowing text, no missing glyphs (accented es-CL), readable hierarchy — PM independently inspects; unresolved visual defects are findings, not notes.
- [A4] Filenames es-CL via RFC 5987-compatible naming constants (consumed by A4-phase headers).
- [A5] Gates green.
**Test plan:** `lib/pasantias/__tests__/pdf.test.ts` (extraction + structure); render-to-image script for QA (dev-only, not CI). Commands: `npx vitest run lib/pasantias/__tests__/pdf.test.ts`; QA script per report.
**Definition of done:** standard + review-request + attached page renders.
**Risks:** React-PDF typographic ceiling — visual QA is the gate; if quality is unacceptable, PM escalates to Brent (designed-PDF override path per D-05 with per-file approval).
**Rollback:** revert branch.

## Phase A4 — PDF serving endpoints + leak checks

**Scope:** `pages/api/pasantias/brochure.ts`, `pages/api/pasantias/ficha.ts`; `__tests__/api/pasantias-pdf.test.ts`.
**Out of scope:** generators (A3), lead API.
**Acceptance criteria:**
- [A1] GET-only; serve from `propuestas` bucket cache path `pasantias/<name>-<BROCHURE_VERSION>.pdf`; on miss: generate → upload → serve; upload failure degrades to generate-and-serve (logged). Headers: `application/pdf`, `Content-Disposition: inline` with RFC 5987 filename, `Cache-Control: public, max-age=3600` (consistent with owner's shareable-link decision).
- [A2] A pre-existing file at the cache path is served as-is; the code path is covered by a test; the plan's override rule (per-file owner approval) is stated in the route's doc comment.
- [A3] Best-effort rate limit present (best-effort wording; the durable cost control is the cache).
- [A4] Tests: cache-hit path, generate-on-miss path, degrade-on-upload-failure path, header assertions. Gates green.
**Test plan:** `__tests__/api/pasantias-pdf.test.ts` with mocked storage + real generator (small fixture cohort). Command: targeted vitest + `npm test`.
**Definition of done:** standard + review-request.
**Risks:** cold-start render latency (~1–3s once per version) — accepted.
**Rollback:** revert branch (endpoints unreferenced until A5/A6).

## Phase A5 — Lead API + transition helper + auto-reply/notification

**Scope:** `lib/pasantias/leads.ts` (`canTransitionLead` + validation helpers), `pages/api/pasantias/lead.ts`, `lib/pasantias/emails.ts`, `__tests__/api/pasantias-lead.test.ts`, `__tests__/lib/pasantias-leads.test.ts`.
**Out of scope:** UI, admin triage, PDF code, contact.ts.
**Acceptance criteria:**
- [A1] POST-only; best-effort rate limit; honeypot fake-success; validation (required names/email/institution/consent-checkbox true; `cohort === CURRENT_COHORT.id`; length caps) → 400 with es-CL field errors; **all user-supplied strings HTML-escaped at every interpolation point in both emails** (hostile-string tests).
- [A2] Persist via service role with explicit `consent_accepted_at: now-from-server` + `consent_notice_version: PRIVACY_NOTICE_VERSION`; duplicate `(email,cohort)` → update contact fields + `dismissed→new` via `canTransitionLead` only; 23505 race → duplicate path; identical 200 body both paths.
- [A3] Emails after persist, best-effort: auto-reply (es-CL, minimal FNE layout, **no prices**, brochure link via `buildAbsoluteUrl('/api/pasantias/brochure')`) + internal notification to `info@nuevaeducacion.org`; failure → still 200, logged, `brochure_sent_at` untouched; missing `RESEND_API_KEY` → soft-fail; **auto-reply dedup**: not re-sent more than once per 24h per lead (amplification control).
- [A4] Transition helper: full edge matrix tested (5 allowed edges pass; every other from→to pair denied).
- [A5] Gates green.
**Test plan:** as v1 suite plus: escaping (hostile payloads render inert), 24h dedup, transition matrix. Commands: targeted vitest ×2 + `npm test`.
**Definition of done:** standard + review-request.
**Risks:** none new; route dark until A6.
**Rollback:** revert branch.

## Phase A6 — `/pasantias` landing page + LeadForm + UI e2e

**Scope:** `pages/pasantias.tsx`, `components/pasantias/LeadForm.tsx`, `tests/e2e/pasantias.spec.ts` (mandatory-list addition per T2), OG image asset if needed.
**Out of scope:** other pages' links (A7), admin UI, endpoints.
**Acceptance criteria:**
- [A1] Compiled Tailwind + brand tokens (model `registro-tractor.tsx`), `Footer`, `<Head>` OG/Twitter meta via `app-url`; imports **only** the public cohort module (leak script from A1 stays green — CI-enforced).
- [A2] Sections from Appendix A content: hero (fecha chip; CTA primario → form; secundario → ficha), por qué Barcelona + approved claims, día tipo (3 cards), itinerario (2 weeks, day-1 per brief, feriado marked), 7 escuelas, equipo (8), testimonios (only if brief supplied them), FAQ ≥5 (no prices; cotización grupal → existing contact path), LeadForm, WhatsApp CTA (number from brief; omit section if brief says none).
- [A3] LeadForm: fields per A5 contract + consent checkbox (A0 sentence, links `/privacidad`) + honeypot; client validation + first-invalid focus; disabled while pending; success panel `role="status"` with brochure link + "te lo enviamos por correo"; server error → es-CL retry, data preserved; UTM/source captured from query.
- [A4] `data-testid` on all interactive elements (`pasantias-*`); accessibility basics: labeled inputs, focus management, contrast per existing tokens (checkable: labels associated + keyboard-only submit path in e2e).
- [A5] `tests/e2e/pasantias.spec.ts` green and in the CI mandatory list: renders hero + dates from public module; ficha link href; empty-submit errors + focus; mocked-API success panel; mocked 500 preserves data; keyboard-only completion.
**Test plan:** the e2e spec (route-mocked; the unmocked integration flow is A9's). Command: `npx playwright test tests/e2e/pasantias.spec.ts`.
**Definition of done:** standard + review-request.
**Risks:** genuinely large phase — it is UI-only by design (API/PDF landed earlier); if context runs out, executor reports honestly and PM splits a round-2 (no silent scope drops — every A-criterion is due).
**Rollback:** revert branch (page orphaned until A7 links it).

## Phase A7 — Link rewiring + contact.ts swap

**Scope:** `pages/index.tsx` (nav ×2, section CTA, **both** flipbook buttons/modals/state as applicable), `pages/programas.tsx` (nav ×2, INSPIRA card link, **its own INSPIRA flipbook state/iframe ~L149-153/651-675**), `pages/nosotros.tsx`, `pages/noticias.tsx`, `components/Footer.tsx`; `pages/api/contact.ts`; `__tests__/api/contact.test.ts`.
**Out of scope:** homepage form fields/consent (backlog), stats numbers, quote flow.
**Acceptance criteria:**
- [A1] Every "PASANTÍAS" nav/footer link → `/pasantias`; homepage section id preserved; homepage + programas INSPIRA flipbooks removed and replaced by links to `/pasantias`; Directivos flipbooks retained with "Abril 2026" removed from titles; `grep -rn "heyzine" pages/ components/` → only Directivos URLs remain; `grep -rn '"/#pasantias"' pages/ components/` → no nav/footer hits.
- [A2] `contact.ts`: interest map covers `inspira/inicia/evoluciona/aula-generativa/otro` (+ legacy aliases); transport = Resend to `info@` from `EMAIL_FROM_ADDRESS` reusing the existing HTML **with all fields escaped** (current template interpolates raw user input — fix, don't copy); Formspree call, 50/month block, and the `trackFormSubmission` call all removed (tracker still fires Formspree warnings at 45 and writes an unmigrated table — dead weight; page `admin/form-usage` → backlog removal); best-effort rate limit; soft-fail without key.
- [A3] Unit tests: label mapping, Resend payload + escaping (hostile input), soft-fail, method guard. E2E nav assertion added to the pasantías spec.
- [A4] Gates green; leak script green.
**Test plan:** `__tests__/api/contact.test.ts`; e2e nav check. Commands: targeted vitest + playwright.
**Definition of done:** standard + review-request.
**Risks:** highest-blast-radius Track A change (all contact-form paths) — soft-fail + tests; PM reads this diff hardest.
**Rollback:** revert branch (Formspree path returns).

## Phase A8 — Admin leads triage

**Scope:** `pages/admin/pasantia-leads.tsx`, `pages/api/admin/pasantia-leads/index.ts`, Sidebar entry (admin-only), `__tests__/api/admin-pasantia-leads.test.ts`, e2e smoke additions.
**Out of scope:** middleware (untouched by plan), email platform, exports beyond CSV.
**Acceptance criteria:**
- [A1] API GET (filters: status, search) + PATCH `{id, status?, notes?}` where **every status change passes `canTransitionLead`** — denied transitions → 400 listing allowed targets; admin-only (401/403 tested for anon/docente).
- [A2] Page per house pattern: status tabs with counts, table (fecha, nombre, email, WhatsApp, institución, cargo, personas, estado, brochure_sent_at), row expand (mensaje/utm/source/consent version), status dropdown offering **only** legal transitions, notes, CSV export; es-CL; `data-testid`s.
- [A3] Unit: auth matrix, transition enforcement (allowed + denied via API), persistence. E2E (mandatory list): admin fixture opens the page and sees a seeded lead; unauthenticated redirect.
- [A4] Gates green.
**Test plan:** targeted vitest + playwright with T2 fixture. Commands: as above.
**Definition of done:** standard + review-request.
**Risks:** none new.
**Rollback:** revert branch.

## Phase A9 — Track A release verification

**Scope:** `tests/e2e/pasantias-flow.spec.ts` (unmocked integration: real form POST → DB → admin page shows the lead, using T2 fixture; mail asserted soft-failed-or-sent via API response contract), CI mandatory-list addition; a written verification checklist executed on the preview/prod deploy with results in the ledger.
**Out of scope:** new features.
**Acceptance criteria:**
- [A1] Integration spec green in CI (no mocks on the lead path; synthetic data only).
- [A2] Post-merge checklist executed and ledgered with evidence: `/pasantias` live with correct dates; ficha downloads; form → lead row + auto-reply received at a test mailbox + internal notification received; brochure link from the email works; homepage card correct; WhatsApp share unfurl checked on a named device (owner-run, result recorded).
- [A3] Any failure = finding; phase closes only when checklist is fully green.
**Test plan:** the integration spec + checklist. Command: `npx playwright test tests/e2e/pasantias-flow.spec.ts`.
**Definition of done:** checklist evidence in LEDGER; Codex review; then Track A is releasable as a whole.
**Risks:** prod-only mail verification depends on Vercel env — coordinate with Brent for the test mailbox.
**Rollback:** n/a (verification phase).

## Phase B1 — Open-relay remediation (Track B prerequisite)

**Scope:** `pages/api/send-email.ts`, `pages/api/test-email.ts`, `lib/bots/expense-service.ts` (caller migration), `package.json` (drop unused `@sendgrid/mail`), tests.
**Out of scope:** campaign features.
**Acceptance criteria:**
- [A1] No unauthenticated route can send arbitrary email: `send-email.ts` deleted or gated behind an internal server-secret + fixed recipient allowlist; `test-email.ts` deleted or admin-gated; `expense-service.ts` sends via a direct internal helper (Resend) with fixed internal recipients — its behavior covered by an updated/added test.
- [A2] Repo-wide grep proves no remaining `fetch`-able unauthenticated send path; `@sendgrid/mail` removed from dependencies (never imported — verified).
- [A3] Gates green.
**Test plan:** unit tests for the gated/migrated paths + a 401 test on any retained route. Command: targeted vitest + `npm test`.
**Definition of done:** standard + review-request.
**Risks:** expense-bot flow must keep working — its existing tests/report cover it; soft-fail preserved.
**Rollback:** revert branch (relay returns — unacceptable long-term; rollback only for defect triage).

## Phase B2 — Resend / svix / cron compatibility spike

**Scope:** a spike executor round producing `docs/plan/reviews/fase-b2-findings.md` + minimal locked-contract tests (`__tests__/lib/resend-contract.test.ts`) + dependency decisions applied (`svix` added; Resend upgraded only if required).
**Out of scope:** feature code.
**Acceptance criteria:**
- [A1] Locked and test-encoded: exact `resend.batch.send` request/response shape on the installed version (nested `{data:{data:[…]}}` or post-upgrade shape), per-email `headers` support, error-as-value vs thrown behavior, idempotency-key support (or its absence, with the dedup implication stated).
- [A2] `svix` verification API locked with a known-vector test (multi-signature header, versioned scheme, past/future tolerance).
- [A3] Vercel cron capability on the account's plan verified (max cadence documented); D-07 cadence parameter recorded in the findings file and reflected in B10's spec (if cron is unavailable/too coarse, findings must say so and PM re-plans B10's invoker before it starts — that path is a FINDINGS outcome, not silent adaptation).
- [A4] Gates green.
**Test plan:** the contract tests (network-mocked; shapes from SDK types + docs). Command: targeted vitest.
**Definition of done:** findings file + tests merged; decisions logged.
**Risks:** none — that's the point of the spike.
**Rollback:** revert branch.

## Phase B3 — Email schema: tables + RLS + privilege pgTAP (DB-agent)

**Scope (DB-agent round):** migration `add_email_marketing_tables.sql`; `supabase/tests/040-email-marketing-rls.sql`.
**Out of scope:** SQL functions (B4), all app code.
**Acceptance criteria:**
- [A1] `email_contacts`: identity fields; `email_normalized` UNIQUE + CHECK; `tags text[]` + GIN; source CHECK; `legal_basis` CHECK (`consent_form|customer_relationship|manual_verified`) NOT NULL, `basis_note`, `basis_recorded_at timestamptz NOT NULL` (**no default**), `consent_notice_version` (nullable — set when basis is consent_form); `unsubscribe_token` UNIQUE default gen_random_uuid(); subscribed_at/unsubscribed_at/suppressed_at + `suppression_reason` CHECK (`bounce|complaint|manual|failed|suppressed`); timestamps + trigger.
- [A2] `email_campaigns`: content fields as v1 + status CHECK (`draft|sending|sent|sent_with_errors|failed`) default draft; audience_tags; send_started_at/completed_at; no counters. `email_campaign_sends`: as v1 + UNIQUE(campaign_id, contact_id) + indexes; **contact FK `ON DELETE RESTRICT`** (erasure is anonymization via RPC, never cascade-delete of history).
- [A3] `email_suppression`: `email_hash text PRIMARY KEY` (SHA-256 of normalized email), reason, created_at. `email_webhook_events`: `svix_id text PRIMARY KEY`, event_type, resend_email_id, received_at.
- [A4] RLS enabled ×5; **admin-only** ALL policies (no community_manager, no anon); migration additive; forward-only rollback wording.
- [A5] pgTAP privilege matrix: rls_enabled ×5; admin CRUD ×5; docente/anon blocked ×5; NOT NULL consent/basis columns reject defaults-missing inserts. `npm run test:db` green.
**Test plan:** 040 suite (~40 asserts). Command: `npm run test:db`.
**Definition of done:** standard + review-request.
**Risks:** none — additive, dormant until B4+.
**Rollback:** forward-only.

## Phase B4 — Email SQL functions + behavioral pgTAP (DB-agent)

**Scope (DB-agent round):** migration `add_email_marketing_functions.sql`; `supabase/tests/041-email-marketing-fn.sql`.
**Out of scope:** app code.
**Acceptance criteria:**
- [A1] Functions (all SECURITY DEFINER, `SET search_path = ''`, schema-qualified, `REVOKE FROM PUBLIC, anon, authenticated`, GRANT to service_role only): `queue_campaign_sends(uuid)` (draft-assert; eligible = subscribed, unsuppressed, not in email_suppression by hash, tags overlap OR empty filter; ON CONFLICT DO NOTHING; flips sending; returns queued count), `claim_campaign_sends(uuid,int)` (pending or stale>15min, SKIP LOCKED, re-check eligibility → skipped), `import_email_contacts(jsonb,uuid,text)` (upsert, tag union, basis fields required per row, refuses rows matching email_suppression, never resurrects unsubscribed/suppressed), `retry_failed_sends(uuid)` (failed→pending, campaign sent_with_errors→sending, returns count), `get_campaign_metrics(uuid)` (grouped counts incl. skipped/failed/unsubscribed), `list_contact_tags()` (distinct unnest), `anonymize_email_contact(uuid)` (hash → email_suppression with reason manual; null PII fields on contact + its sends' email snapshots; keeps rows; idempotent).
- [A2] Behavioral pgTAP (the B-04 list): empty-tag vs overlapping-tag audience; double-queue no-op; stale vs fresh claim; unsubscribe/suppress between queue and claim → skipped; import insert/update/tag-union; suppression-hash refusal; no resurrection; retry flips only failed; metrics math on a seeded fixture; anonymize leaves metrics unchanged and blocks re-import; privilege denial via PUBLIC/anon/authenticated EXECUTE attempts; service-role success.
- [A3] `npm run test:db` green; gates green.
**Test plan:** 041 suite (~45 asserts). Command: `npm run test:db`.
**Definition of done:** standard + review-request.
**Risks:** true SKIP LOCKED concurrency can't be fully exercised in single-session pgTAP — covered structurally (claim marks rows `sending` so a second claim returns disjoint rows; asserted) and noted honestly in the report.
**Rollback:** forward-only.

## Phase B5 — Contacts admin

**Scope:** `pages/admin/email/contacts.tsx`, `pages/api/admin/email/contacts/index.ts`, `lib/email/adminGuard.ts` (admin-only), `components/admin/email/ContactModal.tsx`, Sidebar "Contactos" entry (admin-only), tests.
**Out of scope:** imports (B6), campaigns (B9), send history UI (B11 — no placeholder UI).
**Acceptance criteria:**
- [A1] Guard: `getApiUser` + active-admin check (401/403; docente/CM denied — tested).
- [A2] API: paginated GET (search ilike email/nombre/organización; tag filter via `list_contact_tags` RPC; estado filter incl. suprimido); POST manual add (requires explicit `legal_basis` + `basis_note`; normalized; 409 duplicate); PUT edit (names/org/tags; manual unsubscribe/resubscribe — resubscribe only when suppression_reason is null/manual); **erasure action calls `anonymize_email_contact` RPC** (confirm modal states permanence, es-CL) — no hard-delete endpoint exists.
- [A3] Page per house pattern: table (estado badges Suscrito/Desuscrito/Suprimido/Anonimizado), filters, add/edit modal with basis fields, anonymize confirm; `data-testid`s; es-CL.
- [A4] Unit + e2e (mandatory list, T2 fixture): guard matrix, basis-required validation, anonymize flow calls RPC, page loads for admin, denied for non-admin.
- [A5] Gates green.
**Test plan:** `__tests__/api/admin-email-contacts.test.ts`, `__tests__/lib/email-adminGuard.test.ts`, e2e additions. Commands: targeted + full.
**Definition of done:** standard + review-request.
**Risks:** none new (no middleware change; sidebar entry is admin-only and its target exists in this phase).
**Rollback:** revert branch.

## Phase B6 — Imports: CSV + platform sources

**Scope:** `components/admin/email/CsvImportModal.tsx`, `pages/api/admin/email/contacts/import.ts`, `import-platform.ts`, `lib/email/importHelpers.ts`, `package.json` (+`papaparse` + types), wiring into contacts page, tests.
**Out of scope:** automatic syncs; `pasantias_leads` import (needs A-track merged — backlog if B6 lands first).
**Acceptance criteria:**
- [A1] CSV flow: parse (`;` + BOM), column mapping, **mandatory basis step** (choose `consent_form` — requires notice-version text — or `manual_verified` with attestation note; es-CL explanation), tags, validation preview (invalid/dupes/existing/suppressed counts), chunks ≤500 → RPC; summary incl. `suprimidos_excluidos`.
- [A2] Platform import: `profiles` restricted to an explicit staff-role allowlist (no student/family role types — D-11), approved accounts, email present, basis fixed `customer_relationship` + auto note; `tractor_signups` similarly; both behind an es-CL confirm explaining the basis being recorded; idempotent.
- [A3] Server re-validation; suppression-hash exclusion proven by test (import a suppressed address → not created).
- [A4] Unit tests (helpers: normalization, dedupe, chunk split at 501, semicolon+BOM fixture; API: guard, oversize 400, basis-missing 400, RPC payload, suppressed exclusion). Gates green.
**Test plan:** `__tests__/lib/email-importHelpers.test.ts`, `__tests__/api/admin-email-import.test.ts`. Commands: targeted + full.
**Definition of done:** standard + review-request.
**Risks:** consent quality of historic lists remains an owner responsibility — the tool now records basis + excludes suppressed; B11 preflight re-checks before first send.
**Rollback:** revert branch + dependency removal.

## Phase B7 — Unsubscribe + webhooks

**Scope:** `pages/desuscribir.tsx`, `pages/api/email/unsubscribe.ts`, `pages/api/email/webhook.ts`, `lib/email/webhookVerify.ts` (thin wrapper over `svix`), tests.
**Out of scope:** sending, composer.
**Acceptance criteria:**
- [A1] `/desuscribir`: noindex, es-CL; GET mutation-free; POST → confirmation; unknown token → same generic success.
- [A2] `unsubscribe.ts`: JSON POST + RFC 8058 one-click form POST; idempotent; **exempt from shared-IP throttling** (token-scoped dampening only); `c` param stamps `unsubscribed_at` on the send row matched by **both** campaign_id AND the token's contact (cross-pair test included); unknown token → generic 200; **internal failure → 5xx**.
- [A3] `webhook.ts`: `bodyParser:false` + 256 KB raw cap; `svix` verification (multi-signature, versioned scheme, ±5 min past/future); `svix_id` insert-first dedup into `email_webhook_events` (duplicate → 200 no-op); event table per D-08: delivered/opened/clicked stamp send rows (first-write-wins); `failed|suppressed|bounced|complained` stamp + suppress contact (+ email_suppression hash) with matching reason, falling back to email match when no send row; unknown types → 200; **internal failure → 5xx** (provider retries); bad signature → 401.
- [A4] Tests: svix vectors (valid/tampered/stale/future/multi-sig), dedup no-op, each event's state effect, bounce→suppression+tombstone, oversized body 413, failure-path 5xx, unsubscribe idempotency + one-click + wrong-pair scoping. Gates green.
**Test plan:** `__tests__/lib/email-webhookVerify.test.ts`, `__tests__/api/email-webhook.test.ts`, `__tests__/api/email-unsubscribe.test.ts`. Commands: targeted + full.
**Definition of done:** standard + review-request.
**Risks:** live webhook registration is prod-only — B11 preflight verifies with a real test event.
**Rollback:** revert branch.

## Phase B8 — Renderer + editor Link extension + sandboxed preview

**Scope:** `lib/email/renderCampaign.ts`, `lib/tiptap/extensions.ts` (add Link deliberately) + editor toolbar Link control, `components/admin/email/CampaignPreview.tsx` (sandboxed iframe util), tests.
**Out of scope:** campaign pages/APIs (B9).
**Acceptance criteria:**
- [A1] Campaign editor schema defined = shared config (headings 2–3, bold/italic/underline, lists, paragraphs, blockquote if present) **+ Link** (with `safeUrl` enforcement at render); no H1, no inline images. Existing editor consumers regression-tested (news admin still renders/saves — its specs stay green).
- [A2] `tiptapToEmailHtml` renders exactly that schema to inline-styled email HTML; **every** interpolation escaped: text nodes, link hrefs (`javascript:`/`data:` neutralized), and in `renderCampaignHtml`: subject, preheader, hero URL/alt, CTA label/URL, unsubscribe URL, all attribute contexts.
- [A3] `renderCampaignHtml`: 600px table layout, header, optional hero/CTA, legal footer (identity + postal address from A0 brief) + "Cancelar suscripción"; pure function, client-importable.
- [A4] Preview component: `<iframe sandbox srcDoc>` — no scripts/forms/top-navigation possible (asserted); 600/375 toggle.
- [A5] Hostile-string test matrix green for every boundary; gates green.
**Test plan:** `__tests__/lib/email-renderCampaign.test.ts` (schema + escaping matrix), editor regression via existing news tests + a toolbar unit test. Commands: targeted + full.
**Definition of done:** standard + review-request.
**Risks:** Link extension touches the shared editor — regression scope is why it's isolated here.
**Rollback:** revert branch.

## Phase B9 — Campaigns API + composer + test-send

**Scope:** `pages/admin/email/campaigns/index.tsx`, `[id].tsx` (draft state only; non-draft states render read-only status text until B11), `pages/api/admin/email/campaigns/{index,[id]/index,[id]/test-send}.ts`, `components/admin/email/CampaignForm.tsx`, Sidebar "Correos" entry (**this phase** — target now exists), tests.
**Out of scope:** queue/send/drain/retry (B10), progress/metrics UI (B11). **Invariant: no code path in this phase can move a campaign out of `draft`** — asserted by test (PUT rejects status fields; no send route exists yet).
**Acceptance criteria:**
- [A1] APIs (adminGuard): list; create draft; detail (campaign + live audience estimate via tags, labeled "estimado"); PUT draft-only (subject/preheader/content JSON + server-rendered `content_html` via B8, hero upload URL, CTA, audience_tags; non-draft → 409; status not client-settable); DELETE draft-only.
- [A2] Composer: subject/preheader, TipTap (B8 schema incl. Link), hero upload (`utils/storage` → resources), CTA fields, tag multi-select **labeled "cualquiera de estas etiquetas (O)"** with estimate; dirty-state guard; sandboxed preview (B8 component); `data-testid`s; es-CL.
- [A3] Test-send: single email to the logged-in admin, `[PRUEBA]` prefix, dummy unsubscribe; **no ledger writes**; without `RESEND_API_KEY` returns an explicit visible "no enviado — falta configuración" error (never fake success).
- [A4] Unit + e2e (mandatory list): guard, draft-only 409, content_html rendered on save, OR-label present, test-send single-recipient behavior incl. unconfigured error; e2e: create draft → edit → preview renders in sandbox → dirty-guard.
- [A5] Gates green.
**Test plan:** `__tests__/api/admin-email-campaigns.test.ts`; `tests/e2e/email-admin.spec.ts` (T2 fixture). Commands: targeted + full.
**Definition of done:** standard + review-request.
**Risks:** sizing — largest UI phase; split point pre-agreed: if executor reports tight context, PM splits `[id].tsx` composer internals into a round 2 (no criterion dropped).
**Rollback:** revert branch (sidebar entry included — no dangling link).

## Phase B10 — Send backend: drain + state machine + retry

**Scope:** `pages/api/cron/email-drain.ts`, `pages/api/admin/email/campaigns/[id]/{send,retry}.ts`, `lib/email/sendBatch.ts`, `vercel.json` cron entry (cadence per B2 findings), tests.
**Out of scope:** progress/metrics UI (B11).
**Acceptance criteria:**
- [A1] `send.ts` (adminGuard): draft → validates (subject, body, estimate>0), freezes HTML, `queue_campaign_sends` → returns **queued snapshot count** (authoritative; UI must display it, not the estimate); non-draft → 409.
- [A2] `email-drain.ts` (`Bearer CRON_SECRET`, per existing cron pattern): for each `sending` campaign: claim → batch (≤100, spacing per B2 rate findings) → per-batch ledger writes using the B2-locked response shape incl. error-as-value; terminal transitions exactly per D-07 (`sent` / `sent_with_errors`; all-failed → `sent_with_errors` unless 0 sent total AND queue-complete → `failed`); also invocable via an adminGuard-ed manual "Procesar ahora" route reusing the same handler core (single implementation).
- [A3] `retry.ts` (adminGuard): calls `retry_failed_sends`; only from `sent_with_errors`; returns new pending count.
- [A4] Every email: frozen HTML + per-recipient unsubscribe substitution + List-Unsubscribe headers (asserted on the batch payload); sender = `EMAIL_MARKETING_FROM` (fallback `EMAIL_FROM_ADDRESS`).
- [A5] Tests: queue idempotency (double POST no-op), drain tick with mocked RPC+Resend (success, partial batch error → failed rows + campaign continues, resolved `{error}` value handled, thrown error handled), terminal-state matrix (incl. all-failed), retry authorization + state gating, cron auth 401, manual-drain guard. Gates green.
**Test plan:** `__tests__/lib/email-sendBatch.test.ts`, `__tests__/api/email-drain.test.ts`, `__tests__/api/admin-email-send.test.ts`. Commands: targeted + full.
**Definition of done:** standard + review-request.
**Risks:** cron cadence dependency on B2 findings; duplicate-window tradeoff per D-07 (documented).
**Rollback:** revert branch (drain/cron removed; campaigns stay draft-only as in B9).

## Phase B11 — Send/progress/metrics UI + campaign e2e + preflight gate

**Scope:** `[id].tsx` sending/sent/sent_with_errors/failed states, `components/admin/email/{SendProgress,CampaignMetrics}.tsx`, contact detail send-history (real data now), `tests/e2e/email-send.spec.ts`, `docs/plan/PREFLIGHT-B.md` execution (checklist below).
**Out of scope:** new backend behavior.
**Acceptance criteria:**
- [A1] Confirm modal: from-address, audience description, **queued count shown as authoritative after queueing** (estimate labeled as estimate before); progress = polled `get_campaign_metrics` while `sending` (UI observes; liveness is the cron's); "Procesar ahora" button; incomplete-send banner whenever `sending` (works after tab close/reopen); `sent_with_errors` state: failure list with per-row error + "Reintentar fallidos".
- [A2] Metrics panel: Destinatarios/Enviados/Entregados/Abiertos/Clics/Rebotes/Fallidos/Omitidos/Desuscritos from the RPC; es-CL note that opens are approximate.
- [A3] E2E (mandatory, T2 fixture, mocked Resend boundary): full synthetic flow — create → compose → queue → drain tick → progress reflects counts → terminal state → metrics render; interruption path (queued, no drain → banner + manual process); retry path.
- [A4] **Preflight gate executed and ledgered with evidence before any real-audience send** (owner + PM): DKIM/SPF verified; DMARC present; `EMAIL_MARKETING_FROM` configured; webhook registered + live test event verified end-to-end; open/click tracking on; Resend plan/quota confirmed vs audience size; consent basis review of imported lists; canary send to internal tag received + unsubscribe round-trip verified. Until ledgered PASS, Brent does not authorize a real send.
- [A5] Gates green.
**Test plan:** e2e spec + component tests for state rendering. Commands: targeted + full.
**Definition of done:** standard + review-request + preflight PASS ledgered ⇒ Track B releasable.
**Risks:** prod-dependent preflight items — scheduled with Brent.
**Rollback:** revert branch (backend intact, UI returns to B9 read-only states).

---

## Backlog

| Item | Source | Class |
|---|---|---|
| Remove `lib/formSubmissionTracker.ts` + `pages/admin/form-usage.tsx` + unmigrated `form_submissions` decision | B-10 triage | SHOULD-FIX |
| Homepage off `cdn.tailwindcss.com` → compiled Tailwind | audit | SHOULD-FIX (perf/SEO) |
| Homepage contact form consent checkbox + dual-write into leads | plan v1 | v2 |
| `pasantias_leads` import button in Contactos | B6 note | v2 |
| `community_manager` access tier for Correos | owner decision (admin-only v1) | v2 |
| Scheduled sends, merge tags, nurture sequences, public double-opt-in, sending subdomain | design | v2 |

## Decision log

| Date | Decision | Rationale | Raised by |
|------|----------|-----------|-----------|
| 2026-07-30 | Adopt AGENT-WORKFLOW.md SOP; files at `docs/plan/`; one plan, two tracks; per-phase explicit merge go | Standardized multi-agent development; human-gated deploys | Brent |
| 2026-07-30 | No prices on web or email bodies; brochure PDF only | Commercial flexibility | Brent |
| 2026-07-30 | Hybrid downloadables; October = single track; email v1 = broadcast simple | Scope control | Brent |
| 2026-07-30 | New `pasantias_leads` table; tick-ledger send concept | Design | Fable |
| 2026-07-30 | **v2 re-plan on Codex FAIL (13 BLOCKING accepted)**: split cohort modules + leak guard; consent-as-evidence model; suppression tombstones + anonymize-erasure; svix + webhook-event dedup + full event set; cron-driven drain + full state machine; relay remediation as B1 prerequisite; CI fixture phase; phase graph resequenced (no broken intermediate states); DB-agent rounds; forward-only rollbacks | REVIEW-PLAN.md | Codex Sol |
| 2026-07-30 | Brochure gating = UI-gated, publicly shareable stable link; public caching consistent | Matches real WhatsApp distribution; zero forward friction | Brent |
| 2026-07-30 | Erasure = anonymize + permanent SHA-256 suppression tombstone; metrics immutable under erasure | Honors deletion without losing do-not-contact | Brent |
| 2026-07-30 | Comms tables are FNE-global (tenancy exception, D-11); **email platform access = admin-only v1**; school segmentation via tags | "Solo admins"; removes middleware.ts from scope entirely | Brent |
| 2026-07-30 | SOP copy committed at `docs/plan/AGENT-WORKFLOW.md` as authoritative in-repo version | Codex NIT: plan referenced a file outside the repo | Fable |

## Appendix A — Content brief (v0 — DRAFT, awaiting owner sign-off in A0)

| # | Item | Value | Status |
|---|---|---|---|
| A-1 | Cohort label | Octubre 2026 | OK (Brent 2026-07-30) |
| A-2 | Week 1 | Lun 12 – Vie 16 octubre 2026 | OK (Brent) |
| A-3 | Week 2 | Mar 20 – Vie 23 octubre 2026 (lunes 19 feriado) | OK (Brent) |
| A-4 | Day 1 shape (12-oct = Fiesta Nacional, colegios cerrados) | — | **PENDING (BCN team)** |
| A-5 | Exact 7-school list | Sadako, Learnlife, Octavio Paz, El Puig, Virolai, Les Vinyes + 1 TBC | **PENDING (confirm 7th + order)** |
| A-6 | Experts + titles | Coral Regí (directora), Mora del Fresno (coordinadora), Jordi Musons, Boris Mir, Pepe Menéndez, Joan Quintana, Sergi del Moral, Sandra Entrena | OK (PPTX) — titles TBC |
| A-7 | 13 objectives + day structure + includes/excludes | per PPTX "BROCHURE INSPIRA 2026 - oct2026 2.0" | OK (source named) |
| A-8 | Prices/payment (brochure only) | €1.000 + €560 (doble) = €1.560; Madrid €810; mín 5; 50% + saldo 30 días | OK (Brent) — validity date TBC |
| A-9 | Claims | "400+ pasantes", "40+ colegios", "12 escuelas BCN" | **PENDING (confirm current)** |
| A-10 | Legal identity + postal address (email footer) | — | **PENDING** |
| A-11 | WhatsApp CTA number | — | **PENDING (or launch without)** |
| A-12 | Testimonios (2–3, named + authorized) | — | **PENDING (or launch without)** |
| A-13 | Privacy notice version | `PRIVACY_NOTICE_VERSION` introduced in A0 | in A0 scope |
