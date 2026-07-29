/**
 * Transcript sanitizer — REQUIRED (Node) layer.
 *
 * Plan reference: zoom-integration-plan.md §12. This is the deterministic pass
 * that must run before any transcript text can reach an LLM prompt. Every
 * detected person name that is NOT in the meeting's attendee list is replaced
 * with a stable neutral token (`[persona 1]`); attendee names survive, because
 * the minuta needs to say who proposed what.
 *
 * Design constraints, all deliberate:
 *
 *  - **Pure.** No DB, no I/O, no clock, no randomness. Same inputs always
 *    produce the same output, which is what makes `sanitizerVersion` meaningful
 *    as a re-run trigger.
 *  - **Zero dependencies.** The required layer has to work wherever the job
 *    runs; a Spanish NER model is the OPTIONAL recall layer that lives behind a
 *    separate service (scripts/spikes/ner/), never a hard requirement of this
 *    module.
 *  - **Uncertain resolves toward redaction.** A name-shaped token that might be
 *    an ordinary word is redacted, not passed through. Over-redaction costs
 *    minuta quality; under-redaction leaks a minor's identity into a third-party
 *    model, so the asymmetry is not close.
 *
 * **Preservation rule (v1.2) — segment classification.** A detected span is a
 * surface, not a person: `buildSpans` bridges name tokens across connectors and
 * across whatever punctuation sits between adjacent name tokens, so "Camila
 * Fuentes y Rodrigo Pérez" (two attendees), "el alumno Matías y Tomás" and
 * "Martina Rojas, Benjamín Soto" (two students each) all arrive as ONE span. A
 * span is therefore classified as a sequence of SEGMENTS — the runs of
 * significant tokens between its internal connectors AND its internal gap
 * punctuation — and a segment is one person-reference.
 *
 * Writing `S` for the span's significant tokens (connectors dropped) and `E_i`
 * for the roster entries, each with its own token set:
 *
 *  1. **Whole span, single entry.** `|S| ≥ 2` and ONE entry accounts for all of
 *     `S` — exact name, or the same tokens reordered, or `S` a subset of that
 *     entry's tokens — preserves the span whole. This is what keeps "Camila
 *     Fuentes" against a roster "Camila Andrea Fuentes", the inverted "Fuentes,
 *     Camila", and names carrying internal connectors readable.
 *     Step 1 runs BEFORE any splitting, which is what keeps the inverted
 *     attendee "Fuentes, Camila" whole: it matches the roster on sorted keys,
 *     and the comma inside it never gets the chance to carve it in two.
 *  2. **Otherwise segment by segment**, each judged on its own:
 *       `|seg| ≥ 2` → preserved iff ONE entry accounts for all of it;
 *       `|seg| = 1` → preserved iff the token is a roster token AND no span this
 *                     transcript redacted contains it (a bare "Camila" is the
 *                     attendee, unless a "Camila Pérez" was redacted here, which
 *                     makes the reference ambiguous and the §12 asymmetry
 *                     resolves ambiguity to redaction).
 *     Segments act independently: passing segments survive, failing segments are
 *     redacted, and the connector or punctuation text between them is emitted
 *     verbatim — "Camila Fuentes y [persona 1]" and "[persona 1], [persona 2]"
 *     are both legal outputs. What is never partial is the action INSIDE a
 *     segment: a half-redacted name still names.
 *  3. **One `[persona N]` per redacted segment**, keyed by token, so two students
 *     joined by "y" get two numbers and a repeat mention reuses its own.
 *     `personCount` / `redactionCount` / the §6 density metric all count per
 *     segment — an undercount here understates the flag threshold.
 *
 * Coverage is per-entry, never the union of the roster: with "Camila Fuentes"
 * AND "Rodrigo Pérez" in the meeting, the distinct student "Camila Pérez" is one
 * segment that no single entry explains, so it is redacted whole even though
 * both of its tokens exist somewhere on the roster.
 *
 * **Segment boundaries (v1.3).** A segment ends at a connector token, and also
 * at an inter-token gap carrying `,` `;` or `.` — the punctuation that separates
 * people in "Martina Rojas, Benjamín Soto" and across the sentence break in
 * "…Martina Rojas. Benjamín Soto llegó…", both of which `buildSpans` merges into
 * one span. The single exception is a period belonging to a known abbreviation:
 * "Sra. Elena" is one person and must not split. Whole-span coverage (step 1)
 * runs first and is untouched by this, so inverted roster names survive.
 *
 * **Accepted over-redaction.** An attendee's own extended name still goes: with
 * a roster entry of "Camila Fuentes", the surface "Camila Fuentes Soto" has no
 * internal connector, so it is a single three-token segment carrying "soto",
 * which no entry explains. The cost is a `[persona N]` where a facilitator's
 * name would read better; the fix is roster hygiene (store the name the
 * transcript will actually contain), not a looser rule.
 *
 * **Trigger-adjacent candidates must be name-plausible (v1.3 → generalized in
 * v1.4).** A trigger marks what sits beside it, but only where that token could
 * be a name:
 *
 *  - CAPITALIZED → `high`. Trigger context legitimately disambiguates a
 *    collision name, so "la alumna Rosa" stays high. Two exceptions: a
 *    sentence-initial ordinary word, and an `ORG_HEADS` token.
 *  - lowercase → `uncertain`, and only when nothing says the token is an
 *    ordinary word: not in `COMMON_WORDS`, not school/course/organization
 *    vocabulary, and carrying none of the Spanish morphology in
 *    `NON_NAME_ENDINGS`. This is the branch that survives Whisper lowercasing a
 *    name ("el alumno benjamín", "la profe marcela"); without the filter it also
 *    marked the verb in "los alumnos **trabajaron** bien" and "La profesora
 *    **terminaba** explicando", which corrupts the minuta input and inflates
 *    `personCount` → density → spurious `flagged` states (§6).
 *
 * The filter is morphology, not a dictionary: an open-class word whose shape is
 * indistinguishable from a name ("la alumna **tranquila**", "los alumnos
 * **nuevos**") still resolves to `uncertain` → redacted, which is the §12
 * asymmetry working as intended. It costs minuta wording, never a leak.
 *
 * ------------------------------------------------------------------------
 *
 * **MARKING-PATH AUDIT (v1.4).** The defect above was never one layer's bug: it
 * is a CLASS — *a marking path fires on a trigger-adjacent token without gap
 * discipline or name plausibility* — and v1.3 closed only the role-pattern
 * instance. v1.4 closes the class with three uniform guards, and the table below
 * is the closure argument: every path that can put evidence on a token, and what
 * bounds it. A new marking path is not finished until it has a row here.
 *
 * | # | Path | Fires on | Bounded by |
 * |---|------|----------|------------|
 * | 1 | honorific (i−1)      | `HONORIFICS` | **G1** · **G2** · **G4** |
 * | 2 | role-pattern (i−1)   | `ROLE_NOUNS` | **G1** · **G2** · **G4** (which subsumes the old ad-hoc "not itself a role noun" test) |
 * | 3 | role-pattern (i−2)   | `ROLE_NOUNS` | **G1** (both gaps) · **G2** · **G4** · intervening token must be a connector or `llamado`/`llamada` |
 * | 4 | course-pattern (i−1) | `looksLikeCourse` | **G1** · **G2** · **G4** · **G4′** (`NON_PERSON_PROPER`, course sites only) · candidate must be capitalized |
 * | 5 | course-pattern (i−2) | `looksLikeCourse` | **G1** (both gaps) · **G2** · **G4** · **G4′** · candidate must be capitalized |
 * | 6 | capitalization       | no trigger — the token's own shape | sentence-initial skip · `NON_PERSON_PROPER` veto · `ORG_HEADS` lookbehind at i−1 and i−2 · **G4** · `COMMON_WORDS` downgrades to `uncertain` |
 * | 7 | left-extension       | an already-marked token to its right | plain-space gap only · capitalized only · `COMMON_WORDS` / `NON_PERSON_PROPER` / `ORG_HEADS` · **G4** · **G3** |
 * | 8 | cross-reference      | the vocabulary built by paths 1–7 | creates no vocabulary of its own, so it inherits every guard above · a lowercase `COMMON_WORDS` token is never propagated · **G4**, because propagation is keyed on the ACCENT-STRIPPED norm and `Nina` would otherwise reach every `niña` |
 *
 *  - **G1 — gap discipline** (`patternGapBlocked`). Paths 1–5 may not reach
 *    across a sentence terminator `[.!?¡¿\n•·]`, unless the token before it is a
 *    known abbreviation — "Sra. Elena" is one construction, not two sentences.
 *    Commas and plain spaces stay legal inside a pattern, so "de 5°B, Martina"
 *    and "la estudiante, Martina" keep working. Without G1, "…los alumnos.
 *    **Entonces** conversamos" and "…de quinto básico. **Entonces** decidimos"
 *    both turned the next sentence's adverb into a person.
 *  - **G2 — name plausibility** (`nameCandidateEvidence`). ONE predicate, shared
 *    by paths 1–5, which is what makes the guarantee a property of the module
 *    rather than of whichever layer someone remembered to patch. Path 6 keeps
 *    its own, older rule: having no trigger to license anything, it vetoes
 *    `NON_PERSON_PROPER` outright — which a trigger layer must NOT do, because
 *    that set holds real given names (`julio`, `abril`, `santiago`).
 *  - **G3 — left-extension veto** (`carriesNonNameEnding` on path 7). A
 *    capitalized verb opening a sentence is not part of the name beside it:
 *    "**Quedaron** Martina Rojas y Benjamín Soto" used to produce the span
 *    `Quedaron Martina Rojas`. `COMMON_WORDS` cannot carry this — Spanish
 *    sentence openers are an open class — so the guard is morphology instead.
 *  - **G4 — trigger-token candidacy veto** (`isStructuralLexiconToken`, v1.5).
 *    A token belonging to the module's own trigger/structural vocabulary —
 *    `HONORIFICS` ∪ `ROLE_NOUNS` ∪ `COURSE_WORDS` ∪ `ABBREVIATIONS` — is never
 *    name material, on ANY path. See the class statement below. **G4′** is the
 *    course-site-only extension of it to `NON_PERSON_PROPER`.
 *
 * ------------------------------------------------------------------------
 *
 * **LEXICON-CANDIDACY CLOSURE (v1.5).** v1.4 bounded *where a trigger may
 * reach*. It never asked the complementary question — *may the trigger token
 * itself be marked?* — and the answer was yes on three paths at once. The
 * capitalization layer had no skip for `HONORIFICS`, `ROLE_NOUNS`,
 * `COURSE_WORDS` or `ABBREVIATIONS`, so a title-case "Sra", "Profesora",
 * "Alumna", "Quinto" or "Dr" self-marked; left-extension had no break for them,
 * so a sentence-initial "Doña" was absorbed into the name beside it; and the
 * shared pattern predicate licensed any capitalized candidate, so a title
 * following a title ("Profesor **Jefe**") was marked too.
 *
 * The consequence was not merely cosmetic. A title fused into a person span
 * makes the span fail roster coverage, so the WORST victims were attendees:
 *
 *     roster ["Elena Vidal"]   "La Sra. Elena presentó…"  →  "La [persona 1] presentó…"
 *     roster ["Marcela Soto"]  "La Profesora Marcela…"    →  "La [persona 1]…"
 *     roster ["Carmen Ruiz"]   "Doña Carmen firmó…"       →  "[persona 1] firmó…"
 *
 * — §12's "attendee names are preserved" breaking in the most common es-CL
 * registers, invisible to a recall-scored suite because the mention WAS
 * redacted. Two further instances had nothing to do with people at all: "Quinto
 * Básico" and "quinto básico Lenguaje" became `[persona N]`.
 *
 * v1.5 closes the class with G4/G4′ and states, per lexicon, its relationship
 * to name candidacy. A new lexicon is not finished until it has a row here.
 *
 * | Lexicon | Candidacy | Why |
 * |---------|-----------|-----|
 * | `HONORIFICS`     | **never** (G4) | A title is not the name that follows a title. `jefe`/`jefa` joined in v1.5 and are vetoed as candidates while acting as triggers. |
 * | `ROLE_NOUNS`     | **never** (G4) | Carve-out: `nina`, see `LEXICON_NAME_COLLISIONS`. |
 * | `COURSE_WORDS`   | **never** (G4) | A course is not a person, however it is capitalized. |
 * | `ABBREVIATIONS`  | **never** (G4) | `dr`/`dra`/`prof`/`ing`/`lic` fused exactly like `sra`; they are not triggers, so the veto costs no recall. |
 * | `ORG_HEADS`      | **never** | Predates v1.5: vetoed independently by paths 6, 7 and G2 (both branches). |
 * | `NON_PERSON_PROPER` | **reachable via role/honorific patterns only** | Vetoed by paths 6 and 7, by G2's lowercase branch, and by G4′ at course sites — but NOT at role/honorific sites, because the set holds `julio`, `abril`, `santiago`, `concepcion`. "el alumno Julio" is a catch; "de 5°B, Julio" is the accepted narrow miss that buys it. |
 * | `COMMON_WORDS`   | **downgrade** | Capitalized → `uncertain` (still redacted) on path 6; dismissed outright on G2's lowercase branch and on path 7. Never a hard veto, because it holds the collision names (`rosa`, `sol`, `milagros`) the module exists to catch. |
 * | `NAME_CONNECTORS` | **bridging only** | Never carries evidence and never forms a segment; a span of nothing but connectors emits nothing. |
 * | `STUDENT_REFERENCE_WORDS` | **never** (inherited) | A subset of `ROLE_NOUNS` ∪ {`curso`}, and `curso` ∈ `NON_PERSON_PROPER`. Feeds the §6 density metric only. |
 * | `NON_NAME_ENDINGS` | n/a | Suffixes, not tokens. Read by G2's lowercase branch and by G3. |
 *
 * **Titles now survive redaction.** The non-attendee case emits "La Sra.
 * [persona 1] reclamó…" instead of swallowing the title — strictly better
 * minuta text, and the property every fixture in this family asserts. The
 * `ABBREVIATIONS` exception in `gapTerminates` changes role accordingly: it no
 * longer holds "Sra. Elena" together as one SPAN (there is no `Sra` in the span
 * any more), it lets the honorific TRIGGER reach across its own period.
 *
 * ------------------------------------------------------------------------
 *
 * **Documented residuals.** R1 and R2 are roster-identity limits, neither a
 * detection gap. R4 and R5 are the priced costs of G4/G4′, both new in v1.5.
 * (v1.2's R3 — punctuation-joined people sharing one segment — is CLOSED by the
 * gap-punctuation split above; what replaces it is an accepted counting
 * artifact, noted after them.)
 *
 *  - **R1 exact-name collision.** A student genuinely called "Camila Fuentes"
 *    while an attendee of that name exists is textually indistinguishable from
 *    the attendee, and is preserved. Irreducible without discourse identity.
 *    Same limit, inverted surface: "Rojas, Camila" now splits into an unknown
 *    "Rojas" and a bare "Camila", and the bare roster token resolves to the
 *    attendee unless something else in the transcript contaminates it.
 *  - **R2 entry-subset reference.** "Andrea Fuentes" against a roster "Camila
 *    Andrea Fuentes" is a subset of one entry, so it is preserved. Deliberate:
 *    partial references to attendees are routine, and tightening this breaks
 *    display-name variance for marginal gain.
 *  - **R4 course-only month-named student** (new in v1.5, the price of G4′). A
 *    student referred to ONLY through a course designation and carrying a name
 *    that is also in `NON_PERSON_PROPER` — "el caso de quinto básico, Julio" —
 *    is now a miss where v1.4 caught him. This is a real recall loss, not a
 *    pre-existing gap, and it is the deliberate price of not letting a course
 *    trigger mark "Básico" and the school subjects. Narrow (the name must be a
 *    month/place AND the reference must be course-only) and self-healing (one
 *    mention beside a role noun, an honorific, or anywhere capitalized
 *    mid-sentence redeems him through cross-reference). The reverse trade —
 *    vetoing `NON_PERSON_PROPER` at role sites too — costs "el alumno Julio",
 *    which is the far more common construction.
 *  - **R5 lexicon-token surname residue** (new in v1.5, the price of G4). A
 *    surname that is also a lexicon member — "Maestro" is the realistic one —
 *    can no longer be marked, so "El informe de Cristóbal Maestro" emits
 *    "[persona 1] Maestro". The given name still redacts; what survives is a
 *    lone surname. Under the §12 asymmetry that is the right side of the trade:
 *    the alternative is letting `Maestro` be name material again, which
 *    re-opens the whole class and destroys an attendee every time a title-case
 *    title appears. Note this is a MISS of one token, not a partial redaction
 *    of a span — the surname was never inside the redacted segment, so the
 *    "never act partially inside a segment" contract is untouched.
 *
 * **Accepted counting artifact — inverted unknown overcount** (replaces v1.2's
 * R3). An unknown person written surname-first, "Rojas, Benjamín", is split by
 * the comma into two segments and counted as TWO people. Both are redacted, so
 * nothing leaks; the cost is one extra person in `personCount` and therefore a
 * slightly higher §6 density — an overcount, the safe direction for a metric
 * whose job is to decide whether a human should look. The undercount it
 * replaces (a comma-joined list of THREE students reported as one person) was
 * the unsafe direction on the same metric.
 *
 * Not wired into any production path yet — Z5 does that. Tests only.
 */

