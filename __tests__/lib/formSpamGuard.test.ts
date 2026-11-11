// @vitest-environment node
/**
 * lib/formSpamGuard — bot screening shared by the public forms.
 *
 * The fixtures are synthetic. The bot-shaped ones reproduce the pattern seen on
 * the homepage contact form (random mixed-case letters as name and institution,
 * a Gmail address with scattered dots); the person-shaped ones reproduce the
 * SHAPE of the one real message of that period (a full name, a school address,
 * a school's name) with invented values.
 */
import { describe, it, expect } from 'vitest';
import {
  MIN_HUMAN_FILL_MS,
  SPAM_SUBJECT_TAG,
  assessFormSubmission,
  hasGmailDotPattern,
  looksLikeRandomLetters,
} from '../../lib/formSpamGuard';

const BOT_NAME = 'lFtYkmFHIyiDfcJHdZvKYzl';
const BOT_INSTITUTION = 'KrxBTJRJOwmoiZzpcmwoazP';
const BOT_EMAIL = 'bot.x.prueba9.1@gmail.com';

const REAL_NAME = 'Carolina Muñoz Sepúlveda';
const REAL_INSTITUTION = 'Colegio Los Aromos de Ejemplo';
const REAL_EMAIL = 'direccion@colegio-los-aromos.example';
const REAL_MESSAGE = 'Somos un colegio de Temuco y queremos saber más sobre la pasantía.';

function contactFields(nombre: unknown, institucion: unknown, mensaje: unknown) {
  return [
    { label: 'Nombre', value: nombre },
    { label: 'Institución', value: institucion },
    { label: 'Mensaje', value: mensaje, freeText: true },
  ];
}

/** Deterministic PRNG (mulberry32), so the bulk case never flakes. */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomLetters(random: () => number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return out;
}

describe('looksLikeRandomLetters', () => {
  it.each([BOT_NAME, BOT_INSTITUTION, 'qWzRtPlKjHgFdSxCvBnM', `  ${BOT_NAME}  `, `${BOT_NAME}.`])(
    'flags a bot-style value: %s',
    (value) => {
      expect(looksLikeRandomLetters(value)).toBe(true);
    }
  );

  it('flags a random word sitting among ordinary ones', () => {
    expect(looksLikeRandomLetters(`Colegio ${BOT_INSTITUTION}`)).toBe(true);
  });

  it('catches at least 95% of 500 uniform random 23-letter strings', () => {
    const random = seededRandom(20261111);
    let caught = 0;
    for (let i = 0; i < 500; i += 1) {
      if (looksLikeRandomLetters(randomLetters(random, 23))) caught += 1;
    }
    expect(caught).toBeGreaterThanOrEqual(475);
  });

  // Names and institutions a real visitor could type, including the awkward
  // ones: compound and foreign surnames, acronyms, run-together words, all
  // caps, all lower case.
  it.each([
    REAL_NAME,
    REAL_INSTITUTION,
    'María José Fernández Valenzuela',
    'Ximena Goycoolea Etcheverry',
    'Juan Pablo McDonald',
    'Sofía MacKenna DeLaFuente',
    'Bernardo OHiggins Riquelme',
    'Arnold Schwarzenegger',
    'Krzysztof Brzęczyszczykiewicz',
    'Hans Kirschbaum Schtscherbakow',
    'MARÍA JOSÉ FERNÁNDEZ VALENZUELA',
    'maría josé fernández valenzuela',
    'Mª Ángeles Ñuñoa',
    '王小明',
    'Liceo Bicentenario de Temuco',
    'Escuela Básica República de Francia',
    'Pontificia Universidad Católica de Valparaíso (PUCV)',
    'Duoc UC',
    'DuocUC',
    'UdeC',
    'USACh',
    'INACAP',
    'SSCC Manquehue',
    'SLEP Chinchorro',
    'Deutsche Schule Santiago',
    'ColegioSanJoseDeLaSalle',
    'PontificiaUniversidadCatolicaDeChile',
    'EscuelaIndustrialSanPedroDeLaPaz',
    'ComplejoEducacionalMonseñorGuillermoHartl',
    'FundaciónNuevaEducaciónChile',
    'colegio.ejemplo@gmail.com',
    'www.colegioejemplo.cl',
    'Colegio N°123',
    'x',
    '',
  ])('does not flag a real-looking value: %s', (value) => {
    expect(looksLikeRandomLetters(value)).toBe(false);
  });

  it.each([undefined, null, 42, {}, ['a']])('non-string input is never flagged: %s', (value) => {
    expect(looksLikeRandomLetters(value)).toBe(false);
  });

  it('short random words are left alone (too little to judge)', () => {
    expect(looksLikeRandomLetters('kRtZpQw')).toBe(false);
  });

  describe('free text (mode "all")', () => {
    it('flags a message that is nothing but random letters', () => {
      expect(looksLikeRandomLetters(BOT_NAME, 'all')).toBe(true);
      expect(looksLikeRandomLetters(`${BOT_NAME} ${BOT_INSTITUTION}`, 'all')).toBe(true);
    });

    it('does not flag a real sentence that contains one odd token', () => {
      expect(looksLikeRandomLetters(`Les dejo el documento: ${BOT_INSTITUTION}`, 'all')).toBe(false);
      expect(looksLikeRandomLetters(REAL_MESSAGE, 'all')).toBe(false);
    });
  });
});

