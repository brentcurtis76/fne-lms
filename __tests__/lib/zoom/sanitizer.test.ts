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
