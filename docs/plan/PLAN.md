# PLAN — INSPIRA Comms (Pasantías Barcelona web/leads + Email platform)

META
- REPO / ROOT: fne-lms-working (nuevaeducacion.org — hybrid public marketing site + Genera LMS; Next.js Pages Router, TS strict, Tailwind, Supabase, Vercel auto-deploy from `main`)
- BRANCH CONVENTION: `phase/p<n>-<slug>` — total length ≤20 chars (Vercel preview DNS limit). Each phase branches from current `main`; a phase starts only after its dependencies are DONE (merged).
- PROCESS: AGENT-WORKFLOW.md SOP. Roles — PM: Fable (writes this file + LEDGER.md only, never source); Executor: fresh Opus session per round; Adversarial reviewer: Codex Sol (final say on BLOCKING); Arbiter/trigger: Brent. Loop caps: executor 3 red-test attempts → BLOCKED; 3 PM↔executor rounds → re-plan; 2 Codex rounds → Brent decides. Finding taxonomy: BLOCKING / SHOULD-FIX / NIT.
- MERGES: per-phase explicit go from Brent only. `main` auto-deploys to production. PM never merges on its own authority.
- PLAN FROZEN: — (DRAFT; freezes on Codex plan-review PASS. Changes after freeze require a Decision Log entry.)

## Goal

Improve communication and sales of the Pasantías INSPIRA Barcelona program for the **October 2026 cohort** (week 1: Mon Oct 12–Fri Oct 16; week 2: Tue Oct 20–Fri Oct 23 — Mon 19 skipped, holiday), and give FNE a permanent in-house capability to (a) capture and track interest leads and (b) design and send broadcast emails to its contact database.

Concretely:
1. A dedicated, inviting, linkable landing page `/pasantias` with correct dates (today the homepage advertises "Abril 2026" — already past — and "Noviembre 2026" — wrong).
2. Better downloadables generated from a single source of truth: an open 1–2 page "ficha" (no prices) + a full brochure PDF (with prices), replacing the error-ridden PPTX flow ("domingo 11 de enero" leftover, stale validity date, missing week 2).
3. Lead capture into the DB with consent (Ley 21.719), auto-reply with the brochure, internal notification, and a thin admin triage view — replacing the Formspree path (50/month hard cap, stores nothing).
4. A simple broadcast email platform ("Correos"): contacts + tags + CSV import, fixed-frame branded composer, reliable batch sending via Resend, legal unsubscribe, basic per-campaign metrics.

## Non-goals

- No CRM beyond lead-status triage (no pipelines, reminders, assignments).
- No email automation sequences, scheduling, merge tags, per-link analytics, A/B tests (v2 candidates; schema must not preclude them).
- No prices anywhere on the web or in email bodies — prices live only in the full brochure PDF (Brent decision, 2026-07-30).
- No changes to the "Programa Estratégico para Directivos" offer (October = single track, líderes pedagógicos only).
- No rebuild of the existing B2B quoting backend (`pasantias_quotes`, `/admin/quotes`, `/quote/[id]`).
- No CMS / DB-driven marketing content editing; cohort content is a typed constants file.
- No Resend Audiences/Broadcasts — contact data stays in our Supabase.
- Out of scope for this plan (tracked in Backlog): hardening/removing the open relay `pages/api/send-email.ts`; migrating the homepage off the `cdn.tailwindcss.com` runtime script; `form_submissions` missing-migration drift; homepage contact form dual-write into leads.

## Frozen architectural decisions

No phase may violate these without a Decision Log entry.

- **D-01 Single source of truth for cohort content**: `lib/pasantias/cohort.ts` (pure typed data, no side-effect imports). Landing page, homepage teaser card, ficha, brochure, and lead auto-reply all render from `CURRENT_COHORT`. No cohort date, price, school, or name may be hardcoded anywhere else.
- **D-02 No prices on web/email**: prices render only inside the full brochure PDF. The ficha, landing page, homepage, and email bodies never show prices.
- **D-03 Leads table is new and dedicated**: `pasantias_leads` (NOT an extension of `tractor_signups`). Status machine `new → contacted → converted | dismissed`. No flow may create platform users from a lead.
- **D-04 Service-role write posture**: public form/API writes go through `createServiceRoleClient()` server-side. New tables get RLS enabled with admin-role (Track A) or admin+community_manager (Track B) policies only; **no anon policies**. Blocked INSERT throws, blocked UPDATE returns empty (pgTAP asserts accordingly).
- **D-05 Downloadables are generated**: React-PDF (`renderToBuffer`) from `CURRENT_COHORT`, reusing `lib/propuestas/{fonts,styles}.ts` + its components; cached in the `propuestas` bucket keyed by `BROCHURE_VERSION`; served by streaming API routes with stable public URLs. A manually designed PDF uploaded to the cache path legitimately overrides generation.
- **D-06 Email campaign data model**: exactly 3 tables (`email_contacts`, `email_campaigns`, `email_campaign_sends`) + 3 SECURITY DEFINER functions (`queue_campaign_sends`, `claim_campaign_sends`, `import_email_contacts`; EXECUTE revoked from anon/authenticated). The sends ledger (`UNIQUE(campaign_id, contact_id)`, insert-before-send) is the idempotency mechanism. Campaign counts are always computed from sends (no denormalized counters).
- **D-07 Send pipeline is UI-driven ticks**: short idempotent POST ticks claim ≤200 rows (`FOR UPDATE SKIP LOCKED`, 15-min stale reclaim) and send ≤100-recipient Resend batches, writing the ledger per batch. No cron, no long-running mega-function. Accepted tradeoff: a mid-request crash can duplicate at most one batch after reclaim — chosen over silent non-delivery.
- **D-08 Compliance is structural**: every campaign email carries a per-recipient unsubscribe URL + `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click` headers; unsubscribe GET never mutates (scanner-safe), POST does; bounces/complaints suppress the contact via verified Resend webhooks (`RESEND_WEBHOOK_SECRET`, raw-body HMAC). Lead capture requires a consent checkbox → `consent_accepted_at`.
- **D-09 Reuse over rebuild**: Resend (existing prod integration) for all sending; `TipTapEditor` for campaign bodies; `emailLayout` NOT reused for marketing (separate `renderCampaignHtml` — different footer obligations); admin pages follow the hand-rolled Tailwind + MainLayout + react-hot-toast house style (`pages/admin/news.tsx` model); URLs via `lib/utils/app-url.ts` (never hardcode domains).
- **D-10 Repo hard rules apply**: RLS on every new `public` table + pgTAP matrix; migrations additive only; UI copy es-CL, code/comments/commits English; `data-testid` on new interactive elements; e2e selectors `getByRole`/`getByTestId`, never `waitForTimeout`; no deployments by agents; executor writes `docs/planning/reviews/<phase-branch>-review-request.md` per phase (CLAUDE.md rule 6) as Codex review input.