/**
 * Bump on any change to detection behaviour. Stored alongside a transcript so a
 * newer sanitizer can be detected and re-run (§6 state machine).
 */
export const SANITIZER_VERSION = 'node-1.5.0';

/** Default student-reference density (per 100 words) above which a transcript is flagged. */
export const DEFAULT_FLAG_DENSITY_THRESHOLD = 2.0;

export type DetectionLayer =
  | 'honorific'
  | 'role-pattern'
  | 'course-pattern'
  | 'capitalization'
  | 'cross-reference';

export type DetectionConfidence = 'high' | 'uncertain';

export type Detection = {
  /** Exact surface text matched in the raw transcript. */
  surface: string;
  /** Character offsets into the raw transcript. */
  start: number;
  end: number;
  /** Which layer produced the strongest evidence for this span. */
  layer: DetectionLayer;
  confidence: DetectionConfidence;
  action: 'redacted' | 'preserved';
  /** Replacement emitted into `sanitizedText`. Absent when preserved. */
  token?: string;
};

export type SanitizeOptions = {
  /**
   * Student references per 100 words above which the transcript is `flagged`
   * instead of `sanitized`. `flagged` blocks minuta generation until a human
   * reviews it (§6).
   */
  flagDensityThreshold?: number;
};

export type SanitizeMetrics = {
  wordCount: number;
  /** Distinct non-attendee people replaced. */
  personCount: number;
  /** Total redacted mentions (a person named five times counts five). */
  redactionCount: number;
  /** Redacted mentions + explicit student-role keyword occurrences. */
  studentReferenceCount: number;
  /** studentReferenceCount per 100 words. */
  density: number;
};

