# Pasantías INSPIRA Barcelona — January 2027 contract

Status: CANDIDATE — NOT RATIFIED — NOT ACTIVE

Prepared by PASANT-B001b (PASANT-03 r0 executor, oracle tightened in r1, 2026-10-08) under approved plan PASANT rev 1;
Brent's recorded answers applied by PASANT-B001c (PASANT-04 r0, 2026-10-08). This file is the proposed single
normative source for active January facts (PASANT-C003). **It is not normative yet.** It becomes active only when
all three happen: (1) Brent's ratification of the whole contract (§8) is recorded with dated evidence (C002, DEC-08)
— the field answers in `decided` are recorded but are not that ratification; (2) `docs/plan/PLAN.md`'s Decision Log
declares this file normative and supersedes Appendix A-1 through A-9 for January only (C003); (3) the cohort oracle
tests switch to parse it. Until then no product code may import or render it, and October Appendix A stays the
record of the shipped October cohort. Open items and their owners are in
`evidence/pasant-january/b001-contract-prerequisites.md`; Brent's answers are in `evidence/pasant-january/b001-brent-decisions.md`.

## 1. Provenance

- Source: `Brochure Pasantías Enero 2027.pdf` (supplied by Brent; outside the repository), SHA-256
  `84d83e153ee794a95d7a9e019359fc637237842ae0a7128f98cae332ff4efdb5`, 17 pages, version `2027-01-V1`.
- Page text: `evidence/pasant-january/b001-source-snapshot.md` (per-page SHA-256; tied to the PDF by the PASANT-01 RUN
  validator). Fact matrix: `evidence/pasant-january/b001-fact-matrix.md`. Every fact below carries its page and a
  verbatim anchor; `__tests__/lib/pasantias/january-contract.test.ts` checks each against the snapshot, and checks
  the fact and decided sets (no missing, duplicate or unlisted entry) and every value and page against expectations
  pinned in the test from the source pages, not from this file. A ratified correction must change both. The page 15
  team range 1–10 (20 rows) is pinned the same way.
- Brent, 2026-10-08 (BD-00): "The brochure is the source of truth". The brochure's hash and page text stay as
  supplied. A recorded correction (BD-01) changes only the `decided` value; the brochure's original text stays in
  that entry's `brochure` and `anchor`, cited by page, as provenance.

## 2. Identities (routine implementation freeze, plan rev 1 architecture)

Cohort `enero-2027`; programs `inspira` (Pasantía INSPIRA) and `mirada-profunda` (INSPIRA Mirada Profunda). These IDs
are an ordinary implementation choice frozen by B001 (DEC-06), not a business decision. Both programs travel together.

## 3–5. Facts (machine-readable)

`facts` are public, client-safe facts. `decided` are the fields that were pending in B001b, now answered by Brent:
`value` is the answer, `brochure` the original text, `evidence`/`at` the decision row and message time (UTC) in
`b001-brent-decisions.md`, `basis` whether Brent's words name the topic (`explicit`) or only the question order links
them (`interpreted`). `pending` lists fields still awaiting an answer (none). `commercial` is brochure-only (§6).
A `value` that is a list repeats brochure items verbatim; dates are ISO, ranges `start/end`.