describe('hasGmailDotPattern', () => {
  it.each([BOT_EMAIL, 'a.b.c.d@gmail.com', 'A.B.C.D@GMAIL.COM', 'a.b.c.d@googlemail.com', ' a.b.c.d+x@gmail.com '])(
    'flags %s',
    (email) => {
      expect(hasGmailDotPattern(email)).toBe(true);
    }
  );

  it.each([
    'maria.jose.perez@gmail.com',
    'm.j.perez@gmail.com',
    'mariaperez@gmail.com',
    'ab+uno.dos.tres.cuatro@gmail.com',
    'a.b.c.d@colegio-ejemplo.example',
    REAL_EMAIL,
    'not-an-email',
    '',
    undefined,
    7,
  ])('does not flag %s', (email) => {
    expect(hasGmailDotPattern(email)).toBe(false);
  });
});

describe('assessFormSubmission — the observed bot is blocked', () => {
  it('random name + random institution + dotted Gmail → blocked', () => {
    const result = assessFormSubmission({
      honeypot: '',
      elapsedMs: 45000,
      expectTiming: true,
      email: BOT_EMAIL,
      textFields: contactFields(BOT_NAME, BOT_INSTITUTION, 'hello'),
    });
    expect(result.verdict).toBe('blocked');
    expect(result.reasons.map((reason) => reason.signal)).toEqual([
      'random_text',
      'random_text',
      'gmail_dots',
    ]);
    expect(result.score).toBe(5);
  });

  it('random name + random institution is enough on its own', () => {
    const result = assessFormSubmission({
      elapsedMs: 45000,
      expectTiming: true,
      email: 'someone@example.com',
      textFields: contactFields(BOT_NAME, BOT_INSTITUTION, REAL_MESSAGE),
    });
    expect(result.verdict).toBe('blocked');
  });

  it('one random field + dotted Gmail → blocked', () => {
    const result = assessFormSubmission({
      elapsedMs: 45000,
      expectTiming: true,
      email: BOT_EMAIL,
      textFields: contactFields(BOT_NAME, REAL_INSTITUTION, REAL_MESSAGE),
    });
    expect(result.verdict).toBe('blocked');
  });

  it('trap field filled + sent instantly → blocked', () => {
    const result = assessFormSubmission({
      honeypot: 'https://spam.example',
      elapsedMs: 150,
      expectTiming: true,
      email: REAL_EMAIL,
      textFields: contactFields(REAL_NAME, REAL_INSTITUTION, REAL_MESSAGE),
    });
    expect(result.verdict).toBe('blocked');
    expect(result.reasons.map((reason) => reason.signal)).toEqual(['honeypot', 'too_fast']);
  });

  it('trap field filled by a direct POST (no timing) → blocked', () => {
    const result = assessFormSubmission({
      honeypot: 'x',
      expectTiming: true,
      email: REAL_EMAIL,
      textFields: contactFields(REAL_NAME, REAL_INSTITUTION, REAL_MESSAGE),
    });
    expect(result.verdict).toBe('blocked');
  });
});

