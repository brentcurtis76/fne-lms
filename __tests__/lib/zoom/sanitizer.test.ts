/**
 * Contract tests for the required Node sanitizer layer (plan §12).
 *
 * These cover the properties the pipeline depends on regardless of how good
 * name detection is: purity, stable tokens, attendee preservation, the
 * sanitized/flagged transition, and the version stamp.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLAG_DENSITY_THRESHOLD,
  SANITIZER_VERSION,
  sanitize,
} from '../../../lib/zoom/sanitizer';

const ATTENDEES = ['Camila Fuentes', 'Rodrigo Pérez'];

describe('sanitize — output contract', () => {
  it('returns the documented shape', () => {
    const result = sanitize('El alumno Benjamín entregó su trabajo.', ATTENDEES);

    expect(result).toMatchObject({
      sanitizedText: expect.any(String),
      status: expect.stringMatching(/^(sanitized|flagged)$/),
      detections: expect.any(Array),
      sanitizerVersion: SANITIZER_VERSION,
    });
    expect(result.metrics.wordCount).toBeGreaterThan(0);
  });

  it('stamps the sanitizer version so a newer pass can be detected and re-run', () => {
    expect(SANITIZER_VERSION).toMatch(/^node-\d+\.\d+\.\d+$/);
    expect(sanitize('texto', []).sanitizerVersion).toBe(SANITIZER_VERSION);
  });

  it('handles empty and non-string input without throwing', () => {
    expect(sanitize('', ATTENDEES).sanitizedText).toBe('');
    expect(sanitize('', ATTENDEES).status).toBe('sanitized');
    expect(sanitize(undefined as unknown as string, ATTENDEES).sanitizedText).toBe('');
  });

  it('tolerates a missing or malformed attendee list rather than trusting it', () => {
    const result = sanitize(
      'La estudiante Martina Rojas presentó su trabajo.',
      undefined as unknown as string[]
    );
    // No allowlist means nobody is exempt — the fail-safe direction.
    expect(result.sanitizedText).not.toContain('Martina');
  });
});

describe('sanitize — purity', () => {
  it('does not mutate its inputs', () => {
    const text = 'El alumno Benjamín habló con don Ignacio.';
    const attendees = [...ATTENDEES];
    sanitize(text, attendees);
    expect(text).toBe('El alumno Benjamín habló con don Ignacio.');
    expect(attendees).toEqual(ATTENDEES);
  });

  it('is deterministic across repeated calls', () => {
    const text = 'La estudiante Martina Rojas y el alumno Benjamín Soto trabajaron juntos.';
    const first = sanitize(text, ATTENDEES);
    const second = sanitize(text, ATTENDEES);
    expect(second.sanitizedText).toBe(first.sanitizedText);
    expect(second.metrics).toEqual(first.metrics);
  });
});

describe('sanitize — attendee allowlist', () => {
  it('preserves attendee full names', () => {
    const result = sanitize('Camila Fuentes abrió la sesión y Rodrigo Pérez tomó nota.', ATTENDEES);
    expect(result.sanitizedText).toContain('Camila Fuentes');
    expect(result.sanitizedText).toContain('Rodrigo Pérez');
    expect(result.sanitizedText).not.toContain('[persona');
  });

  it('preserves an attendee referred to by first name only', () => {
    const result = sanitize('Camila propuso el cambio y Rodrigo lo respaldó.', ATTENDEES);
    expect(result.sanitizedText).toContain('Camila');
    expect(result.sanitizedText).toContain('Rodrigo');
  });

  it('redacts a non-attendee sharing the transcript with attendees', () => {
    const result = sanitize(
      'Camila Fuentes comentó el caso de la estudiante Martina Rojas.',
      ATTENDEES
    );
    expect(result.sanitizedText).toContain('Camila Fuentes');
    expect(result.sanitizedText).not.toContain('Martina');
    expect(result.sanitizedText).toContain('[persona 1]');
  });

  it('redacts everyone when the attendee list is empty', () => {
    const result = sanitize('Camila Fuentes comentó el caso de Martina Rojas.', []);
    expect(result.sanitizedText).not.toContain('Camila');
    expect(result.sanitizedText).not.toContain('Martina');
  });
});

describe('sanitize — attendee coverage rule', () => {
  // One attendee on purpose: these cases are about what a SINGLE roster entry
  // does and does not license.
  const ROSTER = ['Camila Fuentes'];

  it('redacts a distinct person who merely shares a given name with an attendee', () => {
    const result = sanitize('El caso de la estudiante Camila Pérez se revisó ayer.', ROSTER);
    // The whole span, not just the surname: a half-redacted name still names.
    expect(result.sanitizedText).not.toContain('Camila Pérez');
    expect(result.sanitizedText).not.toContain('Camila');
    expect(result.sanitizedText).toContain('[persona 1]');
  });

  it('gives a redacted bare given name the number of the person it collides with', () => {
    const result = sanitize(
      'La estudiante Camila Pérez entregó el informe. Más tarde Camila preguntó por la nota.',
      ROSTER
    );
    const tokens = result.sanitizedText.match(/\[persona \d+\]/g) ?? [];
    expect(tokens.length).toBe(2);
    expect(new Set(tokens).size).toBe(1);
    expect(result.metrics.personCount).toBe(1);
  });

  it('keeps the bare-first-name heuristic when nothing collides', () => {
    const result = sanitize(
      'En la reunión Camila propuso revisar el protocolo de convivencia.',
      ROSTER
    );
    expect(result.sanitizedText).toContain('Camila');
    expect(result.sanitizedText).not.toContain('[persona');
  });

  it('preserves a roster name written in inverted order', () => {
    const result = sanitize('En la nómina aparece Fuentes, Camila como facilitadora.', ROSTER);
    expect(result.sanitizedText).toContain('Fuentes, Camila');
  });

  it('preserves the attendee full name even after a colliding redaction', () => {
    const result = sanitize(
      'La estudiante Camila Pérez faltó el lunes. Camila Fuentes revisará el caso.',
      ROSTER
    );
    expect(result.sanitizedText).toContain('Camila Fuentes');
    expect(result.sanitizedText).not.toContain('Camila Pérez');
  });

  it('redacts an attendee name the roster does not fully explain — accepted over-redaction', () => {
    // "Camila Fuentes Soto" carries a token the roster lacks, so the span goes.
    // Costs minuta quality, never leaks; roster hygiene is the fix.
    const result = sanitize('La sesión la dirigió Camila Fuentes Soto en la mañana.', ROSTER);
    expect(result.sanitizedText).not.toContain('Camila Fuentes Soto');
    expect(result.sanitizedText).toContain('[persona 1]');
  });
});

describe('sanitize — segment classification', () => {
  // A span is a surface, not a person: buildSpans bridges name tokens across
  // connectors, so one span can hold an attendee and a student, or two
  // students. These are the properties that carving it into segments buys.

  it('redacts a person stitched from two DIFFERENT attendees — coverage is per entry, not the union', () => {
    // Roster has "camila" (Fuentes) and "perez" (Rodrigo). Neither attendee
    // explains "Camila Pérez", so the union must not license it.
    const result = sanitize('La alumna Camila Pérez llegó tarde a la sesión.', ATTENDEES);
    expect(result.sanitizedText).not.toContain('Camila Pérez');
    expect(result.sanitizedText).not.toContain('Camila');
    expect(result.sanitizedText).toContain('[persona 1]');
  });

  it('ends the role-pattern detection of that person as redacted', () => {
    const result = sanitize('La alumna Camila Pérez llegó tarde a la sesión.', ATTENDEES);
    const detection = result.detections.find((d) => d.surface === 'Camila Pérez');
    expect(detection).toBeDefined();
    expect(detection?.layer).toBe('role-pattern');
    expect(detection?.confidence).toBe('high');
    expect(detection?.action).toBe('redacted');
  });

  it('keeps segments independent — an attendee survives inside a span that also holds a student', () => {
    const result = sanitize(
      'Conversamos con Camila Fuentes y Martina sobre el plan de acompañamiento.',
      ['Camila Fuentes']
    );
    expect(result.sanitizedText).toContain('Camila Fuentes y [persona 1]');
    expect(result.sanitizedText).not.toContain('Martina');
    expect(result.detections.map((d) => [d.surface, d.action])).toEqual([
      ['Camila Fuentes', 'preserved'],
      ['Martina', 'redacted'],
    ]);
  });

  it('preserves both attendees of a connector-merged span, with zero redactions', () => {
    const result = sanitize('Camila Fuentes y Rodrigo Pérez firmaron el acta.', ATTENDEES);
    expect(result.sanitizedText).toBe('Camila Fuentes y Rodrigo Pérez firmaron el acta.');
    expect(result.metrics.redactionCount).toBe(0);
    expect(result.metrics.personCount).toBe(0);
  });

  it('gives each connector-joined student its own number', () => {
    const result = sanitize('En la reunión el alumno Matías y Tomás expusieron.', ['Camila Fuentes']);
    expect(result.sanitizedText).toContain('[persona 1] y [persona 2]');
    expect(result.metrics.personCount).toBe(2);
    expect(result.metrics.redactionCount).toBe(2);
  });

  it('emits the connector text between segments verbatim', () => {
    const result = sanitize('En la reunión el alumno Matías y Tomás expusieron.', ['Camila Fuentes']);
    expect(result.sanitizedText).toBe('En la reunión el alumno [persona 1] y [persona 2] expusieron.');
  });

  it('preserves an attendee name that carries its own connectors', () => {
    const result = sanitize('La sesión la abrió María de los Ángeles con el equipo.', [
      'María de los Ángeles Rojas',
    ]);
    expect(result.sanitizedText).toContain('María de los Ángeles');
    expect(result.sanitizedText).not.toContain('[persona');
  });

  it('preserves a partial reference to a single roster entry (residual R2)', () => {
    // "Andrea Fuentes" is a subset of one entry, so it survives. Deliberate:
    // partial references to attendees are routine in session speech.
    const result = sanitize('El informe lo firmó Andrea Fuentes la semana pasada.', [
      'Camila Andrea Fuentes',
    ]);
    expect(result.sanitizedText).toContain('Andrea Fuentes');
  });

  it('never acts partially INSIDE a segment', () => {
    // Two students separated only by a comma are two segments, and both go —
    // partial action is illegal inside a segment, never between them.
    const result = sanitize('Quedaron Martina Rojas, Benjamín Soto y otro más.', ['Camila Fuentes']);
    expect(result.sanitizedText).not.toContain('Martina');
    expect(result.sanitizedText).not.toContain('Rojas');
    expect(result.sanitizedText).not.toContain('Benjamín');
    expect(result.sanitizedText).not.toContain('Soto');
  });
});

describe('sanitize — segments split at gap punctuation', () => {
  // buildSpans merges adjacent name tokens whatever punctuation sits between
  // them, so a comma list and a sentence boundary both arrive as ONE span.
  // Splitting there is what makes the person count match the people present.

  it('counts a comma-joined pair as two people and emits the comma verbatim', () => {
    const result = sanitize('Quedaron Martina Rojas, Benjamín Soto y otro más.', ['Camila Fuentes']);
    expect(result.sanitizedText).toContain('[persona 1], [persona 2]');
    expect(result.metrics.personCount).toBe(2);
    expect(result.metrics.redactionCount).toBe(2);
  });

  it('splits a span that merged across a sentence boundary, keeping the period', () => {
    const result = sanitize(
      'Hablamos de la estudiante Martina Rojas. Benjamín Soto llegó tarde a la sesión.',
      ['Camila Fuentes']
    );
    expect(result.sanitizedText).toBe(
      'Hablamos de la estudiante [persona 1]. [persona 2] llegó tarde a la sesión.'
    );
    expect(result.metrics.personCount).toBe(2);
  });

  it('does NOT split an abbreviation period — the honorific still reaches "Elena"', () => {
    // AMENDED in Z0B-1r5. The abbreviation exception used to be asserted on the
    // SPAN: "Sra. Elena" arrived as one detection because `Sra` self-marked and
    // the period did not split it. Under G4 the title is not name material at
    // all, so the span is `Elena` alone and the exception's job is now the one
    // it should always have had — letting the honorific TRIGGER reach across its
    // own period. The name still goes; the title now survives.
    const result = sanitize(
      'Camila Fuentes coordinó la entrevista con la Sra. Elena para el martes.',
      ATTENDEES
    );
    const redaction = result.detections.find((d) => d.action === 'redacted');
    expect(redaction?.surface).toBe('Elena');
    expect(redaction?.layer).toBe('honorific');
    expect(result.metrics.personCount).toBe(1);
    expect(result.sanitizedText).toContain('la Sra. [persona 1] para el martes');
  });

  it('runs whole-span coverage BEFORE splitting, so an inverted attendee survives', () => {
    // "Fuentes, Camila" matches the roster on sorted keys at step 1. If the
    // comma split first, it would become an unknown "Fuentes" plus a bare
    // "Camila" and the facilitator's name would be destroyed.
    const result = sanitize('En la nómina aparece Fuentes, Camila como facilitadora.', [
      'Camila Fuentes',
    ]);
    expect(result.sanitizedText).toContain('Fuentes, Camila');
    expect(result.metrics.redactionCount).toBe(0);
    expect(result.detections).toEqual([
      expect.objectContaining({ surface: 'Fuentes, Camila', action: 'preserved' }),
    ]);
  });

  it('overcounts an inverted UNKNOWN person — the accepted artifact that replaces R3', () => {
    // "Rojas, Benjamín" is one person written surname-first, and the comma
    // makes it two. Both are redacted, so nothing leaks; the cost is one extra
    // person in the §6 density metric, which is the safe direction for a metric
    // that decides whether a human should look.
    const result = sanitize('En la nómina aparece Rojas, Benjamín como caso nuevo.', [
      'Camila Fuentes',
    ]);
    expect(result.sanitizedText).toContain('[persona 1], [persona 2]');
    expect(result.metrics.personCount).toBe(2);
  });
});

describe('sanitize — role-pattern candidates must be name-plausible', () => {
  // A role noun marks what follows it, but only where that token could be a
  // name. Without the filter, every plural-role-noun sentence in ordinary
  // speech produced a person: "los alumnos [persona 1] bien".

  it('leaves the verb after a plural role noun alone', () => {
    const text = 'Los alumnos trabajaron bien y las estudiantes avanzaron rápido.';
    const result = sanitize(text, ATTENDEES);
    expect(result.sanitizedText).toBe(text);
    expect(result.metrics.personCount).toBe(0);
  });

  it('leaves quantifiers, adjectives and gerunds after a role noun alone', () => {
    for (const text of [
      'Hay dos estudiantes más que necesitan apoyo.',
      'La alumna nueva llegó esta semana.',
      'Vimos a los estudiantes estudiando en la sala.',
      'Las estudiantes destacadas prepararon la presentación.',
      'Los alumnos de séptimo siguen sin sala fija.',
    ]) {
      expect(sanitize(text, ATTENDEES).sanitizedText).toBe(text);
    }
  });

  it('still redacts a name the transcription lowercased, as uncertain', () => {
    const result = sanitize('El equipo comentó que el alumno benjamín no ha entregado.', ATTENDEES);
    const detection = result.detections.find((d) => d.action === 'redacted');
    expect(detection?.layer).toBe('role-pattern');
    expect(detection?.confidence).toBe('uncertain');
    expect(result.sanitizedText).not.toContain('benjamín');
  });

  it('applies the same rule behind one connector', () => {
    const result = sanitize('Conversamos con el alumno llamado diego en la sala.', ATTENDEES);
    expect(result.sanitizedText).not.toContain('diego');
    expect(sanitize('Conversamos con la alumna de kinder sobre el horario.', ATTENDEES).sanitizedText).toBe(
      'Conversamos con la alumna de kinder sobre el horario.'
    );
  });

  it('keeps a capitalized candidate at high confidence, ordinary word or not', () => {
    const result = sanitize('La alumna Rosa ha estado más callada en clases.', ATTENDEES);
    const detection = result.detections.find((d) => d.surface === 'Rosa');
    expect(detection?.layer).toBe('role-pattern');
    expect(detection?.confidence).toBe('high');
    expect(detection?.action).toBe('redacted');
  });

  it('documents the -ando collision the ending set was measured into', () => {
    // "fernando" carries the gerund ending, and the ending has to stay: without
    // it "vimos a los estudiantes estudiando" redacts. Measured in
    // zoom-spike-results.md §3.5.2. The cost lands ONLY on a name that is
    // lowercased everywhere in the transcript.
    const capitalized = sanitize('Conversamos con el alumno Fernando en el recreo.', ATTENDEES);
    expect(capitalized.sanitizedText).not.toContain('Fernando');

    const rescued = sanitize(
      'El alumno Fernando entregó la guía. Después fernando volvió a la sala.',
      ATTENDEES
    );
    expect(rescued.sanitizedText).not.toContain('Fernando');
    expect(rescued.sanitizedText).not.toContain('fernando');

    const lowercaseOnly = sanitize('Conversamos con el alumno fernando en el recreo.', ATTENDEES);
    expect(lowercaseOnly.sanitizedText).toContain('fernando');
  });
});

describe('sanitize — G1: trigger patterns respect sentence boundaries', () => {
  // A trigger-adjacent pattern must not reach across a sentence terminator.
  // Every layer that has a trigger is bound by the same guard, so these cases
  // are the class statement, not three unrelated bugs.

  it('does not let a role noun mark the word opening the next sentence', () => {
    const text = 'Llegaron temprano los alumnos. Entonces conversamos del plan.';
    const result = sanitize(text, ATTENDEES);
    expect(result.sanitizedText).toBe(text);
    expect(result.metrics.redactionCount).toBe(0);
  });

  it('does not let a course word mark the word opening the next sentence', () => {
    const text = 'Vimos a los niños de quinto básico. Entonces decidimos avanzar.';
    const result = sanitize(text, ATTENDEES);
    expect(result.sanitizedText).toBe(text);
    expect(result.metrics.redactionCount).toBe(0);
  });

  it('does not let an honorific mark across a sentence break', () => {
    const text = 'Quedó pendiente hablar con la profesora. Después revisamos el acta.';
    const result = sanitize(text, ATTENDEES);
    expect(result.sanitizedText).toBe(text);
    expect(result.metrics.personCount).toBe(0);
  });

  it('keeps the abbreviation exception — the honorific still fires across its period', () => {
    // AMENDED in Z0B-1r5 for the same reason as the segment-split twin above:
    // what crosses the period is the trigger, not the span.
    const result = sanitize(
      'Camila Fuentes coordinó la entrevista con la Sra. Elena para el martes.',
      ATTENDEES
    );
    const redaction = result.detections.find((d) => d.action === 'redacted');
    expect(redaction?.surface).toBe('Elena');
    expect(result.metrics.personCount).toBe(1);
  });

  it('leaves commas and plain spaces legal inside a pattern', () => {
    // G1 blocks sentence terminators only: the constructions that legitimately
    // carry a comma must keep working.
    const course = sanitize('El caso de quinto básico, Emilia, se conversó ayer.', ATTENDEES);
    expect(course.sanitizedText).not.toContain('Emilia');

    const role = sanitize('Hablamos con la estudiante, Martina, sobre la guía.', ATTENDEES);
    expect(role.sanitizedText).not.toContain('Martina');
  });
});

describe('sanitize — G2: every pattern layer shares one plausibility rule', () => {
  // r3 gave role-pattern a name-plausibility test. r4 makes it the shared
  // predicate every trigger layer runs through, which is what turns a fixed
  // instance into a closed class.

  it('leaves the verb after an honorific alone', () => {
    for (const text of [
      'La profesora terminaba explicando dos veces la misma consigna.',
      'El profesor entregó la pauta corregida ayer.',
      'La señora dijo que faltaban sillas en la sala.',
      'La asistente contó que faltaban materiales.',
      'El tío vino a buscar a su sobrino después del recreo.',
    ]) {
      expect(sanitize(text, ATTENDEES).sanitizedText).toBe(text);
    }
  });

  it('still redacts a lowercased name after an honorific, as uncertain', () => {
    const result = sanitize('Conversamos con don ignacio sobre el rendimiento.', ATTENDEES);
    const detection = result.detections.find((d) => d.action === 'redacted');
    expect(detection?.layer).toBe('honorific');
    expect(detection?.confidence).toBe('uncertain');
    expect(result.sanitizedText).not.toContain('ignacio');
  });

  it('keeps a capitalized candidate after an honorific at high confidence', () => {
    const result = sanitize('Los cursos chicos le dicen tía Rosa a la asistente.', ATTENDEES);
    const detection = result.detections.find((d) => d.surface === 'Rosa');
    expect(detection?.layer).toBe('honorific');
    expect(detection?.confidence).toBe('high');
    expect(detection?.action).toBe('redacted');
  });

  it('never lets a pattern layer mark a sentence-initial ordinary word', () => {
    // Defence in depth behind G1: even if a trigger could reach the token,
    // capitalization carries no information at a sentence start.
    const result = sanitize('Hablamos con los alumnos. Entonces cerramos la sesión.', ATTENDEES);
    expect(result.detections).toEqual([]);
  });

  it('does not let a course word turn an institution head into a person', () => {
    // Found while implementing r4: the course-pattern i-2 variant marked the
    // capitalized ORG_HEADS token, fragmenting the institution name.
    const text = 'Trabajamos en primero básico del Colegio San Mateo durante la mañana.';
    const result = sanitize(text, ATTENDEES);
    expect(result.sanitizedText).toBe(text);
    expect(result.sanitizedText).toContain('Colegio San Mateo');
  });

  it('keeps course-pattern capitalization-only — the shared predicate does not relax it', () => {
    const text = 'El caso de quinto básico, emilia, se conversó con la dupla.';
    expect(sanitize(text, ATTENDEES).sanitizedText).toBe(text);
  });
});

describe('sanitize — G3: left extension does not swallow a verb', () => {
  it('leaves a sentence-opening verb outside the persona span', () => {
    const result = sanitize('Quedaron Martina Rojas y Benjamín Soto a cargo del mural.', [
      'Camila Fuentes',
    ]);
    expect(result.sanitizedText).toBe('Quedaron [persona 1] y [persona 2] a cargo del mural.');
    expect(result.metrics.personCount).toBe(2);
  });

  it('still extends across a genuine compound name', () => {
    for (const [text, expected] of [
      ['Juan Pablo mostró un avance importante en matemática.', 'Juan Pablo'],
      ['Ayer llegó María José Aravena con el informe del ciclo.', 'María José Aravena'],
      ['El acta menciona a Ana María Tapia como responsable.', 'Ana María Tapia'],
    ] as const) {
      const result = sanitize(text, ATTENDEES);
      for (const part of expected.split(' ')) {
        expect(result.sanitizedText).not.toContain(part);
      }
    }
  });

  it('leaves name-free sentence-initial verbs alone', () => {
    const text = 'Quedaron los materiales listos para la próxima sesión.';
    expect(sanitize(text, ATTENDEES).sanitizedText).toBe(text);
  });
});

describe('sanitize — G4: a trigger token is never name material', () => {
  // v1.5. G1/G2/G3 bounded where a trigger may REACH. None of them asked
  // whether the trigger token itself may be MARKED, and the answer was yes on
  // three paths at once — so a title fused into the person span, the span then
  // failed roster coverage, and the attendee standing beside the title was
  // destroyed. These are the class assertions, one per path.

  it('V1 — the capitalization layer cannot self-mark a lexicon token', () => {
    // Empty roster on purpose: nobody is exempt, so whatever survives in the
    // output survives because it was never marked, not because it was allowed.
    for (const [text, lexical] of [
      ['La Profesora Marcela propuso un cambio de horario.', 'Profesora'], // HONORIFICS
      ['La Alumna Martina no llegó a clases.', 'Alumna'], // ROLE_NOUNS
      ['En Quinto Básico revisamos la pauta de observación.', 'Quinto Básico'], // COURSE_WORDS
      ['El Dr. Martínez revisó el informe del ciclo.', 'Dr.'], // ABBREVIATIONS
    ] as const) {
      expect(sanitize(text, []).sanitizedText).toContain(lexical);
    }
  });

  it('V2 — left extension stops at each lexicon, one token per lexicon', () => {
    // Each case puts the lexicon member immediately LEFT of a marked name with
    // a plain-space gap, sentence-initial so the capitalization layer has
    // already skipped it. That leaves the extension pass as the only thing that
    // can absorb it — and therefore the only place the break can go. The course
    // and role lines are terse transcript shapes; a mid-sentence course word is
    // already stopped by V1, so this is the only construction that reaches the
    // extension pass at all.
    for (const [text, absorbed] of [
      ['Doña Carmen firmó el acta de la sesión.', 'Doña'], // HONORIFICS
      ['Alumna Martina no llegó a clases hoy.', 'Alumna'], // ROLE_NOUNS
      ['Kinder Florencia no llegó a clases hoy.', 'Kinder'], // COURSE_WORDS
      ['Dra Antonia revisó el caso durante la semana.', 'Dra'], // ABBREVIATIONS
    ] as const) {
      const result = sanitize(text, []); // empty roster: everyone redacts
      expect(result.sanitizedText).toContain(absorbed);
      expect(result.metrics.redactionCount).toBe(1);
    }
  });

  it('V3 — the shared pattern predicate vetoes a title following a title', () => {
    const result = sanitize('El Profesor Jefe mencionó el calendario.', ['Camila Fuentes']);
    expect(result.detections).toEqual([]);
    expect(result.metrics.personCount).toBe(0);
  });

  it("V3 — the course-vs-role asymmetry on NON_PERSON_PROPER, both sides", () => {
    // Role/honorific sites keep NON_PERSON_PROPER reachable, because it holds
    // real es-CL given names whose ONLY path this is.
    const role = sanitize('Hablamos con el alumno Julio sobre la guía.', ['Camila Fuentes']);
    expect(role.sanitizedText).not.toContain('Julio');
    expect(role.detections[0]?.layer).toBe('role-pattern');

    const honorific = sanitize('Conversamos con don Santiago sobre el caso.', ['Camila Fuentes']);
    expect(honorific.sanitizedText).not.toContain('Santiago');

    // Course sites veto it, which is what kills "Básico" and school subjects.
    const course = sanitize('En quinto básico Lenguaje se trabajó con la pauta.', [
      'Camila Fuentes',
    ]);
    expect(course.sanitizedText).toBe('En quinto básico Lenguaje se trabajó con la pauta.');
  });

  it('V3 — the accepted narrow miss the asymmetry buys: a course-only month-named student', () => {
    // "de 5°B, Julio" is a miss: the capitalization layer vetoes julio outright
    // and G4' vetoes it at the course site, so no path reaches him. Narrow and
    // self-healing — one mention anywhere else in the transcript redeems him.
    const courseOnly = sanitize('El caso de quinto básico, Julio, se conversó ayer.', [
      'Camila Fuentes',
    ]);
    expect(courseOnly.sanitizedText).toContain('Julio'); // documented residual

    const redeemed = sanitize(
      'El caso de quinto básico, Julio, se conversó ayer. El alumno Julio faltó el lunes.',
      ['Camila Fuentes']
    );
    expect(redeemed.sanitizedText).not.toContain('Julio');
  });

  it('V4 — jefe/jefa are vetoed as candidates and active as triggers', () => {
    const asCandidate = sanitize('El Profesor Jefe entregó el informe del curso.', [
      'Camila Fuentes',
    ]);
    expect(asCandidate.sanitizedText).toBe('El Profesor Jefe entregó el informe del curso.');

    const asTrigger = sanitize('el profesor jefe marcelo revisó la pauta.', ['Camila Fuentes']);
    expect(asTrigger.sanitizedText).not.toContain('marcelo');
    expect(asTrigger.detections[0]?.layer).toBe('honorific');
    expect(asTrigger.detections[0]?.confidence).toBe('uncertain');
  });

  it('V4 — promoting a trigger does not over-redact the role title around it', () => {
    for (const text of [
      'La jefa técnica revisó la planificación del ciclo.',
      'El jefe de UTP pidió el informe antes del viernes.',
    ]) {
      expect(sanitize(text, ['Camila Fuentes']).sanitizedText).toBe(text);
    }
  });

  it('carves out the one lexicon member that is a real given name', () => {
    // "niña" and "Nina" collapse to the same normalized key, so a blanket
    // ROLE_NOUNS veto would make a girl called Nina undetectable everywhere.
    const caught = sanitize('La alumna Nina pidió cambiarse de puesto.', ['Camila Fuentes']);
    expect(caught.sanitizedText).not.toContain('Nina');

    // …and the carve-out must not leak back through cross-reference, which is
    // keyed on the accent-stripped norm.
    const bothForms = sanitize(
      'La alumna Nina pidió cambiarse de puesto y la niña de kinder también.',
      ['Camila Fuentes']
    );
    expect(bothForms.sanitizedText).toContain('la niña de kinder');
    expect(bothForms.metrics.personCount).toBe(1);
  });

  it('keeps the title in the output when the name beside it is redacted', () => {
    // The consequence of the whole round: titles now SURVIVE redaction, which
    // is better minuta text than the swallowed title it replaces.
    expect(sanitize('La Sra. Rosa reclamó por el horario.', ['Camila Fuentes']).sanitizedText).toBe(
      'La Sra. [persona 1] reclamó por el horario.'
    );
    expect(sanitize('La Alumna Martina no llegó a clases.', ['Camila Fuentes']).sanitizedText).toBe(
      'La Alumna [persona 1] no llegó a clases.'
    );
  });
});

describe('sanitize — G4 and the bare-attendee heuristic', () => {
  // Once the title leaves the span, "Sra. Elena" reduces to a ONE-token span —
  // which lands the attendee on the bare-roster-token heuristic rather than on
  // whole-span coverage. That is the intended path, and it carries the same
  // contamination caveat it always had.

  it('preserves an honorific-addressed attendee through the bare-token path', () => {
    const result = sanitize('La Sra. Elena presentó el informe de asistencia.', ['Elena Vidal']);
    expect(result.sanitizedText).toBe('La Sra. Elena presentó el informe de asistencia.');
    expect(result.detections).toEqual([
      expect.objectContaining({ surface: 'Elena', layer: 'honorific', action: 'preserved' }),
    ]);
  });

  it('still redacts that bare token when another person in the transcript contaminates it', () => {
    // Unchanged caveat: a redacted "Elena Fuenzalida" makes the bare "Elena"
    // ambiguous, and §12 resolves ambiguity to redaction. G4 does not weaken
    // this — it only stops the TITLE from being the thing that fails coverage.
    const result = sanitize(
      'La Sra. Elena presentó el informe. La apoderada Elena Fuenzalida reclamó después.',
      ['Elena Vidal']
    );
    expect(result.sanitizedText).not.toContain('Elena Fuenzalida');
    expect(result.sanitizedText).toContain('La Sra. [persona');
  });

  it('takes the whole-span path when the attendee is named in full behind the title', () => {
    const result = sanitize('La Sra. Elena Vidal presentó el informe.', ['Elena Vidal']);
    expect(result.sanitizedText).toBe('La Sra. Elena Vidal presentó el informe.');
    expect(result.metrics.redactionCount).toBe(0);
  });
});

describe('sanitize — stable person tokens', () => {
  it('gives the same person the same number across mentions', () => {
    const result = sanitize(
      'El alumno Cristóbal Vergara llegó tarde. Hablamos con Cristóbal en la mañana.',
      ATTENDEES
    );
    const tokens = result.sanitizedText.match(/\[persona \d+\]/g) ?? [];
    expect(tokens.length).toBe(2);
    expect(new Set(tokens).size).toBe(1);
    expect(result.metrics.personCount).toBe(1);
  });

  it('gives different people different numbers', () => {
    const result = sanitize(
      'El alumno Benjamín Soto y la estudiante Martina Rojas presentaron por separado.',
      ATTENDEES
    );
    const tokens = new Set(result.sanitizedText.match(/\[persona \d+\]/g) ?? []);
    expect(tokens.size).toBe(2);
    expect(result.metrics.personCount).toBe(2);
  });

  it('numbers people from 1 upward', () => {
    const result = sanitize('El alumno Benjamín habló con la estudiante Martina.', ATTENDEES);
    expect(result.sanitizedText).toContain('[persona 1]');
    expect(result.sanitizedText).toContain('[persona 2]');
  });
});

describe('sanitize — detection records', () => {
  it('records offsets that point at the original surface text', () => {
    const text = 'La estudiante Martina Rojas presentó su trabajo.';
    const result = sanitize(text, ATTENDEES);
    const redaction = result.detections.find((d) => d.action === 'redacted');
    expect(redaction).toBeDefined();
    expect(text.slice(redaction!.start, redaction!.end)).toBe(redaction!.surface);
  });

  it('labels the layer that fired', () => {
    const honorific = sanitize('Conversamos con don Ignacio ayer.', ATTENDEES);
    expect(honorific.detections[0]?.layer).toBe('honorific');

    const role = sanitize('Vimos el caso del alumno Maximiliano hoy.', ATTENDEES);
    expect(role.detections.some((d) => d.layer === 'role-pattern')).toBe(true);
  });

  it('marks a capitalized ordinary word as uncertain and still redacts it', () => {
    const result = sanitize('El equipo comentó que Rosa ha estado más callada.', ATTENDEES);
    const detection = result.detections.find((d) => d.surface === 'Rosa');
    expect(detection?.confidence).toBe('uncertain');
    expect(detection?.action).toBe('redacted');
    expect(result.sanitizedText).not.toContain('Rosa');
  });

  it('never leaves an uncertain detection passed through', () => {
    const result = sanitize(
      'Hablamos con Rosa, con Ángel y con Sol durante la jornada de trabajo.',
      ATTENDEES
    );
    const passedThrough = result.detections.filter(
      (d) => d.confidence === 'uncertain' && d.action !== 'redacted'
    );
    expect(passedThrough).toEqual([]);
  });
});

describe('sanitize — flagged status', () => {
  it('stays sanitized for a transcript with few student references', () => {
    const text = `${'Revisamos los acuerdos del ciclo anterior y definimos los focos del semestre. '.repeat(
      12
    )} El alumno Benjamín avanzó bien.`;
    const result = sanitize(text, ATTENDEES);
    expect(result.status).toBe('sanitized');
    expect(result.flagReasons).toEqual([]);
  });

  it('flags a transcript dense in student references', () => {
    const result = sanitize(
      'El alumno Benjamín, la alumna Martina, el estudiante Tomás y la estudiante Antonia.',
      ATTENDEES
    );
    expect(result.status).toBe('flagged');
    expect(result.flagReasons.length).toBeGreaterThan(0);
    expect(result.flagReasons[0]).toMatch(/density/);
  });

  it('still redacts when flagged — flagging is an extra gate, not a substitute', () => {
    const result = sanitize(
      'El alumno Benjamín, la alumna Martina, el estudiante Tomás y la estudiante Antonia.',
      ATTENDEES
    );
    expect(result.status).toBe('flagged');
    expect(result.sanitizedText).not.toContain('Benjamín');
    expect(result.sanitizedText).not.toContain('Martina');
  });

  it('honours a caller-supplied density threshold', () => {
    const text = 'El alumno Benjamín, la alumna Martina, el estudiante Tomás.';
    expect(sanitize(text, ATTENDEES, { flagDensityThreshold: 100 }).status).toBe('sanitized');
    expect(sanitize(text, ATTENDEES, { flagDensityThreshold: 0 }).status).toBe('flagged');
  });

  it('exposes a documented default threshold', () => {
    expect(DEFAULT_FLAG_DENSITY_THRESHOLD).toBeGreaterThan(0);
  });
});

describe('sanitize — non-person proper nouns', () => {
  it('leaves institutions alone', () => {
    const result = sanitize(
      'En el Colegio San Mateo trabajamos con la Fundación Nueva Educación.',
      ATTENDEES
    );
    expect(result.sanitizedText).toContain('Colegio San Mateo');
    expect(result.sanitizedText).toContain('Fundación Nueva Educación');
  });

  it('leaves subjects and school vocabulary alone', () => {
    const text = 'Revisamos Matemática, Lenguaje y Ciencias junto al equipo de Convivencia.';
    expect(sanitize(text, ATTENDEES).sanitizedText).toBe(text);
  });
});
