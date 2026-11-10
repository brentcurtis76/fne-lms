// @vitest-environment node
/**
 * PASANTÍAS PANEL — request validation of the admin routes. Every body is a
 * closed shape; nothing is defaulted that the admin did not send.
 */
import { describe, expect, it } from 'vitest';
import {
  PANEL_MESSAGES,
  normalizeNotes,
  safeDisplayFileName,
  validateBulkBody,
  validateCorrectionBody,
  validateLogisticsBody,
  validateRosterDetailsBody,
  validateUploadFields,
} from '../../../../lib/pasantias/panel/validation';

const ID_A = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ID_B = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

const TRACKING = {
  flightStatus: 'purchased',
  lodgingStatus: 'reserved',
  depositReceived: true,
  balanceReceived: false,
  salutation: 'estimada',
  notes: '  Llamar al colegio\r\nel viernes  ',
  sclDepartureDate: '2027-01-16',
  bcnArrivalDate: '2027-01-17',
  bcnDepartureDate: '2027-01-29',
  sclArrivalDate: '2027-01-30',
  expectedVersion: 3,
};

function value<T>(result: { ok: boolean; value?: T }): T {
  expect(result.ok).toBe(true);
  return (result as { value: T }).value;
}

function errors(result: { ok: boolean; errors?: Record<string, string> }): Record<string, string> {
  expect(result.ok).toBe(false);
  return (result as { errors: Record<string, string> }).errors;
}

describe('validateLogisticsBody', () => {
  it('accepts a full tracking body and normalizes the notes (CRLF → LF, trimmed)', () => {
    expect(value(validateLogisticsBody(TRACKING))).toEqual({
      ...TRACKING,
      notes: 'Llamar al colegio\nel viernes',
    });
  });

  it('treats a blank greeting and blank notes as "not set" (null), never as a default', () => {
    const parsed = value(validateLogisticsBody({ ...TRACKING, salutation: '', notes: '   ', expectedVersion: null }));
    expect(parsed.salutation).toBeNull();
    expect(parsed.notes).toBeNull();
    expect(parsed.expectedVersion).toBeNull();
  });

  it('refuses the whole request on an unknown key', () => {
    const result = validateLogisticsBody({ ...TRACKING, updatedBy: ID_A });
    expect(errors(result)._form).toBe(PANEL_MESSAGES.unknownKeys);
    expect((result as { unknownKeys: boolean }).unknownKeys).toBe(true);
  });

  it('requires every tracking value: a missing one is an error, not "pending"', () => {
    const { flightStatus: _f, depositReceived: _d, ...rest } = TRACKING;
    const found = errors(validateLogisticsBody(rest));
    expect(found.flightStatus).toBe(PANEL_MESSAGES.flightInvalid);
    expect(found.depositReceived).toBe(PANEL_MESSAGES.paymentInvalid);
  });

  it.each([
    [{ flightStatus: 'reserved' }, 'flightStatus'],
    [{ lodgingStatus: 'purchased' }, 'lodgingStatus'],
    [{ balanceReceived: 'true' }, 'balanceReceived'],
    [{ salutation: 'Estimado' }, 'salutation'],
    [{ notes: 'x'.repeat(2001) }, 'notes'],
    [{ notes: 'tab\there' }, 'notes'],
    [{ notes: 42 }, 'notes'],
    [{ expectedVersion: 0 }, 'expectedVersion'],
    [{ expectedVersion: '3' }, 'expectedVersion'],
  ])('refuses %j', (change, field) => {
    expect(errors(validateLogisticsBody({ ...TRACKING, ...change }))[field]).toBeTruthy();
  });

  it('flight dates: blank or absent means "not entered", and a same-day leg is fine', () => {
    const { sclDepartureDate: _a, bcnArrivalDate: _b, bcnDepartureDate: _c, sclArrivalDate: _d, ...rest } = TRACKING;
    const none = value(validateLogisticsBody({ ...rest, bcnArrivalDate: '', sclArrivalDate: null }));
    expect([none.sclDepartureDate, none.bcnArrivalDate, none.bcnDepartureDate, none.sclArrivalDate]).toEqual([
      null,
      null,
      null,
      null,
    ]);
    const sameDay = value(
      validateLogisticsBody({ ...TRACKING, bcnDepartureDate: '2027-01-29', sclArrivalDate: '2027-01-29' })
    );
    expect(sameDay.sclArrivalDate).toBe('2027-01-29');
  });

  it.each([
    ['not a date', '17-01-2027'],
    ['an impossible day', '2027-02-30'],
    ['a date with a time', '2027-01-16T10:00:00Z'],
    ['before the cohort window', '2026-11-30'],
    ['after the cohort window', '2027-04-01'],
    ['a number', 20270116],
  ])('flight dates: refuses %s', (_label, bad) => {
    expect(errors(validateLogisticsBody({ ...TRACKING, sclDepartureDate: bad })).sclDepartureDate).toBe(
      PANEL_MESSAGES.flightDateInvalid
    );
  });

  it('flight dates: refuses a date earlier than a previous leg, naming the leg, even across a gap', () => {
    const found = errors(validateLogisticsBody({ ...TRACKING, bcnArrivalDate: '2027-01-15' }));
    expect(found.bcnArrivalDate).toContain('Llegada a BCN');
    expect(found.bcnArrivalDate).toContain(PANEL_MESSAGES.flightDateOrder);
    // Only the first and last are filled, in the wrong order.
    const gap = errors(
      validateLogisticsBody({ ...TRACKING, bcnArrivalDate: null, bcnDepartureDate: null, sclArrivalDate: '2027-01-10' })
    );
    expect(Object.keys(gap)).toEqual(['sclArrivalDate']);
  });

  it('requires expectedVersion to be present, so a first save and an edit are never confused', () => {
    const { expectedVersion: _e, ...rest } = TRACKING;
    expect(errors(validateLogisticsBody(rest)).expectedVersion).toBe(PANEL_MESSAGES.requestInvalid);
  });

  it('refuses a non-object body', () => {
    expect(errors(validateLogisticsBody(null))._form).toBe(PANEL_MESSAGES.body);
    expect(errors(validateLogisticsBody([TRACKING]))._form).toBe(PANEL_MESSAGES.body);
  });
});

