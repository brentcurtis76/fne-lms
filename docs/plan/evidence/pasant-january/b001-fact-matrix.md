# PASANT-B001a — January 2027 brochure fact matrix

Discovery evidence for B001 (PASANT-C002). **Not a ratified contract**: nothing here becomes publishable until
B001 ratifies `docs/plan/pasantias-january-contract.md`. Anchors are verbatim brochure text; the source-integrity
test (`__tests__/lib/pasantias/january-source.test.ts`) checks each anchor on its cited page(s) of the committed
page-text snapshot after removing whitespace. The snapshot is tied to the real PDF only by the PASANT-01 RUN
validator (hash + page-by-page comparison), not by the repository test.

## Provenance

- Source: `/home/brent/Projects/pm-workflow/Brochure Pasantías Enero 2027.pdf` (outside the repository)
- SHA-256: `84d83e153ee794a95d7a9e019359fc637237842ae0a7128f98cae332ff4efdb5`
- Pages: 17 · A4 · 6725842 bytes · PDF created 2026-09-29 23:33 -03
- Version: `2027-01-V1` (page 17)
- Page-text snapshot: `b001-source-snapshot.md` (all 17 pages, per-page SHA-256, extraction method)

## 1. Brochure facts (page-referenced)

| ID | Program | Field | Fact | Pages | Anchor |
|---|---|---|---|---|---|
| F01 | cohort | label | Cohorte Enero 2027 | 1 | `COHORTE ENERO 2027` |
| F02 | cohort | span | 18–29 January 2027 | 1 | `Enero, 18 al 29 · 2027` |
| F03 | cohort | version | 2027-01-V1 | 17 | `VERSIÓN 2027-01-V1` |
| F04 | both | identities | Two programs, one trip: Pasantía INSPIRA and INSPIRA Mirada Profunda | 1 | `Pasantía INSPIRA y Mirada Profunda` |
| F05 | INSPIRA | audience | Teams travelling for the first time | 3 | `Equipos que viajan por primera vez` |
| F06 | Mirada Profunda | audience | Those who already travelled with INSPIRA | 3 | `Quienes ya viajaron con INSPIRA` |
| F07 | INSPIRA | dates/duration | 18–28 January, 9 school days | 3 | `18 al 28 de enero · 9 días en escuelas` |
| F09 | Mirada Profunda | dates/duration | 18–29 January, 10 school days | 3 | `18 al 29 de enero · 10 días en escuelas` |
| F10 | INSPIRA | schools | 6 schools: one immersion week in two, one visit week in four | 3 | `6 escuelas: una semana de inmersión en dos` |
| F11 | Mirada Profunda | schools | 5 schools, two full days each | 3 | `5 escuelas, dos días completos en cada una` |
| F12 | INSPIRA | week 1 | Immersion Mon 18–Fri 22 Jan | 4 | `SEMANA 1 · LUN 18 — VIE 22 ENE` |
| F13 | INSPIRA | immersion | 2,5 days at Escola Virolai and 2,5 days at Escola Sadako per pasante | 5 | `Cada pasante vive 2,5 días en Escola Virolai y 2,5 días en Escola Sadako.` |
| F14 | INSPIRA | week 2 | Visits Mon 25–Thu 28 Jan, one school per day | 4 | `SEMANA 2 · LUN 25 — JUE 28 ENE` |
| F15 | INSPIRA | school selection | Four visits chosen from five candidates (El Puig, La Maquinista, Octavio Paz, Angeleta Ferrer, Les Vinyes) by group interest and availability | 4 | `Cada cohorte visita cuatro de estas cinco escuelas.` |
| F16 | both | free days | Free weekend Sat 23 – Sun 24 Jan | 4,7 | `domingo 24` |
| F17 | both | out of Barcelona | El Puig and Les Vinyes take the full day | 5 | `Institut Escola El Puig e Institut Escola Les Vinyes están fuera de Barcelona` |
| F18 | Mirada Profunda | week 2 | Mon 25–Fri 29 Jan, five school days | 7 | `Lunes 25 a viernes 29 de enero · cinco jornadas en escuelas` |
| F19 | Mirada Profunda | schools | Virolai, Sadako, Angeleta Ferrer, El Puig, Les Vinyes — 2 days each | 9 | `MIRADA PROFUNDA: 2 DÍAS` |
| F20 | Mirada Profunda | order caveat | Order confirmed per school; one may split its two days across Fri 22 / Mon 25 | 7 | `Una de ellas puede repartir sus dos días entre el viernes 22 y el lunes 25.` |
| F21 | Mirada Profunda | preparation | Each participant defines a real school challenge with FNE before travel | 6 | `Cada participante define, con el equipo FNE, un desafío real de su colegio.` |
| F22 | Mirada Profunda | follow-up | Closing roadmap Fri 29; online follow-up session in April | 6 | `En abril, una sesión online` |
| F23 | both | preparation | Bibliography, logbook and learning-record system at least one month before | 8,16 | `bitácora` |
| F24 | both | includes | School visits, afternoon expert workshops, programme direction/relator/FNE facilitator fees, mid-morning breakfast | 16 | `El pago de las visitas a las escuelas.` |
| F25 | per program | includes: lunches | INSPIRA: week-1 lunches (Virolai, Sadako); Mirada Profunda: every programme day | 16 | `Profunda, todos los días del programa.` |
| F26 | Mirada Profunda | includes | Question accompaniment before travel and April online follow-up | 16 | `pregunta antes del viaje y sesión online de` |
| F27 | per program | excludes | Santiago airport transfers, Barcelona transport incl. El Puig/Les Vinyes, dinners, INSPIRA week-2 lunches, insurance, flights and lodging unless coordinated via FNE | 16 | `Almuerzos de la segunda semana (solo en la` |
| F28 | INSPIRA | CLP fee | $2.500.000 per person; $2.000.000 for schools with FNE annual advisory | 14 | `PASANTÍA INSPIRA $2.500.000 $2.000.000` |
| F29 | Mirada Profunda | CLP fee | $2.500.000 per person; $2.000.000 discounted | 14 | `INSPIRA MIRADA PROFUNDA $2.500.000 $2.000.000` |
| F30 | both | discount condition | Discount applies to schools with an FNE annual advisory programme | 14,15 | `COLEGIOS CON PROGRAMA ANUAL DE ASESORÍA FNE` |
| F31 | both | EUR lodging | Double room €50–€75 per person per night (single approx. €100: `Habitación single: aprox. €100 por noche`) | 14 | `Habitación doble: €50 a €75 por persona por noche` |
| F33 | both | CLP flight | Santiago–Barcelona–Santiago approx. $1.500.000 | 14 | `aprox. $1.500.000` |
| F34 | INSPIRA | CLP total | 12 nights: $4.700.000–$5.000.000; discounted $4.200.000–$4.500.000 | 14 | `Pasantía INSPIRA (12 noches) $4.700.000 a $5.000.000 $4.200.000 a $4.500.000` |
| F35 | Mirada Profunda | CLP total | 13 nights: $4.700.000–$5.100.000; discounted $4.200.000–$4.600.000 | 14 | `INSPIRA Mirada Profunda (13 noches) $4.700.000 a $5.100.000 $4.200.000 a $4.600.000` |
| F36 | both | exchange rate | Totals computed at €1 = $1.100; arrival Sun 17 Jan, return Fri 29 (INSPIRA) / Sat 30 (MP) | 14 | `calculados con el euro a $1.100` |
| F37 | both | payment | 50% on booking, 50% the week before start | 14 | `50% al reservar` |
| F38 | both | places | Confirmed in booking order | 14 | `Se confirman por orden de reserva.` |
| F39 | both | team totals | Page 15 multiplies page-14 per-person values by team size 1–10 | 15 | `Si viajan 1, 2 o 10` |
| F40 | cohort | RPA claim | "FNE es Agencia Técnica Educativa certificada por RPA Mineduc" | 2 | `certificada por` |
| F41 | INSPIRA | host name | Jordi Mussons, Director, Escola Sadako (spelled "Mussons" on both pages) | 4,12 | `Jordi Mussons` |

