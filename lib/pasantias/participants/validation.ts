/**
 * Request validation for the participant intake — the first guard. The SQL
 * functions re-check structure (db-contract §4); the es-CL rules (NFC, no
 * digits in names, per-program dates) live only here (db-contract §7.2, §7.5).
 *
 * Browser-safe and shared: the coordinator form runs the same field checks
 * before it sends, so a message the API would give appears under the field
 * before any request.
 *
 * Every body is a closed shape. An unknown key — `school`, `program`,
 * `rosterId` included — refuses the whole request (FIRST §4): the school and
 * program come only from the token.
 */
import { isProgramId, type ProgramId } from '../cohort-public';
import { arrivalOptions, departureOptions } from './dates';
import { normalizeStrictRut } from './rut';
import {
  DIETARY_CODES,
  FOCUS_CODES,
  FUNDING_SOURCES,
  VALID_DAYS_OPTIONS,
  type DietaryCode,
  type FocusCode,
  type FundingSource,
  type ParticipantFields,
  type ValidDays,
} from './types';

export type FieldErrors = Record<string, string>;

export type Validation<T> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldErrors; unknownKeys: boolean };

/**
 * F01: no funding key. `flightsFunding` / `lodgingFunding` in a participant
 * body are therefore UNKNOWN keys and refuse the whole request with 422 before
 * any RPC (FIRST corrections R4); funding is saved once per roster through
 * `validateSchoolFundingBody` and the school route.
 */
export const PARTICIPANT_FIELD_KEYS: readonly (keyof ParticipantFields)[] = [
  'firstNames',
  'lastNames',
  'rut',
  'passportNumber',
  'arrivalDate',
  'departureDate',
  'focus',
  'dietaryRestrictions',
  'dietaryOther',
];

const CREATE_KEYS: readonly string[] = [...PARTICIPANT_FIELD_KEYS, 'clientRequestId', 'acknowledged'];
const UPDATE_KEYS: readonly string[] = [...PARTICIPANT_FIELD_KEYS, 'expectedVersion', 'acknowledged'];

export const MESSAGES = {
  unknownKeys: 'La solicitud contiene campos no permitidos.',
  body: 'La solicitud no es válida.',
  firstNamesRequired: 'Ingresa los nombres.',
  lastNamesRequired: 'Ingresa los apellidos.',
  nameInvalid:
    'Usa solo letras, espacios, apóstrofos, puntos o guiones (máximo 80 caracteres).',
  rutRequired: 'Ingresa el RUT.',
  rutInvalid: 'RUT no válido. Revisa los números y el dígito verificador (ej.: 12.345.678-5).',
  rutDuplicate: 'Este RUT ya está en la nómina.',
  passportInvalid: 'El pasaporte debe tener entre 5 y 20 letras o números, sin símbolos.',
  flightsFundingRequired: 'Elige quién cubre el costo de los pasajes.',
  lodgingFundingRequired: 'Elige quién cubre el costo de la estadía.',
  arrivalInvalid: 'Elige una de las fechas de llegada propuestas o «Sin indicar».',
  departureInvalid: 'Elige una de las fechas de regreso propuestas o «Sin indicar».',
  departureOrder: 'La fecha de regreso debe ser posterior a la de llegada.',
  focusInvalid: 'Elige un foco de la lista o «Sin indicar».',
  dietaryInvalid: 'Opción de alimentación no válida.',
  dietaryOtherRequired: 'Describe la restricción «Otra» (máximo 200 caracteres).',
  dietaryOtherWithoutOtra: 'Marca «Otra» para agregar un detalle, o borra el detalle.',
  dietaryOtherControl: 'El detalle no puede tener saltos de línea, tabulaciones ni caracteres de control.',
  acknowledged: 'Debes confirmar la declaración antes de guardar.',
  requestInvalid: 'Solicitud inválida. Recarga la página e inténtalo de nuevo.',
  schoolNameInvalid: 'Ingresa el nombre del colegio (entre 2 y 160 caracteres).',
  programInvalid: 'Elige un programa.',
  validDaysInvalid: 'Elige una vigencia de 30, 60, 90 o 120 días.',
  actionInvalid: 'Acción no válida.',
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

// Explicit Latin ranges rather than `\p{L}`: Unicode property escapes are
// missing on the older browsers school hardware still runs.
const LETTER = 'A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F\\u1E00-\\u1EFF';
const NAME_PATTERN = new RegExp(`^[${LETTER}][${LETTER}' \\u2019.\\-]*$`);
// C0, DEL and C1 control characters.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;

/** Unicode code points, as Postgres `char_length` counts them — not UTF-16 units. */
export function charLength(value: string): number {
  return Array.from(value).length;
}

function nfc(value: string): string {
  return typeof value.normalize === 'function' ? value.normalize('NFC') : value;
}

/** NFC, trimmed, inner whitespace collapsed. */
export function cleanText(value: string): string {
  return nfc(value).trim().replace(/\s+/g, ' ');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasUnknownKeys(body: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(body).some((key) => !allowed.includes(key));
}

/** `undefined`, `null` and `''` all mean "not provided" for optional fields. */
function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

export function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = cleanText(value);
  if (cleaned.length === 0 || charLength(cleaned) > 80) return null;
  if (CONTROL.test(cleaned) || !NAME_PATTERN.test(cleaned)) return null;
  return cleaned;
}

export function normalizePassport(value: unknown): string | null | undefined {
  if (isBlank(value)) return null;
  if (typeof value !== 'string') return undefined;
  const compact = value.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z0-9]{5,20}$/.test(compact) ? compact : undefined;
}