describe('normalizeNotes', () => {
  it('counts code points, keeps inner line breaks and refuses control characters', () => {
    expect(normalizeNotes('😀'.repeat(2000))).toHaveLength(4000);
    expect(normalizeNotes('😀'.repeat(2001))).toBeUndefined();
    expect(normalizeNotes('a\n\nb')).toBe('a\n\nb');
    expect(normalizeNotes('a\u0000b')).toBeUndefined();
    expect(normalizeNotes(undefined)).toBeNull();
  });
});

describe('validateCorrectionBody', () => {
  const FIELDS = {
    firstNames: '  Ana   María ',
    lastNames: 'Pérez',
    rut: '11.111.111-1',
    passportNumber: 'ab 123456',
    arrivalDate: '2027-01-17',
    departureDate: '2027-01-29',
    focus: 'todos',
    dietaryRestrictions: ['vegano', 'otra'],
    dietaryOther: 'Sin mariscos',
    expectedVersion: 2,
  };

  it('applies the school form rules and returns normalized fields', () => {
    expect(value(validateCorrectionBody(FIELDS, 'inspira'))).toEqual({
      expectedVersion: 2,
      fields: {
        firstNames: 'Ana María',
        lastNames: 'Pérez',
        rut: '11111111-1',
        passportNumber: 'AB123456',
        arrivalDate: '2027-01-17',
        departureDate: '2027-01-29',
        focus: 'todos',
        dietaryRestrictions: ['otra', 'vegano'],
        dietaryOther: 'Sin mariscos',
        // FNE may correct a person whose school gave no email yet.
        email: null,
      },
    });
  });

  it('takes an email when FNE has one, lower-cased, and refuses a malformed one', () => {
    expect(value(validateCorrectionBody({ ...FIELDS, email: ' Ana@Example.COM ' }, 'inspira')).fields.email).toBe(
      'ana@example.com'
    );
    expect(errors(validateCorrectionBody({ ...FIELDS, email: 'ana@' }, 'inspira')).email).toBeTruthy();
  });

  it('accepts only the dates the school form of THAT program offers', () => {
    // 2027-01-29 is INSPIRA's "day after the end"; Mirada Profunda ends that day.
    expect(errors(validateCorrectionBody(FIELDS, 'mirada-profunda')).departureDate).toBeTruthy();
    expect(errors(validateCorrectionBody({ ...FIELDS, arrivalDate: '2027-01-16' }, 'inspira')).arrivalDate).toBeTruthy();
  });

  it('refuses keys the school form never sends — acknowledged, funding, roster', () => {
    for (const extra of [{ acknowledged: true }, { flightsFunding: 'sep' }, { rosterId: ID_A }, { version: 9 }]) {
      const result = validateCorrectionBody({ ...FIELDS, ...extra }, 'inspira');
      expect((result as { unknownKeys: boolean }).unknownKeys).toBe(true);
    }
  });

  it('requires the participant version', () => {
    const { expectedVersion: _e, ...rest } = FIELDS;
    expect(errors(validateCorrectionBody(rest, 'inspira')).expectedVersion).toBe(PANEL_MESSAGES.requestInvalid);
    expect(errors(validateCorrectionBody({ ...FIELDS, expectedVersion: null }, 'inspira')).expectedVersion).toBeTruthy();
  });

  it('reports field errors with the school form messages', () => {
    const found = errors(validateCorrectionBody({ ...FIELDS, rut: '11.111.111-2', firstNames: '' }, 'inspira'));
    expect(found.rut).toContain('RUT no válido');
    expect(found.firstNames).toBe('Ingresa los nombres.');
  });
});