## 2. Approved-plan facts (plan grant rev 1, source hash a9597051…f9bc9f)

- Canonical candidate source is the PDF above with that SHA, 17 pages, version 2027-01-V1 (constraints; C002).
- Pasantía INSPIRA 18–28 Jan 2027, nine school days, six visited schools; INSPIRA Mirada Profunda 18–29 Jan 2027,
  ten school days, five schools with two days each (C002 statement) — consistent with F07–F11.
- Default success copy confirms registration and gives direct information access without promising unverified
  email delivery (architecture; C007). Program IDs are frozen in B001 (architecture).
- Packaging recommendation (not a decision): one price-free two-program ficha plus the supplied designed brochure.

## 3. Delta against the current (October 2026) implementation

| Topic | Current repo (HEAD 76349909) | January source |
|---|---|---|
| Cohort | `octubre-2026`, single track (`lib/pasantias/cohort-public.ts`) | `Enero 2027`, two programs (F01, F04) |
| Price | €2.500 programme (`cohort-commercial.ts:48`), `BROCHURE_VERSION 2026-10-v5` | CLP $2.500.000 / $2.000.000 (F28–F29), version 2027-01-V1 |
| Schools | 7 schools, one itinerary | INSPIRA 2 + 4-of-5; MP 5 × 2 days (F10–F19) |
| Lunches | week-1 lunches only | per program (F25, F27) |
| Host spelling | `Jordi Musons` (cohort-public.ts:265, pasantias-cohort.test.ts, PLAN A-6) | `Jordi Mussons` (F41) |