```json
{
  "status": "CANDIDATE — NOT RATIFIED — NOT ACTIVE",
  "source": { "sha256": "84d83e153ee794a95d7a9e019359fc637237842ae0a7128f98cae332ff4efdb5", "pages": 17, "version": "2027-01-V1" },
  "ids": { "cohort": "enero-2027", "programs": ["inspira", "mirada-profunda"] },
  "facts": [
    { "program": "cohort", "field": "label", "value": "Cohorte Enero 2027", "page": 1, "anchor": "COHORTE ENERO 2027" },
    { "program": "cohort", "field": "span", "value": "2027-01-18/2027-01-29", "page": 1, "anchor": "Enero, 18 al 29 · 2027" },
    { "program": "cohort", "field": "city", "value": "Barcelona", "page": 2, "anchor": "Ciudad Barcelona" },
    { "program": "cohort", "field": "together", "value": "both programs travel together", "page": 3, "anchor": "Todos viajan juntos a Barcelona" },
    { "program": "cohort", "field": "routing", "value": ["Pasantía INSPIRA", "Mirada Profunda"], "page": 17, "anchor": "¿Primera vez? Pasantía INSPIRA. ¿Ya viajaste? Mirada Profunda." },
    { "program": "cohort", "field": "places", "value": "confirmed in booking order", "page": 17, "anchor": "Los cupos de la cohorte de enero se confirman por orden de reserva." },
    { "program": "cohort", "field": "contact", "value": ["+56 9 4162 3577", "info@nuevaeducacion.org"], "page": 17, "anchor": "WHATSAPP +56 9 4162 3577" },
    { "program": "inspira", "field": "name", "value": "Pasantía INSPIRA", "page": 3, "anchor": "PASANTÍA INSPIRA VER PARA" },
    { "program": "inspira", "field": "audience", "value": "Equipos que viajan por primera vez", "page": 3, "anchor": "Equipos que viajan por primera vez" },
    { "program": "inspira", "field": "dates", "value": "2027-01-18/2027-01-28", "page": 3, "anchor": "18 al 28 de enero · 9 días en escuelas" },
    { "program": "inspira", "field": "schoolDays", "value": 9, "page": 5, "anchor": "nueve días en escuelas, dos días libres" },
    { "program": "inspira", "field": "schoolCount", "value": 6, "page": 3, "anchor": "6 escuelas: una semana de inmersión en dos escuelas y una semana de visitas a cuatro" },
    { "program": "inspira", "field": "week1", "value": "2027-01-18/2027-01-22 immersion", "page": 4, "anchor": "SEMANA 1 · LUN 18 — VIE 22 ENE INMERSIÓN" },
    { "program": "inspira", "field": "immersionSchools", "value": ["Escola Virolai", "Escola Sadako"], "page": 5, "anchor": "Cada pasante vive 2,5 días en Escola Virolai y 2,5 días en Escola Sadako." },
    { "program": "inspira", "field": "freeDays", "value": "2027-01-23/2027-01-24", "page": 4, "anchor": "un fin de semana libre · sábado 23 y domingo 24" },
    { "program": "inspira", "field": "week2", "value": "2027-01-25/2027-01-28 visits, one school per day", "page": 4, "anchor": "SEMANA 2 · LUN 25 — JUE 28 ENE VISITAS Una escuela por día" },
    { "program": "inspira", "field": "visitCount", "value": 4, "page": 4, "anchor": "Cada cohorte visita cuatro de estas cinco escuelas." },
    { "program": "inspira", "field": "visitCandidates", "value": ["Institut Escola El Puig", "Escola La Maquinista", "Escola Octavio Paz", "Institut Angeleta Ferrer", "Institut Escola Les Vinyes"], "page": 4, "anchor": "cuatro visitas que se eligen entre estos cinco proyectos" },
    { "program": "inspira", "field": "visitSelection", "value": "conditional: chosen with the group by interests and each school's availability", "page": 4, "anchor": "La selección y el orden se definen con el grupo, según sus intereses y la disponibilidad de cada escuela." },
    { "program": "inspira", "field": "fullDayOutside", "value": ["Institut Escola El Puig", "Institut Escola Les Vinyes"], "page": 5, "anchor": "están fuera de Barcelona y toman el día completo" },
    { "program": "inspira", "field": "lunches", "value": "week 1 only (Virolai, Sadako)", "page": 16, "anchor": "Almuerzos: en la Pasantía INSPIRA, durante la primera semana (Escola Virolai y Escola Sadako)." },
    { "program": "inspira", "field": "takeaway", "value": "Inspiración y un mapa de lo posible", "page": 3, "anchor": "Inspiración y un mapa de lo posible" },
    { "program": "mirada-profunda", "field": "name", "value": "INSPIRA Mirada Profunda", "page": 3, "anchor": "INSPIRA MIRADA PROFUNDA COMPRENDER PARA" },
    { "program": "mirada-profunda", "field": "audience", "value": "Quienes ya viajaron con INSPIRA", "page": 3, "anchor": "Quienes ya viajaron con INSPIRA" },
    { "program": "mirada-profunda", "field": "dates", "value": "2027-01-18/2027-01-29", "page": 3, "anchor": "18 al 29 de enero · 10 días en escuelas" },
    { "program": "mirada-profunda", "field": "schoolDays", "value": 10, "page": 6, "anchor": "Son diez días, cinco escuelas y dos días completos en cada una." },
    { "program": "mirada-profunda", "field": "schoolCount", "value": 5, "page": 3, "anchor": "5 escuelas, dos días completos en cada una" },
    { "program": "mirada-profunda", "field": "week1", "value": "2027-01-18/2027-01-22 five school days", "page": 7, "anchor": "Lunes 18 a viernes 22 de enero · cinco jornadas en escuelas" },
    { "program": "mirada-profunda", "field": "freeDays", "value": "2027-01-23/2027-01-24", "page": 7, "anchor": "Sábado 23 y domingo 24 de enero" },
    { "program": "mirada-profunda", "field": "week2", "value": "2027-01-25/2027-01-29 five school days", "page": 7, "anchor": "Lunes 25 a viernes 29 de enero · cinco jornadas en escuelas" },
    { "program": "mirada-profunda", "field": "schools", "value": ["Escola Virolai", "Escola Sadako", "Institut Angeleta Ferrer", "Institut Escola El Puig", "Institut Escola Les Vinyes"], "page": 7, "anchor": "LAS CINCO ESCUELAS 2 DÍAS Escola Virolai 2 DÍAS Escola Sadako 2 DÍAS Institut Angeleta Ferrer" },
    { "program": "mirada-profunda", "field": "orderCaveat", "value": "order confirmed per school, may change; one may split across Fri 22 / Mon 25", "page": 7, "anchor": "El orden de las escuelas se confirma con cada una según su disponibilidad y puede cambiar. Una de ellas puede repartir sus dos días entre el viernes 22 y el lunes 25." },
    { "program": "mirada-profunda", "field": "preparation", "value": "a real school challenge defined with FNE before travel", "page": 6, "anchor": "Cada participante define, con el equipo FNE, un desafío real de su colegio." },
    { "program": "mirada-profunda", "field": "closing", "value": "2027-01-29 roadmap presentation", "page": 6, "anchor": "El viernes 29 cada participante presenta qué va a mover en marzo y cómo." },
    { "program": "mirada-profunda", "field": "followUp", "value": "April online session", "page": 6, "anchor": "En abril, una sesión online para revisar qué se implementó y ajustar el rumbo." },
    { "program": "mirada-profunda", "field": "lunches", "value": "every programme day", "page": 16, "anchor": "En Mirada Profunda, todos los días del programa." },
    { "program": "mirada-profunda", "field": "includes", "value": ["acompañamiento para definir tu pregunta antes del viaje", "sesión online de seguimiento en abril"], "page": 16, "anchor": "Mirada Profunda: acompañamiento para definir tu pregunta antes del viaje y sesión online de seguimiento en abril." },
    { "program": "mirada-profunda", "field": "takeaway", "value": "Cómo se hace por dentro, y una hoja de ruta para marzo", "page": 3, "anchor": "Cómo se hace por dentro, y una hoja de ruta para marzo" },
    { "program": "both", "field": "dayStructure", "value": ["Presentación del proyecto educativo y entrevista con la dirección", "Visita guiada, entrevistas con estudiantes y educadores", "Talleres con expertos del movimiento de Nueva Educación"], "page": 8, "anchor": "Las jornadas se ordenan siempre igual en las escuelas que nos reciben" },
    { "program": "both", "field": "includes", "value": ["El pago de las visitas a las escuelas.", "Los talleres de la tarde con especialistas.", "Los honorarios de la dirección del programa, los relatores y el equipo de facilitadores de FNE que acompañan a los pasantes.", "Bibliografía básica recomendada para preparar el viaje, una bitácora y un sistema de registro de los aprendizajes, presentado al menos un mes antes del viaje.", "Desayuno a media mañana en las escuelas."], "page": 16, "anchor": "EL PROGRAMA INCLUYE Todo esto, cubierto" },
    { "program": "both", "field": "excludes", "value": ["Traslados colegio – aeropuerto de Santiago – colegio", "Traslados en Barcelona, incluido el transporte a El Puig y Les Vinyes", "Cenas", "Almuerzos de la segunda semana (solo en la Pasantía INSPIRA)", "Seguros", "Pasajes y alojamiento, salvo que los coordines a través de FNE"], "page": 16, "anchor": "NO INCLUYE Lo que corre por tu cuenta" }
  ],
  "decided": [
    { "id": "P-01", "decision": "DEC-01", "field": "inspira.host.sadako", "value": "Jordi Musons", "brochure": "Jordi Mussons", "page": 12, "anchor": "Jordi Mussons DIRECTOR, ESCOLA SADAKO · ANFITRIÓN", "evidence": "BD-01", "at": "2026-10-09T00:39:14.785Z", "basis": "explicit" },
    { "id": "P-02", "decision": "DEC-02", "field": "cohort.claim.rpa", "value": "Fundación Nueva Educación es Agencia Técnica Educativa certificada por RPA Mineduc.", "brochure": "Fundación Nueva Educación es Agencia Técnica Educativa certificada por RPA Mineduc.", "page": 2, "anchor": "Fundación Nueva Educación es Agencia Técnica Educativa certificada por RPA Mineduc.", "evidence": "BD-04", "at": "2026-10-09T00:39:14.785Z", "basis": "interpreted" },
    { "id": "P-03", "decision": "DEC-08", "field": "cohort.claim.trackRecord", "value": ["400+ Pasantes han viajado con FNE", "40+ Colegios participantes", "12 Escuelas catalanas en la red"], "brochure": "400+ Pasantes han viajado con FNE 40+ Colegios participantes 12 Escuelas catalanas en la red", "page": 2, "anchor": "400+ Pasantes han viajado con FNE 40+ Colegios participantes 12 Escuelas catalanas en la red", "evidence": "BD-02", "at": "2026-10-09T00:39:14.785Z", "basis": "explicit" },
    { "id": "P-04", "decision": "DEC-03", "field": "inspira.visits.presentation", "value": "4 visits, chosen with the group from the five candidates ('cuatro de estas cinco'); never a fixed list of four", "brochure": "En la Pasantía INSPIRA, las cuatro escuelas de la segunda semana se definen con el grupo", "page": 9, "anchor": "En la Pasantía INSPIRA, las cuatro escuelas de la segunda semana se definen con el grupo", "evidence": "BD-03", "at": "2026-10-09T00:39:14.785Z", "basis": "explicit" }
  ],
  "pending": [],
  "commercial": {
    "exposure": "brochure-only",
    "discountCondition": "COLEGIOS CON PROGRAMA ANUAL DE ASESORÍA FNE",
    "programs": {
      "inspira": { "feeClp": 2500000, "discountedFeeClp": 2000000, "nights": 12, "returnDate": "2027-01-29", "perPersonClp": { "standard": [4700000, 5000000], "discounted": [4200000, 4500000] } },
      "mirada-profunda": { "feeClp": 2500000, "discountedFeeClp": 2000000, "nights": 13, "returnDate": "2027-01-30", "perPersonClp": { "standard": [4700000, 5100000], "discounted": [4200000, 4600000] } }
    },
    "arrivalDate": "2027-01-17",
    "lodgingEur": { "doublePerPersonPerNight": [50, 75], "singlePerNightApprox": 100 },
    "flightClpApprox": 1500000,
    "eurClp": 1100,
    "totalsRoundedToClp": 100000,
    "teamSizes": [1, 10],
    "payment": "50% al reservar y el 50% restante la semana antes del inicio de la pasantía",
    "places": "Se confirman por orden de reserva."
  }
}
```