export type SanitizeResult = {
  sanitizedText: string;
  status: 'sanitized' | 'flagged';
  detections: Detection[];
  sanitizerVersion: string;
  /** Human-readable reasons; empty when status is 'sanitized'. */
  flagReasons: string[];
  metrics: SanitizeMetrics;
};

/* ------------------------------------------------------------------ lexicons */

/**
 * High-frequency Spanish words. Two readers, and the second one is why this set
 * grew in v1.4:
 *
 *  - the CAPITALIZED path, where an ordinary word capitalized mid-sentence is
 *    ambiguous ("Rosa"), not automatically innocent, so membership here
 *    downgrades a detection to `uncertain` rather than dismissing it;
 *  - G2's lowercase branch, where membership dismisses outright. Once the
 *    honorific layer was routed through G2 (v1.4), the words that had to be
 *    dismissed were the SHORT preterites an honorific-headed sentence puts right
 *    after its subject — and `NON_NAME_ENDINGS` cannot reach them, because they
 *    sit under the length-5 floor that exists to protect "juan" and "ivan".
 *
 * The v1.4 additions are marked below. Every one is a verb form or a role noun
 * with no es-CL given-name collision, so dismissing it costs no recall. The list
 * is NOT claimed to be complete: an unlisted short verb after an honorific still
 * resolves to `uncertain` and redacts, which is over-redaction in the §12-safe
 * direction. What closes the defect class is G1/G2/G3, not this lexicon.
 *
 * v1.5 adds `tecnica`/`tecnico`, and they are cost containment for V4 rather
 * than a defect fix: promoting `jefe`/`jefa` to `HONORIFICS` makes them triggers,
 * and the very next word in the es-CL role title "la jefa técnica" is an
 * adjective that no other filter reaches, so V4 would have introduced the
 * over-redaction "la jefa [persona 1]". Neither form is a given name, so the
 * containment costs nothing. The general residue stands: an unlisted adjective
 * after a newly promoted trigger over-redacts, in the safe direction.
 */
const COMMON_WORDS = new Set<string>(
  `a al algo alguna algunas alguno algunos ahora ante antes aqui aquel aquella aquello asi aun aunque
   bien bueno buena buenos buenas
   cada casi como con contra cosa cosas cuando cuanto cual cuales
   de del desde donde dos durante
   el ella ellas ello ellos en entre era eran eres es esa esas ese eso esos esta estaba estan estar estas este esto estos estoy
   fue fueron
   ha hace hacer hacia han hasta hay he hoy
   igual incluso ir
   la las le les lo los luego
   mas mal manera mano mas mayor mejor menos mes mi mientras mismo mucha muchas mucho muchos muy
   nada ni ninguna ninguno no nos nosotros nueva nuevo nunca
   o otra otras otro otros
   para pero poco por porque primera primero pronto pue pues puede pueden
   que quien quienes quiza
   se segun ser si siempre sin sino sobre solo son su sus
   tal tambien tampoco tan tanto te tenemos tener tengo tiene tienen todo toda todas todos tras
   un una unas uno unos usted ustedes
   va vamos van varias varios veces ver vez viene
   y ya yo
   ahi alla alli entonces despues ademas pero tambien claro cierto efectivamente exacto perfecto listo
   gracias hola buenos buenas dias tarde tardes noche noches
   ayer manana anoche siempre nunca quizas ojala respecto sobre finalmente primero segundo tercero
   ahora bueno igualmente asimismo mientras tanto luego entretanto ok okey vale dale ya
   rosa angel angeles consuelo pilar mercedes milagros sol luz cruz paz nieves dolores esperanza olivia
   alba aurora estrella flor perla violeta jazmin azucena rocio amparo remedios socorro
   salvador jesus leon lucero prado ribera vega paloma
   dijo hizo vino quiso propuso jefe
   tecnica tecnico`
    .split(/\s+/)
    .filter(Boolean)
);

/**
 * Capitalized tokens that are proper nouns but never a person in this domain:
 * school subjects, structural vocabulary, institutions, products, places.
 * Membership here dismisses the token outright.
 */
const NON_PERSON_PROPER = new Set<string>(
  `matematica matematicas lenguaje comunicacion ciencias ciencia historia geografia ingles idioma
   educacion fisica quimica biologia artes arte musica tecnologia religion filosofia orientacion
   colegio escuela liceo jardin kinder prekinder basica basico media medio ensenanza
   curso cursos nivel niveles ciclo ciclos generacion generaciones comunidad comunidades
   direccion rectoria directiva coordinacion utp pie sep pme dua mineduc simce paes
   convivencia inclusion plan planes programa programas proyecto proyectos
   informe informes acta actas minuta minutas sesion sesiones reunion reuniones taller talleres
   objetivo objetivos meta metas acuerdo acuerdos tarea tareas compromiso compromisos
   evaluacion evaluaciones rubrica rubricas pauta pautas protocolo protocolos diagnostico
   cobertura curriculum curricular practica practicas retroalimentacion acompanamiento
   fundacion corporacion universidad instituto centro ministerio municipalidad
   chile santiago valparaiso concepcion antofagasta temuco region comuna provincia
   genera zoom google meet drive classroom excel word powerpoint whatsapp teams outlook
   internet wifi pdf csv link enero febrero marzo abril mayo junio julio agosto septiembre
   octubre noviembre diciembre lunes martes miercoles jueves viernes sabado domingo`
    .split(/\s+/)
    .filter(Boolean)
);

/**
 * Head words that open an organization or place name: the capitalized run that
 * follows belongs to the institution, not to a person.
 * "Colegio San Mateo" must not yield a person called San Mateo.
 */
const ORG_HEADS = new Set<string>(
  `colegio escuela liceo jardin fundacion corporacion universidad instituto centro ministerio
   municipalidad region comuna provincia ciudad sector poblacion villa avenida calle
   red redes programa proyecto plan sala`
    .split(/\s+/)
    .filter(Boolean)
);

