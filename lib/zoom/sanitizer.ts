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
 * Not wired into any production path yet — Z5 does that. Tests only.
 */

/**
 * Bump on any change to detection behaviour. Stored alongside a transcript so a
 * newer sanitizer can be detected and re-run (§6 state machine).
 */
export const SANITIZER_VERSION = 'node-1.0.0';

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
 * High-frequency Spanish words. Used only to decide whether a CAPITALIZED token
 * is suspicious: an ordinary word capitalized mid-sentence is ambiguous
 * ("Rosa"), not automatically innocent, so membership here downgrades a
 * detection to `uncertain` rather than dismissing it.
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
   salvador jesus leon lucero prado ribera vega paloma`
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

/** Titles that mark the FOLLOWING token as a person name, whatever it looks like. */
const HONORIFICS = new Set<string>(
  `don dona sr sra srta senor senora senorita profe profesor profesora
   tio tia miss mister maestro maestra educador educadora asistente
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
    const gap = text.slice(tokens[i - 1].end, tokens[i].start);
    const terminated = /[.!?¡¿\n•·]/.test(gap);
    tokens[i].sentenceInitial = terminated && !ABBREVIATIONS.has(tokens[i - 1].norm);
  }

  return tokens;
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

/* --------------------------------------------------------------- attendees */

type AttendeeIndex = {
  fullNames: Set<string>;
  tokens: Set<string>;
};

function buildAttendeeIndex(attendeeNames: string[]): AttendeeIndex {
  const fullNames = new Set<string>();
  const tokens = new Set<string>();
  for (const name of attendeeNames) {
    if (typeof name !== 'string') continue;
    const norm = normalize(name).replace(/\s+/g, ' ').trim();
    if (!norm) continue;
    fullNames.add(norm);
    for (const part of norm.split(' ')) {
      // Two-letter fragments and connectors match far too much to be safe
      // preservation evidence.
      if (part.length >= 3 && !NAME_CONNECTORS.has(part)) tokens.add(part);
    }
  }
  return { fullNames, tokens };
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

    // --- Layer: honorific. "don Ignacio", "la profe Marcela", "Sra. Elena".
    // Fires regardless of the following token's capitalization or wordiness,
    // which is what makes it survive Whisper lowercasing a name.
    if (previous && HONORIFICS.has(previous.norm)) {
      mark(i, { layer: 'honorific', confidence: 'high' });
    }

    // --- Layer: role pattern. "el alumno Benjamín", "la estudiante Martina",
    // "la niña de kinder, Florencia".
    if (previous && ROLE_NOUNS.has(previous.norm) && !ROLE_NOUNS.has(token.norm)) {
      mark(i, { layer: 'role-pattern', confidence: 'high' });
    }
    // Allow one intervening connector: "el alumno de Martina" is rare, but
    // "la estudiante, Martina" and "el alumno llamado Diego" are not.
    if (
      i >= 2 &&
      ROLE_NOUNS.has(tokens[i - 2].norm) &&
      (NAME_CONNECTORS.has(previous?.norm ?? '') || previous?.norm === 'llamado' || previous?.norm === 'llamada') &&
      token.capitalized
    ) {
      mark(i, { layer: 'role-pattern', confidence: 'high' });
    }

    // --- Layer: course pattern. "de 5°B, Martina", "quinto básico, Antonia".
    if (previous && looksLikeCourse(previous, text) && token.capitalized) {
      mark(i, { layer: 'course-pattern', confidence: 'high' });
    }
    if (i >= 2 && looksLikeCourse(tokens[i - 2], text) && token.capitalized) {
      mark(i, { layer: 'course-pattern', confidence: 'high' });
    }

    // --- Layer: capitalization.
    if (!token.capitalized) continue;
    if (NON_PERSON_PROPER.has(token.norm)) continue;
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
  for (let i = tokens.length - 1; i > 0; i -= 1) {
    if (!evidence.has(i)) continue;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (evidence.has(j)) break;
      const candidate = tokens[j];
      if (!candidate.capitalized) break;
      if (COMMON_WORDS.has(candidate.norm)) break;
      if (NON_PERSON_PROPER.has(candidate.norm)) break;
      if (ORG_HEADS.has(candidate.norm)) break;
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

/* ---------------------------------------------------------------- sanitize */

/**
 * Replaces every non-attendee person name with a stable `[persona N]` token.
 *
 * @param rawText        Transcript text as produced by transcription.
 * @param attendeeNames  Display names of the people known to have attended.
 *                       These are preserved; everyone else is redacted.
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

  /** normalized token → assigned person number. Keeps "Martina Rojas" and a later bare "Martina" on the same token. */
  const personNumbers = new Map<string, number>();
  let nextPersonNumber = 1;

  const detections: Detection[] = [];
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  let redactionCount = 0;

  for (const span of spans) {
    const first = tokens[span.startToken];
    const last = tokens[span.endToken];
    const surface = rawText.slice(first.start, last.end);
    const spanTokens = tokens
      .slice(span.startToken, span.endToken + 1)
      .filter((t) => !NAME_CONNECTORS.has(t.norm));
    const normalizedSpan = spanTokens.map((t) => t.norm).join(' ');

    // Attendee check: exact full name, or any shared significant token. A
    // transcript that says "Camila" when "Camila Fuentes" attended is talking
    // about the attendee.
    const isAttendee =
      attendees.fullNames.has(normalizedSpan) ||
      spanTokens.some((t) => attendees.tokens.has(t.norm));

    if (isAttendee) {
      detections.push({
        surface,
        start: first.start,
        end: last.end,
        layer: span.layer,
        confidence: span.confidence,
        action: 'preserved',
      });
      continue;
    }

    // Reuse an existing number if any token of this span was already assigned.
    let assigned: number | undefined;
    for (const t of spanTokens) {
      const existing = personNumbers.get(t.norm);
      if (existing !== undefined) {
        assigned = assigned === undefined ? existing : Math.min(assigned, existing);
      }
    }
    if (assigned === undefined) {
      assigned = nextPersonNumber;
      nextPersonNumber += 1;
    }
    for (const t of spanTokens) personNumbers.set(t.norm, assigned);

    const token = `[persona ${assigned}]`;
    replacements.push({ start: first.start, end: last.end, text: token });
    detections.push({
      surface,
      start: first.start,
      end: last.end,
      layer: span.layer,
      confidence: span.confidence,
      action: 'redacted',
      token,
    });
    redactionCount += 1;
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