## Working constraints (evidence, 2026-07-30)

- GitHub push auth is broken (invalid gh token, no SSH) — commits stay local; gates run locally (`npm run type-check && npm run lint && npm test && npm run build`, + `npm run test:db` / targeted e2e). Full local e2e is false-green-prone (~57 unseeded legacy failures; `| tail` hides the count) — run targeted specs and grep for "N failed".
- Local `.env.local` has no `RESEND_API_KEY` — email paths must fail soft locally (log + succeed pattern, as `grant.ts` does); real send verification happens on preview/prod.
- `supabase test db` requires Supabase CLI + Docker running.

## Phase index

| ID | Name | Status | Branch | Depends on |
|----|------|--------|--------|-----------|
| P1 | Cohort source of truth + homepage date fix | TODO | `phase/p1-cohort` | — |
| P2 | `pasantias_leads` migration + RLS + pgTAP | TODO | `phase/p2-leads-db` | — |
| P3 | Lead API + auto-reply/notification emails | TODO | `phase/p3-lead-api` | P1, P2 |
| P4 | Ficha + brochure PDF generators + endpoints | TODO | `phase/p4-pdfs` | P1 |
| P5 | `/pasantias` landing page + LeadForm + e2e | TODO | `phase/p5-landing` | P1, P3, P4 |
| P6 | Site link rewiring + contact.ts fixes | TODO | `phase/p6-links` | P5 |
| P7 | Admin leads triage page + API | TODO | `phase/p7-leads-ui` | P2 |
| P8 | Email marketing schema + functions + pgTAP | TODO | `phase/p8-email-db` | — |
| P9 | Contacts admin (CRUD/search/tags) + routing | TODO | `phase/p9-contacts` | P8 |
| P10 | CSV + platform imports | TODO | `phase/p10-import` | P9 |
| P11 | Unsubscribe + Resend webhooks | TODO | `phase/p11-unsub` | P8 |
| P12 | Campaign HTML renderer | TODO | `phase/p12-render` | — |
| P13 | Campaigns API + composer + test-send | TODO | `phase/p13-compose` | P9, P12 |
| P14 | Send pipeline + progress/resume + metrics | TODO | `phase/p14-send` | P11, P13 |

Execution order: Track A (P1→P7) first — the October cohort is selling now and P1 alone fixes publicly wrong dates. P8/P12 may interleave (no Track A deps). Estimated total: ~4–6 focused executor days + review loops.

---

## Phase P1 — Cohort source of truth + homepage date fix

**Scope:** `lib/pasantias/cohort.ts` (new); `__tests__/lib/pasantias-cohort.test.ts` (new); `pages/index.tsx` (surgical edit of the "Próximas Expediciones" card, ~L300–313).
**Out of scope:** nav links, flipbook modals/buttons, contact form, any other homepage section, any new page.
**Acceptance criteria:**
- [A1] `lib/pasantias/cohort.ts` exports typed `CURRENT_COHORT` (id `octubre-2026`), `BROCHURE_VERSION`, `BROCHURE_FILENAME` with: 2 weeks (2026-10-12→16, 2026-10-20→23, week-2 note "lunes 19 feriado"), prices (1000/560/1560, Madrid 810), minParticipants 5, ≥6 schools, 8 experts (Coral Regí directora, Mora del Fresno coordinadora, Jordi Musons, Boris Mir, Pepe Menéndez, Joan Quintana, Sergi del Moral, Sandra Entrena), 13 objectives, day structure, includes/excludes, payment terms, lodging (Residencia Instituto Relacional, Eixample), Madrid schools (IDEO, Santa Gema, Virgen de Europa). Pure data module — no imports with side effects.
- [A2] Guard test passes: money math (1000+560=1560), all week dates valid ISO and Oct 19 absent, week 2 starts Tuesday, minParticipants 5, ≥6 schools, 13 objectives.
- [A3] Homepage "Próximas Expediciones" card shows exactly one upcoming cohort — "Octubre 2026" with "12–16 y 20–23 de octubre" — rendered from `CURRENT_COHORT` (no literal date strings in `index.tsx`), replacing the "Abril 2026"/"Noviembre 2026" cards. No prices shown (D-02).
- [A4] `grep -n "Abril 2026\|Noviembre 2026" pages/index.tsx` returns only the two flipbook modal titles (L1083/L1133 area — out of scope here, P6 handles them).
- [A5] Gates green: `npm run type-check && npm run lint && npm test && npm run build`.
**Test plan:** `__tests__/lib/pasantias-cohort.test.ts` — `describe('COHORT_OCT_2026')`: `totals add up`, `no session on Oct 19`, `week dates are valid ISO Mondays/Tuesdays–Fridays`, `has 13 objectives and >=6 schools and 8 experts`. Command: `npx vitest run __tests__/lib/pasantias-cohort.test.ts`, then full `npm test`.
**Definition of done:** criteria checked, gates green, review-request file written, no BLOCKING findings, branch mergeable.
**Risks / unknowns:** day-1 content (Oct 12 = Fiesta Nacional in Spain, schools closed) unconfirmed — model it as data (`weeks[0].note` or per-day labels) so correcting it later is a one-line data change, not a layout change.
**Rollback:** revert the branch; homepage returns to prior (stale) cards. No DB involvement.

## Phase P2 — `pasantias_leads` migration + RLS + pgTAP