function oneOf<T extends string>(value: unknown, set: readonly T[]): T | undefined {
  return typeof value === 'string' && (set as readonly string[]).includes(value) ? (value as T) : undefined;
}

/**
 * The eleven participant fields. Absent optional keys mean "Sin indicar"; a
 * save always replaces every field (PUT is a full replace).
 */
export function validateParticipantFields(
  input: Record<string, unknown>,
  programId: ProgramId
): { value: ParticipantFields | null; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const firstNames = normalizeName(input.firstNames);
  if (!firstNames) {
    errors.firstNames = isBlank(input.firstNames) ? MESSAGES.firstNamesRequired : MESSAGES.nameInvalid;
  }
  const lastNames = normalizeName(input.lastNames);
  if (!lastNames) {
    errors.lastNames = isBlank(input.lastNames) ? MESSAGES.lastNamesRequired : MESSAGES.nameInvalid;
  }

  const rut = normalizeStrictRut(input.rut);
  if (!rut) {
    errors.rut = isBlank(input.rut) ? MESSAGES.rutRequired : MESSAGES.rutInvalid;
  }

  const passportNumber = normalizePassport(input.passportNumber);
  if (passportNumber === undefined) errors.passportNumber = MESSAGES.passportInvalid;

  let arrivalDate: string | null = null;
  if (!isBlank(input.arrivalDate)) {
    const value = input.arrivalDate;
    if (typeof value === 'string' && arrivalOptions(programId).some((o) => o.value === value)) {
      arrivalDate = value;
    } else {
      errors.arrivalDate = MESSAGES.arrivalInvalid;
    }
  }
  let departureDate: string | null = null;
  if (!isBlank(input.departureDate)) {
    const value = input.departureDate;
    if (typeof value === 'string' && departureOptions(programId).some((o) => o.value === value)) {
      departureDate = value;
    } else {
      errors.departureDate = MESSAGES.departureInvalid;
    }
  }
  // ISO dates compare correctly as strings.
  if (arrivalDate && departureDate && departureDate <= arrivalDate) {
    errors.departureDate = MESSAGES.departureOrder;
  }

  let focus: FocusCode | null = null;
  if (!isBlank(input.focus)) {
    const value = oneOf<FocusCode>(input.focus, FOCUS_CODES);
    if (value) focus = value;
    else errors.focus = MESSAGES.focusInvalid;
  }

  let dietaryRestrictions: DietaryCode[] = [];
  const rawDietary = input.dietaryRestrictions;
  if (rawDietary !== undefined && rawDietary !== null) {
    if (
      Array.isArray(rawDietary) &&
      rawDietary.length <= DIETARY_CODES.length * 2 &&
      rawDietary.every((code) => oneOf<DietaryCode>(code, DIETARY_CODES))
    ) {
      // Sorted (C order) and distinct, exactly as the RPC requires.
      dietaryRestrictions = Array.from(new Set(rawDietary as DietaryCode[])).sort();
    } else {
      errors.dietaryRestrictions = MESSAGES.dietaryInvalid;
    }
  }

  let dietaryOther: string | null = null;
  const hasOtra = dietaryRestrictions.includes('otra');
  if (isBlank(input.dietaryOther)) {
    if (hasOtra) errors.dietaryOther = MESSAGES.dietaryOtherRequired;
  } else if (typeof input.dietaryOther !== 'string') {
    errors.dietaryOther = MESSAGES.dietaryOtherRequired;
  } else if (!hasOtra) {
    // Refused rather than silently dropped: the coordinator typed something.
    if (!errors.dietaryRestrictions) errors.dietaryOther = MESSAGES.dietaryOtherWithoutOtra;
  } else if (CONTROL.test(input.dietaryOther)) {
    // Checked on the RAW value, before whitespace is collapsed: a newline, tab
    // or other control character is refused, never silently rewritten to a
    // space (strict parity with the RPC's `invalid_dietary`).
    errors.dietaryOther = MESSAGES.dietaryOtherControl;
  } else {
    const cleaned = cleanText(input.dietaryOther);
    if (cleaned.length === 0 || charLength(cleaned) > 200) {
      errors.dietaryOther = MESSAGES.dietaryOtherRequired;
    } else {
      dietaryOther = cleaned;
    }
  }

  if (Object.keys(errors).length > 0) return { value: null, errors };
  return {
    value: {
      firstNames: firstNames as string,
      lastNames: lastNames as string,
      rut: rut as string,
      passportNumber: passportNumber ?? null,
      arrivalDate,
      departureDate,
      focus,
      dietaryRestrictions,
      dietaryOther,
    },
    errors,
  };
}