/**
 * Titles that mark the FOLLOWING token as a person name, whatever it looks like.
 *
 * `jefe`/`jefa` joined in v1.5 (V4). They stay in `COMMON_WORDS` as well — the
 * two memberships drive different mechanisms and neither replaces the other:
 * `COMMON_WORDS` dismisses a LOWERCASE candidate, membership here makes the
 * token a TRIGGER for what follows it. Together with the candidacy veto below
 * that gives both halves of "profesor jefe": "El Profesor Jefe mencionó…" stays
 * intact because `Jefe` can no longer be name material, and "el profesor jefe
 * marcelo…" catches `marcelo` because `jefe` now licenses the token after it.
 *
 * The entries carrying their own period (`don.`, `sr.`…) never match anything —
 * `tokenize` splits on `\p{L}` runs, so a token's `norm` never contains a dot.
 * Left in place as-is: removing them is a behaviour-free edit this round has no
 * reason to make, and `ABBREVIATIONS` is what actually handles the period.
 */
const HONORIFICS = new Set<string>(
  `don dona sr sra srta senor senora senorita profe profesor profesora
   tio tia miss mister maestro maestra educador educadora asistente
   jefe jefa
   don. sr. sra. srta.`
    .split(/\s+/)
    .filter(Boolean)
);

/** Nouns that mark a following (or nearby) capitalized token as a person name. */
const ROLE_NOUNS = new Set<string>(
  `alumno alumna alumnos alumnas estudiante estudiantes nino nina ninos ninas
   chico chica chicos chicas joven jovenes apoderado apoderada apoderados apoderadas
   pupilo pupila companero companera companeros companeras hermano hermana
   hijo hija madre padre mama papa tutor tutora`
    .split(/\s+/)
    .filter(Boolean)
);

/**
 * Everything the OPTIONAL NER layer must NOT be allowed to call a person.
 *
 * The Z0B spike found two things about Spanish NER on session transcripts:
 * it usually *detects* an ambiguous given name but mislabels it
 * (Florencia→LOC, Rosa→MISC, Balentina→ORG), so taking only PER entities
 * throws most of its value away; and once any label is accepted, it starts
 * emitting sentence-initial verbs ("Vamos", "Propongo") as MISC entities.
 *
 * So the composition is: NER proposes entities of any label; this set vetoes
 * institutions, places and school vocabulary; and the verb noise is filtered
 * with the POS tags spaCy already computes.
 *
 * COMMON_WORDS is deliberately NOT part of this set: it contains the very
 * collision names ("rosa", "sol", "milagros") the any-label variant exists to
 * recover, so vetoing with it would cancel the gain it is meant to protect.
 * Measurements in docs/planning/zoom-spike-results.md §4.
 */
export const NON_PERSON_TERMS: ReadonlySet<string> = new Set<string>([
  ...Array.from(NON_PERSON_PROPER),
  ...Array.from(ORG_HEADS),
]);

/**
 * A person name is at most this many tokens. Longer NER spans are clauses
 * ("La asistencia a las instancias de trabajo colaborativo"), not people.
 */
export const MAX_NAME_TOKENS = 6;

/** Explicit student vocabulary — feeds the density heuristic. */
const STUDENT_REFERENCE_WORDS = new Set<string>(
  `alumno alumna alumnos alumnas estudiante estudiantes nino nina ninos ninas
   apoderado apoderada apoderados apoderadas curso pupilo pupila`
    .split(/\s+/)
    .filter(Boolean)
);

/** Lowercase words allowed INSIDE a multi-token name ("María de los Ángeles"). */
const NAME_CONNECTORS = new Set<string>(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do']);

/** Abbreviations whose trailing period does not end a sentence. */
const ABBREVIATIONS = new Set<string>(['sr', 'sra', 'srta', 'dr', 'dra', 'prof', 'ing', 'lic']);

/**
 * Punctuation that ends a sentence. Read by `tokenize` (to mark sentence
 * starts) and by `gapTerminates` (G1, the pattern layers' gap discipline), so
 * both answer the "is there a sentence break here?" question the same way.
 */
const SENTENCE_TERMINATOR_RE = /[.!?¡¿\n•·]/;

/**
 * Spanish endings a person name does not carry. Read in two places, both of
 * them a marking guard: G2's lowercase branch (every pattern layer, v1.4 —
 * previously role-pattern only), where a capitalized candidate keeps its `high`
 * evidence whatever it ends in; and G3, the left-extension veto, where a
 * CAPITALIZED candidate is tested too, because a capitalized verb is exactly
 * what a sentence-opening extension absorbs ("**Quedaron** Martina Rojas").
 *
 * Matched against the **accent-preserving** lowercase surface, which is what
 * makes the set usable at all: Spanish spells the name/verb minimal pairs apart
 * on the accent. `necesitan` vs `Sebastián`, `tenían` vs `Antonia`, `hablaban`
 * vs `Esteban` — filter the unaccented ending and the accented names walk
 * through untouched. Where the transcription has already dropped the accent the
 * name falls into the filter and is missed; that is the same accent-loss gap the
 * adversarial suite tracks (docs/planning/zoom-spike-results.md §3.2), not a new
 * one.
 *
 * Two endings are in the set despite a real name collision, because dropping
 * either one redacts ordinary speech the precision corpus requires to survive
 * (measured, docs/planning/zoom-spike-results.md §3.5.2):
 *  - `ando` — fernando, rolando, armando, orlando. Dropping it redacts the
 *    gerund in "vimos a los estudiantes estudiando".
 *  - `an` / `en` — esteban, carmen, plus any accent-stripped sebastián. Dropping
 *    them redacts "los estudiantes necesitan más práctica".
 * The collision costs a name only where it appears ONLY lowercased and ONLY next
 * to a role noun: one capitalized mention anywhere in the transcript redeems it
 * through the cross-reference layer.
 *
 * Everything with a name collision that the corpus does NOT need stays OUT, so
 * the ambiguous surface redacts instead of walking through — §12's asymmetry
 * applied to the lexicon itself. Notably absent: the `ía` imperfect family
 * (maría, lucía, sofía — and "los alumnos tenían" is already covered by `an`),
 * and the singular participles `ado`/`ada`/`ido`/`ida` (amado, frida, cándida —
 * so "el alumno seleccionado" over-redacts, the safe direction).
 */
const NON_NAME_ENDINGS: readonly string[] = [
  // preterite, 3rd person — "trabajaron", "respondieron", "llegó"
  'aron',
  'eron',
  'ó',
  // imperfect, -ar verbs — "trabajaba", "trabajaban"
  'aba',
  'abas',
  'aban',
  'ábamos',
  // present, 3rd person plural — "necesitan", "prefieren" (also "tenían")
  'an',
  'en',
  // gerunds — "estudiando", "haciendo", "leyendo"
  'ando',
  'iendo',
  'yendo',
  // plural participles and participial adjectives — "destacadas", "distraídos"
  'ados',
  'adas',
  'idos',
  'idas',
  'ídos',
  'ídas',
  // derivational adjective endings — "participativos", "responsables", "silenciosos"
  'ivo',
  'iva',
  'ivos',
  'ivas',
  'ble',
  'bles',
  'osos',
  'osas',
  // adverbs — "rápidamente"
  'mente',
];

/**
 * Short tokens are exempt from the ending filter: "juan" and "ivan" would
 * otherwise be swallowed by `an`. Two characters of stem are required as well,
 * which is what keeps an accent-stripped "aaron" out of `aron`.
 */
const MIN_ENDING_FILTER_LENGTH = 5;
const MIN_ENDING_FILTER_STEM = 2;

/* ------------------------------------------------------------------- helpers */

/** Lowercase + strip diacritics. Whisper drops accents constantly, so every comparison goes through this. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

type Token = {
  raw: string;
  norm: string;
  start: number;
  end: number;
  capitalized: boolean;
  sentenceInitial: boolean;
};

const WORD_RE = /[\p{L}][\p{L}\p{M}'’]*/gu;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of Array.from(text.matchAll(WORD_RE))) {
    const raw = match[0];
    const start = match.index ?? 0;
    tokens.push({
      raw,
      norm: normalize(raw),
      start,
      end: start + raw.length,
      capitalized: raw[0] !== raw[0].toLowerCase(),
      sentenceInitial: false,
    });
  }

  // A token opens a sentence when everything between it and the previous token
  // contains a terminator — unless that terminator is the period of a known
  // abbreviation ("Sra. Elena": Elena is NOT sentence-initial).
  for (let i = 0; i < tokens.length; i += 1) {
    if (i === 0) {
      tokens[i].sentenceInitial = true;
      continue;
    }
    tokens[i].sentenceInitial = gapTerminates(tokens[i - 1], tokens[i], text);
  }

  return tokens;
}

