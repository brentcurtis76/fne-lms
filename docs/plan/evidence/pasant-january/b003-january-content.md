# PASANT-B003 — January 2027 public content, program choice and shared documents

Status: **AUTHORED, NOT VALIDATED** (PASANT-B003/local-part2 r1, authorship-only, 2026-10-15; continued under
r1-continuation-1 the same day, see §8). No test, scanner, build, service or browser check has been run on this state.
Every gate below is open.

- Executor: Claude Code (`claude-opus-5-5`, requested effort high, fallback NONE), `/bounded-executor` invoked explicitly.
- Base: `fix/p02b-r1` at `85838af02a03a5289ad71852aab007fa62edbbf7`, on top of the uncommitted B002a/B002b overlay and the
  B003-part1 guard changes (freeze `PASANT-B003-part1/freeze-r1.json`, identity `0f447e71…`).
- Normative source: `docs/plan/pasantias-january-contract.md` (RATIFIED — ACTIVE). No fact, decision or criterion was
  redesigned; facts the contract does not ratify were removed rather than carried (C005).

## 1. What changed

| Area | Change |
| --- | --- |
| Public registry (`lib/pasantias/cohort-public.ts`) | Cohort `enero-2027`, label `Cohorte Enero 2027`, shared span 2027-01-18/29, headline `Enero, 18 al 29 · 2027`. Typed per-program registry `COHORT_PROGRAMS = [INSPIRA_PROGRAM, MIRADA_PROFUNDA_PROGRAM]` (IDs `inspira`, `mirada-profunda`; immersion/visits are fields, never IDs). Common free weekend, routing, places, contact, P-02 accreditation, P-03 track record, day structure, includes, excludes, P-01 host Jordi Musons. Spanish copy is the contract's verbatim `anchor`. October experts, objectives, school levels/highlights, Fiesta Nacional and October meal/transport terms are gone. |
| Commercial data (`lib/pasantias/cohort-commercial.ts`, server-only) | `PROGRAM_PRICING` (fees $2.500.000 / $2.000.000, nights 12 / 13, returns 29 / 30 Jan, per-person standard and discounted ranges), discount condition, arrival 17 Jan, lodging €50–€75 double / ~€100 single, flight ~$1.500.000, €1 = $1.100, rounding $100.000, teams 1–10 (`teamRows`), payment, places, notes, validity. `BROCHURE_VERSION = '2027-01-v1'`. October euro prices removed from the module (still hunted by the guard). |
| Formatting / filenames | `formatClp`, `formatClpRange` (hand-grouped es-CL); `FICHA_VERSION = '2027-01-v1'`. |
| Ficha (`lib/pasantias/ficha.tsx`) | One price-free document for both programs, no page cap; never imports the commercial module. |
| Brochure (`lib/pasantias/brochure.tsx`) | One generated fallback for both programs with every ratified commercial fact, including the 20-row team table. |
| Page (`pages/pasantias.tsx`) | January content in the existing design system and sections; two program cards with CTAs that preselect the program in the form; per-program calendars around the shared weekend; schools per program; Mirada Profunda preparation/closing/follow-up; host; includes/excludes with distinct lunches; FAQ updated. Every module value is printed directly. |
| Homepage (`pages/index.tsx`) | The cohort card shows `COHORT_HEADLINE` and both program names from the module. Continuation (F5): three unsupported teaser claims corrected as text only — see §8. |
| Form (`components/pasantias/LeadForm.tsx`) | Required single-choice program radio group, first in the form and in focus order; CTA preselection via `requestedProgram` (nonce re-applies), always user-changeable; success only on `200 {success: true}`; success panel names the program and links the ficha and the brochure; "other program" button re-opens the form with the other program and both consents unchecked; no e-mail promise in any copy. |
| E-mail (`lib/pasantias/emails.ts`) | January acknowledgement names the program, links `/api/pasantias/ficha` and `/api/pasantias/brochure` at the configured origin, promises no further mail. URL resolution happens before any message is built: a missing production origin returns `not_configured` → the route settles `not_sent` (claim restored) instead of throwing into an `ambiguous` 24 h hold. Provider seam, settle mapping and notification unchanged. |
| Validation (`lib/pasantias/leads.ts`) | Comments only. With `COHORT_ID = 'enero-2027'` every valid submission requires one program and takes the reviewed B002b atomic RPC path; a stale October form gets the visible `cohortInvalid` error. No October denylist; the single-track branch is kept. |
| API route (`pages/api/pasantias/lead.ts`) | **Not changed** (not allowlisted). |

## 2. Criteria map