**Scope:** new migration `supabase/migrations/<ts>_add_pasantias_leads.sql`; new `supabase/tests/030-pasantias-leads-rls.sql`.
**Out of scope:** any API route, UI, or email code; any change to `tractor_signups` or other tables.
**Acceptance criteria:**
- [A1] Table `public.pasantias_leads` per spec: id uuid PK default `gen_random_uuid()`; cohort text NOT NULL; first_name/last_name/email/email_normalized/institution NOT NULL; phone, role_title, num_people (CHECK 1–60 or NULL), message, source_path, utm_source/utm_medium/utm_campaign, notes nullable; status NOT NULL default `'new'` CHECK in (`new`,`contacted`,`converted`,`dismissed`); `consent_accepted_at` NOT NULL default now(); `brochure_sent_at` nullable; created_at/updated_at defaults; CHECK `email_normalized = lower(btrim(email)) AND email_normalized <> ''`.
- [A2] Unique index on `(email_normalized, cohort)`; indexes on `(status)` and `(created_at DESC)`; `set_updated_at` trigger attached (function exists in baseline).
- [A3] RLS enabled; single policy `pasantias_leads_admin_all` for `authenticated` mirroring `tractor_signups_admin_all` (active admin role required), USING + WITH CHECK; no anon policies (D-04).
- [A4] Migration is additive only and contains no `DISABLE ROW LEVEL SECURITY` (CI guard + hook).
- [A5] pgTAP suite passes: rls_enabled; admin SELECT/INSERT/UPDATE/DELETE allowed; docente SELECT 0 rows, INSERT throws 42501, UPDATE matches 0; anon SELECT 0 rows, INSERT throws (~11 asserts, modeled on `020-tractor-signups-rls.sql` fixtures).
- [A6] Gates green incl. `npm run test:db`.
**Test plan:** `supabase/tests/030-pasantias-leads-rls.sql` as above. Command: `npm run test:db` (Supabase CLI + Docker).
**Definition of done:** criteria checked, gates + test:db green, review-request file, mergeable.
**Risks / unknowns:** baseline helper availability (`set_updated_at`) — verified present; if pgTAP fixture helpers differ from CLAUDE.md's description, follow the real `020-*` file (precedent over prose).
**Rollback:** table is additive and unreferenced until P3; abandoning the phase = revert branch (a follow-up migration to drop the table only if it ever reached prod).

## Phase P3 — Lead API + auto-reply/notification emails

**Scope:** `pages/api/pasantias/lead.ts` (new); `lib/pasantias/emails.ts` (new); `__tests__/api/pasantias-lead.test.ts` (new); minor export additions to `lib/pasantias/` index if needed.
**Out of scope:** landing page/UI, brochure endpoints (P4 — email links to the P4 route path as a constant), contact.ts, admin UI.
**Acceptance criteria:**
- [A1] POST-only route: rate-limited via `lib/rateLimit.ts` (5/min per IP, key `pasantias-lead`); honeypot field `website` returns fake success 200 without insert.
- [A2] Validation: required first_name, last_name, email (via `isValidEmail`), institution, `consent === true`, `cohort === CURRENT_COHORT.id`; optional phone/role_title/num_people/message/utm fields; length caps (80/80/140 email/140 institution/40 phone/1000 message) → 400 with es-CL field errors.
- [A3] Insert path: normalized via `normalizeEmail`/`normalizeText` (`lib/signups.ts`); writes via `createServiceRoleClient()`; duplicate `(email_normalized, cohort)` → updates contact fields, re-opens to `new` only from `dismissed`; unique-violation race (23505) handled as duplicate path; both paths return identical `200 {success:true}` (anti-enumeration).
- [A4] After successful persist: auto-reply email to the lead (es-CL, FNE-branded minimal layout in `lib/pasantias/emails.ts`, NOT `emailLayout`; no prices in body per D-02; brochure button → `buildAbsoluteUrl('/api/pasantias/brochure')`) and internal notification to `info@nuevaeducacion.org` with lead details. Email failures are logged, still return 200; `brochure_sent_at` set only on auto-reply success. Missing `RESEND_API_KEY` → soft-fail (log + 200), matching `grant.ts` behavior.
- [A5] Unit suite green (cases in test plan) and gates green.
**Test plan:** `__tests__/api/pasantias-lead.test.ts` (clone `__tests__/api/registro-signup.test.ts` harness: `supabaseStub`, mocked service client + mocked `resend`): method 405; honeypot 200-no-insert; missing-field/invalid-email/missing-consent/wrong-cohort 400s; happy insert payload includes cohort, consent_accepted_at, normalized email; duplicate → update + 200 + auto-reply still sent; dismissed → re-open; 23505 race → 200; email-throw → still 200, `brochure_sent_at` untouched. Command: `npx vitest run __tests__/api/pasantias-lead.test.ts`, then `npm test`.
**Definition of done:** standard + review-request file.
**Risks / unknowns:** none material; route is dark (nothing links it) until P5.
**Rollback:** revert branch; table from P2 remains, unused.

## Phase P4 — Ficha + brochure PDF generators + endpoints