/**
 * Does the gap between two adjacent tokens carry a sentence break?
 *
 * The abbreviation exception is what keeps "Sra. Elena" a single construction:
 * the period belongs to the title, not to a sentence. `tokenize` uses this to
 * decide sentence starts and G1 (`patternGapBlocked`) uses it to decide whether
 * a trigger may reach across the gap, so the two can never disagree.
 */
function gapTerminates(previous: Token, current: Token, text: string): boolean {
  const gap = text.slice(previous.end, current.start);
  return SENTENCE_TERMINATOR_RE.test(gap) && !ABBREVIATIONS.has(previous.norm);
}

/**
 * **G1 — gap discipline.** A trigger-adjacent pattern (honorific, role noun,
 * course designation, in both their i-1 and i-2 forms) must not reach across a
 * sentence boundary. "Llegaron temprano los alumnos. Entonces conversamos…"
 * used to make the adverb opening the NEXT sentence a person, because the layer
 * only ever looked at token indices and never at the text between them.
 *
 * Every gap in `[from, to]` is checked, so the i-2 variants are bound too. What
 * stays legal inside a pattern is a comma or a plain space — "de 5°B, Martina"
 * and "la estudiante, Martina" are one construction, and an abbreviation's own
 * period ("Sra. Elena") is not a boundary at all.
 */
function patternGapBlocked(tokens: Token[], from: number, to: number, text: string): boolean {
  for (let k = from + 1; k <= to; k += 1) {
    if (gapTerminates(tokens[k - 1], tokens[k], text)) return true;
  }
  return false;
}

/** Course designations: "5°B", "5 B", "1ºA", "octavo B". */
const COURSE_NUMERIC_RE = /^\d{1,2}$/;
const COURSE_WORDS = new Set<string>(
  `primero segundo tercero cuarto quinto sexto septimo octavo
   primer tercer basico basica medio media kinder prekinder`
    .split(/\s+/)
    .filter(Boolean)
);

function looksLikeCourse(token: Token, text: string): boolean {
  if (COURSE_WORDS.has(token.norm)) return true;
  if (!COURSE_NUMERIC_RE.test(token.raw)) return false;
  // "5°B" tokenizes as the letter run "B" preceded by "5°"; check the raw gap.
  return /[°º]/.test(text.slice(token.end, token.end + 2));
}

/**
 * Accent-preserving lowercase forms that LOOK like a structural lexicon member
 * once `normalize` strips their diacritics, but are real es-CL given names.
 *
 * One member, and it is the whole reason this set exists: `niña` and the given
 * name `Nina` both normalize to `nina`, so the trigger-token veto below would
 * have made a girl called Nina undetectable by every path in the module — a
 * recall REGRESSION introduced by the fix, which is the one outcome the §12
 * asymmetry never tolerates. Membership is tested on the accent-preserving
 * surface, so the spelled `niña` keeps its veto and only the tilde-free `Nina`
 * escapes it.
 *
 * Where transcription has already dropped the tilde, an accent-free `nina`
 * meaning "girl" becomes name-eligible and over-redacts. That is the same
 * accent-loss trade the module makes everywhere else, in the safe direction.
 */
const LEXICON_NAME_COLLISIONS = new Set<string>(['nina']);

/**
 * **Trigger/structural lexicon membership — the v1.5 candidacy veto (V1·V2·V3).**
 *
 * A token that is itself part of the module's trigger or structural vocabulary
 * is never name material. Before v1.5 each lexicon was consulted only where
 * someone had remembered to consult it, so the capitalization layer happily
 * marked `Sra`, `Profesora`, `Alumna`, `Quinto` and `Dr`, and left-extension
 * absorbed `Doña` — fusing the title into the person span. A fused span then
 * fails roster coverage, so the worst victims were ATTENDEES: "La Sra. Elena
 * presentó…" against a roster holding Elena Vidal came out as "La [persona 1]
 * presentó…", breaking §12's "attendee names are preserved" in the most common
 * es-CL registers.
 *
 * `ABBREVIATIONS` is in the union because `dr`/`dra`/`prof`/`ing`/`lic` are the
 * same construction as `sra` with none of its `HONORIFICS` membership: "El Dr.
 * Martínez" fused exactly like "La Sra. Elena". Vetoing them is pure gain —
 * they were never triggers, so nothing that used to be detected through them
 * stops being detected. (Making them triggers as well is a recall question this
 * round deliberately does not answer; see the residuals.)
 *
 * `ORG_HEADS` is NOT in the union only because it was already vetoed by every
 * path individually; `NON_PERSON_PROPER` is deliberately outside it, see
 * `nameCandidateEvidence`.
 */
function isStructuralLexiconToken(token: Token): boolean {
  if (LEXICON_NAME_COLLISIONS.has(token.raw.normalize('NFC').toLowerCase())) return false;
  return (
    HONORIFICS.has(token.norm) ||
    ROLE_NOUNS.has(token.norm) ||
    COURSE_WORDS.has(token.norm) ||
    ABBREVIATIONS.has(token.norm)
  );
}

/* --------------------------------------------------------------- attendees */

type AttendeeIndex = {
  /** Normalized roster names, spelled as the roster spells them. */
  fullNames: Set<string>;
  /** The same names with significant tokens sorted, so word order stops mattering. */
  fullNameKeys: Set<string>;
  /**
   * Significant tokens of every roster name, UNION. Only the bare-name
   * heuristic reads this — a multi-token name is never judged against the
   * union, or one attendee's given name plus another's surname would license a
   * third person nobody invited.
   */
  tokens: Set<string>;
  /** Significant tokens per roster entry — the set multi-token coverage uses. */
  entryTokens: Array<Set<string>>;
};

/** Order-insensitive key for a name: connectors dropped, remaining tokens sorted. */
function nameKey(parts: string[]): string {
  return parts
    .filter((part) => !NAME_CONNECTORS.has(part))
    .slice()
    .sort()
    .join(' ');
}

function buildAttendeeIndex(attendeeNames: string[]): AttendeeIndex {
  const fullNames = new Set<string>();
  const fullNameKeys = new Set<string>();
  const tokens = new Set<string>();
  const entryTokens: Array<Set<string>> = [];
  for (const name of attendeeNames) {
    if (typeof name !== 'string') continue;
    const norm = normalize(name).replace(/\s+/g, ' ').trim();
    if (!norm) continue;
    fullNames.add(norm);
    const parts = norm.split(' ');
    const key = nameKey(parts);
    if (key) fullNameKeys.add(key);
    const entry = new Set<string>();
    for (const part of parts) {
      // Two-letter fragments and connectors match far too much to be safe
      // preservation evidence.
      if (part.length >= 3 && !NAME_CONNECTORS.has(part)) {
        tokens.add(part);
        entry.add(part);
      }
    }
    if (entry.size > 0) entryTokens.push(entry);
  }
  return { fullNames, fullNameKeys, tokens, entryTokens };
}

/**
 * Does ONE roster entry account for every token of this name?
 *
 *   "Camila Fuentes"  (roster: Camila Fuentes)        → yes, exact.
 *   "Fuentes, Camila"                                 → yes, same tokens reordered.
 *   "Camila Fuentes"  (roster: Camila Andrea Fuentes) → yes, subset of one entry.
 *   "Camila Pérez"    (roster: Camila Fuentes AND Rodrigo Pérez)
 *      → NO. Both tokens exist on the roster, but no single attendee explains
 *        the pair, so this is a third person until proven otherwise. Checking
 *        the union instead is the cross-entry leak Z0B-1r2 closed.
 *
 * A name of nothing but connectors is never covered — `every` over an empty
 * list is vacuously true, which would preserve exactly the surfaces with the
 * least evidence behind them.
 */
function isCoveredBySingleEntry(parts: Token[], attendees: AttendeeIndex): boolean {
  if (parts.length === 0) return false;
  const norms = parts.map((t) => t.norm);
  if (attendees.fullNames.has(norms.join(' '))) return true;
  if (attendees.fullNameKeys.has(nameKey(norms))) return true;
  return attendees.entryTokens.some((entry) => norms.every((norm) => entry.has(norm)));
}

/* ---------------------------------------------------------------- detection */

type Evidence = {
  layer: DetectionLayer;
  confidence: DetectionConfidence;
};

/** Strongest wins; 'high' beats 'uncertain'. */
function strongest(a: Evidence | undefined, b: Evidence): Evidence {
  if (!a) return b;
  if (a.confidence === 'high') return a;
  return b.confidence === 'high' ? b : a;
}