function finish<T>(errors: FieldErrors, value: () => T): Validation<T> {
  if (Object.keys(errors).length > 0) return { ok: false, errors, unknownKeys: false };
  return { ok: true, value: value() };
}

export interface CreateRequest {
  clientRequestId: string;
  fields: ParticipantFields;
}

export function validateCreateBody(body: unknown, programId: ProgramId): Validation<CreateRequest> {
  if (!isPlainObject(body)) return { ok: false, errors: { _form: MESSAGES.body }, unknownKeys: false };
  if (hasUnknownKeys(body, CREATE_KEYS)) {
    return { ok: false, errors: { _form: MESSAGES.unknownKeys }, unknownKeys: true };
  }
  const { value, errors } = validateParticipantFields(body, programId);
  if (body.acknowledged !== true) errors.acknowledged = MESSAGES.acknowledged;
  if (!isUuid(body.clientRequestId)) errors.clientRequestId = MESSAGES.requestInvalid;
  return finish(errors, () => ({
    clientRequestId: (body.clientRequestId as string).toLowerCase(),
    fields: value as ParticipantFields,
  }));
}

export interface UpdateRequest {
  expectedVersion: number;
  fields: ParticipantFields;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2_147_483_647;
}

export function validateUpdateBody(body: unknown, programId: ProgramId): Validation<UpdateRequest> {
  if (!isPlainObject(body)) return { ok: false, errors: { _form: MESSAGES.body }, unknownKeys: false };
  if (hasUnknownKeys(body, UPDATE_KEYS)) {
    return { ok: false, errors: { _form: MESSAGES.unknownKeys }, unknownKeys: true };
  }
  const { value, errors } = validateParticipantFields(body, programId);
  if (body.acknowledged !== true) errors.acknowledged = MESSAGES.acknowledged;
  if (!isPositiveInteger(body.expectedVersion)) errors.expectedVersion = MESSAGES.requestInvalid;
  return finish(errors, () => ({
    expectedVersion: body.expectedVersion as number,
    fields: value as ParticipantFields,
  }));
}

export function validateFinalizeBody(body: unknown): Validation<{ expectedRosterVersion: number }> {
  if (!isPlainObject(body)) return { ok: false, errors: { _form: MESSAGES.body }, unknownKeys: false };
  if (hasUnknownKeys(body, ['expectedRosterVersion'])) {
    return { ok: false, errors: { _form: MESSAGES.unknownKeys }, unknownKeys: true };
  }
  const errors: FieldErrors = {};
  if (!isPositiveInteger(body.expectedRosterVersion)) errors.expectedRosterVersion = MESSAGES.requestInvalid;
  return finish(errors, () => ({ expectedRosterVersion: body.expectedRosterVersion as number }));
}

/* ------------------------------------------------------- school funding (F01) */

export interface SchoolFundingRequest {
  flightsFunding: FundingSource;
  lodgingFunding: FundingSource;
  /** null = "I expect no saved row yet"; otherwise the saved row's version. */
  expectedFundingVersion: number | null;
}

