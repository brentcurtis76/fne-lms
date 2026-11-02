// @vitest-environment node
/**
 * I02–I04 — the TypeScript validator, the first guard in front of the RPC.
 * Synthetic names and RUTs only.
 */
import { describe, expect, it } from 'vitest';
import {
  MESSAGES,
  normalizeSchoolName,
  schoolNameKey,
  validateCreateBody,
  validateFinalizeBody,
  validateParticipantFields,
  validateRosterCreateBody,
  validateRosterPatchBody,
  validateSchoolFundingBody,
  validateUpdateBody,
} from '../../../../lib/pasantias/participants/validation';

const REQUEST_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

function fields(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    firstNames: 'María José',
    lastNames: "O'Higgins Núñez",
    rut: '12.345.678-5',
    passportNumber: null,
    // F01: no per-person funding — it is the school's answer (validateSchoolFundingBody).
    arrivalDate: null,
    departureDate: null,
    focus: null,
    dietaryRestrictions: [],
    dietaryOther: null,
    ...overrides,
  };
}

function createBody(overrides: Record<string, unknown> = {}) {
  return { ...fields(), clientRequestId: REQUEST_ID, acknowledged: true, ...overrides };
}

describe('names', () => {
  it.each(['Ñuñoa-Pérez', "D'Arcy", 'Anne-Marie', 'Ángela', 'José M.', 'Zoë Ålvarez', 'O’Brien'])(
    'accepts %j',
    (name) => {
      const { value, errors } = validateParticipantFields(fields({ firstNames: name }), 'inspira');
      expect(errors).toEqual({});
      expect(value?.firstNames).toBe(name);
    }
  );

  it('normalises to NFC, trims and collapses inner whitespace', () => {
    const typed = 'José   Luis ';
    // Whatever form this source literal is in, it stores collapsed and NFC.
    expect(validateParticipantFields(fields({ firstNames: typed }), 'inspira').value?.firstNames).toBe(
      typed.normalize('NFC').trim().replace(/\s+/g, ' ')
    );
    // "e" + COMBINING ACUTE ACCENT (U+0301), as some keyboards and pastes produce it.
    const input = '  Jose' + String.fromCharCode(0x301) + '   Luis ';
    const composed = 'Jos' + String.fromCharCode(0xe9) + ' Luis';
    const { value } = validateParticipantFields(fields({ firstNames: input }), 'inspira');
    expect(value?.firstNames).toBe(composed);
    expect(value?.firstNames).toHaveLength(9);
    // Precomposed and decomposed input store the same string.
    expect(validateParticipantFields(fields({ firstNames: composed }), 'inspira').value?.firstNames).toBe(composed);
  });

  it('accepts exactly 80 characters and refuses 81', () => {
    expect(validateParticipantFields(fields({ lastNames: 'a'.repeat(80) }), 'inspira').errors).toEqual({});
    expect(validateParticipantFields(fields({ lastNames: 'a'.repeat(81) }), 'inspira').errors.lastNames).toBe(
      MESSAGES.nameInvalid
    );
  });

  it.each([
    ['digits', 'Ana2'],
    ['a control character', 'Ana\u0007'],
    ['a leading apostrophe', "'Ana"],
    ['symbols', 'Ana@'],
  ])('refuses %s', (_label, name) => {
    expect(validateParticipantFields(fields({ firstNames: name }), 'inspira').errors.firstNames).toBe(
      MESSAGES.nameInvalid
    );
  });

  it('says "required" for an empty name', () => {
    const { errors } = validateParticipantFields(fields({ firstNames: '  ', lastNames: undefined }), 'inspira');
    expect(errors.firstNames).toBe(MESSAGES.firstNamesRequired);
    expect(errors.lastNames).toBe(MESSAGES.lastNamesRequired);
  });
});

