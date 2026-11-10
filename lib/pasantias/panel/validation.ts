/**
 * Request validation for the Pasantías panel admin routes. Browser-safe.
 *
 * Every body is a closed shape: an unknown key refuses the whole request, so a
 * service-role write can never be widened by a caller (the same rule as the
 * intake routes). The SQL functions re-check structure; trimming, NFC and the
 * es-CL messages live only here.
 */
import type { ProgramId } from '../cohort-public';
import type { ParticipantFields } from '../participants/types';
import {
  PARTICIPANT_FIELD_KEYS,
  charLength,
  cleanText,
  isUuid,
  validateParticipantFields,
  type FieldErrors,
  type Validation,
} from '../participants/validation';
import {
  BULK_FIELDS,
  BULK_MAX,
  DESCRIPTION_MAX,
  FLIGHT_DATE_FIELDS,
  FLIGHT_DATE_LABELS,
  FLIGHT_DATE_MAX,
  FLIGHT_DATE_MIN,
  FLIGHT_STATUSES,
  LETTER_LINE_MAX,
  LODGING_STATUSES,
  NOTES_MAX,
  SALUTATIONS,
  UPLOAD_KINDS,
  type BulkField,
  type FlightStatus,
  type LodgingStatus,
  type Salutation,
  type UploadKind,
} from './types';

export const PANEL_MESSAGES = {
  body: 'La solicitud no es válida.',
  unknownKeys: 'La solicitud contiene campos no permitidos.',
  requestInvalid: 'Solicitud inválida. Recarga la página e inténtalo de nuevo.',
  flightInvalid: 'Elige un estado de pasaje de la lista.',
  lodgingInvalid: 'Elige un estado de alojamiento de la lista.',
  paymentInvalid: 'Indica si el pago fue recibido.',
  salutationInvalid: 'Elige «Estimado», «Estimada» o «Sin indicar».',
  flightDateInvalid: 'Fecha no válida. Usa una fecha entre diciembre de 2026 y marzo de 2027.',
  flightDateOrder: 'Las fechas del viaje deben ir en orden: salida de SCL, llegada a BCN, salida de BCN, llegada a SCL.',
  notesInvalid: `Las notas pueden tener hasta ${NOTES_MAX} caracteres, sin caracteres de control.`,
  letterLineInvalid: `Usa hasta ${LETTER_LINE_MAX} caracteres en una sola línea.`,
  bulkIdsInvalid: `Selecciona entre 1 y ${BULK_MAX} personas.`,
  bulkFieldInvalid: 'Elige qué quieres marcar y con qué valor.',
  kindInvalid: 'Elige el tipo de documento.',
  descriptionInvalid: `La descripción puede tener hasta ${DESCRIPTION_MAX} caracteres en una sola línea.`,
} as const;

// C0 (except LF, which notes may contain), DEL and C1 control characters.
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_LF = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasUnknownKeys(body: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(body).some((key) => !allowed.includes(key));
}

function oneOf<T extends string>(value: unknown, set: readonly T[]): T | undefined {
  return typeof value === 'string' && (set as readonly string[]).includes(value) ? (value as T) : undefined;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2_147_483_647;
}

/** `null`/absent/blank → null; otherwise the cleaned text, or `undefined` when invalid. */
function optionalLine(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  if (CONTROL.test(value)) return undefined;
  const cleaned = cleanText(value);
  if (cleaned.length === 0) return null;
  return charLength(cleaned) <= max ? cleaned : undefined;
}

/** Notes keep their line breaks: CRLF → LF, NFC, trimmed. */
export function normalizeNotes(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  const unified = value.replace(/\r\n?/g, '\n');
  if (CONTROL_EXCEPT_LF.test(unified)) return undefined;
  const cleaned = (typeof unified.normalize === 'function' ? unified.normalize('NFC') : unified).trim();
  if (cleaned.length === 0) return null;
  return charLength(cleaned) <= NOTES_MAX ? cleaned : undefined;
}

function invalidBody<T>(unknownKeys = false): Validation<T> {
  return {
    ok: false,
    errors: { _form: unknownKeys ? PANEL_MESSAGES.unknownKeys : PANEL_MESSAGES.body },
    unknownKeys,
  };
}

function finish<T>(errors: FieldErrors, value: () => T): Validation<T> {
  if (Object.keys(errors).length > 0) return { ok: false, errors, unknownKeys: false };
  return { ok: true, value: value() };
}

/** `expectedVersion` must be present: null ("nothing saved yet") or a positive integer. */
function readExpectedVersion(body: Record<string, unknown>, errors: FieldErrors): number | null {
  const expected = body.expectedVersion;
  if (!('expectedVersion' in body) || (expected !== null && !isPositiveInteger(expected))) {
    errors.expectedVersion = PANEL_MESSAGES.requestInvalid;
    return null;
  }
  return expected === null ? null : (expected as number);
}

