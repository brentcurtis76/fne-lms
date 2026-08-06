# PLAN — INSPIRA Comms (Pasantías Barcelona web/leads + Email platform) — v4

META
- REPO / ROOT: fne-lms-working (nuevaeducacion.org — hybrid public marketing site + Genera LMS; Next.js Pages Router, TypeScript, Tailwind, Supabase, Vercel auto-deploy from `main`)
- BRANCH CONVENTION: `phase/<id>-<slug>`, total ≤20 chars. Each phase branches from current `main`; a phase starts only after its dependencies are DONE (merged).
- PROCESS: SOP at `docs/plan/AGENT-WORKFLOW.md`. PM: Fable (PLAN.md/LEDGER.md only). Executors: fresh Opus per round. Reviewer: Codex Sol (final say on BLOCKING). Arbiter: Brent. Caps: 3 executor attempts / 3 PM rounds / 2 Codex rounds per phase.
- MERGES: per-phase explicit go from Brent only; `main` auto-deploys.
- MIGRATIONS: DB-agent flow (dedicated single-purpose DB executor round; DDL here is the spec). Additive only; **no DROP/TRUNCATE/destructive ALTER anywhere, including rollbacks** — rollback of DB phases = disable consumers, forward-only.
- REVIEW ARTIFACTS: executor review-requests at `docs/planning/reviews/fase-<phase-id>-review-request.md`; Codex phase reviews at `docs/plan/reviews/REVIEW-<phase-id>.md`; **phase evidence (rendered PDFs/PNGs, checklist results) committed under `docs/plan/evidence/<phase-id>/` and linked from the ledger** — no evidence lives only in a chat transcript.
- PLAN REVIEWS: v1 FAIL (13 BLOCKING — REVIEW-PLAN.md); v2 FAIL (8 BLOCKING — REVIEW-PLAN-R2.md; arbitration to Brent); v3 closure FAIL (REVIEW-PLAN-R3.md: 6/8 closed, all SHOULD-FIX closed, 2 remediation-introduced residues → Brent §1.5). v4 resolves both residues on Codex-recommended options (sanitized webhook ledger; generic client-side amount warning). Triage: LEDGER rounds 3–4.
- **PLAN FROZEN: 2026-07-30** (Brent's §1.5 authority after arbitration + residue resolution; both residues closed per Codex's recommended remedies, so no live disagreement remains. Changes from here require a Decision Log entry.)

## Goal