describe('RUT, passport and enums', () => {
  it('stores the strict RUT form', () => {
    expect(validateParticipantFields(fields({ rut: '10.000.030-k' }), 'inspira').value?.rut).toBe('10000030-K');
    expect(validateParticipantFields(fields({ rut: '1x2.3a45.678-5' }), 'inspira').errors.rut).toBe(
      MESSAGES.rutInvalid
    );
    expect(validateParticipantFields(fields({ rut: '' }), 'inspira').errors.rut).toBe(MESSAGES.rutRequired);
  });

  it('passport is optional, upper-cased, 5–20 letters or digits', () => {
    expect(validateParticipantFields(fields({ passportNumber: null }), 'inspira').value?.passportNumber).toBeNull();
    expect(validateParticipantFields(fields({ passportNumber: '' }), 'inspira').value?.passportNumber).toBeNull();
    expect(validateParticipantFields(fields({ passportNumber: ' ab 12345 ' }), 'inspira').value?.passportNumber).toBe(
      'AB12345'
    );
    for (const bad of ['ABCD', 'A'.repeat(21), 'AB-12345', 12345]) {
      expect(validateParticipantFields(fields({ passportNumber: bad }), 'inspira').errors.passportNumber).toBe(
        MESSAGES.passportInvalid
      );
    }
  });

  // F01 (replaces "missing funding is an error and is never defaulted" on the
  // participant): the same rule now holds for the SCHOOL's answer.
  it('missing school funding is an error and is never defaulted', () => {
    const result = validateSchoolFundingBody({
      flightsFunding: undefined,
      lodgingFunding: '',
      expectedFundingVersion: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors.flightsFunding).toBe(MESSAGES.flightsFundingRequired);
      expect(result.errors.lodgingFunding).toBe(MESSAGES.lodgingFundingRequired);
    }
  });

  // F01: per-person funding is no longer accepted anywhere — the keys are unknown.
  it.each(['flightsFunding', 'lodgingFunding'])('a participant body carrying %j is refused whole', (key) => {
    const create = validateCreateBody(createBody({ [key]: 'sep' }), 'inspira');
    expect(create.ok).toBe(false);
    if (create.ok === false) expect(create.unknownKeys).toBe(true);
    const update = validateUpdateBody({ ...fields(), acknowledged: true, expectedVersion: 1, [key]: 'colegio' }, 'inspira');
    expect(update.ok).toBe(false);
    if (update.ok === false) expect(update.unknownKeys).toBe(true);
  });

  it('enum values are exact', () => {
    // F01: funding enum exactness now applies to the school body.
    const school = validateSchoolFundingBody({ flightsFunding: 'SEP', lodgingFunding: 'colegio', expectedFundingVersion: null });
    expect(school.ok === false && school.errors.flightsFunding).toBe(MESSAGES.flightsFundingRequired);
    expect(validateParticipantFields(fields({ focus: 'Infantil' }), 'inspira').errors.focus).toBe(MESSAGES.focusInvalid);
    expect(validateParticipantFields(fields({ focus: 'tercer_ciclo' }), 'inspira').value?.focus).toBe('tercer_ciclo');
    expect(validateParticipantFields(fields({ focus: '' }), 'inspira').value?.focus).toBeNull();
  });

  // F04: "Todos" is an explicit, exact, lowercase choice; blank stays optional.
  it('focus accepts todos and refuses Todos / unknown levels', () => {
    expect(validateParticipantFields(fields({ focus: 'todos' }), 'inspira').value?.focus).toBe('todos');
    for (const bad of ['Todos', 'TODOS', 'media', 'all']) {
      expect(validateParticipantFields(fields({ focus: bad }), 'inspira').errors.focus).toBe(MESSAGES.focusInvalid);
    }
    expect(validateParticipantFields(fields({ focus: null }), 'inspira').value?.focus).toBeNull();
  });
});

describe('per-program dates', () => {
  it('INSPIRA rejects Mirada’s departures and accepts its own', () => {
    for (const date of ['2027-01-30', '2027-02-05']) {
      expect(validateParticipantFields(fields({ departureDate: date }), 'inspira').errors.departureDate).toBe(
        MESSAGES.departureInvalid
      );
    }
    expect(validateParticipantFields(fields({ departureDate: '2027-01-29' }), 'inspira').value?.departureDate).toBe(
      '2027-01-29'
    );
  });

  it('Mirada Profunda rejects INSPIRA’s departures and accepts its own', () => {
    for (const date of ['2027-01-29', '2027-02-04']) {
      expect(validateParticipantFields(fields({ departureDate: date }), 'mirada-profunda').errors.departureDate).toBe(
        MESSAGES.departureInvalid
      );
    }
    expect(
      validateParticipantFields(fields({ departureDate: '2027-02-12' }), 'mirada-profunda').value?.departureDate
    ).toBe('2027-02-12');
  });

  it('arrival must be one of the options; null means "no indicado"', () => {
    expect(validateParticipantFields(fields({ arrivalDate: '2027-01-18' }), 'inspira').errors.arrivalDate).toBe(
      MESSAGES.arrivalInvalid
    );
    const ok = validateParticipantFields(fields({ arrivalDate: '2027-01-11', departureDate: null }), 'inspira');
    expect(ok.value?.arrivalDate).toBe('2027-01-11');
    expect(ok.value?.departureDate).toBeNull();
  });
});

