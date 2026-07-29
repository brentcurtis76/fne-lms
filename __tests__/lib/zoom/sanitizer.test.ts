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
    // Two students with no connector between them stay one segment, so the
    // whole surface goes — a half-redacted name still names.
    const result = sanitize('Quedaron Martina Rojas, Benjamín Soto y otro más.', ['Camila Fuentes']);
    expect(result.sanitizedText).not.toContain('Martina');
    expect(result.sanitizedText).not.toContain('Rojas');
    expect(result.sanitizedText).not.toContain('Benjamín');
    expect(result.sanitizedText).not.toContain('Soto');
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