/** Does this surface carry an ending no Spanish given name carries? Case-blind by design (G3 tests capitalized tokens). */
function carriesNonNameEnding(token: Token): boolean {
  const form = token.raw.normalize('NFC').toLowerCase();
  if (form.length < MIN_ENDING_FILTER_LENGTH) return false;
  return NON_NAME_ENDINGS.some(
    (ending) => form.length - ending.length >= MIN_ENDING_FILTER_STEM && form.endsWith(ending)
  );
}

/**
 * **G2 — uniform name plausibility.** What a trigger licenses for the candidate
 * beside it, or `null` for nothing. ONE predicate, shared by every pattern layer
 * (honorific, role-pattern, course-pattern), which is what makes the guarantee a
 * property of the module rather than of whichever layer someone remembered.
 *
 * Capitalized is `high`, as the role layer has always had it — "la alumna Rosa"
 * must stay high even though `rosa` is an ordinary word, because the trigger is
 * exactly the disambiguation. Two exceptions:
 *
 *  - **sentence-initial ∧ ordinary word** → nothing. Capitalization carries no
 *    information at a sentence start, so "…los alumnos. **Entonces** conversamos"
 *    must never yield a person. Defence in depth behind G1, which already stops
 *    a trigger from reaching across the boundary; the layers agree twice.
 *  - **∈ `ORG_HEADS`** → nothing. "…de primero básico del **Colegio** San Mateo"
 *    made the institution head a person: the capitalized branch was the one place
 *    an org head could be marked, since the capitalization layer vetoes it
 *    outright. Costs no recall — every `ORG_HEADS` member that is not also in
 *    `NON_PERSON_PROPER` (`villa`, `avenida`, `sala`, `red`…) is still reachable
 *    by the capitalization layer if it ever appears as a surname. The veto stops
 *    at `ORG_HEADS` deliberately: `NON_PERSON_PROPER` holds `julio`, `abril`,
 *    `santiago`, `concepcion` — real es-CL given names — and vetoing those would
 *    turn "el alumno Julio" into a miss, which is a leak, not a precision gain.
 *
 * Lowercase is the Whisper-lowercasing case ("el alumno benjamín"), and there
 * the token has to look like a name at all: ordinary vocabulary and
 * school/course/organization words are not names, and neither is anything
 * carrying the verb, participle or adverb morphology of `NON_NAME_ENDINGS`.
 * Whatever survives that is `uncertain` — plausible, unproven, and redacted
 * under the §12 asymmetry.
 *
 * Course-pattern additionally requires capitalization at its call sites, which
 * this predicate must not and does not weaken: its lowercase branch can only
 * ever produce `uncertain`, never `high`, and course-pattern never reaches it.
 */
function nameCandidateEvidence(token: Token, layer: DetectionLayer): Evidence | null {
  // **V3 — a title is never the name that follows a title.** Applied before the
  // capitalized/lowercase split, not only to the capitalized branch: the
  // lowercase branch already dismissed `COURSE_WORDS`, but not `HONORIFICS` or
  // `ROLE_NOUNS`, and path 2's own ad-hoc "candidate is not itself a role noun"
  // test is now redundant and gone. One predicate, every pattern layer, both
  // branches — which is also what makes the `nina` carve-out apply uniformly
  // instead of in whichever branch it was remembered.
  if (isStructuralLexiconToken(token)) return null;

  // **V3, course sites only.** `NON_PERSON_PROPER` is vetoed for the course
  // patterns and NOT for the role/honorific ones, and the asymmetry is load
  // bearing in both directions:
  //  - course → veto. It is what kills "Quinto **Básico**" (`basico` is in the
  //    set) and "quinto básico **Lenguaje**", where the capitalized branch used
  //    to mark school-subject and structural vocabulary as people.
  //  - role/honorific → reachable. That set holds `julio`, `abril`,
  //    `santiago`, `concepcion` — real es-CL given names whose ONLY detection
  //    path is a role or honorific pattern, because the capitalization layer
  //    vetoes the set outright. Vetoing them here would turn "el alumno Julio"
  //    into a miss, which is a leak, not a precision gain.
  // Cost of the asymmetry: a course-only reference to a month-named student,
  // "de 5°B, Julio", is a miss. Narrow and self-healing — one mention of that
  // student anywhere else in the transcript redeems him through cross-reference.
  if (layer === 'course-pattern' && NON_PERSON_PROPER.has(token.norm)) return null;

  if (token.capitalized) {
    if (token.sentenceInitial && COMMON_WORDS.has(token.norm)) return null;
    if (ORG_HEADS.has(token.norm)) return null;
    return { layer, confidence: 'high' };
  }
  if (COMMON_WORDS.has(token.norm)) return null;
  if (NON_PERSON_PROPER.has(token.norm)) return null;
  if (ORG_HEADS.has(token.norm)) return null;
  if (COURSE_WORDS.has(token.norm)) return null;
  if (carriesNonNameEnding(token)) return null;
  return { layer, confidence: 'uncertain' };
}

/**
 * Pass A — decide, per token index, whether it looks like part of a person name
 * and how sure we are.
 */