describe('dietary', () => {
  it('comes out sorted (C order) and distinct', () => {
    const { value } = validateParticipantFields(
      fields({ dietaryRestrictions: ['vegetariano', 'otra', 'sin_gluten', 'vegetariano'], dietaryOther: '  Sin  mariscos ' }),
      'inspira'
    );
    expect(value?.dietaryRestrictions).toEqual(['otra', 'sin_gluten', 'vegetariano']);
    expect(value?.dietaryOther).toBe('Sin mariscos');
  });

  it('"Otra" requires a detail, and a detail requires "Otra"', () => {
    expect(
      validateParticipantFields(fields({ dietaryRestrictions: ['otra'], dietaryOther: ' ' }), 'inspira').errors.dietaryOther
    ).toBe(MESSAGES.dietaryOtherRequired);
    expect(
      validateParticipantFields(fields({ dietaryRestrictions: ['vegano'], dietaryOther: 'Algo' }), 'inspira').errors
        .dietaryOther
    ).toBe(MESSAGES.dietaryOtherWithoutOtra);
    expect(
      validateParticipantFields(fields({ dietaryRestrictions: ['otra'], dietaryOther: 'x'.repeat(201) }), 'inspira')
        .errors.dietaryOther
    ).toBe(MESSAGES.dietaryOtherRequired);
  });

  it.each([
    ['a newline', 'Sin\nmariscos'],
    ['a carriage return', 'Sin\r\nmariscos'],
    ['a tab', 'Sin\tmariscos'],
    ['a trailing newline', 'Sin mariscos\n'],
    ['a BEL', 'Sin\u0007mariscos'],
    ['DEL', 'Sin\u007Fmariscos'],
    ['a C1 control', 'Sin\u0085mariscos'],
  ])('refuses a detail with %s instead of rewriting it (DB parity)', (_label, detail) => {
    const { value, errors } = validateParticipantFields(
      fields({ dietaryRestrictions: ['otra'], dietaryOther: detail }),
      'inspira'
    );
    expect(value).toBeNull();
    expect(errors.dietaryOther).toBe(MESSAGES.dietaryOtherControl);
  });

  it('counts the 200-character detail limit in code points, not UTF-16 units', () => {
    const astral = String.fromCodePoint(0x1f957); // one code point, two UTF-16 units
    const at200 = astral.repeat(200);
    expect(at200.length).toBe(400);
    expect(
      validateParticipantFields(fields({ dietaryRestrictions: ['otra'], dietaryOther: at200 }), 'inspira').value
        ?.dietaryOther
    ).toBe(at200);
    expect(
      validateParticipantFields(fields({ dietaryRestrictions: ['otra'], dietaryOther: astral.repeat(201) }), 'inspira')
        .errors.dietaryOther
    ).toBe(MESSAGES.dietaryOtherRequired);
  });

  it('refuses unknown codes and non-arrays; empty means "not provided"', () => {
    expect(validateParticipantFields(fields({ dietaryRestrictions: ['halal'] }), 'inspira').errors.dietaryRestrictions).toBe(
      MESSAGES.dietaryInvalid
    );
    expect(validateParticipantFields(fields({ dietaryRestrictions: 'vegano' }), 'inspira').errors.dietaryRestrictions).toBe(
      MESSAGES.dietaryInvalid
    );
    expect(validateParticipantFields(fields({ dietaryRestrictions: [] }), 'inspira').value?.dietaryRestrictions).toEqual([]);
  });
});