describe('assessFormSubmission — a real person always gets through', () => {
  const person = {
    honeypot: '',
    elapsedMs: 95000,
    expectTiming: true,
    email: REAL_EMAIL,
    textFields: contactFields(REAL_NAME, REAL_INSTITUTION, REAL_MESSAGE),
  };

  it('the director-shaped message is clean, with no reasons at all', () => {
    expect(assessFormSubmission(person)).toEqual({ verdict: 'clean', score: 0, reasons: [] });
  });

  it('a page cached from before this shipped (no trap field, no timing) is still clean', () => {
    const result = assessFormSubmission({ ...person, honeypot: undefined, elapsedMs: undefined });
    expect(result.verdict).toBe('clean');
    expect(result.reasons.map((reason) => reason.signal)).toEqual(['no_timing']);
  });

  it('a Gmail address with many dots is still clean on its own', () => {
    const result = assessFormSubmission({ ...person, email: 'c.m.s.directora@gmail.com' });
    expect(result.verdict).toBe('clean');
  });

  it('a single uncertain sign is delivered and marked, never blocked', () => {
    const cases = [
      { ...person, elapsedMs: 900 }, // sent very fast
      { ...person, honeypot: 'autofill put something here' }, // trap field alone
      { ...person, textFields: contactFields(BOT_NAME, REAL_INSTITUTION, REAL_MESSAGE) },
      { ...person, textFields: contactFields(REAL_NAME, REAL_INSTITUTION, BOT_NAME) },
      { ...person, elapsedMs: undefined, email: 'c.m.s.directora@gmail.com' }, // two weak signs
    ];
    for (const input of cases) {
      expect(assessFormSubmission(input).verdict).toBe('flagged');
    }
  });

  it('every reason carries a sentence for the notification email', () => {
    const result = assessFormSubmission({ ...person, elapsedMs: 900 });
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0].detail).toBe('El formulario se envió en menos de 3 segundos.');
  });
});

describe('assessFormSubmission — timing', () => {
  const base = {
    email: REAL_EMAIL,
    textFields: contactFields(REAL_NAME, REAL_INSTITUTION, REAL_MESSAGE),
  };

  it('the threshold is three seconds, exclusive', () => {
    expect(MIN_HUMAN_FILL_MS).toBe(3000);
    expect(assessFormSubmission({ ...base, elapsedMs: 2999, expectTiming: true }).verdict).toBe('flagged');
    expect(assessFormSubmission({ ...base, elapsedMs: 3000, expectTiming: true }).verdict).toBe('clean');
  });

  it.each(['1200', -5, Number.NaN, Number.POSITIVE_INFINITY, null, {}])(
    'an unusable value (%s) counts as missing, not as fast',
    (elapsedMs) => {
      const result = assessFormSubmission({ ...base, elapsedMs, expectTiming: true });
      expect(result.reasons.map((reason) => reason.signal)).toEqual(['no_timing']);
      expect(result.verdict).toBe('clean');
    }
  );

  it('a form that does not report timing is not penalised for its absence', () => {
    expect(assessFormSubmission(base)).toEqual({ verdict: 'clean', score: 0, reasons: [] });
  });
});

describe('SPAM_SUBJECT_TAG', () => {
  it('is the mark staff will see in the inbox', () => {
    expect(SPAM_SUBJECT_TAG).toBe('[POSIBLE SPAM]');
  });
});