/* ------------------------------------------------------------------ tracking */

export interface LogisticsRequest {
  flightStatus: FlightStatus;
  lodgingStatus: LodgingStatus;
  depositReceived: boolean;
  balanceReceived: boolean;
  salutation: Salutation | null;
  notes: string | null;
  sclDepartureDate: string | null;
  bcnArrivalDate: string | null;
  bcnDepartureDate: string | null;
  sclArrivalDate: string | null;
  expectedVersion: number | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Blank → null; a real calendar date inside the cohort's window; otherwise `undefined`. */
export function normalizeFlightDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // 2027-02-30 would roll into March: the round trip must give the same day.
  if (date.toISOString().slice(0, 10) !== value) return undefined;
  return value >= FLIGHT_DATE_MIN && value <= FLIGHT_DATE_MAX ? value : undefined;
}

const LOGISTICS_KEYS = [
  'flightStatus',
  'lodgingStatus',
  'depositReceived',
  'balanceReceived',
  'salutation',
  'notes',
  ...FLIGHT_DATE_FIELDS,
  'expectedVersion',
] as const;

/** `PATCH …/participants/[id]` — a full replace of the ten tracking values. */
export function validateLogisticsBody(body: unknown): Validation<LogisticsRequest> {
  if (!isPlainObject(body)) return invalidBody();
  if (hasUnknownKeys(body, LOGISTICS_KEYS)) return invalidBody(true);
  const errors: FieldErrors = {};
  const flightStatus = oneOf<FlightStatus>(body.flightStatus, FLIGHT_STATUSES);
  if (!flightStatus) errors.flightStatus = PANEL_MESSAGES.flightInvalid;
  const lodgingStatus = oneOf<LodgingStatus>(body.lodgingStatus, LODGING_STATUSES);
  if (!lodgingStatus) errors.lodgingStatus = PANEL_MESSAGES.lodgingInvalid;
  if (typeof body.depositReceived !== 'boolean') errors.depositReceived = PANEL_MESSAGES.paymentInvalid;
  if (typeof body.balanceReceived !== 'boolean') errors.balanceReceived = PANEL_MESSAGES.paymentInvalid;
  let salutation: Salutation | null = null;
  if (body.salutation !== undefined && body.salutation !== null && body.salutation !== '') {
    const value = oneOf<Salutation>(body.salutation, SALUTATIONS);
    if (value) salutation = value;
    else errors.salutation = PANEL_MESSAGES.salutationInvalid;
  }
  const notes = normalizeNotes(body.notes);
  if (notes === undefined) errors.notes = PANEL_MESSAGES.notesInvalid;
  const dates: Record<string, string | null> = {};
  for (const field of FLIGHT_DATE_FIELDS) {
    const value = normalizeFlightDate(body[field]);
    if (value === undefined) errors[field] = PANEL_MESSAGES.flightDateInvalid;
    dates[field] = value ?? null;
  }
  // Each date may equal the one before (a same-day leg) but never precede it.
  let latest: string | null = null;
  for (const field of FLIGHT_DATE_FIELDS) {
    const value = dates[field];
    if (!value || errors[field]) continue;
    if (latest && value < latest) errors[field] = `${FLIGHT_DATE_LABELS[field]}: ${PANEL_MESSAGES.flightDateOrder}`;
    else latest = value;
  }
  const expectedVersion = readExpectedVersion(body, errors);
  return finish(errors, () => ({
    flightStatus: flightStatus as FlightStatus,
    lodgingStatus: lodgingStatus as LodgingStatus,
    depositReceived: body.depositReceived as boolean,
    balanceReceived: body.balanceReceived as boolean,
    salutation,
    notes: notes ?? null,
    sclDepartureDate: dates.sclDepartureDate,
    bcnArrivalDate: dates.bcnArrivalDate,
    bcnDepartureDate: dates.bcnDepartureDate,
    sclArrivalDate: dates.sclArrivalDate,
    expectedVersion,
  }));
}

/* ---------------------------------------------------------------- correction */

export interface CorrectionRequest {
  expectedVersion: number;
  fields: ParticipantFields;
}

const CORRECTION_KEYS: readonly string[] = [...PARTICIPANT_FIELD_KEYS, 'expectedVersion'];

/**
 * `PUT …/participants/[id]` — an admin corrects what the school entered. The
 * SAME field rules as the school's own form (`validateParticipantFields`),
 * dates included: a value the school's form could not show again would be
 * silently lost the next time the school edits that person.
 */
export function validateCorrectionBody(body: unknown, programId: ProgramId): Validation<CorrectionRequest> {
  if (!isPlainObject(body)) return invalidBody();
  if (hasUnknownKeys(body, CORRECTION_KEYS)) return invalidBody(true);
  const { value, errors } = validateParticipantFields(body, programId);
  if (!isPositiveInteger(body.expectedVersion)) errors.expectedVersion = PANEL_MESSAGES.requestInvalid;
  return finish(errors, () => ({
    expectedVersion: body.expectedVersion as number,
    fields: value as ParticipantFields,
  }));
}