| Criterion | Where it is met | Independent oracle (not read from the implementation) |
| --- | --- | --- |
| C004 — January page/metadata/homepage, no October promotion | `cohort-public.ts`, `pages/pasantias.tsx` (chip, meta description, title), `pages/index.tsx` | `__tests__/lib/pasantias-cohort.test.ts` (literal span/headline, per-fact contract comparison); `__tests__/pages/pasantias-site-links.test.ts` (C004 block: literal headline/program names, no `Octubre 2026` on any page; F5 block: retired teaser claims absent, corrected copy and badge markup present); hardcoded-cohort C003 block (prints January, no October); `tests/e2e/pasantias-page.spec.ts` (chip, title, "October is not the running cohort"). |
| C005 — both programs' ratified content | `cohort-public.ts`, page sections, ficha, brochure | Hand-transcribed oracle objects in `pasantias-cohort.test.ts` (whole-object `toEqual`), plus `FACT_CHECKS`: one mechanical comparison per contract fact (41) and per decided answer; calendar weekday arithmetic; per-program section attribution in the hardcoded-cohort C003 block; `tests/e2e/pasantias-page.spec.ts` literal contract pins on the rendered page (both programs' dates, day/school counts, immersion, conditional visits, full-day pair, order caveat, roadmap, April follow-up, weekend, day structure, includes/excludes, host). |
| C006 — rendered leaves and real PDF bytes | page guard (leaf/collection/fragment/restatement contracts), `lib/pasantias/__tests__/pdf.test.ts` | Expected text typed from the contract; real `renderToBuffer` → `pdf-parse` text and `pdf-lib` A4 geometry; ficha ≥ 2 pages (no 1–2 cap); 20 team rows; literal versions and filenames. |
| C006-cache | `__tests__/api/pasantias-pdf.test.ts` (existing suite + new January block) | Literal keys `pasantias/brochure-2027-01-v1.pdf`, `pasantias/ficha-2027-01-v1.pdf`; October keys never read; warm designed bytes verbatim; cold/failed read → own generator only, called without the request; preview no upload; production create-only and object-exists race; literal Content-Disposition names. |
| C007 — program submissions, consents, failure/retry, truthful copy, documents | form, e-mail, API tests, e2e flow | `PasantiasLeadForm.test.tsx` (both programs, missing/invalid/route-400 program with focus, keyboard, CTA preselect/override, consent combinations, 2xx-without-success is a failure, retry keeps program, other-program second submission), `pasantias-emails.test.ts` (links, no promise, URL failure → `not_sent`), `pasantias-lead.test.ts` (January default fixture, stale October form, two POSTs one contact), `tests/e2e/pasantias-flow.spec.ts` (unmocked), `tests/e2e/pasantias-form.spec.ts` (intercepted POSTs, browser behaviour only: literal cohort/program IDs, missing program, switching, CTA preselection, consents, UTM, failure/retry with retention, 2xx-without-success, stale program/cohort 400, other-program second submission, keyboard). |

## 3. Shared documents, versions and the cache

- Cache keys (`lib/pasantias/pdf/serve.ts`, unchanged): `pasantias/brochure-2027-01-v1.pdf`, `pasantias/ficha-2027-01-v1.pdf`.
  New keys mean no October object (`brochure-2026-10-v1…v5`, `ficha-2026-10-v1…v2`) can be served for January.
- Download names: `Pasantias-INSPIRA-Barcelona-enero-2027-2027-01-v1.pdf`, `Ficha-Pasantias-INSPIRA-Barcelona-enero-2027-2027-01-v1.pdf`.
- Cache-hit priority, production-only create-only writes and the object-exists race are the existing handler's behavior;
  nothing in serving changed. No production object was read or written by this step.
- **R-08 (Brent-owned release)**: the corrected designed two-program brochure must be approved by hash and uploaded at
  `pasantias/brochure-2027-01-v1.pdf` before the deployment that ships `BROCHURE_VERSION = '2027-01-v1'`, then verified.
  Until then the generated brochure is the fallback canary. Note: a cold production request would create-only fill that key
  with the generated fallback first if it reached production before the upload — the upload must precede the deployment.
- **R-17 (Brent-owned release)**: real mail evidence. A2-9 PASS, A2-11/12 FAIL, A2-13 BLOCKED stay as recorded.

## 4. Price-leak guard — narrow extension (B003-P1 review notes)

Behavior added in `scripts/check-price-leak.mjs` (no check removed or narrowed):