Improve communication and sales of Pasantías INSPIRA Barcelona for the **October 2026 cohort** (week 1 Mon Oct 5–Fri Oct 9, full week; free long weekend Sat 10–Mon 12 — Oct 12 is Spain's Fiesta Nacional; week 2 Tue Oct 13–Fri Oct 16; **9 visit days**, corrected by owner 2026-07-31 — Appendix A is normative), and give FNE a permanent, legally sound in-house capability to (a) capture/track interest leads and (b) design and send broadcast emails to consenting contacts.

1. Dedicated landing page `/pasantias` with correct dates (homepage today shows Abril 2026 — past — and Noviembre 2026 — wrong).
2. Generated downloadables from one content source: open ficha (no prices) + full brochure (prices; UI-gated, publicly shareable link — owner decision).
3. Lead capture with split consent evidence (processing vs optional marketing), auto-reply, internal notification, admin triage.
4. "Correos": admin-only broadcast platform — contacts + tags + CSV import, fixed-frame composer, cron-driven durable sending via Resend, one-click unsubscribe, per-campaign metrics.

## Non-goals

- No CRM beyond lead triage; no automation sequences, scheduling, merge tags, per-link analytics, A/B tests (v2 candidates; schema must not preclude).
- No prices in **repository-authored** public surfaces: web bundles, pages, transactional emails, the ficha (see D-02 — admin-authored campaign bodies are outside this guarantee per owner arbitration).
- No changes to the Directivos offer (October = single track) or the B2B quoting backend.
- No CMS; cohort content is typed constants gated by the owner-approved content brief (Appendix A).
- No Resend Audiences/Broadcasts; contact data lives in our Supabase.
- No school-scoped access to the email platform (admin-only v1; school targeting via tags).

## Frozen architectural decisions

- **D-01 Split cohort data by exposure.** `lib/pasantias/cohort-public.ts` (client-safe; zero monetary fields) is the only cohort module public pages may import. `lib/pasantias/cohort-commercial.ts` (prices, payment terms, sentinel `__INSPIRA_COMMERCIAL__`) may be imported **only** by the server-side brochure generator. Enforced by post-build assertion `scripts/check-price-leak.mjs` (sentinel + price literals absent from `.next/static/**`) wired into CI, plus a unit test that the public module serialization has no monetary keys/values.
- **D-02 Price boundary (narrowed by owner arbitration 2026-07-30).** Prices appear only in brochure PDF bytes **among repository-authored surfaces**: web bundles (D-01 guard), pages, the ficha, and transactional email templates (all covered by tests). Admin-authored campaign bodies are the admin's own content and carry no structural guarantee; the composer shows a **non-blocking** es-CL warning driven by a **generic client-side currency-amount pattern** (`detectCurrencyAmounts` — matches shapes like `€1.234` / `$500.000`; contains **no protected values and imports no commercial module**, so D-01's leak guard is unaffected; broader-than-exact warnings accepted by owner residue decision 2026-07-30). Warning tested; save/send never blocked.
- **D-03 Leads.** Dedicated `pasantias_leads` table. Transition graph via `canTransitionLead(from,to)` in `lib/pasantias/leads.ts`: `new→contacted`, `new→dismissed`, `contacted→converted`, `contacted→dismissed`, `dismissed→new` (admin re-open or automatic public resubmission); `converted` terminal. The helper is **authoritative at the API boundary**: RLS grants no authenticated write on the table (D-04), so every write path goes through service-role routes that call it. No flow creates platform users from a lead.
- **D-04 Access/write posture (per-operation, per owner arbitration: tombstones permanent).** All comms tables (`pasantias_leads` + the five email tables): RLS enabled; authenticated **admin = SELECT only**; anon and every other role = nothing; **no authenticated INSERT/UPDATE/DELETE on any comms table**. All mutations go through service-role clients inside guarded API routes (public routes for lead/unsubscribe/webhook; adminGuard-ed routes for admin actions) or SECURITY DEFINER RPCs. Contact erasure exists only as the anonymize RPC — **no code path deletes contacts, suppression tombstones, send history, or webhook events**; campaign deletion exists only as a draft-only service-role route. pgTAP proves the full per-operation matrix, explicitly including direct-DELETE denial on tombstones and contacts for authenticated admins. `lib/rateLimit.ts` is best-effort dampening only; durable cost controls are structural (bucket-cached PDFs, auto-reply dedup, cron-paced bounded sending).
- **D-05 Generated downloadables.** React-PDF from cohort modules; cached in `propuestas` bucket keyed by `BROCHURE_VERSION`; streaming routes, stable public URLs, `Cache-Control: public` (consistent with UI-gated-but-shareable owner decision). Manual override files require per-file owner approval recorded in the ledger.
- **D-06 Email schema sized to obligations.** Tables: `email_contacts`, `email_campaigns`, `email_campaign_sends`, `email_suppression` (SHA-256 tombstones; survive erasure; checked at import AND queue), `email_webhook_events` — a **sanitized, PII-free** svix-id dedup ledger: `(svix_id PK, event_type, resend_email_id, occurred_at, received_at, detail jsonb)`, where `detail` holds only an allowlisted operational subset (e.g. bounce classification/diagnostic code, delay reason) and **never** `to`/`cc`/`bcc`/subject/html or any address — the allowlist projection happens **inside `process_webhook_event`**, so no code path can persist a raw payload (owner residue decision 2026-07-30). Anonymization contract: `email_contacts.anonymized_at` marker; on anonymize, `email/email_normalized/first_name/last_name/organization/basis_note/unsubscribe_token` become NULL (CHECK enforces the two valid row shapes: normal row with consistent normalized email, or anonymized row with NULL identity), sends' `email` snapshots NULLed, tombstone row inserted; second call is a tested no-op; **webhook rows need no scrubbing by construction, and pgTAP asserts post-anonymization no recipient email exists in contacts, sends, or webhook events** while dedup keys and metrics are preserved. SQL surface the API layer cannot express ships as SECURITY DEFINER functions: `queue_campaign_sends`, `claim_campaign_sends`, `complete_campaign_if_done`, `retry_failed_sends`, `import_email_contacts`, `get_campaign_metrics`, `list_contact_tags`, `anonymize_email_contact`, `process_webhook_event`. All: `SET search_path = ''`, schema-qualified, `REVOKE FROM PUBLIC, anon, authenticated`, GRANT service_role only. Metrics always computed from sends.
- **D-07 Sending is server-driven, durable, and race-free.** Campaign statuses: `draft | sending | sent | sent_with_errors` (no `failed` status — zero-audience never leaves draft). Transitions: `draft→sending` only inside `queue_campaign_sends` **iff queued>0** (queued=0 → stays draft, RPC returns 0, API responds 422 es-CL); `sending→sent` / `sending→sent_with_errors` only inside `complete_campaign_if_done`, whose atomic predicate is **no `pending` AND no `sending` rows** for the campaign (fresh claims block completion — a worker holding claimed rows makes the campaign non-terminal by construction; stale recovery only reclassifies rows claimed >15 min ago); `sent_with_errors→sending` only via `retry_failed_sends`. Send-row machine: `pending→sending→sent|failed|skipped`; `failed→pending` via retry RPC only. Repeated send-POST on a non-draft campaign → **409 with current status in the body** (chosen over idempotent no-op; tested for `sending` and terminal states). The drain (`/api/cron/email-drain`, `Bearer CRON_SECRET`) is **bounded AND paced per invocation**: ≤2 campaigns (oldest `send_started_at` first) × ≤3 claim-batches (≤200 rows each, ≤100/`batch.send`) — worst case **12 provider calls per tick**, so every `batch.send` goes through a shared paced sender enforcing **≥150 ms since the previous provider call** (≤6.7 req/s against Resend's 10 req/s ceiling; pacing is a hard requirement, not best-effort, and is proven by fake-clock spacing tests). Invoked by Vercel cron (cadence per B2 findings) and by an adminGuard-ed "Procesar ahora" route sharing the same handler core. UI observes state; it never owns liveness. Accepted, documented tradeoff: a mid-tick crash can duplicate ≤1 batch after stale reclaim.
- **D-08 Compliance is structural and atomic.** Campaign emails carry per-recipient unsubscribe URL + `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click`. Unsubscribe: GET never mutates; POST (JSON + RFC 8058 form) idempotent, exempt from shared-IP throttling, generic 200 for unknown tokens, **5xx on internal failure**. Webhooks: `svix` package verification (multi-signature, versioned scheme, ±5 min past AND future), raw body ≤256 KB, then a single call to `process_webhook_event` — **one atomic transaction** that inserts the `svix_id` ledger row (with payload) and applies the event's state effect together; any failure rolls back both, the endpoint returns 5xx, and the provider retry re-processes cleanly; an existing `svix_id` means the effect already committed → 200 duplicate no-op. Event effect table (every D-08 event defined and tested): `sent` → ledger-only (explicit no-op on send rows); `delivery_delayed` → ledger-only; `delivered/opened/clicked` → stamp send row (first-write-wins); `failed | suppressed | bounced | complained` → stamp send row + suppress contact + tombstone hash (reasons `failed|suppressed|bounce|complaint`), falling back to email match when no send row. Unknown types → 200 ledger-only. Bad signature → 401.
- **D-09 Reuse with verified assumptions.** Resend for all sending — after B1a/B1b remove every unauthenticated or browser-controlled send path (including the expense-report chain through `utils/emailUtils.ts`) and B2 locks the installed SDK's real contracts. Campaign editor schema = shared TipTap config's real capabilities (headings 2–3, bold/italic/underline, lists, paragraphs) **+ a deliberately added Link extension with regression tests**; no H1, no inline images. `renderCampaignHtml` is marketing-specific (separate from `emailLayout`). URLs via `lib/utils/app-url.ts`. Admin UI follows the house pattern.
- **D-10 Repo hard rules.** RLS + pgTAP (privilege matrix AND behavioral contracts) for every new table; DB-agent migrations, additive, forward-only rollbacks; es-CL UI, English code; `data-testid`; `getByRole`/`getByTestId`, no `waitForTimeout`; no agent deployments; zero `middleware.ts` changes in this plan.
- **D-11 Tenancy exception (owner-approved).** Comms data is FNE-global — no `school_id`; substitute rule = D-04 posture; school segmentation via tags; adult professional contacts only; platform imports restricted to a staff-role allowlist; no student/family identities.
- **D-12 Consent is split, explicit evidence (owner arbitration 2026-07-30).** Two distinct purposes, separately evidenced; **no default may assert consent or a legal basis** (`marketing_opt_in DEFAULT false` is the safe non-assertion): (1) **processing consent** (required to submit the lead form): respond + deliver the requested program — `consent_accepted_at` + `consent_notice_version`; (2) **marketing opt-in** (optional, unchecked by default): "quiero recibir novedades de FNE" — `marketing_opt_in boolean NOT NULL DEFAULT false`, `marketing_opt_in_at`/`marketing_notice_version` (set only when true). Only opted-in leads may ever be imported to Correos (basis `consent_form`). A required acknowledgement is never stored as proof of an optional marketing choice. `email_contacts.legal_basis` CHECK (`consent_form|customer_relationship|manual_verified`) + `basis_note` + `basis_recorded_at` NOT NULL; platform imports additionally require an explicit per-import admin attestation (recorded actor/time/source) and per-row exclusion — account approval alone never reaches the import RPC.

## Working constraints (verified 2026-07-30)

- CI (`.github/workflows/ci.yml`): gate 4 builds and runs **only** `tests/e2e/smoke.spec.ts` against placeholder/secret env; **no Supabase stack is started or seeded in the e2e job** (the smoke spec's own comment says the synthetic tenant does not yet exist). T2 therefore *builds* the CI fixture topology; nothing may assume one exists.
- Local `.env.local` lacks `RESEND_API_KEY` — email paths fail soft locally; real sends verified in A9/B11b gates.
- Resend 3.5.0: batch response nested `{data:{data:[{id}]}}`, no webhook verifier — B2 locks final shapes; `svix` is the decided verifier dependency.
- Push auth restored; branches push; CI runs on PRs.

## Phase index (30 executable phases)

| ID | Name | Status | Branch | Depends on |
|----|------|--------|--------|-----------|
| A0 | Content brief sign-off + privacy notice versioning + consent copy (both checkboxes) | **DONE 2026-07-31** (Codex PASS r2; code `82a14cd`+`b50bff3`+`17f3da8`, PR #28) | `phase/a0-content` | — |
| T2 | CI e2e topology: local Supabase stack + seeded fixtures + mandatory specs | **DONE 2026-07-31** (Codex PASS; code head `eb908ed`, PR #27) | `phase/t2-ci` | — |
| A1 | Cohort data modules + leak guard + homepage date fix | **DONE 2026-08-02** (Sol PASS r5; head `992aeef`, PR #34) | `phase/a1-cohort` | A0 |
| A2 | `pasantias_leads` migration + per-op RLS + pgTAP (DB-agent) | **DONE 2026-07-31** (Codex PASS r3; head `e13adfb`, PR #31) | `phase/a2-leads-db` | A0 |
| A3 | Brochure + ficha generators + PDF text/visual QA | **DONE 2026-08-02** (Sol PASS r2; PR #37) | `phase/a3-pdfgen` | A1 |
| A4 | PDF serving endpoints + leak checks | **DONE 2026-08-03** (Sol PASS r2; PR #39) | `phase/a4-pdfsrv` | A3 |
| A5 | Lead API + transition helper + auto-reply/notification | **DONE 2026-08-03** (Sol PASS r2; PR #40, merge `4e8400c`..) | `phase/a5-lead-api` | A2, A4 |
| A6a | `/pasantias` page: sections + ficha CTA (no form) | **DONE 2026-08-05** (Sol r6 REQUEST CHANGES on reporting completeness only — both findings verified non-silencing, shipped under the r7 stopping rule; head `99825c31`, merge `81222df0`) | `phase/a6a-page` | A1, A4 |
| A6r | **Visual redesign of `/pasantias`** (externally designed markup; same data module, same guards) | **DONE 2026-08-06** (Sol PASS r9, R4 review; head `63ebf9d6`, 9 executor rounds, 4 Sol reviews) | `phase/a6r-design` | A6a |
| A6b | LeadForm (split consent) + wiring + e2e + a11y | TODO | `phase/a6b-form` | A5, A6r, T2 |
| A7a | Site link rewiring + both INSPIRA flipbooks | TODO | `phase/a7a-links` | A6b |
| A7b | contact.ts transport swap (Formspree→Resend) | **DONE 2026-07-31** (Codex PASS, zero findings; code `5e1940d`, PR #29) | `phase/a7b-contact` | — |
| A8 | Admin leads triage (transition-enforced via API) | TODO | `phase/a8-leads-ui` | A5, T2 |
| A9 | Track A release verification (integration e2e + evidence) | TODO | `phase/a9-verify` | A6b, A7a, A7b, A8 |
| B1a | Expense-report mail moved server-side (recipients derived server-side) | **DONE 2026-07-31** (Codex PASS; code `f29c1ce`, PR #30) | `phase/b1a-expmail` | — |
| B1b | Relay removal (`send-email.ts`, `test-email.ts`, sendgrid dep) | **DONE 2026-08-02** (Sol PASS r3; head `07ae6b1`, PR #32) | `phase/b1b-relay` | B1a |
| B2 | Resend / svix / cron compatibility spike | **DONE 2026-08-02** (Sol PASS r2; PR #36) | `phase/b2-spike` | B1b |
| B3 | Email schema: 5 tables + per-op RLS + privilege pgTAP (DB-agent) | **DONE 2026-08-03** (Sol PASS r2; PR #41) | `phase/b3-email-db` | A0, B2 |
| B4a | Send-side SQL fns (queue/claim/complete/retry) + behavioral pgTAP incl. two-worker | TODO | `phase/b4a-sendfn` | B3 |
| B4b | Data-side SQL fns (import/metrics/tags/anonymize/webhook-process) + behavioral pgTAP | TODO | `phase/b4b-datafn` | B3 |
| B5 | Contacts admin (CRUD via service-role APIs, anonymize) | TODO | `phase/b5-contacts` | B4b, T2 |
| B6 | Imports: CSV + platform sources with per-row attestation | TODO | `phase/b6-import` | B5 |
| B7a | Unsubscribe page + API | TODO | `phase/b7a-unsub` | B3 |
| B7b | Webhook endpoint (svix → atomic RPC) | TODO | `phase/b7b-webhook` | B4b |
| B8 | Renderer + editor Link extension + sandboxed preview + price warning | TODO | `phase/b8-render` | B2 |
| B9a | Campaigns CRUD APIs + list page + test-send + sidebar | TODO | `phase/b9a-camp-api` | B5, B8, T2 |
| B9b | Composer UI (editor/preview/dirty-guard) + e2e | TODO | `phase/b9b-composer` | B9a |
| B10a | Drain worker: sendBatch lib + cron route (bounded ticks) | TODO | `phase/b10a-drain` | B4a, B2 |
| B10b | Send/retry/process-now APIs + cron config + state-matrix tests | TODO | `phase/b10b-sendapi` | B10a, B9a, B7a, B7b |
| B11a | Send/progress/metrics UI + campaign e2e | TODO | `phase/b11a-sendui` | B10b, B9b |
| B11b | Production preflight gate (evidence-based; no code) | TODO | `phase/b11b-preflight` | B11a, B6 |
| A9/B11b are release gates; their tracks are releasable only after they PASS. | | | | |

Sequencing: Track A after A0 (A7b may run any time). Track B: B1a→B1b→B2 before anything email-shaped; schema → functions → features; webhook/unsubscribe before sending; backend before UI; no visible link before its target exists. Effort note: ~12–16 focused executor days plus loop overhead; no calendar commitment.

---

### Shared phase contract (applies to every phase; criteria below add to it)

Gates: `npm run type-check && npm run lint && npm test && npm run build` (+ `npm run test:db` for DB phases; + the phase's targeted e2e). New interactive elements get `data-testid`; UI copy es-CL. Executor writes `docs/planning/reviews/fase-<id>-review-request.md` and a LEDGER entry; evidence files under `docs/plan/evidence/<id>/`. Definition of done: criteria checked, gates green, review-request + evidence committed, no BLOCKING findings, branch mergeable. Rollback (non-DB phases): revert branch. Rollback (DB phases): forward-only — disable consumers; schema stays.

## Phase A0 — Content brief + privacy notice versioning + consent copy

**Scope:** Appendix A sign-off (owner); executor: `components/PrivacyPolicyContent.tsx` (stable date + exported `PRIVACY_NOTICE_VERSION`), exported es-CL consent constants: processing-consent sentence (respond + deliver requested program) and **separate optional marketing-opt-in sentence** ("quiero recibir novedades…"), legal footer identity block.
**Out of scope:** any cohort/lead/email feature code.
**Acceptance criteria:**
- [A1] Appendix A APPROVED by Brent in the Decision Log (school list, free-day/itinerary shape, experts, prices for brochure, claims, legal identity + postal address, WhatsApp, testimonios or explicit without).
- [A2] Privacy page renders fixed version + date from `PRIVACY_NOTICE_VERSION`; the two consent sentences exist as exported constants and are textually distinct (processing ≠ marketing; marketing explicitly optional).
- [A3] Snapshot/unit test of version rendering + constants; gates green.
**Test plan:** targeted vitest. **Risks:** owner availability (blocks by design). 

## Phase T2 — CI e2e topology: local Supabase + fixtures + mandatory specs

**Scope:** `.github/workflows/ci.yml` gate 4; `scripts/ci/seed-e2e.mjs`; `tests/e2e/helpers/auth.ts`; `tests/e2e/ci-fixture.spec.ts`; playwright config wiring; skip-guard.
**Out of scope:** product specs (owned by later phases).
**Acceptance criteria:**
- [A1] **Topology decided and implemented: isolated local Supabase in gate 4** — `supabase start` + `supabase db reset` (applies all migrations) on the runner; app built/run against the local stack's URL/keys; ephemeral teardown (runner-scoped); no remote QA project, no real credentials.
- [A2] Seed script creates synthetic fixtures: an admin **and a disallowed role (docente)** with known credentials, plus minimal org rows they need; idempotent (safe to re-run); zero real PII.
- [A3] Auth helper produces storageState for both fixtures; `ci-fixture.spec.ts` proves both log in and role-gating differs (admin reaches an admin page; docente is denied).
- [A4] CI runs an explicit mandatory spec list and **fails if a mandatory spec is skipped** (guard demonstrated with a scratch `test.skip` run, then removed); smoke spec stays green.
- [A5] Gates green including the reworked e2e job on this PR.
**Test plan:** the fixture spec + CI run evidence (PR checks + linked run URL in evidence dir). **Risks:** honest resize — this *builds* CI infrastructure that v2 wrongly assumed existed; it is the largest T-phase and stays single-concern (CI topology).

## Phase A1 — Cohort data modules + leak guard + homepage date fix

Public/commercial split per D-01, criteria inlined here (the prior "as v2" reference embedded superseded cohort facts — Appendix A is normative):
- [A1] Public module `lib/pasantias/cohort-public.ts`: cohort id `octubre-2026`, label, weeks per Appendix A-2/A-3/A-4 (week 1 `2026-10-05→09` full; free long weekend sáb 10–lun 12 with "lunes 12 = Fiesta Nacional" note; week 2 `2026-10-13→16` mar–vie), **two-tier school structure per A-5 (immersion: Virolai + Sadako, 2,5 días each; visits: 5 schools, 1–2/day, El Puig + Les Vinyes full-day)**, experts per A-6, 13 objectives, day structure, lodging area. **Zero monetary fields — and no Madrid exports (removed 2026-08-02).** Commercial module `lib/pasantias/cohort-commercial.ts`: prices/payment terms per A-8, `BROCHURE_VERSION`, `BROCHURE_FILENAME`, `COMMERCIAL_SENTINEL`.
- [A2] `scripts/check-price-leak.mjs` scans `.next/static/**` post-build for sentinel + price literals; wired into CI; green on this branch.
- [A3] Guard test pinned to Appendix A anchors: money math per amended A-8 (program = 2500; lodging band 70 ≤ min < max ≤ 120; **no combined total exists or may return**); **no session on 2026-10-12** or any free-weekend day; week 1 = 5 consecutive visit days lun 5–vie 9; week 2 = 4 visit days mar 13–vie 16; **9 visit days total**; valid ISO dates; **immersion list = 2 and visit list = 5, names matching A-5 (7 total)**; public-module serialization contains no monetary keys/values.
- [A4] Homepage "Próximas Expediciones" card renders the derived single-span headline per amended A-1 ("Octubre, 5 al 16", year rendered once alongside) from the public module (no literal date strings in `index.tsx`), no prices; "Abril/Noviembre 2026" remain only in flipbook titles until A7a. *(Rewritten 2026-08-02 with the A-1 span amendment — r6.)*
- [A5] Gates + leak script green.

## Phase A2 — `pasantias_leads` migration + per-op RLS + pgTAP (DB-agent)

**Scope (DB-agent round):** migration + `supabase/tests/030-pasantias-leads-rls.sql`.
**Acceptance criteria:**
- [A1] Table as v2 **plus split consent columns**: `consent_accepted_at timestamptz NOT NULL` (no default), `consent_notice_version text NOT NULL`, `marketing_opt_in boolean NOT NULL DEFAULT false`, `marketing_opt_in_at timestamptz`, `marketing_notice_version text`, CHECK (`marketing_opt_in = false AND marketing_opt_in_at IS NULL AND marketing_notice_version IS NULL) OR (marketing_opt_in = true AND marketing_opt_in_at IS NOT NULL AND marketing_notice_version IS NOT NULL`).
- [A2] **RLS per D-04**: authenticated admin SELECT-only policy; no INSERT/UPDATE/DELETE policies for any authenticated role; no anon policies.
- [A3] Migration additive; forward-only rollback wording.
- [A4] pgTAP: rls on; admin SELECT ok; admin INSERT/UPDATE/DELETE all blocked (throw/empty); docente + anon fully blocked; NOT NULL consent columns reject missing values; marketing CHECK enforces both shapes. (~16 asserts.)
- [A5] `npm run test:db` + gates green.

## Phase A3 — Brochure + ficha generators + PDF text/visual QA

As v2 A3, with evidence location fixed: rendered PNGs of every page at 144 DPI committed to `docs/plan/evidence/a3/` and linked from the report/ledger; PM inspects from the repo, not chat. **Other criteria per amended A-8** (text-extraction tests: brochure carries "2.500" and the lodging band "70"/"120" text, and contains NO "1.560"/"560" total and NO retired "1.000" programme price; ficha has no monetary tokens; RFC 5987 filename constants). **A3 renders no Madrid content (removed 2026-08-02) and uses the decided lodging coordination framing (A-8).**

## Phase A4 — PDF serving endpoints + leak checks

As v2 A4 (cache-or-generate, degrade on upload failure, headers incl. RFC 5987, best-effort rate limit, override rule in doc comment). **Unchanged.**

## Phase A5 — Lead API + transition helper + auto-reply/notification

As v2 A5, with consent handling updated to D-12:
- [Δ1] Request accepts `consent: true` (required) **and `marketingOptIn: boolean` (optional, default false)**; persists both evidence sets (processing always; marketing fields only when true, stamped server-side with `PRIVACY_NOTICE_VERSION`).
- [Δ2] Resubmission may **set marketing opt-in true** (with fresh evidence) but never silently clears an earlier true (opt-out happens via unsubscribe, not by omitting a checkbox on resubmission) — tested both directions.
- [Δ3] All other v2 A5 criteria stand (honeypot, validation, dedup + 23505, `dismissed→new` via helper, escaped emails, no prices, brochure link, 24h auto-reply dedup, soft-fail, identical 200s; full transition-matrix tests).

## Phase A6a — `/pasantias` page: sections + ficha CTA (no form)

**Scope:** `pages/pasantias.tsx` (all static sections), OG/meta, `tests/e2e/pasantias-page.spec.ts`.
**Out of scope:** LeadForm (A6b), links from other pages (A7a).
**Acceptance criteria:**
- [A1] Compiled Tailwind + brand tokens; `Footer`; `<Head>` OG/Twitter via `app-url`; **public cohort module only** (leak guard stays green).
- [A2] Sections per Appendix A: hero (fecha chip; primary CTA anchors to `#programa`, which in this phase renders an "Solicita el programa completo" panel with the info@ mailto as interim CTA — page is orphaned until A7a, so no dead-end ships to nav users), por qué Barcelona + claims, día tipo, itinerario (day-1 per brief, feriado marked), escuelas, equipo, testimonios (if brief), FAQ ≥5 (no prices), WhatsApp CTA (if brief), ficha download CTA → `/api/pasantias/ficha`.
- [A3] E2E (mandatory list): sections render with brief content; ficha link href; no price tokens in page HTML (assert absence).
- [A4] Gates + leak script green.
**Risks:** none — static content; single concern (page composition).

## Phase A6r — Visual redesign of `/pasantias`

**Why:** the r1 page was built for structure and guard coverage, not visual craft; the
owner rejected the design on sight (2026-08-05). Markup is redesigned externally and
delivered as code.

**Scope:** `pages/pasantias.tsx` markup/styling, and new components under
`components/pasantias/` if the design needs them.
**Out of scope:** the content itself, `lib/pasantias/cohort-public.ts`, the leak guard,
the PDFs, the form (still A6b).

**Acceptance criteria:**
- [A1] **Every fact still comes from `lib/pasantias/cohort-public.ts`.** No cohort string
  is hardcoded in the page — not a date, school, level, highlight, expert name or title.
  A grep-based test asserts this; a redesign that inlines copy fails the phase.
- [A2] All A6a guards stay green unmodified: no price token in the rendered page (D-02);
  no `experto invitado` placeholder; every school renders levels + ≥1 highlight; one `h1`
  and valid heading order **across the whole document** including `Footer`; axe reports no
  serious/critical violations; the leak scan passes on a production build.
- [A3] Every `data-testid` the existing e2e depends on survives, or the spec is updated in
  the same commit with the change called out explicitly in the report.
- [A4] Renders correctly at 390 px and 1280 px; evidence PNGs re-rendered under
  `docs/plan/evidence/a6r/`.
- [A5] Self-contained: no CDN fonts, scripts or remote images — assets live in the repo.
  (`pages/index.tsx` loads Tailwind from a CDN; that pattern must not spread here.)
- [A6] `#programa` remains the interim mailto panel until A6b replaces it.
- [A7] Gates + leak script green.

**Risks:** externally-authored markup is the likeliest source of hardcoded content and of
silently dropped testids — [A1] and [A3] exist for exactly that, and both are mechanical
to check.

## Phase A6b — LeadForm (split consent) + wiring + e2e + a11y

**Scope:** `components/pasantias/LeadForm.tsx`; replace A6a's interim `#programa` panel; `tests/e2e/pasantias.spec.ts` (form flows).
**Acceptance criteria:**
- [A1] Fields per A5 contract; **two checkboxes**: required processing consent (A0 sentence, links `/privacidad`) and optional, unchecked marketing opt-in (A0 sentence) — visually and semantically separate controls (`pasantias-consent`, `pasantias-marketing-optin`); honeypot; client validation + first-invalid focus; pending state; success panel `role="status"` with brochure link + mail note; error preserves data; UTM/source capture.
- [A2] Submitting without marketing opt-in succeeds (proves optionality) — asserted in e2e and unit level.
- [A3] Keyboard-only completion path; labels associated; `data-testid` on all controls.
- [A4] E2E (mandatory): empty-submit errors + focus; success (mocked API) with/without opt-in; 500 preserves data; keyboard path. Gates green.
- [A5] **The A6r [A1] guard governs this phase's copy** (added 2026-08-06 — see Decision Log). `__tests__/pages/pasantias-hardcoded-cohort.test.ts` scans `components/pasantias/**`, so the form's labels, success panel and mail note are in scope: every cohort fact must be read from `cohort-public.ts`, and any coincidental overlap with a module value must be declared with an exact `path`/`form`/`sites` count and a reason checked against the line. **Expect the `lodgingArea: 'Barcelona' at 9` declaration to move** — a success panel or intro that mentions Barcelona makes it ten and reds the suite until the count is updated. That is the guard working, not a regression.

## Phase A7a — Site link rewiring + both INSPIRA flipbooks

**Scope:** `pages/index.tsx` (nav ×2, section CTA, INSPIRA flipbook button/modal/state), `pages/programas.tsx` (nav ×2, INSPIRA card link, **its own INSPIRA flipbook state/iframe**), `pages/nosotros.tsx`, `pages/noticias.tsx`, `components/Footer.tsx`.
**Out of scope:** `contact.ts` (A7b).
**Acceptance criteria:** v2 A7 [A1] verbatim (all PASANTÍAS links → `/pasantias`; both INSPIRA flipbooks removed → links; Directivos flipbooks keep, "Abril 2026" dropped; greps prove it) + e2e nav assertion; gates + leak green.

**Added 2026-08-05 (owner approved) — two one-line asset swaps in `pages/index.tsx`, which this phase already edits:**
- [A2] Replace `/barcelona-innovation.jpg` in the Barcelona collage with `/images/pasantias/educadores-biblioteca.jpg`. The current file is **generic stock of identifiable children and is not Barcelona** — the brand manual prohibits generic stock, and identifiable minors need image-use authorisation on file. It was removed from `/pasantias` in A6r; this is the same file's last live use.
- [A3] Repoint `/barcelona-skyline.jpg` (**9.4 MB, 7551×5034**) to `/images/pasantias/bcn-skyline.jpg` (1.5 MB, 2400×1350, same photograph). ~8 MB off the homepage; the page targets older school hardware. Check for other references before deleting the original.

## Phase A7b — contact.ts transport swap

**Scope:** `pages/api/contact.ts`; `__tests__/api/contact.test.ts`.
**Acceptance criteria:** v2 A7 [A2]–[A3] verbatim (interest map incl. legacy aliases; Resend transport with **all fields escaped**; Formspree call + 50/month block + `trackFormSubmission` call removed; best-effort rate limit; soft-fail; unit tests incl. hostile input). Single concern: transport swap on the money path. No dependencies — may run early.

## Phase A8 — Admin leads triage

As v2 A8, adjusted to D-04 posture: the API's GET/PATCH use the service-role client after adminGuard (table has no authenticated write policies — direct PostgREST writes are impossible, making `canTransitionLead` authoritative); PATCH enforces the graph; page offers only legal transitions. All v2 criteria + auth/transition tests stand; e2e uses **both** T2 fixtures (admin sees the page + a seeded lead; docente denied).

## Phase A9 — Track A release verification

As v2 A9, with the evidence fix (R2-S-01): the unmocked CI integration spec asserts persistence through the **admin API as the admin fixture** (lead row visible with correct consent fields; `brochure_sent_at` state asserted there, NOT via the public response, which stays uniform); checklist results + screenshots committed under `docs/plan/evidence/a9/`; WhatsApp unfurl = owner-run named-device check recorded there.

## Phase B1a — Expense-report mail moved server-side

**Scope:** server routes (or extensions of existing authenticated expense mutations) for the three notification moments (submitted/approved/rejected) with **recipients derived server-side** from the report record; `utils/emailUtils.ts` browser `sendEmail` removed (or reduced to calling the new authed routes without to/subject/html); `pages/expense-reports.tsx` updated call sites (submission L~303, approval L~361, rejection L~423); tests.
**Out of scope:** deleting the relay routes (B1b), campaign features.
**Acceptance criteria:**
- [A1] Browser code can no longer choose recipient, subject, or HTML for any mail; the three notification flows work end-to-end with server-derived recipients (report owner / approver), sending via Resend directly server-side.
- [A2] Authorization tested per flow (only the legitimate actor triggers each notification); recipient-derivation tested; soft-fail without key.
- [A3] Existing expense-report tests stay green; gates green.
**Risks:** touches a live feature — PM reads this diff hard; executor must locate call sites by content.

## Phase B1b — Relay removal

**Scope:** delete `pages/api/send-email.ts` + `pages/api/test-email.ts`; drop `@sendgrid/mail`; repo-wide proof.
**Acceptance criteria:**
- [A1] Both routes deleted; `grep -rn "send-email\|test-email" --include="*.ts*"` shows no live caller; no unauthenticated or browser-controlled arbitrary-recipient send path exists in the repo.
- [A2] `@sendgrid/mail` removed (never imported — re-verified); gates green.

## Phase B2 — Resend / svix / cron compatibility spike

As v2 B2 (locked batch shapes incl. error-as-value, headers, idempotency stance; svix vectors; **Vercel cron cadence on the account's plan** — findings file + contract tests; unavailable/coarse cron ⇒ FINDINGS outcome and PM re-plans B10a's invoker before it starts). **Unchanged.**

## Phase B3 — Email schema: 5 tables + per-op RLS + privilege pgTAP (DB-agent)

**Scope (DB-agent round):** migration + `supabase/tests/040-email-marketing-rls.sql`.
**Acceptance criteria:**
- [A1] Tables per D-06 including: `email_contacts.anonymized_at` + the two-shape identity CHECK (normal vs anonymized-NULL); `email_campaigns.status` CHECK **(`draft|sending|sent|sent_with_errors`)**; `email_campaign_sends` FK `ON DELETE RESTRICT` + UNIQUE(campaign,contact) + indexes + **`provider_batch_key text` (nullable, unused at B3 — stamped on the ≤100 rows of one provider call before it is issued; every non-status-quo idempotency option in B2's findings §1.4.4 needs it, and a nullable column is free now / a migration later; B3 only creates it)**; `email_suppression(email_hash PK, reason, created_at)`; `email_webhook_events(svix_id PK, event_type, resend_email_id, occurred_at, received_at, detail jsonb)` with a table comment documenting the D-06 allowlist and that `detail` must never contain addresses or subjects.
- [A2] **RLS per D-04 on all five: authenticated admin SELECT-only; zero authenticated write policies; zero anon policies.** The migration file documents the per-table operation matrix in a header comment.
- [A3] Consent/basis columns NOT NULL without defaults (`legal_basis`, `basis_recorded_at`); `marketing`-relevant contact fields per D-12 as applicable (`consent_notice_version` nullable, required with `consent_form` via CHECK).
- [A4] pgTAP: per-operation matrix ×5 tables (admin SELECT ok; admin INSERT/UPDATE/**DELETE blocked — tombstone and contact DELETE denial explicitly asserted**; docente/anon everything blocked); constraint tests (two-shape CHECK, basis NOT NULLs, status CHECK). (~45 asserts.)
- [A5] `npm run test:db` + gates green.

## Phase B4a — Send-side SQL functions + behavioral pgTAP (DB-agent)

**Scope (DB-agent round):** migration (queue/claim/complete/retry) + `supabase/tests/041-email-send-fn.sql`.
**Acceptance criteria:**
- [A1] `queue_campaign_sends(uuid)`: asserts draft; inserts eligible (subscribed, unsuppressed, not tombstoned by hash, tags overlap or empty filter, not anonymized) ON CONFLICT DO NOTHING; **flips to `sending` only when queued>0, else campaign remains draft**; returns count.
- [A2] `claim_campaign_sends(uuid,int)`: pending or stale(>15 min) `sending` rows, `FOR UPDATE SKIP LOCKED`; eligibility re-check → `skipped`.
- [A3] `complete_campaign_if_done(uuid)`: atomic; terminal flip (`sent` vs `sent_with_errors` by failed-count) **only when zero `pending` AND zero `sending` rows**; otherwise no-op returning current state.
- [A4] `retry_failed_sends(uuid)`: only from `sent_with_errors`; `failed→pending`; campaign → `sending`; returns count.
- [A5] Hardening per D-06 (search_path '', qualified, PUBLIC/anon/authenticated revoked, service_role granted).
- [A6] Behavioral pgTAP: zero-audience stays draft; empty vs overlapping tags; double-queue no-op; stale vs fresh claim; eligibility-change → skipped; **two-worker completion race: with fresh `sending` rows present (simulated second worker's claim), `complete_campaign_if_done` refuses to terminate; after rows resolve, it completes with the correct terminal status**; retry gating (draft/sending/sent refuse); privilege denial + service-role success. (~35 asserts.)
- [A7] `npm run test:db` + gates green. Honest note: true concurrent SKIP LOCKED is approximated by claim-marking disjointness within one session; stated in the report.

## Phase B4b — Data-side SQL functions + behavioral pgTAP (DB-agent)

**Scope (DB-agent round):** migration (import/metrics/tags/anonymize/process_webhook_event) + `supabase/tests/042-email-data-fn.sql`.
**Acceptance criteria:**
- [A1] `import_email_contacts(jsonb,uuid,text)`: upsert by normalized email; tag union; per-row basis fields required; refuses tombstoned hashes; never resurrects unsubscribed/suppressed/anonymized; returns `{inserted, updated, excluded}`.
- [A2] `anonymize_email_contact(uuid)`: per D-06 contract (NULL identity set + `anonymized_at` + sends' email snapshots NULLed + tombstone insert, reason `manual`); **idempotent second call is a tested no-op**; metrics unchanged by anonymization (asserted on a seeded fixture); **post-anonymization sweep assertion: no recipient email string exists in `email_contacts`, `email_campaign_sends`, or `email_webhook_events` for the anonymized identity**.
- [A3] `process_webhook_event(p_svix_id, p_type, p_resend_email_id, p_payload)`: **single-transaction dedup + effect** per D-08's event table (incl. `sent`/`delivery_delayed` ledger-only no-ops); **projects `p_payload` to the D-06 allowlisted `detail` subset inside the function — raw payload is never written** (tested: a payload containing `to`/subject yields a stored row without them); returns `inserted|duplicate`; **injected failure mid-effect rolls back the svix row too** (asserted by wrapping in a failing transaction and re-processing successfully).
- [A4] `get_campaign_metrics(uuid)` (grouped counts incl. skipped/failed/unsubscribed) and `list_contact_tags()`; hardening per D-06 for all.
- [A5] Behavioral pgTAP (~35 asserts) + `npm run test:db` + gates green.

## Phase B5 — Contacts admin

As v2 B5 under D-04 posture (all writes via service-role in adminGuard-ed routes; **no delete endpoint of any kind**; erasure = anonymize RPC with es-CL permanence confirm; "Anonimizado" state rendered from `anonymized_at`). v2 criteria stand; e2e uses both T2 fixtures (admin CRUD path; docente denied).

## Phase B6 — Imports: CSV + platform sources with per-row attestation

As v2 B6 plus R2-S-02 remediation:
- [Δ1] Platform import UI: selectable preview with **per-row exclusion**; explicit attestation control whose es-CL text states what is being attested (vigente customer/staff relationship for the included rows); API requires `attestation: {acknowledged: true, note}` and records actor (`imported_by`), timestamp (`basis_recorded_at`), source, and note into each row's basis fields; **request without attestation → 400 and the RPC is never called (tested)**.
- [Δ2] Staff-role allowlist (D-11) enforced server-side regardless of client selection (tested with a non-staff row).
- [Δ3] CSV flow, suppression exclusion, chunking, papaparse (`;`+BOM) — v2 criteria stand.

## Phase B7a — Unsubscribe page + API

v2 B7 minus webhooks: `/desuscribir` (GET mutation-free, generic success, noindex) + `pages/api/email/unsubscribe.ts` (JSON + RFC 8058 one-click; idempotent; token-scoped dampening only; pair-scoped campaign stamp — wrong token/campaign pair does nothing, tested; unknown token → generic 200; **internal failure → 5xx**). Writes via service role (D-04). Tests as v2.

## Phase B7b — Webhook endpoint

**Scope:** `pages/api/email/webhook.ts` + `lib/email/webhookVerify.ts` (thin `svix` wrapper) + tests.
**Acceptance criteria:**
- [A1] `bodyParser:false`; 256 KB cap (413 over); svix verification (multi-signature header, versioned scheme, ±5 min past/future) → 401 bad; then **one call to `process_webhook_event`** — endpoint contains no state-mutation logic of its own.
- [A2] RPC `duplicate` → 200; RPC success → 200; **RPC/DB error → 5xx** (provider retries; safe because dedup+effect are atomic).
- [A3] Tests: svix vectors (valid/tampered/stale/future/multi-sig), oversize 413, duplicate 200, error 5xx, and a mapping test per event type reaching the RPC with correct args. Gates green.

## Phase B8 — Renderer + Link extension + sandboxed preview + price warning

As v2 B8 plus D-02's composer warning:
- [Δ1] `detectCurrencyAmounts(text)` helper per D-02: a **generic client-side currency/amount pattern** (currency symbols + grouped digits; **no protected values, no commercial-module import anywhere client-reachable**) powering a **non-blocking** es-CL warning banner in the preview component ("este correo parece incluir montos; recuerda que los precios oficiales viven en el brochure"); warning render + pattern unit tests; leak guard unaffected; nothing blocks.
- [Δ2] All v2 criteria stand (schema = shared config + Link w/ regression tests on news admin; full escaping matrix incl. subject/preheader/hero/CTA/unsubscribe/attrs; sandboxed iframe — no scripts/forms/top-nav; pure client-importable functions).

## Phase B9a — Campaigns CRUD APIs + list page + test-send + sidebar

**Scope:** `pages/api/admin/email/campaigns/{index,[id]/index,[id]/test-send}.ts`, `pages/admin/email/campaigns/index.tsx`, `pages/admin/email/index.tsx` redirect, Sidebar "Correos" entry, tests.
**Out of scope:** composer UI (B9b), send/queue (B10b). **Invariant (tested): no B9a/B9b code path can move a campaign out of `draft`** — PUT rejects status; no queue/send route exists yet.
**Acceptance criteria:**
- [A1] APIs (adminGuard + service-role writes): list; create draft; detail (+ live audience **estimate**, labeled); PUT draft-only (409 otherwise; status not settable; server-renders `content_html` via B8); DELETE draft-only (service-role; the only delete in the platform).
- [A2] Test-send: single email to the requesting admin, `[PRUEBA]` prefix, dummy unsubscribe, no ledger writes; **unconfigured Resend → explicit visible es-CL error, never fake success**.
- [A3] List page (status chips, create button) per house pattern; sidebar entry lands with its target in the same phase.
- [A4] Unit + e2e (both fixtures: admin path works; docente denied). Gates green.

## Phase B9b — Composer UI + e2e

**Scope:** `pages/admin/email/campaigns/[id].tsx` (draft state), `components/admin/email/CampaignForm.tsx`, preview wiring, tests.
**Acceptance criteria:**
- [A1] Subject/preheader; TipTap (B8 schema incl. Link); hero upload (`utils/storage` → resources); CTA fields; tag multi-select labeled **"cualquiera de estas etiquetas (O)"** + estimate; dirty-state guard; sandboxed preview + price-warning banner (B8); non-draft states render read-only status text (send UI arrives in B11a).
- [A2] E2E (mandatory, admin fixture): create → edit → preview renders in sandbox → dirty-guard prompt → price warning appears when any currency-like amount is typed (non-blocking; generic pattern per D-02). Gates green.

## Phase B10a — Drain worker (bounded) + cron route

**Scope:** `lib/email/sendBatch.ts`, `pages/api/cron/email-drain.ts` (handler core exported for reuse), tests.
**Acceptance criteria:**
- [A1] Tick (Bearer `CRON_SECRET`; 401 otherwise): **bounded — ≤2 campaigns (oldest `send_started_at` first) × ≤3 claims × ≤200 rows**, **paced — every provider call ≥150 ms after the previous one (worst case is 12 calls/tick vs Resend's 10 req/s; assert the spacing with a fake clock)**, batches ≤100 via locked B2 shapes (headers + per-recipient unsubscribe substitution asserted on payloads), per-batch ledger writes (success ids index-aligned; batch error → rows failed with error text; **resolved `{error}` value and thrown error both handled**), then `complete_campaign_if_done` per touched campaign; response reports processed/remaining.
- [A2] Sender = `EMAIL_MARKETING_FROM` (fallback `EMAIL_FROM_ADDRESS`).
- [A3] Unit tests: chunking/alignment, substitution, error paths, bounds respected (a third campaign is untouched), completion invoked; cron auth; **a provider 429/rate-limit response leaves its rows retriable — never marked `sent` — and the tick backs off instead of hammering (B2 findings C17)**; **pacing asserted with a fake clock (≥150 ms between provider calls, per D-07)**. Gates green.

## Phase B10b — Send/retry/process-now APIs + cron config + state matrix

**Scope:** `pages/api/admin/email/campaigns/[id]/{send,retry,process}.ts`, `vercel.json` cron entry (cadence per B2 findings), tests.
**Acceptance criteria:**
- [A1] `send`: draft → validate (subject/body/estimate>0 client-side hint only) → `queue_campaign_sends`; **queued=0 → 422 es-CL, campaign stays draft**; queued>0 → 200 with **queued snapshot count** (authoritative); **non-draft → 409 with current status (tested for `sending` and terminal)**.
- [A2] `retry`: `sent_with_errors` only (else 409); calls RPC; returns new pending count. `process`: adminGuard-ed manual invocation of the B10a core (same bounds).
- [A3] `vercel.json` cron entry per B2 findings; if B2 found cron unavailable/coarse, this phase must not start until the PM re-plans the invoker (FINDINGS gate).
- [A4] State-matrix tests across send/retry/process (draft/sending/sent/sent_with_errors × each endpoint); queue-0 path; gates green.

## Phase B11a — Send/progress/metrics UI + campaign e2e

As v2 B11 UI scope (confirm modal with authoritative queued count; polled `get_campaign_metrics` progress; "Procesar ahora"; incomplete-send banner on `sending` (survives tab close); `sent_with_errors` failure list + retry; metrics panel with es-CL approximation note; contact send-history now real). E2E (mandatory, admin fixture, mocked Resend boundary): compose → queue → process → progress → terminal → metrics; interruption + resume; retry path; 409 on re-send.

## Phase B11b — Production preflight gate (no code)

The v2 B11 preflight as its own evidence phase: DKIM/SPF verified; DMARC present; `EMAIL_MARKETING_FROM` set; webhook registered + live test event verified end-to-end (visible in `email_webhook_events`); open/click tracking on; Resend plan/quota vs audience; consent-basis review of imported lists (only D-12-compliant contacts present); canary send to internal tag received; unsubscribe round-trip verified. Results + screenshots committed to `docs/plan/evidence/b11b/`; ledgered PASS is the release gate for any real-audience send — until then Brent authorizes none.

---

## Backlog

| Item | Source | Class |
|---|---|---|
| Remove `lib/formSubmissionTracker.ts` + `pages/admin/form-usage.tsx` + `form_submissions` drift decision | R1 B-10 | SHOULD-FIX |
| Homepage off `cdn.tailwindcss.com` → compiled Tailwind | audit | SHOULD-FIX (perf/SEO) |
| Homepage contact form consent checkbox + dual-write into leads | v1 | v2 |
| `pasantias_leads` (marketing_opt_in=true only) import button in Contactos | B6/D-12 | v2 |
| `community_manager` access tier for Correos | owner decision | v2 |
| Scheduled sends, merge tags, nurture sequences, public double-opt-in, sending subdomain | design | v2 |
| Restore an explicit delivery timeout (~8s) on the bot expense-notification send | Codex B1a S-01 | SHOULD-FIX |
| Expense-report e2e (seeded reports + approver + mocked Resend) | B1a round 1 | SHOULD-FIX |
| Expense e-mail deep links hardcode fne-lms.vercel.app → migrate to app-url | B1a round 1 (pre-existing) | SHOULD-FIX |
| Durable notify dedup (`notified_at` column, needs migration) | B1a round 1 | v2 |

## Decision log

| Date | Decision | Rationale | Raised by |
|------|----------|-----------|-----------|
| 2026-07-30 | Adopt SOP; docs/plan/; one plan, two tracks; per-phase merge go | Human-gated deploys | Brent |
| 2026-07-30 | No prices on repo-authored web/email; hybrid downloadables; October single track; broadcast-simple v1 | Scope/product | Brent |
| 2026-07-30 | v2 re-plan on Codex R1 FAIL (13 BLOCKING accepted) | REVIEW-PLAN.md | Codex Sol |
| 2026-07-30 | Brochure = UI-gated, shareable public link; erasure = anonymize + permanent tombstone; comms FNE-global; email platform admin-only v1 | Owner decisions R1 | Brent |
| 2026-07-30 | SOP copy in-repo at docs/plan/AGENT-WORKFLOW.md | Codex NIT | Fable |
| 2026-07-30 | **Arbitration on Codex R2 (cap reached):** (1) marketing = separate optional opt-in with own evidence (D-12); (2) tombstones truly permanent — no authenticated DELETE anywhere, per-operation RLS (D-04); (3) D-02 narrowed to repository-authored content + non-blocking composer warning; (4) SOP sizing honored — 8 phases pre-split (A6, A7, B1, B4, B7, B9, B10, B11 → 30-phase index) | REVIEW-PLAN-R2.md §arbitration | Brent |
| 2026-07-30 | v3 mechanical fixes: atomic webhook RPC; completion predicate incl. `sending` rows + two-worker test; zero-queue stays draft; send re-POST → 409; campaign `failed` status removed; bounded drain ticks; B1 split to cover expense-mail chain (`utils/emailUtils.ts`, `pages/expense-reports.tsx`); T2 rebuilt as isolated local Supabase CI topology with admin+docente fixtures; evidence directories under docs/plan/evidence/ | REVIEW-PLAN-R2.md B-03..B-06, S-01..S-05 | Fable (accepting Codex) |
| 2026-07-30 | **R3 residue resolution (§1.5) + FREEZE:** residue 1 → sanitized PII-free webhook ledger (allowlist projection inside `process_webhook_event`; sweep assertion post-anonymization); residue 2 → generic client-side currency pattern for the composer warning (no protected values client-side). Both are Codex's recommended remedies, closing all open findings; plan frozen v4 on Brent's authority | REVIEW-PLAN-R3.md §residue | Brent |
| 2026-07-31 | **Process amendment (binding):** every executor session runs in its own dedicated `git worktree` — never the shared checkout — and concurrent sessions must not share the local Supabase stack (DB-touching gate runs serialize). Cause: A0/T2 shared-checkout collision silently misplaced a commit (recovered; `rescue/a0-6e69c9e` fidelity-confirmed). Enforced via every executor prompt. | A0/T2 round-1 findings | Fable (PM) |
| 2026-07-31 | T2 execution deviations accepted: gate-4 job timeout 20→30 min; Supabase CLI pinned (gate 4 only); `.gitignore` negation for fixtures JSON; real-login storageState over minted tokens; CI-as-evidence for gates. T2 DONE — Codex PASS, 2 NITs logged (stale ci.yml header comment; evidence README run-number) | REVIEW-T2.md | Fable (PM) |
| 2026-07-31 | **Cohort facts corrected by owner** — the 07-30 brief had the dates mixed up. Real October 2026: week 1 lun 5–vie 9 (full), free long weekend sáb 10–lun 12 (Fiesta Nacional), week 2 mar 13–vie 16; **9 visit days**. School list revised to **5**: El Puig, La Maquinista, Octavio Paz, Angeleta Ferrer, Les Vinyes (Sadako/Learnlife/Virolai out). Goal, A0 [A1], A1 criteria realigned; Appendix A rewritten v1 and declared **normative** over any embedded/referenced cohort fact. Expert lineup flagged TBC (includes directors of dropped schools). | Brent (2026-07-31) | Brent / Fable (PM) |
| 2026-07-31 | **Second correction (program structure):** the 5-school list was week 2 only. Real structure: **week 1 = immersion — 2,5 days each at Escola Virolai + Escola Sadako per pasante; week 2 = visits — 1–2 schools/day (El Puig, La Maquinista, Octavio Paz, Angeleta Ferrer, Les Vinyes; El Puig + Les Vinyes full-day, outside BCN). 7 schools total; only Learnlife out.** Sandra Entrena's title = **Encargada de Innovación, Virolai** (not directora). A-6 lineup confirmed (Musons + Entrena host week 1). A-5/A-6 OK; A1 criteria updated to the two-tier structure. | Brent (2026-07-31) | Brent / Fable (PM) |
| 2026-07-31 | **Appendix A APPROVED — A0 [A1] satisfied.** All rows OK: claims confirmed; legal identity = Fundación Instituto Relacional (fantasía: Fundación Nueva Educación), RUT 65.166.503-5, Carlos Silva Vildósola 10448, La Reina, Santiago; WhatsApp +56 9 4162 3577; testimonios = launch without (placeholder, 2–3 later); consent sentences A-14/A-15 approved as drafted (ratifies `2026-07-v1`); A-8 validity resolved by design. Remaining code fill (real legal-identity values + legal/brand name split) = A0 executor round 2. A7b + B1a dispatch authorized ("go"). | Brent (2026-07-31) | Brent |
| 2026-07-31 | **Dispatch mechanics locked:** `/exec INSPIRA <phase> <round>` (project nickname required); every PM-written prompt file is committed under `docs/plan/prompts/` (untracked files do not exist in executor worktrees); each PM round report ends with the exact dispatch lines. **Standing merge authorization DENIED** — per-phase explicit go remains; owner cites the PM's stale-fetch union slip, caught by the PM's own verification, as the check doing its job | Brent (2026-07-31) | Brent |
| 2026-07-31 | **Lodging pricing model changed (A-8 amended):** Barcelona lodging is variable — €70–120 por persona por noche según tipo — replacing the fixed €560-double package; the combined "€1.560 total" is retired from all materials. Program price stays €1.000. A1's commercial module + guard tests + leak patterns updated in round r2; Madrid lodging figure flagged for confirmation at A3. A-16 closed (meals = generic truthful phrasing; day mapping is ops, not comms). | Brent (2026-07-31) | Brent |
| 2026-07-31 | **S1 ratified:** info@nuevaeducacion.org confirmed as the data-subject-request address. Shipped code already uses it — no change required; Codex's A0 SHOULD-FIX closes. | Brent (2026-07-31) | Brent |
| 2026-07-31 | **D-04 amended (Codex A2 finding, accepted):** RLS alone is not the write boundary — TRUNCATE (and REFERENCES/TRIGGER) are privileges RLS never governs, and Supabase default grants hand them to anon/authenticated. Every comms table now also REVOKEs non-SELECT privileges from anon+authenticated (authenticated keeps SELECT, RLS-gated; anon keeps nothing), with pgTAP asserting **privileges as well as policies** (TRUNCATE denial explicitly). Applies to A2 (round r2) and binds B3's five tables. | REVIEW-A2.md | Fable (PM, accepting Codex) |
| 2026-07-31 | **§1.5 on A2's Codex-r2 residue: fix now (round r3, owner-authorized).** The r2 denylist omits PG17's `MAINTAIN`; prod verified at PostgreSQL 15.8 (forward-looking, not live). Standard hardened: **revoke-all-then-GRANT-SELECT is THE form for every comms table** (Codex-bound; ACL-level pgTAP pins via aclexplode, version-guarded MAINTAIN asserts). | Brent (2026-07-31) / REVIEW-A2-R2.md | Brent |
| 2026-07-31 | **Record correction (PM):** the r2/r3 triage premise "local+prod are PG15" was over-generalized from a prod-only check — local and CI stacks run PostgreSQL 17.6 (no `major_version` pin in supabase/config.toml), so the MAINTAIN exposure was live on locally/CI-created tables; production 15.8 unaffected, severity call stands. r3's fix verified live on PG17.6 (CI gate 3 green at `e13adfb`). Backlog: consider pinning `[db] major_version`. | A2 r3 executor finding | Fable (PM) |
| 2026-08-01 | **A-8 propagation completed (A1-r3 executor finding):** the lodging amendment had reached Appendix/Decision Log/A1's code but not the plan's criteria text — A1 [A3] and A3's brochure test still demanded the retired "1.560" total, unsatisfiable by construction (and would have failed A1's correct branch at Codex review). Both rewritten to the band model; A3 gains explicit dispatch-time owner items (Madrid €360, lodging styling). | A1 r3 report | Fable (PM) |
| 2026-08-02 | **§1.5 on B1b's Codex-r2 residue: fix now (round r3, owner-authorized)** — the browser-mail regression guard extends its sweep to the full client-source surface (tsconfig-derived, incl. `src/`), with red-then-green proof; then scoped Codex confirmation on Brent's authority. | Brent (2026-08-02) | Brent |
| 2026-08-02 | **Madrid option REMOVED** — owner: the PPTX's "Opcional Madrid" block was an accidental carry; no Madrid pasantías for now (may return in a future cohort). Purged from Appendix A, cohort modules, tests, scanner patterns via A1 round r5 (owner-authorized — A1's Codex cap was spent; this change is owner-directed). | Brent (2026-08-02) | Brent |
| 2026-08-02 | **Lodging styling delegated to PM** ("that's fine") — coordination framing chosen; owner veto point = A3's brochure review. | Brent (2026-08-02) | Brent / Fable (PM) |
| 2026-08-02 | **Headline date label = single span ("Octubre, 5 al 16")** — owner: the merged two-range label ("5–9 y 13–16") reads as two different pasantías. Label derivation changes in `cohort-public.ts` (micro-round a1-6 on a fresh branch; A1 is merged); A3/A6a inherit via the module. Two-week detail stays in itinerary contexts. | Brent (2026-08-02) | Brent |
| 2026-08-02 | **PM amendment-checklist rule (binding):** every content amendment now ends with a grep of PLAN criteria for the retired literal before commit — the r6 executor found A1 [A4] still pinning the old label, the SECOND propagation-class miss (after A-8/r3). [A4] rewritten. | A1 r6 report | Fable (PM) |
| 2026-08-02 | **Brochure production artifact = Claude-DESIGNED PDF via D-05's override path** (owner: the generated brochure is "very basic" vs the PPTX's visual richness). The generated brochure REMAINS as the data-faithful fallback + regression canary; the ficha stays generated; A3/A4 criteria unchanged (the override path was designed for exactly this). **Design-content rule:** the designed PDF's copy derives from Appendix A + the cohort modules via a PM-supplied content pack (incl. the PPTX expert bios); it needs per-file owner approval + a D-02 price check before upload; every future Appendix amendment adds a designed-PDF review item to the checklist rule. | Brent (2026-08-02) | Brent |
| 2026-08-02 | **Vercel plan = Pro, CONFIRMED by owner screenshot** (account page: "Brent Curtis' projects — Pro"). B2's R1 residue CLOSED first-hand; per-minute cron stands for D-07/B10a. | Brent (2026-08-02, screenshot) | Brent |
| 2026-08-02 | **D-07 amended — provider pacing is mandatory (Sol B2 finding 3, PM-owned defect):** the drain's own bounds permit 12 `batch.send` calls per tick against Resend's 10 req/s ceiling, and no revision of D-07 ever required spacing. A shared paced sender (≥150 ms between provider calls) is now part of the frozen decision and of B10a's [A1], with fake-clock spacing tests. | REVIEW-B2.md | Fable (PM, accepting Sol) |
| 2026-08-02 | **B2-r2 carry-forwards absorbed (executor findings):** B3 now creates a nullable `provider_batch_key` on `email_campaign_sends` — every non-status-quo idempotency option needs it, free now vs a migration later; B10a [A3] now requires a **429/rate-limit** test and an explicit fake-clock **pacing** assert. The idempotency mechanism itself still decides at B10a from B2's five costed options. | B2 r2 report | Fable (PM) |
| 2026-08-02 | **REPRICING + terms change (owner, via the designed brochure):** programa **€1.000 → €2.500 por persona**; includes/excludes replaced by the brochure's version — week-1 lunches at Virolai/Sadako IN; week-2 visit-day meals, cenas (incl. the closing dinner) and transport to El Puig/Les Vinyes OUT. €1.000 joins the retired-amount guard. Propagated to Appendix A-7/A-8, the content pack, and (via round `a1-repricing`) the commercial module, public includes list, tests, leak-scanner patterns and A3's brochure pins. | Brent (2026-08-02) | Brent |
| 2026-08-02 | **The owner-reviewed brochure is CANONICAL for content** (Brent: "I went through it myself"). Where plan/pack and brochure disagreed, the plan changes: Sergi del Moral is **Director** of Les Vinyes (retires the "equipo directivo" correction), Boris Mir's and Joan Quintana's titles/bibliography per the brochure, and El Puig + Les Vinyes now HAVE approved aspectos destacados (the pack's "FALTA" is closed). | Brent (2026-08-02) | Brent |
| 2026-08-02 | **Retired amounts are guarded permanently (Sol finding; PM-caused gap).** The `a1-3` prompt removed €1.560/€560 from the leak-scanner patterns because the values had been deleted from the module — before the retired-amount concept existed — leaving the guard blind to the retired total while catching the retired €1.000. Standing rule: **every retired price stays in the guard forever**, with per-amount mutation evidence; the module no longer holds them, so hand-written copy is precisely the leak worth catching. | REVIEW-A1-REPRICING.md | Fable (PM, accepting Sol) |
| 2026-08-06 | **A6b gains [A5]: the A6r guard governs its copy (plan-drift catch at A6r close).** A6r ended with a hardcoding guard far stronger than the one A6b was written against — it scans `components/pasantias/**`, rejects a cohort fact restated at *any one* of several sites, and requires coincidental overlaps to be declared by exact site count. A6b's LeadForm lands inside that scope and its criteria said nothing about it. The most likely collision is named in the criterion: the `lodgingArea: 'Barcelona' at 9` declaration moves the moment the form's copy mentions the city. Sized as a criterion, not a new phase. | A6r close (SOP §3.8 step 5) | Fable (PM) |
| 2026-08-06 | **Round caps retired as a stopping condition (owner).** Brent, on the PM flagging that A6r had run five executor rounds against META's cap of three: *"the cap is irrelevant, we have to keep going till it's production ready."* The caps in META stay as a **signal** — a phase burning rounds still gets flagged and still earns a re-plan proposal if the rounds stop converging — but they no longer stop a phase that is converging on real findings. The bar is production-readiness, judged on merit. Supersedes the A6r-specific stopping rule recorded in the LEDGER on 2026-08-05, which existed to bound guard-polish rounds: reviewers now classify findings honestly and every BLOCKING gets a round. | Brent (2026-08-06) | Brent |
| 2026-08-03 | **PostgREST `or`-on-UPDATE is banned for claim logic (A5 r3 finding; the repo has paid for it before).** PostgREST accepts `or=(...)` filters on SELECT but REJECTS them on UPDATE for non-PK columns, so a claim written that way passes every mocked test and fails only in production — exactly the 2026-06-12 stranded-session incident (`lib/bots/store.ts:claimSessionTransition`). Claims must be single-predicate statements or SECURITY DEFINER SQL. **Binding on B4a/B4b: `claim_campaign_sends` and `complete_campaign_if_done` stay in SQL functions (D-06) and must never be expressed as PostgREST filters.** | A5 r3 report | Fable (PM) |

## Appendix A — Content brief (v1 — NORMATIVE for cohort facts)

**Supremacy rule:** this table is the single normative source for cohort dates, day counts, school and expert lists, prices, and claims. Wherever any phase text — or any prior plan revision a phase references — states a conflicting cohort fact, **this table supersedes it.**

| # | Item | Value | Status |
|---|---|---|---|
| A-1 | Cohort label | Octubre 2026. **Headline date-span in all materials: "Octubre, 5 al 16"** — one continuous span; never two ranges in titles/chips (reads as two pasantías — Brent 2026-08-02). The two-week structure appears only in itinerary detail. | OK (amended 2026-08-02) |
| A-2 | Week 1 | **Lun 5 – Vie 9 octubre 2026 — semana completa, 5 días de visitas** | OK (Brent 2026-07-31; supersedes the 07-30 dates) |
| A-3 | Week 2 | **Mar 13 – Vie 16 octubre 2026 — 4 días de visitas** | OK (Brent 2026-07-31) |
| A-4 | Free days | Fin de semana largo **sáb 10 – lun 12**; lunes 12 = Fiesta Nacional de España (colegios cerrados) — día libre en Barcelona o para conocer Europa. **Total 9 días de visitas (5+4), el formato habitual.** Marketing dice "dos semanas" con calendario honesto; el claim "10 días" del brochure antiguo se retira. | OK (Brent 2026-07-31) |
| A-5 | Schools — two-tier structure | **Semana 1 = inmersión:** cada pasante vive **2,5 días en Escola Virolai y 2,5 días en Escola Sadako**. **Semana 2 = visitas:** 1–2 escuelas por día — **El Puig, La Maquinista, Octavio Paz, Angeleta Ferrer, Les Vinyes** (El Puig y Les Vinyes toman el día completo — están fuera de Barcelona). **7 escuelas en total.** Learnlife fuera de esta cohorte. Week-2 day order flexible: materials say "el orden puede variar", no rigid per-day grid. | OK (Brent 2026-07-31, second correction — supersedes "Sadako/Virolai out") |
| A-6 | Experts + titles | **Canonical source = the owner-reviewed brochure (2026-08-02).** Coral Regí — Directora del programa INSPIRA · Mora del Fresno — Coordinadora INSPIRA · Jordi Musons — Director, Escola Sadako (anfitrión semana 1) · Sandra Entrena — Encargada de Innovación, Escola Virolai (anfitriona semana 1) · **Boris Mir — ex-director adjunto, Institut Angeleta Ferrer y Escola Nova 21; fundador del Institut Angeleta Ferrer** · **Sergi del Moral — Director, Institut Escola Les Vinyes** (supersedes the earlier "equipo directivo" wording) · Pepe Menéndez — consultor en transformación pedagógica · **Joan Quintana — consultor en procesos de cambio, co-autor de «Educación Relacional»** | OK (owner-reviewed brochure) |
| A-7 | Objectives, day structure, includes/excludes | **Verbatim content in the "Appendix A-7 (verbatim content)" section below** — transcribed by the PM from the PPTX "BROCHURE INSPIRA 2026 - oct2026 2.0" (source outside the repo; extracted 2026-07-30). Mechanical whitespace fixes only. | OK |
| A-8 | Inversión (brochure only) | **Programa: €2.500 por persona** (repriced by owner 2026-08-02 with the designed brochure; the previous €1.000 is RETIRED and must never appear). **Alojamiento en Barcelona: variable — entre €70 y €120 por persona por noche, en base a habitación doble (el monto es por persona, no por habitación), según el tipo de alojamiento** (base-doble precision: Brent 2026-08-02) (Brent 2026-07-31; the old fixed "€560 doble / €1.560 total" package is RETIRED — no combined total is quoted anywhere). **No Madrid option** (removed 2026-08-02 — accidental carry from the stale PPTX; may return in a future cohort). Mín. 5 personas; 50% al acuerdo + saldo 30 días antes; "precios vigentes para la cohorte Octubre 2026". Lodging styling (owner-delegated, PM-decided): coordination framing — "se coordina con el equipo FNE según tu preferencia" — veto-able at A3 review. | OK (amended Brent 2026-07-31) |
| A-9 | Claims | **"400+ pasantes", "40+ colegios", "12 escuelas BCN" — confirmed correct.** "7 escuelas" phrasing is valid again via the two-tier structure (2 inmersión + 5 visitas). | OK (Brent 2026-07-31) |
| A-10 | Legal identity (email footer) | **Nombre legal: Fundación Instituto Relacional** (nombre de fantasía: Fundación Nueva Educación) · **RUT 65.166.503-5** · **Carlos Silva Vildósola 10448, La Reina, Santiago, Chile.** Footer/legal blocks show both: brand name + legal name/RUT/address. | OK (Brent 2026-07-31) — code fill = A0 round 2 |
| A-11 | WhatsApp CTA number | **+56 9 4162 3577** — button IN (consumed by A6a) | OK (Brent 2026-07-31) |
| A-12 | Testimonios | **Launch without** — section self-hides until quotes exist. Wanted later: 2–3 (1 suficiente, máx 3) with nombre + colegio. | OK (Brent 2026-07-31: placeholder) |
| A-13 | Privacy notice version | `2026-07-v1` (shipped in A0 executor round) | OK — ratified with A-14/A-15 |
| A-14 | Processing-consent sentence (es-CL) | `CONSENT_PROCESSING_TEXT` in `lib/pasantias/consent.ts` | **APPROVED (Brent 2026-07-31)** |
| A-15 | Marketing opt-in sentence (es-CL, optional, unchecked) | `CONSENT_MARKETING_TEXT` in `lib/pasantias/consent.ts` | **APPROVED (Brent 2026-07-31)** |
| A-16 | Alojamiento octubre — nights + meals mapping | **CLOSED.** Lodging: per-night range per amended A-8 (no night counts quoted — participants compute for their stay). Meals: **superseded 2026-08-02** — the canonical brochure states week-1 lunches at Virolai/Sadako are included and week-2 visit-day meals, cenas and El Puig/Les Vinyes transport are not (A-7). | OK (Brent 2026-07-31 + PM phrasing) |

### Appendix A-7 (verbatim content) — transcribed from the source PPTX

**Objetivos (13):**
1. Conocer los proyectos educativos de las principales escuelas de vanguardia en Cataluña y compartir la mirada pedagógica de sus directores.
2. Tomar contacto con las prácticas pedagógicas en terreno y profundizar en su comprensión por medio de entrevistas con estudiantes y docentes.
3. Valorar el profundo peso que ha tenido la evolución del propósito del educar en las escuelas de vanguardia y en las prioridades estratégicas que surgen desde esa nueva jerarquía.
4. Conocer cómo ha tomado forma la evolución del proceso de aprendizaje, con foco en las metodologías activas, colaborativas y centradas en la autonomía y el propósito de los estudiantes.
5. Conectar con la globalización y el uso de herramientas como: cajas de aprendizaje, nubes de preguntas, integración de niveles, diversos tipos de proyectos, momentos públicos, entre muchas otras.
6. Visualizar cómo se organizan los procesos de evaluación, con énfasis en la evaluación formativa y formadora, por medio del uso de herramientas como: portafolios, rúbricas participativas, diarios de aprendizaje, entre otras.
7. Profundizar en la comprensión de los procesos de personalización y su aplicación en terreno. Tanto el uso de planes personales, proyectos de autoconocimiento, inventarios personales de aprendizaje, brújulas y otras herramientas.
8. Apreciar nuevos estilos de liderazgo y de organización para conducir los procesos de cambio y evolución cultural hacia el nuevo paradigma educativo.
9. Conocer y comprender la evolución del trabajo colaborativo docente y la constitución de equipos de alto desempeño.
10. Visualizar el uso del tiempo, los espacios, los materiales y el equipamiento en los diversos proyectos educativos visitados.
11. Comprender el nuevo rol de las familias en las escuelas de Nueva Educación y las dinámicas de crecimiento que de ello surgen.
12. Valorar la apertura y conexión de la escuela con su entorno, el funcionamiento en red y el poder del pensamiento sistémico para diseñar las experiencias de aprendizaje.
13. Comprender y apreciar el giro relacional que implica migrar hacia la Nueva Educación y los beneficios personales y societales que conlleva.

**Día tipo:** Mañana 1 — Presentación del proyecto educativo y entrevista con la dirección. Mañana 2 — Visita guiada, entrevistas con estudiantes y educadores. Tarde — Talleres con expertos en las temáticas centrales del movimiento de Nueva Educación, en las dependencias de las escuelas visitadas y/o en las oficinas del Instituto Relacional, barrio de Eixample, Barcelona.

**El programa (€2.500) incluye — seis cosas (owner-approved 2026-08-02):** el pago de las visitas a las escuelas; los talleres de la tarde con especialistas; los honorarios de la dirección del programa, los relatores y el equipo de facilitadores de FNE que acompañan a los pasantes; bibliografía básica recomendada, una bitácora y un sistema de registro de los aprendizajes, presentado al menos un mes antes del viaje; desayuno a media mañana en las escuelas; **almuerzos de la primera semana, en Escola Virolai y Escola Sadako**.

**NO incluye:** desayunos de hotel; **comidas en los días de visita de la segunda semana**; **cenas**; pasajes aéreos y transporte terrestre de llegada y salida; **transporte a El Puig y Les Vinyes**; seguros. *(Supersedes the earlier "comidas en todos los días de visita + cena de cierre + transporte incluido" wording — owner 2026-08-02.)*

**Alojamiento (aparte del programa):** en Barcelona, entre €70 y €120 por persona por noche, en base a habitación doble — el monto es por persona, no por habitación — según el tipo de alojamiento (per amended A-8; no night counts quoted).