/* ---------------------------------------------------------------------- bulk */

/** The SQL field name and text value `pasantias_panel_bulk_set` takes. */
export interface BulkRequest {
  participantIds: string[];
  field: 'flight_status' | 'lodging_status' | 'deposit_received' | 'balance_received';
  value: string;
}

const BULK_SQL_FIELD: Record<BulkField, BulkRequest['field']> = {
  flightStatus: 'flight_status',
  lodgingStatus: 'lodging_status',
  depositReceived: 'deposit_received',
  balanceReceived: 'balance_received',
};

/** `POST …/bulk` — `{participantIds, field, value}`; value is a status or a boolean. */
export function validateBulkBody(body: unknown): Validation<BulkRequest> {
  if (!isPlainObject(body)) return invalidBody();
  if (hasUnknownKeys(body, ['participantIds', 'field', 'value'])) return invalidBody(true);
  const errors: FieldErrors = {};
  const ids = body.participantIds;
  let participantIds: string[] = [];
  if (Array.isArray(ids) && ids.length >= 1 && ids.length <= BULK_MAX && ids.every(isUuid)) {
    participantIds = Array.from(new Set((ids as string[]).map((id) => id.toLowerCase())));
  } else {
    errors.participantIds = PANEL_MESSAGES.bulkIdsInvalid;
  }
  const field = oneOf<BulkField>(body.field, BULK_FIELDS);
  let value: string | null = null;
  if (field === 'flightStatus') value = oneOf<FlightStatus>(body.value, FLIGHT_STATUSES) ?? null;
  else if (field === 'lodgingStatus') value = oneOf<LodgingStatus>(body.value, LODGING_STATUSES) ?? null;
  else if (field && typeof body.value === 'boolean') value = body.value ? 'true' : 'false';
  if (!field || value === null) errors.field = PANEL_MESSAGES.bulkFieldInvalid;
  return finish(errors, () => ({
    participantIds,
    field: BULK_SQL_FIELD[field as BulkField],
    value: value as string,
  }));
}

/* ------------------------------------------------------------ roster details */

export interface RosterDetailsRequest {
  letterSchoolLine: string | null;
  letterLodgingLine: string | null;
  expectedVersion: number | null;
}

/** `PUT …/rosters/[rosterId]` — the two letter lines of one school and program. */
export function validateRosterDetailsBody(body: unknown): Validation<RosterDetailsRequest> {
  if (!isPlainObject(body)) return invalidBody();
  if (hasUnknownKeys(body, ['letterSchoolLine', 'letterLodgingLine', 'expectedVersion'])) return invalidBody(true);
  const errors: FieldErrors = {};
  const letterSchoolLine = optionalLine(body.letterSchoolLine, LETTER_LINE_MAX);
  if (letterSchoolLine === undefined) errors.letterSchoolLine = PANEL_MESSAGES.letterLineInvalid;
  const letterLodgingLine = optionalLine(body.letterLodgingLine, LETTER_LINE_MAX);
  if (letterLodgingLine === undefined) errors.letterLodgingLine = PANEL_MESSAGES.letterLineInvalid;
  const expectedVersion = readExpectedVersion(body, errors);
  return finish(errors, () => ({
    letterSchoolLine: letterSchoolLine ?? null,
    letterLodgingLine: letterLodgingLine ?? null,
    expectedVersion,
  }));
}

/* ------------------------------------------------------------------- uploads */

export interface UploadFields {
  kind: UploadKind;
  description: string | null;
}

/** The two text fields that travel with an uploaded file. */
export function validateUploadFields(kind: unknown, description: unknown): Validation<UploadFields> {
  const errors: FieldErrors = {};
  const validKind = oneOf<UploadKind>(kind, UPLOAD_KINDS);
  if (!validKind) errors.kind = PANEL_MESSAGES.kindInvalid;
  const cleaned = optionalLine(description, DESCRIPTION_MAX);
  if (cleaned === undefined) errors.description = PANEL_MESSAGES.descriptionInvalid;
  return finish(errors, () => ({ kind: validKind as UploadKind, description: cleaned ?? null }));
}

/**
 * The display name kept for a stored file: the base name only, control and
 * path characters removed, at most 200 characters. The stored OBJECT never
 * uses it — its path is a random UUID.
 */
export function safeDisplayFileName(raw: unknown, fallback: string): string {
  const text = typeof raw === 'string' ? raw : '';
  const base = text.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').replace(/\s+/g, ' ').trim();
  const clipped = Array.from(cleaned).slice(0, 200).join('').trim();
  return clipped.length > 0 ? clipped : fallback;
}