Observations kept for ratification (no claim added): page 9 "Siete proyectos" counts the seven distinct schools
across both programs (INSPIRA visits six of them, Mirada Profunda five) and is consistent with the facts above.
Per-person totals equal programme fee + flight + nights × lodging × €1 = $1.100, rounded to the nearest $100.000;
that rounding is observed arithmetic, not a brochure statement. Page 15 team rows are the page 14 per-person values
times team size 1–10 (the brochure says so on page 15).

## 6. Retained decisions and exclusions (unchanged by this candidate)

- **Retained** October legal and consent decisions, unless a later dated amendment says otherwise: D-01 exposure split
  (client-safe public module, server-only commercial module, post-build leak guard), D-02 price boundary, D-03 lead
  transitions, D-04 access/write posture, D-11 FNE-global adult-professional tenancy, D-12 split consent evidence,
  A-10 legal identity, A-13 privacy notice version, A-14 processing-consent and A-15 marketing opt-in sentences.
- **Commercial facts stay commercial**: every `commercial` value is brochure-only — never in client bundles, pages,
  the price-free ficha, transactional email or client fixtures. The price-leak corpus must gain all CLP/EUR values and
  keep every retired amount (B003).
- **Excluded**: Correos (contacts, imports, composer, campaigns, sending, unsubscribe, metrics) — its unfinished backlog
  is preserved, not cancelled. October 2026 facts are historical and are not carried forward by default.