/**
 * `PUT /api/pasantias/participants/school` — exactly
 * `{flightsFunding, lodgingFunding, expectedFundingVersion: number|null}`.
 * Both answers are required and never defaulted; `expectedFundingVersion` must
 * be present (null or a positive integer) so a first save and an edit are
 * never confused. No acknowledgement is needed: this is the school's own data.
 */
export function validateSchoolFundingBody(body: unknown): Validation<SchoolFundingRequest> {
  if (!isPlainObject(body)) return { ok: false, errors: { _form: MESSAGES.body }, unknownKeys: false };
  if (hasUnknownKeys(body, ['flightsFunding', 'lodgingFunding', 'expectedFundingVersion'])) {
    return { ok: false, errors: { _form: MESSAGES.unknownKeys }, unknownKeys: true };
  }
  const errors: FieldErrors = {};
  const flightsFunding = oneOf<FundingSource>(body.flightsFunding, FUNDING_SOURCES);
  if (!flightsFunding) errors.flightsFunding = MESSAGES.flightsFundingRequired;
  const lodgingFunding = oneOf<FundingSource>(body.lodgingFunding, FUNDING_SOURCES);
  if (!lodgingFunding) errors.lodgingFunding = MESSAGES.lodgingFundingRequired;
  const expected = body.expectedFundingVersion;
  if (!('expectedFundingVersion' in body) || (expected !== null && !isPositiveInteger(expected))) {
    errors.expectedFundingVersion = MESSAGES.requestInvalid;
  }
  return finish(errors, () => ({
    flightsFunding: flightsFunding as FundingSource,
    lodgingFunding: lodgingFunding as FundingSource,
    expectedFundingVersion: expected === null ? null : (expected as number),
  }));
}

/* --------------------------------------------------------------- admin bodies */

/** Mirrors the generated `school_name_key` for ASCII whitespace (db-contract §6). */
export function schoolNameKey(schoolName: string): string {
  return schoolName.replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeSchoolName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = cleanText(value);
  const length = charLength(cleaned);
  if (length < 2 || length > 160 || CONTROL.test(cleaned)) return null;
  return cleaned;
}

function isValidDays(value: unknown): value is ValidDays {
  return typeof value === 'number' && (VALID_DAYS_OPTIONS as readonly number[]).includes(value);
}

export interface RosterCreateRequest {
  schoolName: string;
  program: ProgramId;
  validDays: ValidDays;
}

export function validateRosterCreateBody(body: unknown): Validation<RosterCreateRequest> {
  if (!isPlainObject(body)) return { ok: false, errors: { _form: MESSAGES.body }, unknownKeys: false };
  if (hasUnknownKeys(body, ['schoolName', 'program', 'validDays'])) {
    return { ok: false, errors: { _form: MESSAGES.unknownKeys }, unknownKeys: true };
  }
  const errors: FieldErrors = {};
  const schoolName = normalizeSchoolName(body.schoolName);
  if (!schoolName) errors.schoolName = MESSAGES.schoolNameInvalid;
  if (!isProgramId(body.program)) errors.program = MESSAGES.programInvalid;
  if (!isValidDays(body.validDays)) errors.validDays = MESSAGES.validDaysInvalid;
  return finish(errors, () => ({
    schoolName: schoolName as string,
    program: body.program as ProgramId,
    validDays: body.validDays as ValidDays,
  }));
}

export type RosterPatchRequest = { action: 'rotate'; validDays: ValidDays } | { action: 'revoke' };

export function validateRosterPatchBody(body: unknown): Validation<RosterPatchRequest> {
  if (!isPlainObject(body)) return { ok: false, errors: { _form: MESSAGES.body }, unknownKeys: false };
  if (body.action === 'revoke') {
    if (hasUnknownKeys(body, ['action'])) {
      return { ok: false, errors: { _form: MESSAGES.unknownKeys }, unknownKeys: true };
    }
    return { ok: true, value: { action: 'revoke' } };
  }
  if (body.action === 'rotate') {
    if (hasUnknownKeys(body, ['action', 'validDays'])) {
      return { ok: false, errors: { _form: MESSAGES.unknownKeys }, unknownKeys: true };
    }
    if (!isValidDays(body.validDays)) {
      return { ok: false, errors: { validDays: MESSAGES.validDaysInvalid }, unknownKeys: false };
    }
    return { ok: true, value: { action: 'rotate', validDays: body.validDays } };
  }
  return { ok: false, errors: { action: MESSAGES.actionInvalid }, unknownKeys: false };
}