## 4. Proposed corrections and decisions register

Status values: **UNRESOLVED** — a correction, ratification or freeze B001 must still settle (C002 names it; the plan
sets no default); **PLAN DEFAULT** — the approved plan (rev 1) already sets the default, which applies unless
B001 records a change; **DECIDED** — a later recorded decision, which must cite dated evidence.

| DEC | Topic | Brochure / repo facts | Proposal (not a decision) | Status | Evidence |
|---|---|---|---|---|---|
| DEC-01 | Mussons vs Musons | F41 vs repo "Musons" | Adopt "Mussons" in the January contract | UNRESOLVED | C002 names it; no plan default |
| DEC-02 | RPA Mineduc claim | F40 | Publish only with confirmed certification evidence | UNRESOLVED | C002 names it; no plan default |
| DEC-03 | INSPIRA four-of-five visits | F14, F15 | Show 2 immersion schools + "cuatro de estas cinco" candidates, never a fixed list | UNRESOLVED | C002 names it; no plan default |
| DEC-04 | Document packaging | plan §2 | One price-free two-program ficha + designed two-program brochure | PLAN DEFAULT | plan rev 1 architecture: "Recommend one price-free two-program ficha plus the supplied designed two-program brochure" |
| DEC-05 | Publication mode | plan C006 | Designed upload under D-05 (hash + object key + upload before version deploy) | UNRESOLVED | plan rev 1 sets no mode, only that B001 freezes it; designed upload follows from DEC-04 if kept; the D-05 upload stays a Brent-owned release step |
| DEC-06 | Program IDs | none in repo | cohort `enero-2027`; programs `inspira`, `mirada-profunda` | PLAN DEFAULT | plan rev 1 architecture: "Freeze the two program IDs in B001" (implementation choice) |
| DEC-07 | Truthful success copy | plan C007 default | Confirm registration + direct information access; no email-delivery promise until A2-11/A2-12 evidence | PLAN DEFAULT | plan rev 1 architecture + C007: "must not promise that email was sent or will arrive" |
| DEC-08 | Canonical status of the brochure | provenance above | Ratify 2027-01-V1 with the DEC-01..03 outcomes | UNRESOLVED | C002: confirmed in B001 ratification |

Other observations for ratification (no proposal made): page 9 says "Siete proyectos" (seven schools across both
programs) while INSPIRA visits six; page 1 claims "400+ pasantes, 40+ colegios, 12 escuelas" without a source;
pages 14–15 prices must stay commercial (never in client bundles or the ficha).