- **No unverified mail claims**: success copy confirms registration and gives direct information access; it must not
  promise that an email was sent or will arrive until A2-11/A2-12 delivery evidence exists (DEC-07, C007).
- **Historical A9 stays historical**: January acceptance does not close A9; A2-9 PASS, A2-11 FAIL, A2-12 FAIL and
  A2-13 BLOCKED are preserved by row ID (register R-16).

## 7. Packaging and publication

Packaging (plan default DEC-04): one price-free two-program ficha, generated, plus the supplied designed two-program
brochure. Publication mode (DEC-05) is **designed upload** — Brent, 2026-10-08 (BD-05): "it should publish my design".
The designed file still spells the host "Mussons" (BD-01 corrects it to "Musons"), so publishing it is a Brent-owned
release step, not a local development blocker: Brent supplies the corrected designed file; Brent approves the final
file hash and the exact new-version object key, uploads the object before the deployment that changes
BROCHURE_VERSION, and verifies it; cache writes stay create-only and nothing relies on overwriting a generated first-request object.
Local fallback: the generated brochure remains the data-faithful canary.
An unresolved D-05 gate blocks only the release that changes BROCHURE_VERSION.

## 8. Sign-off candidate (for Brent's Decide question — not an approval)

Whole-contract approval: **NOT GIVEN** (BD-07). The PM puts this question to Brent with this file attached at a
committed SHA and its SHA-256: "Ratify the January 2027 contract: brochure 2027-01-V1 facts (§3–5), your answers
BD-00 to BD-05 (`decided`, §7), retained decisions (§6)." The question states that BD-04 is interpreted: "Confirm it"
does not name the RPA claim.

Remaining prerequisites (register): R-11 whole-contract ratification (Brent); R-08 corrected designed file, hash,
object key and upload before the BROCHURE_VERSION deployment (Brent-owned release); R-17 production mail state
(Brent-owned release). After ratification only: the C003 PLAN.md amendment and the oracle switch (B001).