function collectEvidence(tokens: Token[], text: string): Map<number, Evidence> {
  const evidence = new Map<number, Evidence>();

  const mark = (index: number, next: Evidence): void => {
    if (index < 0 || index >= tokens.length) return;
    evidence.set(index, strongest(evidence.get(index), next));
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const previous = i > 0 ? tokens[i - 1] : null;

    // Every trigger-adjacent layer below is bound by the SAME two guards: G1
    // (`patternGapBlocked`) stops a trigger reaching across a sentence break,
    // and G2 (`nameCandidateEvidence`) stops it marking a token that could not
    // be a name. See the MARKING-PATH AUDIT in the module header.
    const reaches = (from: number): boolean => !patternGapBlocked(tokens, from, i, text);

    // --- Layer: honorific. "don Ignacio", "la profe Marcela", "Sra. Elena".
    // Survives Whisper lowercasing a name ("la profe marcela"), because G2's
    // lowercase branch licenses a name-plausible token as `uncertain`. What it
    // no longer does is mark the VERB after an honorific that is also an
    // ordinary sentence subject: "La profesora terminaba…", "El profesor
    // entregó…", "La señora dijo…" all used to yield a person.
    if (previous && HONORIFICS.has(previous.norm) && reaches(i - 1)) {
      const licensed = nameCandidateEvidence(token, 'honorific');
      if (licensed) mark(i, licensed);
    }

    // --- Layer: role pattern. "el alumno Benjamín", "la estudiante Martina",
    // "la niña de kinder, Florencia". The candidate has to be name-plausible, or
    // the ordinary word after every plural role noun becomes a person:
    // "los alumnos trabajaron bien" made `trabajaron` one.
    if (previous && ROLE_NOUNS.has(previous.norm) && reaches(i - 1)) {
      const licensed = nameCandidateEvidence(token, 'role-pattern');
      if (licensed) mark(i, licensed);
    }
    // Allow one intervening connector: "el alumno de Martina" is rare, but
    // "la estudiante, Martina" and "el alumno llamado Diego" are not. Same
    // name-plausibility rule — this variant used to require capitalization,
    // which the rule now supplies in a form that also survives lowercasing.
    if (
      i >= 2 &&
      ROLE_NOUNS.has(tokens[i - 2].norm) &&
      (NAME_CONNECTORS.has(previous?.norm ?? '') || previous?.norm === 'llamado' || previous?.norm === 'llamada') &&
      reaches(i - 2)
    ) {
      const licensed = nameCandidateEvidence(token, 'role-pattern');
      if (licensed) mark(i, licensed);
    }

    // --- Layer: course pattern. "de 5°B, Martina", "quinto básico, Antonia".
    // Capitalization stays a hard requirement here — routing through the shared
    // predicate adds guards, it does not relax this one.
    if (previous && looksLikeCourse(previous, text) && token.capitalized && reaches(i - 1)) {
      const licensed = nameCandidateEvidence(token, 'course-pattern');
      if (licensed) mark(i, licensed);
    }
    if (i >= 2 && looksLikeCourse(tokens[i - 2], text) && token.capitalized && reaches(i - 2)) {
      const licensed = nameCandidateEvidence(token, 'course-pattern');
      if (licensed) mark(i, licensed);
    }

    // --- Layer: capitalization.
    if (!token.capitalized) continue;
    if (NON_PERSON_PROPER.has(token.norm)) continue;
    // **V1 — a trigger token can never self-mark.** This layer has no trigger to
    // license anything, so a capitalized `Sra`, `Profesora`, `Alumna`, `Quinto`
    // or `Dr` is exactly what it looks like: the title, the role or the course,
    // written title-case. Marking it fused the title into the person span and
    // destroyed the attendee standing beside it.
    if (isStructuralLexiconToken(token)) continue;
    // Part of an institution name: "Colegio San Mateo", "Fundación Nueva Educación".
    if (previous && ORG_HEADS.has(previous.norm)) continue;
    if (i >= 2 && ORG_HEADS.has(tokens[i - 2].norm) && tokens[i - 1].capitalized) continue;

    if (token.sentenceInitial) {
      // Capitalization carries no information at a sentence start. Left to the
      // cross-reference pass, which redeems it if the same token appears
      // capitalized mid-sentence somewhere else in the transcript.
      continue;
    }

    if (COMMON_WORDS.has(token.norm)) {
      // "Rosa" mid-sentence: could be the flower, could be a child. Ambiguous
      // by construction, so it is redacted and recorded as uncertain.
      mark(i, { layer: 'capitalization', confidence: 'uncertain' });
      continue;
    }

    mark(i, { layer: 'capitalization', confidence: 'high' });
  }

  // --- Left extension.
  // A capitalized token immediately before a detected name token, separated by
  // nothing but a space, belongs to the same name. Without this, "Camila
  // Fuentes" at the start of a sentence detects only "Fuentes": the first token
  // was skipped for being sentence-initial, and the result is a HALF-redacted
  // name, which is worse than a clean miss because it still reads as sanitized.
  // Ordinary sentence-opening words ("Ayer Renata entregó…") are excluded, or
  // the adverb would be swallowed into the person span.
  //
  // **G3 — non-name-ending veto.** `COMMON_WORDS` is a closed list and Spanish
  // sentence openers are not, so the list alone let a capitalized VERB be
  // absorbed: "Quedaron Martina Rojas y Benjamín Soto…" produced the span
  // `Quedaron Martina Rojas`. `carriesNonNameEnding` is the same morphology the
  // pattern layers use, applied here to the extension candidate — open class,
  // no list to maintain. Genuine compound names are untouched: `Juan`, `Ana`,
  // `Luis`, `José` are under the length floor and `María`, `Sebastián`,
  // `Constanza`, `Matilde` carry no filtered ending.
  for (let i = tokens.length - 1; i > 0; i -= 1) {
    if (!evidence.has(i)) continue;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (evidence.has(j)) break;
      const candidate = tokens[j];
      if (!candidate.capitalized) break;
      if (COMMON_WORDS.has(candidate.norm)) break;
      if (NON_PERSON_PROPER.has(candidate.norm)) break;
      if (ORG_HEADS.has(candidate.norm)) break;
      // **V2 — extension stops at a trigger token.** V1 keeps a title from
      // marking itself, but the title sitting immediately left of a marked name
      // is precisely what this pass reaches for: "Doña Carmen" opens a sentence,
      // so `Doña` is skipped by the capitalization layer and then absorbed here,
      // and the attendee Carmen Ruiz disappears into `[persona 1]`. The same
      // walk swallowed `Profesora`, `Alumna` and `Quinto`.
      if (isStructuralLexiconToken(candidate)) break;
      if (carriesNonNameEnding(candidate)) break;
      // Only a plain space may sit between the two — a comma or a period means
      // two separate things, not one name.
      if (!/^\s+$/.test(text.slice(candidate.end, tokens[j + 1].start))) break;
      mark(j, { layer: 'capitalization', confidence: 'high' });
    }
  }

  // --- Layer: cross-reference.
  // Any token judged a name somewhere becomes a name everywhere in this
  // transcript — including sentence-initial and lowercase occurrences. This is
  // the layer that catches "martina" after "Martina" has been seen once.
  const vocabulary = new Map<string, Evidence>();
  for (const [index, found] of Array.from(evidence.entries())) {
    const existing = vocabulary.get(tokens[index].norm);
    vocabulary.set(tokens[index].norm, strongest(existing, found));
  }

  for (let i = 0; i < tokens.length; i += 1) {
    if (evidence.has(i)) continue;
    const known = vocabulary.get(tokens[i].norm);
    if (!known) continue;
    // A name that doubles as a common word only counts where it is capitalized;
    // otherwise every "rosa" in the transcript would disappear.
    if (COMMON_WORDS.has(tokens[i].norm) && !tokens[i].capitalized) continue;
    // The same veto as V1/V2/V3, so this layer cannot re-open through the back
    // door what they closed. It matters for exactly one input today, and it is
    // the `nina` carve-out: propagation is keyed on the ACCENT-STRIPPED norm, so
    // a transcript naming a student `Nina` would otherwise turn every `niña` in
    // it into that student. The carve-out is tested on the accent-preserving
    // surface, so `Nina` still propagates to `Nina` and `niña` is left alone.
    if (isStructuralLexiconToken(tokens[i])) continue;
    mark(i, { layer: 'cross-reference', confidence: known.confidence });
  }

  return evidence;
}

/* ------------------------------------------------------------------- spans */

type Span = {
  startToken: number;
  endToken: number;
  layer: DetectionLayer;
  confidence: DetectionConfidence;
};

/** Merges adjacent name tokens (and the connectors between them) into one person span. */
function buildSpans(tokens: Token[], evidence: Map<number, Evidence>): Span[] {
  const spans: Span[] = [];
  let current: Span | null = null;

  for (let i = 0; i < tokens.length; i += 1) {
    const found = evidence.get(i);

    if (found) {
      if (current && i - current.endToken <= 2) {
        // Extend across at most one connector token ("María de los Ángeles"
        // arrives as separate marks; the connectors sit between them).
        const between = tokens.slice(current.endToken + 1, i);
        if (between.every((t) => NAME_CONNECTORS.has(t.norm))) {
          current.endToken = i;
          current.layer = strongest({ layer: current.layer, confidence: current.confidence }, found).layer;
          current.confidence = strongest(
            { layer: current.layer, confidence: current.confidence },
            found
          ).confidence;
          continue;
        }
      }
      if (current) spans.push(current);
      current = { startToken: i, endToken: i, layer: found.layer, confidence: found.confidence };
      continue;
    }

    if (current && NAME_CONNECTORS.has(tokens[i].norm)) continue; // maybe a bridge
    if (current) {
      spans.push(current);
      current = null;
    }
  }

  if (current) spans.push(current);
  return spans;
}

/**
 * One person-reference: a run of significant span tokens with no connector
 * inside it. Classification, emission and person numbering all happen here —
 * a span merely delimits the surface these were carved out of.
 */
type Segment = {
  start: number;
  end: number;
  surface: string;
  /** Every token of the run. Connectors are the boundaries, never members. */
  tokens: Token[];
  layer: DetectionLayer;
  confidence: DetectionConfidence;
  preserved: boolean;
};

/** A span plus everything the preservation decision needs. */
type SpanPlan = {
  span: Span;
  start: number;
  end: number;
  surface: string;
  /** Span tokens with connectors dropped — the ones that carry identity. */
  significant: Token[];
  /** The span split at its internal connector positions. */
  segments: Segment[];
  /** Set when the roster covers the span as a whole; then `segments` is unused. */
  preservedWhole: boolean;
};

/**
 * Does the gap between two adjacent span tokens end a person-reference?
 *
 * `,` and `;` separate people in a list. A `.` does too — "…Martina Rojas.
 * Benjamín Soto llegó…" is two students, and `buildSpans` merges them because
 * the tokens are adjacent. The exception is an abbreviation's own period, which
 * is what keeps "Sra. Elena" one person; `tokenize` already relies on the same
 * `ABBREVIATIONS` set to decide sentence starts.
 */
function gapSplitsSegment(previous: Token, current: Token, rawText: string): boolean {
  const gap = rawText.slice(previous.end, current.start);
  if (/[,;]/.test(gap)) return true;
  if (!gap.includes('.')) return false;
  return !ABBREVIATIONS.has(previous.norm);
}

/**
 * Splits a span at the connector positions `buildSpans` bridged, and at the gap
 * punctuation it merged across.
 *
 * "el alumno Matías y Tomás" and "Martina Rojas, Benjamín Soto" → two segments,
 * two students, two numbers each. Every significant token inside a span carries
 * evidence (the bridges are connectors by construction), so each segment can
 * report the strongest layer of its OWN tokens rather than inheriting the span's.
 */