describe('closed bodies', () => {
  it.each(['school', 'program', 'rosterId', 'notice_version'])('a create body with %j is refused whole', (key) => {
    const result = validateCreateBody(createBody({ [key]: 'x' }), 'inspira');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.unknownKeys).toBe(true);
  });

  it('create needs acknowledged === true and a UUID request id', () => {
    const result = validateCreateBody(createBody({ acknowledged: 'true', clientRequestId: 'abc' }), 'inspira');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.acknowledged).toBe(MESSAGES.acknowledged);
      expect(result.errors.clientRequestId).toBe(MESSAGES.requestInvalid);
    }
    const ok = validateCreateBody(createBody(), 'inspira');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.clientRequestId).toBe(REQUEST_ID);
  });

  it('update needs a positive integer expectedVersion and refuses clientRequestId', () => {
    for (const bad of [0, 1.5, '2', null]) {
      const result = validateUpdateBody({ ...fields(), acknowledged: true, expectedVersion: bad }, 'inspira');
      expect(result.ok).toBe(false);
    }
    const extra = validateUpdateBody({ ...fields(), acknowledged: true, expectedVersion: 1, clientRequestId: REQUEST_ID }, 'inspira');
    expect(extra.ok).toBe(false);
    const ok = validateUpdateBody({ ...fields(), acknowledged: true, expectedVersion: 3 }, 'inspira');
    expect(ok.ok).toBe(true);
  });

  it('non-object bodies are refused', () => {
    for (const body of [null, 'x', [], 42]) {
      expect(validateCreateBody(body, 'inspira').ok).toBe(false);
    }
  });

  it('finalize takes only expectedRosterVersion', () => {
    expect(validateFinalizeBody({ expectedRosterVersion: 4 })).toEqual({ ok: true, value: { expectedRosterVersion: 4 } });
    expect(validateFinalizeBody({ expectedRosterVersion: 0 }).ok).toBe(false);
    const extra = validateFinalizeBody({ expectedRosterVersion: 4, school: 'x' });
    expect(extra.ok).toBe(false);
    if (!extra.ok) expect(extra.unknownKeys).toBe(true);
  });
});

describe('admin bodies', () => {
  it('normalises the school name and mirrors the generated key for ASCII whitespace', () => {
    expect(normalizeSchoolName('  Colegio   San  José ')).toBe('Colegio San José');
    expect(normalizeSchoolName('A')).toBeNull();
    expect(normalizeSchoolName('x'.repeat(161))).toBeNull();
    expect(schoolNameKey('Colegio San José')).toBe('colegio san josé');
  });

  it('counts the school name in Unicode code points (2–160), not UTF-16 units', () => {
    const astral = String.fromCodePoint(0x1f3eb); // one code point, two UTF-16 units
    expect(astral.length).toBe(2);
    expect(normalizeSchoolName(astral)).toBeNull(); // 1 code point, although .length is 2
    expect(normalizeSchoolName(astral.repeat(2))).toBe(astral.repeat(2));
    expect(normalizeSchoolName(astral.repeat(160))).toBe(astral.repeat(160)); // .length 320
    expect(normalizeSchoolName(astral.repeat(161))).toBeNull();
    // NFC before counting: 160 × ("e" + U+0301) is 320 code points raw, 160 after NFC.
    const composedE = String.fromCharCode(0xe9);
    const decomposedE = 'e' + String.fromCharCode(0x301);
    expect(normalizeSchoolName(decomposedE.repeat(160))).toBe(composedE.repeat(160));
  });

  it('roster create: program and validDays are exact', () => {
    expect(validateRosterCreateBody({ schoolName: 'Colegio Uno', program: 'inspira', validDays: 90 }).ok).toBe(true);
    const bad = validateRosterCreateBody({ schoolName: 'C', program: 'otro', validDays: 45 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['program', 'schoolName', 'validDays']);
    const extra = validateRosterCreateBody({ schoolName: 'Colegio Uno', program: 'inspira', validDays: 90, token: 'x' });
    expect(extra.ok).toBe(false);
  });

  it('roster patch: rotate needs validDays, revoke takes nothing else, other actions refused', () => {
    expect(validateRosterPatchBody({ action: 'rotate', validDays: 30 })).toEqual({
      ok: true,
      value: { action: 'rotate', validDays: 30 },
    });
    expect(validateRosterPatchBody({ action: 'rotate' }).ok).toBe(false);
    expect(validateRosterPatchBody({ action: 'revoke' })).toEqual({ ok: true, value: { action: 'revoke' } });
    expect(validateRosterPatchBody({ action: 'revoke', validDays: 30 }).ok).toBe(false);
    expect(validateRosterPatchBody({ action: 'delete' }).ok).toBe(false);
  });
});