- `commercial-copy` gains four literal fragments of the January commercial module: `PROGRAMA ANUAL DE ASESORÍA FNE`,
  `Habitación individual: aproximadamente`, `tipo de cambio de referencia`, `el valor por persona multiplicado`. The
  January module keeps `Alojamiento en Barcelona: entre`, `por persona por noche`, `en base a habitación doble` and
  `Precios vigentes para la cohorte` live; the October-only fragments stay under the retired rule.
- Not added: the payment split (`50% al reservar…`), because part 1 pinned it as a silent control; changing that verdict is
  outside this extension.
- Corpus/test: verbatim-substring check of every fragment against the module; each fragment fires alone; real copy rows;
  escaped forms (x-escape, u-escape, braced u-escape) fire only after `unescapeLiterals`; benign controls; the ficha
  filename is pinned as a safe-direction over-firing.
- **B003-P1-N2**: named rows pin that the percentage exclusion also silences October figures (`€70%`, `€70 %`,
  `EUR 120%`, `€560%`, `€2500 %`, `€1.000%`), with firing controls without the sign and with the sign two spaces away.
- Historical guard evidence (`docs/plan/evidence/a1/leak-guard.md`, `a6a/leak-guard-r*.md`) is unchanged.

## 5. Findings routed to the PM (no scope expansion)

- **F1 (gate impact)**: `tests/e2e/pasantias-page.spec.ts` and `tests/e2e/pasantias-form.spec.ts` are not allowlisted and pin
  October facts/exports (`COHORT_EXPERTS`, `COHORT_OBJECTIVES`, `COHORT_VISIT_DAY_COUNT`, `COHORT_SCHOOLS`, "Fiesta Nacional",
  `semana-1/2` week hooks, the October form without a program). They will fail the mandatory Playwright gate after this
  cutover. Not edited or deleted. Needs a PM allowlist extension to retarget them to January.
  **→ Resolved by code** in r1-continuation-1 after the PM extension and Sol's browser-scope review; see §8. Not yet run.
- **F4 (copy)**: the retained A-14 processing-consent sentence (`lib/pasantias/consent.ts`, not allowlisted) says
  "…enviarme el programa completo de la pasantía". Contract §6 retains A-14 verbatim; it states a processing purpose, not a
  delivery claim. Left unchanged; a wording change needs a dated amendment.
  **→ Resolved without change**: PM and Sol classified it PRESERVE_NO_HUMAN_DECISION (contract §6 retains A-14 verbatim;
  a processing purpose is not a delivery claim). No amendment and no question to Brent; `consent.ts` untouched.
- **F5 (homepage copy)**: generic homepage benefit cards ("Certificación Internacional", "Networking Internacional",
  "¡CUPOS LIMITADOS!") predate January and are not ratified facts; left as is (no redesign).
  **→ Resolved by code** in r1-continuation-1: Sol classified it ROUTINE_IN_SCOPE_COPY_CORRECTION (the cards sit inside
  `#pasantias`, under the January cohort, as included benefits); corrected as text only; see §8. Not yet run.
- **F6 (dependency)**: the e2e flow's January assertions depend on the B002a migration's RPC writing the contact into
  `pasantias_leads` with cohort `enero-2027` and the admin API listing it; per-program interests are not exposed by the admin
  API (covered by pgTAP 112 / PostgREST checks).
  **→ Routed** to B004/B006 (real-database/admin per-program interest proof). No DB or API change in B003; not claimed here.

## 6. Test-design notes a reviewer should know

- `__tests__/api/pasantias-lead.test.ts`: the route's single-track branch is unreachable while the public cohort requires a
  program, but kept; its tests are kept and run through `useLegacySingleTrack()`, a documented test-only override that makes
  the public module report `octubre-2026`. The default fixture is January.
- `__tests__/pages/pasantias-hardcoded-cohort.test.ts`: mechanism unchanged; counts (106 leaves, 14 collections),
  `EXPORT_BY_KEY` and every declaration re-derived by reading the January page — **predicted, not observed**. Number shift
  +7.3 (rounded) replaces +7.25 so January's 5 and 2 can be proved. This suite is the most likely to need a data-only
  adjustment at first execution.

## 7. Validation

NOT_RUN. Required before acceptance: focused suites above, full type-check, zero-warning lint, `npm test`, production build
plus `node scripts/check-price-leak.mjs`, cumulative pgTAP/grants/RLS/password guards/PostgREST/concurrency, mandatory
Playwright (with F1 resolved) and the browser journeys at 1366×768 and 390×844, and all four CI gates. Baseline A9 failures and
blocked rows stay as recorded.

Still NOT_RUN after the continuation (§8): F1 is resolved in code only; the two retargeted specs and the new site-links block
have never executed.