**Scope:** `lib/pasantias/brochure.tsx`, `lib/pasantias/ficha.tsx` (new; may share a sections module); `pages/api/pasantias/brochure.ts`, `pages/api/pasantias/ficha.ts` (new); `lib/pasantias/__tests__/pdf.test.ts` (new).
**Out of scope:** landing page, lead API, any propuestas-kit refactoring (reuse as-is; if a kit component can't be reused cleanly, write a local one — do not modify `lib/propuestas/*`).
**Acceptance criteria:**
- [A1] `generateBrochure(cohort)` → PDF Buffer via `renderToBuffer`, reusing `lib/propuestas/fonts.ts` + `styles.ts`; content: portada (INSPIRA · Barcelona · Octubre 2026), qué es + 13 objetivos, estructura del día, itinerario 2 semanas (lunes 19 marcado feriado), 7 escuelas, equipo (8), alojamiento, **inversión + forma de pago** (only place prices appear), incluye/no incluye, contacto. All content from `CURRENT_COHORT` — zero literal dates/prices in the components.
- [A2] `generateFicha(cohort)` → 1–2 page PDF Buffer: qué es, fechas, escuelas, día tipo, equipo destacado, CTA (web + email). **No prices** (D-02).
- [A3] Both GET endpoints: rate-limited; serve from `propuestas` bucket cache path `pasantias/<name>-<BROCHURE_VERSION>.pdf` via `lib/propuestas/storage.ts`; on miss generate + upload + serve; headers `Content-Type: application/pdf`, `Content-Disposition: inline; filename="<es-CL name>.pdf"`, `Cache-Control: public, max-age=3600`. A pre-uploaded file at the cache path is served as-is (manual override, D-05).
- [A4] Unit tests green: both buffers start `%PDF`; brochure ≥5 pages, ficha ≤2 (page count via `pdf-lib`, pattern from `lib/propuestas/__tests__/generator.test.ts`); brochure text layer contains "1.560" and ficha's does not (extraction as in existing generator tests; if text extraction is impractical, assert via rendered component tree instead — state the substitution in the report).
- [A5] Gates green.
**Test plan:** `lib/pasantias/__tests__/pdf.test.ts` — `brochure renders %PDF with >=5 pages`, `ficha renders %PDF with <=2 pages`, `prices only in brochure`. Command: `npx vitest run lib/pasantias/__tests__/pdf.test.ts`, then `npm test`.
**Definition of done:** standard + review-request file.
**Risks / unknowns:** sizing — two documents in one phase; if context gets tight, ship brochure + endpoint complete and report ficha as NOT DONE (PM will split a follow-up round). React-PDF aesthetics below designed-PPTX level — accepted (D-05 override path). Storage upload needs service-role envs at runtime; endpoint must degrade to generate-and-serve (no cache) if upload fails.
**Rollback:** revert branch; endpoints unreferenced until P5.

## Phase P5 — `/pasantias` landing page + LeadForm + e2e

**Scope:** `pages/pasantias.tsx` (new); `components/pasantias/LeadForm.tsx` (new); `tests/e2e/pasantias.spec.ts` (new); `public/` OG image only if an existing asset can't serve.
**Out of scope:** nav/footer/link changes anywhere else (P6), homepage edits, admin UI, any endpoint changes.
**Acceptance criteria:**
- [A1] Page renders with compiled Tailwind + brand tokens (model `registro-tractor.tsx`; no `cdn.tailwindcss.com`), existing `Footer`, `<Head>` with es-CL title/description + OG/Twitter meta (title, description, image, url via `lib/utils/app-url.ts`) so WhatsApp shares unfurl.
- [A2] Sections, all cohort content from `CURRENT_COHORT`, no prices (D-02): hero (fecha chip "Octubre 2026 · 12–16 y 20–23", CTA primario "Recibe el programa completo" → form anchor, secundario "Descarga la ficha (PDF)" → `/api/pasantias/ficha`); por qué Barcelona + stats (400+ pasantes, 40+ colegios); cómo funciona un día (3 cards); itinerario 2 semanas (feriado del lunes 19 marcado); las escuelas; el equipo (8); testimonios (renders only if quotes present in a `TESTIMONIALS` const — empty array hides section); FAQ accordion (≥5 es-CL items incl. Madrid opcional + cotización grupal → existing contact path); formulario; WhatsApp CTA (renders only if `WHATSAPP_NUMBER` const non-empty).
- [A3] LeadForm posts to `/api/pasantias/lead` with cohort id + utm params from query string + `source_path`; fields nombre, apellido, email, WhatsApp (opt), institución, cargo (opt), nº personas (opt), mensaje (opt), consent checkbox linking `/privacidad` (required), honeypot `website` (hidden); client validation + first-invalid focus (pattern `registro-tractor.tsx:109-166`); submit disabled while pending; success panel `role="status"` with "Descargar programa (PDF)" → `/api/pasantias/brochure` + "te lo enviamos también a tu correo"; server/network error → es-CL error with retry, form data preserved.
- [A4] Every interactive element has `data-testid` (`pasantias-*`); `npm run lint:testid` reports no regressions on the new files.
- [A5] E2E spec green (cases below); gates green.
**Test plan:** `tests/e2e/pasantias.spec.ts` (route-mock `**/api/pasantias/lead`, pattern `tests/e2e/registro.spec.ts` — no DB): renders hero with "Octubre 2026" + visible `pasantias-submit`; ficha link href correct; empty submit → errors + focus on first invalid; mocked success → success panel with brochure link; mocked 500 → error message, fields preserved. Command: `npx playwright test tests/e2e/pasantias.spec.ts`.
**Definition of done:** standard + review-request file.
**Risks / unknowns:** sizing (~650 lines) — if tight, FAQ/testimonios sections may land minimal; report honestly. Page is orphaned (nothing links to it) until P6 — intentional, allows preview review before wiring.
**Rollback:** revert branch — page disappears, no other surface affected (P6 not yet applied).
**Content placeholders:** `TESTIMONIALS = []` and `WHATSAPP_NUMBER = ''` ship empty until Brent provides content (sections self-hide); wiring them later is a data-only change.

## Phase P6 — Site link rewiring + contact.ts fixes

**Scope:** `pages/index.tsx` (nav ×2, section CTA, flipbook button/modal/state); `pages/programas.tsx`, `pages/nosotros.tsx`, `pages/noticias.tsx` (nav ×2 each); `components/Footer.tsx`; `pages/api/contact.ts`; `__tests__/api/contact.test.ts` (new).
**Out of scope:** homepage form UI fields (no consent checkbox addition — Backlog), any new page/section, `pages/quote/*`, stats numbers.
**Acceptance criteria:**
- [A1] All nav/footer "PASANTÍAS" links point to `/pasantias` (index L188/L224, programas L254/L290, nosotros L352/L388, noticias L450/L496, Footer L84); homepage `#pasantias` section id preserved (old anchors don't break).
- [A2] Homepage: "Programa para líderes pedagógicos" flipbook button replaced by `Link` → `/pasantias`; `showFlipbook` state + modal (~L1078–1125) removed; Directivos flipbook kept, "Abril 2026" dropped from its title; pasantías section CTA card links `/pasantias`; `programas.tsx` INSPIRA card gains "Pasantía Octubre 2026 → /pasantias" link.
- [A3] `contact.ts`: interestMap covers `inspira`/`inicia`/`evoluciona`/`aula-generativa`/`otro` (old keys kept as aliases); transport = Resend (reusing the existing dead `htmlContent`, to `info@nuevaeducacion.org`, from `EMAIL_FROM_ADDRESS`), Formspree call and the 50/month 429 block removed; `trackFormSubmission` retained for stats; `rateLimit` 5/min added; missing `RESEND_API_KEY` → soft-fail 200 with log.
- [A4] `grep -rn "heyzine" pages/` shows only the Directivos flipbook; `grep -rn "/#pasantias" pages/ components/` returns no nav/footer hits.
- [A5] Unit suite green: interes labels (inspira→"Inspira (Pasantía en Barcelona)" etc.), Resend called with expected subject/to, rate-limit 429 path, no-key soft-fail; gates green; e2e nav check (extend `pasantias.spec.ts` or smoke) asserting homepage nav href.
**Test plan:** `__tests__/api/contact.test.ts` as above. Commands: `npx vitest run __tests__/api/contact.test.ts`; `npx playwright test tests/e2e/pasantias.spec.ts`.
**Definition of done:** standard + review-request file.
**Risks / unknowns:** contact.ts swap touches every contact-form submission (all interest types) — the highest-blast-radius change in Track A; mitigated by unit tests + soft-fail. Line numbers cited are 2026-07-30 evidence; executor must re-locate by content, not trust them blindly.
**Rollback:** revert branch; Formspree path returns (still capped but functional).

## Phase P7 — Admin leads triage page + API

**Scope:** `pages/admin/pasantia-leads.tsx` (new); `pages/api/admin/pasantia-leads/index.ts` (new); Sidebar entry (`components/layout/Sidebar.tsx`, near the "Propuestas Pasantías" item ~L539).
**Out of scope:** middleware changes (admin gating is automatic), lead API changes, email platform, bulk actions/exports beyond CSV.
**Acceptance criteria:**
- [A1] API: GET returns leads (service client) with optional `status` filter + search on nombre/email/institución, ordered created_at DESC; PATCH `{id, status?, notes?}` validates status against the CHECK set; both behind admin check (`checkIsAdmin` pattern from `tractor-signups/index.ts`); non-admin → 403, unauthenticated → 401.
- [A2] Page (admin-only, MainLayout, house style, model `pages/admin/tractor-signups.tsx`): status filter tabs with counts (Nuevos/Contactados/Convertidos/Descartados/Todos), table (fecha, nombre, email, WhatsApp, institución, cargo, nº personas, estado badge, brochure_sent_at indicator), row expand shows message/utm/source, status dropdown + notes editing with optimistic toast, CSV export (existing `ReportExporter` pattern).
- [A3] `data-testid` on interactive elements; es-CL copy.
- [A4] Unit test green: API auth (401/403), status validation 400, PATCH persists; gates green.
- [A5] E2E smoke: unauthenticated `/admin/pasantia-leads` redirects to login (pattern from existing admin smoke).
**Test plan:** `__tests__/api/admin-pasantia-leads.test.ts` (harness as P3). Commands: `npx vitest run __tests__/api/admin-pasantia-leads.test.ts`; targeted playwright smoke.
**Definition of done:** standard + review-request file.
**Risks / unknowns:** none material — read/update UI over an existing table.
**Rollback:** revert branch.

## Phase P8 — Email marketing schema + functions + pgTAP

**Scope:** migration `supabase/migrations/<ts>_add_email_marketing.sql`; `supabase/tests/040-email-marketing-rls.sql`.
**Out of scope:** any API/UI/lib code.
**Acceptance criteria:**
- [A1] `email_contacts`: email + `email_normalized` (UNIQUE, CHECK lower/btrim/non-empty), first_name/last_name/organization nullable, `tags text[]` NOT NULL default `{}` + GIN index, source CHECK (`manual|csv_import|profiles|tractor_signups|pasantia_leads|other`), `imported_by` FK profiles ON DELETE SET NULL, `unsubscribe_token uuid` NOT NULL default gen_random_uuid() UNIQUE, subscribed_at default now(), unsubscribed_at, suppressed_at, suppression_reason CHECK (`bounce|complaint|manual`), timestamps + trigger.
- [A2] `email_campaigns`: subject default '', preheader, content jsonb, content_html, hero_image_url, cta_label, cta_url, `audience_tags text[]` default `{}`, status CHECK (`draft|sending|sent|failed`) default draft, created_by FK, send_started_at, completed_at, timestamps + trigger. No counter columns (D-06).
- [A3] `email_campaign_sends`: FK campaign CASCADE + FK contact CASCADE, email snapshot, status CHECK (`pending|sending|sent|failed|skipped`) default pending, claimed_at, sent_at, resend_email_id, error, delivered_at/opened_at/clicked_at/bounced_at/complained_at/unsubscribed_at, created_at; `UNIQUE(campaign_id, contact_id)`; indexes `(campaign_id, status)`, `(resend_email_id)`, `(contact_id)`.
- [A4] Functions (SECURITY DEFINER, `SET search_path = public`, EXECUTE revoked from anon+authenticated): `queue_campaign_sends(uuid)` — asserts draft, inserts eligible recipients (subscribed, unsuppressed, tags overlap or empty filter) ON CONFLICT DO NOTHING, flips to sending, returns count; `claim_campaign_sends(uuid, int default 200)` — claims pending or stale-sending (>15 min) rows FOR UPDATE SKIP LOCKED with subscription re-check → skipped, returns rows; `import_email_contacts(jsonb, uuid, text)` — upsert by email_normalized with tag union + COALESCE names/org, never resurrects unsubscribed/suppressed, returns `{inserted, updated}`.
- [A5] RLS enabled ×3; one policy each for admin+community_manager (copy `news_articles_admin_cm_all`); no anon policies. Migration additive, no RLS disable.
- [A6] pgTAP suite green (~34 asserts): rls_enabled ×3; admin CRUD ×3; community_manager CRUD ×3; docente blocked ×3 (SELECT empty / INSERT 42501 / UPDATE empty); anon blocked ×3; authenticated cannot EXECUTE the 3 functions. `npm run test:db` green.
**Test plan:** `supabase/tests/040-email-marketing-rls.sql`, modeled on `020-tractor-signups-rls.sql` (+ a community_manager fixture). Command: `npm run test:db`.
**Definition of done:** standard + review-request file.
**Risks / unknowns:** `user_role_type` enum must contain `community_manager` (it does — used by news policy); function reclaim interval (15 min) frozen here, tuning later is a Decision Log entry.
**Rollback:** additive tables unreferenced until P9+; revert branch.

## Phase P9 — Contacts admin (CRUD/search/tags) + routing

**Scope:** `pages/admin/email/contacts.tsx` (new); `pages/api/admin/email/contacts/index.ts` (new); `lib/email/adminGuard.ts` (new); `components/admin/email/ContactModal.tsx` (new); `components/layout/Sidebar.tsx` (add "Correos"→`/admin/email/campaigns` [stub target ok] + "Contactos"→`/admin/email/contacts` in the comunicacion group, `restrictedRoles: ['admin','community_manager']`); `middleware.ts` (add `'/admin/email'` to `cmRoutes`).
**Out of scope:** CSV/platform imports (P10), campaigns pages/APIs (P13), unsubscribe (P11).
**Acceptance criteria:**
- [A1] `adminGuard(req,res)` helper: resolves user via `getApiUser`, service-role check for active `admin|community_manager` role, else 401/403 via `sendAuthError`; used by the contacts API.
- [A2] API: GET paginated (50/page) with `ilike` search (email/nombre/organización), tag filter, estado filter (suscrito/desuscrito/suprimido); POST create (normalizes email, 409 on duplicate); PUT update (names/org/tags; manual unsubscribe/resubscribe — resubscribe only allowed when suppression_reason is `manual` or null; manual suppress/unsuppress); DELETE with id (hard delete — Ley 21.719 erasure).
- [A3] Page: table (email, nombre, organización, tag chips, estado badge, fecha), search box, tag filter populated from `DISTINCT unnest(tags)`, estado filter, add/edit modal, delete confirm, per-contact detail showing send history placeholder (empty until P14 data exists), toasts, `data-testid`s, es-CL.
- [A4] Sidebar entries visible to admin + community_manager only; middleware allows CM into `/admin/email/*` and still blocks other roles (existing matrix test pattern if present).
- [A5] Unit tests green (guard 401/403/200; contacts API validation + dedupe 409 + resubscribe rules); gates green; e2e smoke: unauthenticated redirect on `/admin/email/contacts`.
**Test plan:** `__tests__/api/admin-email-contacts.test.ts`; `__tests__/lib/email-adminGuard.test.ts`. Commands: `npx vitest run` on both, `npm test`, targeted smoke.
**Definition of done:** standard + review-request file.
**Risks / unknowns:** middleware edit touches the most bug-prone file in the repo (per CLAUDE.md) — keep to the one-line cmRoutes addition; PM diff-review extra hard here.
**Rollback:** revert branch (sidebar/middleware lines included).

## Phase P10 — CSV + platform imports

**Scope:** `components/admin/email/CsvImportModal.tsx` (new); `pages/api/admin/email/contacts/import.ts` (new); `pages/api/admin/email/contacts/import-platform.ts` (new); `lib/email/importHelpers.ts` (new, pure); `package.json` (+`papaparse`, `@types/papaparse`); wire modal + platform-import buttons into `contacts.tsx`.
**Out of scope:** campaigns, sending, unsubscribe; automatic/scheduled syncs (explicit buttons only, D-09/consent).
**Acceptance criteria:**
- [A1] CSV modal flow: file → papaparse (handles `;` delimiters + BOM) → column mapping (email required; nombre/apellido/organización optional) → tags-to-apply input → validation preview (valid/invalid emails, in-file duplicates collapsed, count already-in-DB) → confirm → chunked POSTs (≤500 rows) → summary `{nuevos, actualizados, inválidos}`.
- [A2] `import.ts`: adminGuard; server-side re-validation (email format, length caps); calls `import_email_contacts` RPC with source `csv_import`; per-chunk result aggregation; rejects >500 rows/chunk.
- [A3] `import-platform.ts`: adminGuard; source `profiles` (approval_status approved, email present → tag `plataforma`) and `tractor_signups` (→ tag `registro`) behind an es-CL consent-reminder confirm in the UI; same RPC; idempotent (re-running updates, never duplicates).
- [A4] Unsubscribed/suppressed contacts are never resurrected by any import (RPC contract) — covered by an API test asserting the RPC receives rows and by helper tests for the client-side pipeline.
- [A5] Unit tests green; gates green.
**Test plan:** `__tests__/lib/email-importHelpers.test.ts` (normalization, dedupe-in-file, mapping, chunking incl. 501-row split, semicolon+BOM fixture); `__tests__/api/admin-email-import.test.ts` (guard, oversize 400, RPC payload shape, aggregation). Commands: targeted vitest, `npm test`.
**Definition of done:** standard + review-request file.
**Risks / unknowns:** consent basis for imported historic lists is an owner responsibility (setup checklist) — the tool only enforces mechanics; `pasantias_leads` import button deferred until Track A merged (Backlog if P10 lands first).
**Rollback:** revert branch + `npm uninstall papaparse @types/papaparse`.

## Phase P11 — Unsubscribe + Resend webhooks

**Scope:** `pages/desuscribir.tsx` (new); `pages/api/email/unsubscribe.ts` (new); `pages/api/email/webhook.ts` (new); `lib/email/webhookVerify.ts` (new); tests.
**Out of scope:** campaign composer/sending (P13/P14 consume these), contacts UI.
**Acceptance criteria:**
- [A1] `/desuscribir?token=…&c=…`: public, `noindex`, es-CL; GET performs no mutation (scanner-safe); button POSTs to the API; result state "Listo, no recibirás más correos de Fundación Nueva Educación."; invalid/missing token shows the same generic success (no enumeration).
- [A2] `unsubscribe.ts`: POST only (405 otherwise); accepts JSON `{token, c?}` AND RFC 8058 one-click form-encoded `List-Unsubscribe=One-Click` with token in query; rate-limited; service-role lookup by `unsubscribe_token` → set `unsubscribed_at` (idempotent); when `c` valid, stamp that campaign's send row `unsubscribed_at`; always generic 200.
- [A3] `webhookVerify.ts`: raw-body HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}` with base64-decoded secret (strip `whsec_`), `crypto.timingSafeEqual`, reject timestamps older than 5 min; header names verified against current Resend docs at implementation time (executor confirms in report).
- [A4] `webhook.ts`: `bodyParser:false`; bad signature → 401; `email.delivered/opened/clicked` → stamp send-row timestamps (first-write-wins for opened/clicked) by `resend_email_id`; `email.bounced/complained` → stamp + suppress contact (`suppression_reason` bounce/complaint), falling back to `email_normalized` match when no send row; unknown event types → 200 ignore; fast 200 always on verified requests.
- [A5] Unit tests green; gates green. Env documented: `RESEND_WEBHOOK_SECRET` (Vercel; owner registers endpoint per checklist).
**Test plan:** `__tests__/lib/email-webhookVerify.test.ts` (known-vector pass, tampered body fail, stale timestamp fail); `__tests__/api/email-webhook.test.ts` (401 bad sig, delivered stamps, bounce suppresses, unknown type 200); `__tests__/api/email-unsubscribe.test.ts` (GET 405 on API, POST idempotent, one-click path, generic success on bad token). Commands: targeted vitest, `npm test`.
**Definition of done:** standard + review-request file.
**Risks / unknowns:** webhook can't be fully verified until the owner registers it in Resend (prod-only) — unit vectors + soft manual verification post-merge.
**Rollback:** revert branch; no other phase consumes these routes until P14 sends real mail.

## Phase P12 — Campaign HTML renderer

**Scope:** `lib/email/renderCampaign.ts` (new); `__tests__/lib/email-renderCampaign.test.ts` (new).
**Out of scope:** UI, APIs, sending.
**Acceptance criteria:**
- [A1] `tiptapToEmailHtml(json)`: supports the node/mark set the news converter supports (paragraph, heading 1–3, bold/italic/underline, link, bullet/ordered list, blockquote, image, horizontal rule) emitting **inline-styled** email-safe HTML; escapes ALL text via `escapeHtml` and hrefs via `safeUrl` (rejects `javascript:` etc.) — the known news-converter href gap must not be copied.
- [A2] `renderCampaignHtml({subject, preheader, heroImageUrl?, bodyHtml, ctaLabel?, ctaUrl?, unsubscribeUrl})`: 600px table layout, FNE header, optional hero/CTA slots, fixed legal footer (org name + Santiago address + "Cancelar suscripción" → unsubscribeUrl), hidden preheader, MSO conditionals; pure string function usable client-side (no server-only imports).
- [A3] `buildUnsubscribeUrl(token, campaignId)` helper → `/desuscribir?token=…&c=…` via `buildAbsoluteUrl`.
- [A4] Unit suite green: each mark/node renders; `javascript:alert(1)` href neutralized; text `<script>` escaped; unsubscribe URL lands in footer + preheader hidden; optional slots render/omit correctly.
- [A5] Gates green.
**Test plan:** `__tests__/lib/email-renderCampaign.test.ts` as above. Command: `npx vitest run __tests__/lib/email-renderCampaign.test.ts`, then `npm test`.
**Definition of done:** standard + review-request file.
**Risks / unknowns:** none — pure library. Email-client rendering quirks are validated by test-sends in P13.
**Rollback:** revert branch.

## Phase P13 — Campaigns API + composer + test-send

**Scope:** `pages/admin/email/campaigns/index.tsx`, `pages/admin/email/campaigns/[id].tsx` (new); `pages/api/admin/email/campaigns/{index,[id]/index,[id]/test-send}.ts` (new); `components/admin/email/{CampaignForm,CampaignPreview}.tsx` (new); `pages/admin/email/index.tsx` redirect (new).
**Out of scope:** the send pipeline + progress/metrics UI states (P14) — `[id].tsx` ships draft-state complete with sending/sent states stubbed ("Envío disponible próximamente" if status ≠ draft).
**Acceptance criteria:**
- [A1] APIs behind `adminGuard`: list (GET, ordered updated_at DESC, status chip data); create (POST → draft with defaults); detail GET (campaign + audience count computed live from contacts for its `audience_tags`); PUT (draft-only: subject, preheader, TipTap `content` + server-rendered `content_html` via P12, hero_image_url, cta fields, audience_tags; editing non-draft → 409); DELETE (draft-only).
- [A2] Composer: subject + preheader inputs, TipTapEditor body (reuse `src/components/TipTapEditor.tsx` as in `admin/news.tsx`), hero image upload (`uploadFile` → `resources` bucket), optional CTA label+URL, audience tag multi-select with live recipient count, save-draft with dirty-state guard.
- [A3] Preview: client-side `<iframe srcDoc>` from the same `renderCampaignHtml` used at send (D-08 single source), 600px/375px toggle, dummy unsubscribe link.
- [A4] Test-send: POST sends exactly one Resend email to the logged-in admin's address, subject `[PRUEBA] <subject>`, dummy unsubscribe URL, never writes `email_campaign_sends`; soft-fail without `RESEND_API_KEY`.
- [A5] Guard rails: send/test-send disabled until subject + non-empty body; es-CL copy; `data-testid`s; unit tests + gates green; e2e smoke (list loads, create draft navigates to composer, unauthenticated redirect).
**Test plan:** `__tests__/api/admin-email-campaigns.test.ts` (guard, draft-only PUT 409, content_html rendered on save, audience count math, test-send single-recipient + no-ledger-write); e2e `tests/e2e/email-admin.spec.ts` (smoke cases above). Commands: targeted vitest + playwright, `npm test`.
**Definition of done:** standard + review-request file.
**Risks / unknowns:** sizing (~650 lines) — sending/sent stubs keep it inside the cap; if tight, drop hero-image upload to a Backlog item and report it.
**Rollback:** revert branch; P9 sidebar "Correos" link would 404 → acceptable pre-merge state is NOT allowed, so P13 must merge before/with the sidebar target going live — sidebar already points here from P9; if P13 is abandoned, a one-line sidebar revert restores consistency (note in report).
**Note:** P9 ships the sidebar link to `/admin/email/campaigns` before this page exists. Next.js 404 behind an admin-only sidebar for a few days is accepted (per-phase merge cadence); if Brent objects at P9 review, the sidebar entry moves to P13 (one-line change, no re-plan).

## Phase P14 — Send pipeline + progress/resume + metrics

**Scope:** `pages/api/admin/email/campaigns/[id]/send.ts` (new); `components/admin/email/{SendProgress,CampaignMetrics}.tsx` (new); `[id].tsx` sending/sent states replacing P13 stubs; `lib/email/sendBatch.ts` (new, pure batching helpers); optional `vercel.json` maxDuration 60 for the send route.
**Out of scope:** scheduling, retries beyond the manual "Reintentar fallidos", any renderer/webhook changes.
**Acceptance criteria:**
- [A1] Send endpoint (adminGuard): status `draft` → validates (subject, body, audience count > 0), freezes `content_html`, calls `queue_campaign_sends`, returns queued count; status `sending` → `claim_campaign_sends(id, 200)`, chunks into ≤100-recipient `resend.batch.send` calls (~600ms spacing), each email = frozen HTML with per-recipient unsubscribe URL substituted + `List-Unsubscribe` / `List-Unsubscribe-Post: One-Click` headers; per-batch ledger update (index-aligned `resend_email_id` → sent/sent_at; batch error → failed + error text); no rows left → status `sent` + completed_at; response `{status, processed, pending, counts}`.
- [A2] Idempotency proven by tests: double-queue impossible (ON CONFLICT), concurrent ticks cannot double-claim (SKIP LOCKED — asserted via RPC contract), re-POST after completion is a no-op 200.
- [A3] UI: confirm modal (from-address, audience description, exact count) → tick loop with progress bar from counts; leaving mid-send is safe — detail page shows "Envío incompleto — Reanudar" whenever status `sending` + pending>0; "Reintentar fallidos" flips failed→pending then resumes; failure list shows per-row error.
- [A4] Metrics panel (sent state): Destinatarios/Enviados/Entregados/Abiertos/Clics/Rebotes/Desuscritos from one GROUP BY over sends; es-CL note that opens are approximate.
- [A5] Sender = `EMAIL_MARKETING_FROM` env (fallback `EMAIL_FROM_ADDRESS`); unit tests + gates green; e2e extends admin smoke (send button disabled on empty draft).
**Test plan:** `__tests__/lib/email-sendBatch.test.ts` (chunk ≤100, id alignment, unsubscribe substitution per recipient, header presence); `__tests__/api/admin-email-send.test.ts` (draft→queue path, sending→claim/send/ledger path with mocked RPC+Resend, batch-error → failed rows, completion flip, re-POST no-op, guard). Commands: targeted vitest, `npm test`, targeted playwright.
**Definition of done:** standard + review-request file; end-to-end manual verification per Verification section after merge.
**Risks / unknowns:** duplicate-window tradeoff accepted in D-07; Resend rate/plan limits are an owner setup gate (free tier 100/day would fail a real campaign mid-send — rows land `failed`, retryable after upgrade).
**Rollback:** revert branch; composer returns to P13 stub state.

---

## Verification (end-to-end, PM-run after merges)

- **Track A:** `/pasantias` renders correct dates; ficha downloads openly; form submit → `pasantias_leads` row + auto-reply received + internal notification + brochure link works; homepage card shows Octubre; WhatsApp share of `/pasantias` unfurls OG card; `/admin/pasantia-leads` triage works.
- **Track B:** CSV import (incl. a semicolon+BOM file) → contacts; campaign → test-send received; real send to internal tag (~5) completes with progress; webhook events populate metrics; unsubscribe link: GET shows page, POST unsubscribes, next send skips the contact.

## Owner setup checklist (Brent — before first campaign)

1. Resend plan (free = 3.000/mes, 100/día — insufficient for a real campaign; ~US$20/mo covers 50k). 2. DKIM/SPF verified in Resend; add DMARC if missing. 3. Set `EMAIL_MARKETING_FROM` (recommend `Fundación Nueva Educación <hola@nuevaeducacion.org>`). 4. Register webhook → `/api/email/webhook`; set `RESEND_WEBHOOK_SECRET`. 5. Enable open/click tracking. 6. Confirm consent basis for historic lists before import; first send explains "por qué recibes este correo". 7. Content: 2–3 testimonios + WhatsApp number for `/pasantias`; confirm day-1 shape with BCN team (Oct 12 = Fiesta Nacional, schools closed).

## Backlog

| Item | Source | Class |
|---|---|---|
| Harden/remove open relay `pages/api/send-email.ts` (+ migrate `expense-service.ts` caller, delete `test-email.ts`), drop dead `@sendgrid/mail` | audit 2026-07-30 | SHOULD-FIX (security) |
| Homepage off `cdn.tailwindcss.com` → compiled Tailwind | audit 2026-07-30 | SHOULD-FIX (perf/SEO) |
| `form_submissions` table missing migration (schema drift) | audit 2026-07-30 | SHOULD-FIX |
| Homepage contact form consent checkbox + dual-write Inspira interest into `pasantias_leads` | plan D2 discussion | v2 |
| `pasantias_leads` import button in Contactos | P10 note | v2 |
| Scheduled sends, merge tags, nurture sequence, public double-opt-in signup, sending subdomain | design | v2 |

## Decision log

| Date | Decision | Rationale | Raised by |
|------|----------|-----------|-----------|
| 2026-07-30 | Adopt AGENT-WORKFLOW.md SOP; process files at `docs/plan/`; one PLAN.md, two tracks; per-phase explicit merge go from Brent | Standardize multi-agent development; `main` auto-deploys so merge stays human-gated | Brent |
| 2026-07-30 | No prices on web or email bodies; prices only in full brochure PDF | Commercial flexibility; brochure circulates in conversations | Brent |
| 2026-07-30 | Hybrid downloadables: open ficha + form-gated full brochure with instant download | Lead capture without hostage content | Brent |
| 2026-07-30 | October 2026 = single track (líderes pedagógicos) | Directivos track not offered this cohort | Brent |
| 2026-07-30 | Email platform v1 = broadcast simple (no automation) | Don't go overboard; schema stays v2-extensible | Brent |
| 2026-07-30 | New `pasantias_leads` table over extending `tractor_signups` | Incompatible constraints + grant flow creates platform users | Fable (plan) |
| 2026-07-30 | Send pipeline = UI-driven ticks over a sends ledger; no cron | Simplest reliable option; no silent stalls; idempotent resume | Fable (plan) |