function buildSegments(
  tokens: Token[],
  span: Span,
  evidence: Map<number, Evidence>,
  rawText: string
): Segment[] {
  const segments: Segment[] = [];
  let run: number[] = [];

  const flush = (): void => {
    if (run.length === 0) return;
    const members = run.map((index) => tokens[index]);
    let combined: Evidence | undefined;
    for (const index of run) {
      const found = evidence.get(index);
      if (found) combined = strongest(combined, found);
    }
    segments.push({
      start: members[0].start,
      end: members[members.length - 1].end,
      surface: rawText.slice(members[0].start, members[members.length - 1].end),
      tokens: members,
      layer: combined?.layer ?? span.layer,
      confidence: combined?.confidence ?? span.confidence,
      preserved: false,
    });
    run = [];
  };

  for (let i = span.startToken; i <= span.endToken; i += 1) {
    if (i > span.startToken && gapSplitsSegment(tokens[i - 1], tokens[i], rawText)) {
      flush();
    }
    if (NAME_CONNECTORS.has(tokens[i].norm)) {
      flush();
      continue;
    }
    run.push(i);
  }
  flush();

  // A span of nothing but connectors yields no segments, so it emits nothing:
  // there is no identity in it to redact, and a `[persona N]` over a bare "de"
  // would be both unreadable and one more person in the density metric.
  return segments;
}

function planSpans(
  tokens: Token[],
  spans: Span[],
  evidence: Map<number, Evidence>,
  rawText: string
): SpanPlan[] {
  return spans.map((span) => {
    const first = tokens[span.startToken];
    const last = tokens[span.endToken];
    return {
      span,
      start: first.start,
      end: last.end,
      surface: rawText.slice(first.start, last.end),
      significant: tokens
        .slice(span.startToken, span.endToken + 1)
        .filter((t) => !NAME_CONNECTORS.has(t.norm)),
      segments: buildSegments(tokens, span, evidence, rawText),
      preservedWhole: false,
    };
  });
}

/**
 * Decides preserve-vs-redact for every span, in two passes.
 *
 * A span first gets one chance to be preserved whole, which is what a
 * multi-token name a single attendee explains needs — including the ones whose
 * own connectors would otherwise segment them apart. Everything else is decided
 * at segment level, independently, so a span may come out mixed.
 *
 * Pass 1 settles every segment whose fate depends on the roster alone:
 * multi-token segments (single-entry coverage, all-or-nothing) and bare names
 * the roster has no token for. Each redaction contributes its tokens to
 * `contaminated`.
 *
 * Pass 2 settles the rest — bare names the roster DOES have a token for. They
 * are preserved on the plan's "a lone Camila means the attendee" heuristic,
 * unless pass 1 redacted a person carrying the same token, which makes the bare
 * mention ambiguous. Two passes rather than one sweep because the contaminating
 * mention can appear anywhere: a bare "Camila" may well be read before the
 * "Camila Pérez" that poisons it.
 */
function classifySpans(plans: SpanPlan[], attendees: AttendeeIndex): void {
  const contaminated = new Set<string>();
  const deferred: Segment[] = [];

  const redact = (segment: Segment): void => {
    segment.preserved = false;
    for (const token of segment.tokens) contaminated.add(token.norm);
  };

  for (const plan of plans) {
    // Step 1. Bare names are deliberately excluded: a lone roster token is the
    // heuristic below, contamination included, not whole-span coverage.
    if (plan.significant.length >= 2 && isCoveredBySingleEntry(plan.significant, attendees)) {
      plan.preservedWhole = true;
      continue;
    }

    for (const segment of plan.segments) {
      if (segment.tokens.length === 1) {
        if (attendees.tokens.has(segment.tokens[0].norm)) {
          deferred.push(segment);
          continue;
        }
        redact(segment);
        continue;
      }
      if (isCoveredBySingleEntry(segment.tokens, attendees)) {
        segment.preserved = true;
        continue;
      }
      redact(segment);
    }
  }

  for (const segment of deferred) {
    segment.preserved = !contaminated.has(segment.tokens[0].norm);
  }
}

/* ---------------------------------------------------------------- sanitize */

/**
 * Replaces every non-attendee person name with a stable `[persona N]` token.
 *
 * @param rawText        Transcript text as produced by transcription.
 * @param attendeeNames  Display names of the people known to have attended.
 *                       A person-reference survives only where ONE of these
 *                       accounts for all of it (see the preservation rule at
 *                       the top of the file); everyone else is redacted.
 */
export function sanitize(
  rawText: string,
  attendeeNames: string[],
  opts: SanitizeOptions = {}
): SanitizeResult {
  const threshold = opts.flagDensityThreshold ?? DEFAULT_FLAG_DENSITY_THRESHOLD;

  if (typeof rawText !== 'string' || rawText.length === 0) {
    return {
      sanitizedText: '',
      status: 'sanitized',
      detections: [],
      sanitizerVersion: SANITIZER_VERSION,
      flagReasons: [],
      metrics: {
        wordCount: 0,
        personCount: 0,
        redactionCount: 0,
        studentReferenceCount: 0,
        density: 0,
      },
    };
  }

  const attendees = buildAttendeeIndex(Array.isArray(attendeeNames) ? attendeeNames : []);
  const tokens = tokenize(rawText);
  const evidence = collectEvidence(tokens, rawText);
  const spans = buildSpans(tokens, evidence);
  const plans = planSpans(tokens, spans, evidence, rawText);
  classifySpans(plans, attendees);

  /** normalized token → assigned person number. Keeps "Martina Rojas" and a later bare "Martina" on the same token. */
  const personNumbers = new Map<string, number>();
  let nextPersonNumber = 1;

  const detections: Detection[] = [];
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  let redactionCount = 0;

  // Emission runs in document order, so person numbers follow the order a
  // reader meets people in the transcript — and a token-keyed map keeps a
  // redacted bare "Camila" on the same `[persona N]` as the "Camila Pérez" it
  // refers to, whichever of the two comes first.
  for (const plan of plans) {
    if (plan.preservedWhole) {
      detections.push({
        surface: plan.surface,
        start: plan.start,
        end: plan.end,
        layer: plan.span.layer,
        confidence: plan.span.confidence,
        action: 'preserved',
      });
      continue;
    }

    // Per segment, so a mixed span emits one record per person-reference and
    // the connector text between them is never inside a replacement range.
    for (const segment of plan.segments) {
      if (segment.preserved) {
        detections.push({
          surface: segment.surface,
          start: segment.start,
          end: segment.end,
          layer: segment.layer,
          confidence: segment.confidence,
          action: 'preserved',
        });
        continue;
      }

      // Reuse an existing number if any token of this segment was already assigned.
      let assigned: number | undefined;
      for (const t of segment.tokens) {
        const existing = personNumbers.get(t.norm);
        if (existing !== undefined) {
          assigned = assigned === undefined ? existing : Math.min(assigned, existing);
        }
      }
      if (assigned === undefined) {
        assigned = nextPersonNumber;
        nextPersonNumber += 1;
      }
      for (const t of segment.tokens) personNumbers.set(t.norm, assigned);

      const token = `[persona ${assigned}]`;
      replacements.push({ start: segment.start, end: segment.end, text: token });
      detections.push({
        surface: segment.surface,
        start: segment.start,
        end: segment.end,
        layer: segment.layer,
        confidence: segment.confidence,
        action: 'redacted',
        token,
      });
      redactionCount += 1;
    }
  }

  // Apply right-to-left so earlier offsets stay valid.
  let sanitizedText = rawText;
  for (const replacement of replacements.slice().sort((a, b) => b.start - a.start)) {
    sanitizedText =
      sanitizedText.slice(0, replacement.start) +
      replacement.text +
      sanitizedText.slice(replacement.end);
  }

  const wordCount = tokens.length;
  const studentKeywordCount = tokens.filter((t) => STUDENT_REFERENCE_WORDS.has(t.norm)).length;
  const studentReferenceCount = redactionCount + studentKeywordCount;
  const density = wordCount === 0 ? 0 : (studentReferenceCount / wordCount) * 100;

  const flagReasons: string[] = [];
  if (density > threshold) {
    flagReasons.push(
      `student-reference density ${density.toFixed(2)} per 100 words exceeds threshold ${threshold}`
    );
  }

  return {
    sanitizedText,
    status: flagReasons.length > 0 ? 'flagged' : 'sanitized',
    detections,
    sanitizerVersion: SANITIZER_VERSION,
    flagReasons,
    metrics: {
      wordCount,
      personCount: nextPersonNumber - 1,
      redactionCount,
      studentReferenceCount,
      density,
    },
  };
}