## 8. Continuation r1-continuation-1 (2026-10-15) — browser specs and homepage copy

Order `order-r1-continuation.json` (authorship-only), reviews `browser-scope-extension-review.json` and
`copy-discovery-review.json` (Sol 6.1). Same executor (Claude Code, `claude-opus-5-5`, requested high, fallback NONE), same
uncommitted state; the other frozen B003 files were not edited.

Changed: seven of the eight allowlisted paths — the four below plus this record, the review request and `PROJECT_STATE.md`
(the eighth, the hardcoded-cohort test, needed no change):

- `tests/e2e/pasantias-page.spec.ts` — retargeted to January. No import from `cohort-public.ts`: every fact is a literal typed
  from the contract and cited by page. October fact assertions are superseded one by one (mapping in the spec header):
  headline/stats → January headline and "Todos viajan juntos a Barcelona"; October weeks → each program's two weeks;
  Fiesta Nacional → the common free weekend; seven schools with levels/highlights → INSPIRA immersion (2,5 days each) and
  five conditional visit candidates (P-04), Mirada Profunda's five schools (2 full days, order caveat); thirteen objectives →
  the day structure and the full includes/excludes; experts → the P-01 host with the "Experto invitado" prohibition kept;
  "Día completo — fuera de Barcelona" → the contract sentence for El Puig and Les Vinyes and no duration on any other visit
  card. New test "October is not the running cohort". CTA destinations (now including both program CTAs), site navigation,
  flipbook control, headings/landmarks, Tab-reachable CTA, both-viewport photo contrast and axe are unchanged in behaviour.
  D-02: the October patterns are kept; January adds the peso marker/code/word, every CLP total with or without separators,
  the 1.100 rate and 100.000 rounding unit (HTML), and the discount condition and payment split (copy only, since `50%` is
  CSS). Nights, team sizes, dates and bare lodging figures are deliberately allowed (they collide with benign copy and carry
  no currency). The page no longer says "Europa", so the October control `expect(html).toContain('Europa')` is replaced by a
  pattern self-test (each pattern catches its named leak and no benign sample) plus benign figures asserted present.
- `tests/e2e/pasantias-form.spec.ts` — explicitly browser behaviour only (header states that persistence, per-program
  interests and mail are proven elsewhere: `pasantias-flow.spec.ts`, pgTAP 112/PostgREST, B004/B006, R-17). Literal
  `enero-2027`, `inspira`, `mirada-profunda` and program names; every valid fixture chooses a program. Cases: empty submit
  (program error first, focus on the first radio, zero POST); missing program alone (single error, `aria-invalid` on both
  radios, zero POST, cleared by choosing); both programs submitted; switching sends only the last choice; both CTAs preselect
  and the visitor can override; optional box only; 500 → one form error, every field incl. program and both boxes retained,
  retry succeeds; 2xx without `success: true` is a failure; stale 400 on program (error on the choice, focus) and on cohort
  (form-level); other-program second submission with both consents reset; keyboard-only path through the radio group
  (Space/arrows) to submit and focus on the confirmation; UTM and over-limit UTM kept. No-mail-promise checks scope to the
  success panel and pre-submit copy, never the preserved A-14 sentence.
- `pages/index.tsx` (F5, text only; classes and markup unchanged): "Networking Internacional / Construye relaciones con
  líderes educativos de todo el mundo" → "Intercambio con las Escuelas / Conversa con los equipos directivos, educadores y
  estudiantes de las escuelas que te reciben" (contract page 8 day structure); "Certificación Internacional / Obtén
  reconocimiento oficial de tu participación y aprendizajes" → "Bitácora de Aprendizajes / Recibe bibliografía recomendada,
  una bitácora y un sistema de registro de tus aprendizajes al menos un mes antes del viaje" (page 16 includes); badge
  "¡CUPOS LIMITADOS!" → "CUPOS POR / ORDEN DE RESERVA" (page 17 places).
- `__tests__/pages/pasantias-site-links.test.ts` — new F5 block with independently typed expectations.
- Not changed: `__tests__/pages/pasantias-hardcoded-cohort.test.ts` (it scans `pages/pasantias.tsx` and `components/pasantias/`
  only, so the homepage copy needs nothing there), `lib/pasantias/consent.ts` (F4), API/SQL/DB artifacts (F6).

Validation: NOT_RUN — no test, scan, build, service or browser. Attempts: initial 1, scope continuation 1, remediation 1
(F5, the first independently reviewed copy finding; the F1 scope extension was completed in the same pass); inherited B002b
initial 1 / remediation 2 and B003-part1 initial 1 / remediation 0 unchanged.