describe('validateBulkBody', () => {
  it('maps the request to the SQL field name and a text value', () => {
    expect(value(validateBulkBody({ participantIds: [ID_A, ID_B], field: 'flightStatus', value: 'paid' }))).toEqual({
      participantIds: [ID_A, ID_B],
      field: 'flight_status',
      value: 'paid',
    });
    expect(value(validateBulkBody({ participantIds: [ID_A], field: 'depositReceived', value: false }))).toEqual({
      participantIds: [ID_A],
      field: 'deposit_received',
      value: 'false',
    });
  });

  it('lower-cases and de-duplicates ids', () => {
    const parsed = value(validateBulkBody({ participantIds: [ID_A.toUpperCase(), ID_A], field: 'lodgingStatus', value: 'reserved' }));
    expect(parsed.participantIds).toEqual([ID_A]);
  });

  it.each([
    [{ participantIds: [] }, 'participantIds'],
    [{ participantIds: ['not-a-uuid'] }, 'participantIds'],
    [{ participantIds: Array.from({ length: 201 }, () => ID_A) }, 'participantIds'],
    [{ participantIds: ID_A }, 'participantIds'],
    [{ field: 'notes', value: 'x' }, 'field'],
    [{ field: 'salutation', value: 'estimado' }, 'field'],
    [{ field: 'flightStatus', value: 'reserved' }, 'field'],
    [{ field: 'lodgingStatus', value: true }, 'field'],
    [{ field: 'depositReceived', value: 'true' }, 'field'],
  ])('refuses %j', (change, field) => {
    const body = { participantIds: [ID_A], field: 'flightStatus', value: 'paid', ...change };
    expect(errors(validateBulkBody(body))[field]).toBeTruthy();
  });

  it('refuses an unknown key', () => {
    const result = validateBulkBody({ participantIds: [ID_A], field: 'flightStatus', value: 'paid', actor: ID_B });
    expect((result as { unknownKeys: boolean }).unknownKeys).toBe(true);
  });
});

describe('validateRosterDetailsBody', () => {
  it('cleans the two lines and keeps null for blank', () => {
    expect(
      value(
        validateRosterDetailsBody({
          letterSchoolLine: '  del Colegio  Sintético,  Chile ',
          letterLodgingLine: '',
          expectedVersion: null,
        })
      )
    ).toEqual({ letterSchoolLine: 'del Colegio Sintético, Chile', letterLodgingLine: null, expectedVersion: null });
  });

  it('refuses a line break, an over-long line and an unknown key', () => {
    const base = { letterSchoolLine: 'a', letterLodgingLine: 'b', expectedVersion: 1 };
    expect(errors(validateRosterDetailsBody({ ...base, letterSchoolLine: 'dos\nlíneas' })).letterSchoolLine).toBeTruthy();
    expect(errors(validateRosterDetailsBody({ ...base, letterLodgingLine: 'x'.repeat(301) })).letterLodgingLine).toBeTruthy();
    expect((validateRosterDetailsBody({ ...base, schoolName: 'x' }) as { unknownKeys: boolean }).unknownKeys).toBe(true);
    const { expectedVersion: _e, ...rest } = base;
    expect(errors(validateRosterDetailsBody(rest)).expectedVersion).toBeTruthy();
  });
});

describe('validateUploadFields', () => {
  it('accepts the two kinds an admin may upload', () => {
    expect(value(validateUploadFields('ticket', ' Ida y vuelta '))).toEqual({ kind: 'ticket', description: 'Ida y vuelta' });
    expect(value(validateUploadFields('other', undefined))).toEqual({ kind: 'other', description: null });
  });

  it('never lets an upload claim to be a generated invitation letter', () => {
    expect(errors(validateUploadFields('invitation_letter', null)).kind).toBe(PANEL_MESSAGES.kindInvalid);
    expect(errors(validateUploadFields(undefined, null)).kind).toBeTruthy();
    expect(errors(validateUploadFields('ticket', 'x'.repeat(201))).description).toBeTruthy();
  });
});

describe('safeDisplayFileName', () => {
  it('keeps only the base name and drops control and path characters', () => {
    expect(safeDisplayFileName('C:\\Users\\ana\\pasaje.pdf', 'documento.pdf')).toBe('pasaje.pdf');
    expect(safeDisplayFileName('../../etc/passwd', 'documento.pdf')).toBe('passwd');
    expect(safeDisplayFileName('boleto\u0000\n final.pdf', 'documento.pdf')).toBe('boleto final.pdf');
    expect(safeDisplayFileName('', 'documento.pdf')).toBe('documento.pdf');
    expect(safeDisplayFileName(undefined, 'documento.pdf')).toBe('documento.pdf');
    expect(Array.from(safeDisplayFileName('ñ'.repeat(500), 'x'))).toHaveLength(200);
  });
});
