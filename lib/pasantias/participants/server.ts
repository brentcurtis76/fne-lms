/**
 * SERVER ONLY. Data access and HTTP plumbing shared by the intake API routes.
 *
 * Contracts (both FROZEN): `docs/plan/evidence/pasant-intake/db-contract.md`
 * (DB-01) and `db-contract-corrections-01.md` (F01 school funding, F04 Todos).
 * Every intake table grants nothing to anon or authenticated — admins
 * included — so every read and write here runs on the service-role client,
 * and every coordinator WRITE goes through an RPC that re-checks the link
 * under a `FOR UPDATE` lock on the roster in the same transaction (FIRST-B7):
 *
 * - participant create/update → `pasantias_nomina_save_participant` (14 named
 *   arguments, no funding). The DB-01 participant save is never called by the
 *   app (corrections C2); a unit test scans app source for its name.
 * - school funding → `pasantias_nomina_save_school_funding`;
 * - finalize → the unchanged `pasantias_intake_finalize`, after the app's
 *   school-data gate (corrections §3.6).
 *
 * Reads never select the participants' copied funding columns (C2): funding
 * is read from the school row and attached to every roster as
 * `schoolFunding`. Effective focus merges the F04 side table, read only for
 * participant ids that came from a roster-scoped read.
 *
 * Responses never carry `token_hash`: every select lists its columns, and no
 * column list here contains it.
 *
 * Logging (Ley 21.719): only `loggableError` output or a code from the frozen
 * refusal lists. Never a token, hash, RUT, name, passport, message, detail or
 * hint.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loggableError } from '../../api-auth';
import { rateLimit } from '../../rateLimit';
import { isProgramId, programById, type ProgramId } from '../cohort-public';
import { hashIntakeToken, parseIntakeAuthorization } from './token';
import {
  FUNDING_SOURCES,
  ROSTER_MAX_PARTICIPANTS,
  type AdminIntakeParticipant,
  type AdminRoster,
  type CoordinatorRoster,
  type DietaryCode,
  type FocusCode,
  type FundingSource,
  type IntakeErrorCode,
  type IntakeParticipant,
  type ParticipantFields,
  type RosterStatus,
  type SchoolFunding,
} from './types';
import { MESSAGES, type FieldErrors } from './validation';

export const LOG_PREFIX = 'pasantias-intake';
export const ROSTERS_TABLE = 'pasantias_intake_rosters';
export const PARTICIPANTS_TABLE = 'pasantias_intake_participants';
export const SCHOOL_FUNDING_TABLE = 'pasantias_nomina_school_funding';
export const PARTICIPANT_FOCUS_TABLE = 'pasantias_nomina_participant_focus';
export const SAVE_RPC = 'pasantias_nomina_save_participant';
export const FUNDING_RPC = 'pasantias_nomina_save_school_funding';
export const FINALIZE_RPC = 'pasantias_intake_finalize';

/** Request bodies are tiny; anything over 8 kB is refused (FIRST §4). */
export const MAX_BODY_BYTES = 8 * 1024;

/**
 * One bucket for every coordinator route: 60 requests a minute per client IP
 * (FIRST §4). Best-effort dampening; the durable controls are the 256-bit token
 * and the RPC lock.
 */
const intakeRateLimit = rateLimit({ limit: 60, windowMs: 60_000 }, 'pasantias-intake');

// Typed as plain `string` on purpose: the rows are mapped explicitly below,
// so supabase-js's select-string type parser has nothing to add.
const COORDINATOR_ROSTER_COLUMNS: string =
  'id, school_name, program, status, version, submitted_at, last_submitted_at, expires_at';

export const ADMIN_ROSTER_COLUMNS: string =
  'id, cohort, program, school_name, status, version, submitted_at, last_submitted_at, expires_at, revoked_at, created_at, updated_at';

/** No `flights_funding` / `lodging_funding`: those participant columns are a copy nothing reads (C2). */
export const PARTICIPANT_COLUMNS: string =
  'id, version, first_names, last_names, rut, passport_number, arrival_date, departure_date, focus, dietary_restrictions, dietary_other, updated_at';

export const ADMIN_PARTICIPANT_COLUMNS: string = `${PARTICIPANT_COLUMNS}, created_at, acknowledged_at, notice_version`;

export const SCHOOL_FUNDING_COLUMNS: string = 'flights_funding, lodging_funding, version';

type Row = Record<string, unknown>;
type Service = SupabaseClient;

/* ------------------------------------------------------------------ mappers */

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function programName(program: string): string {
  return isProgramId(program) ? programById(program).name : program;
}

function isFundingSource(value: unknown): value is FundingSource {
  return typeof value === 'string' && (FUNDING_SOURCES as readonly string[]).includes(value);
}

/** A school-funding row (snake_case) as the API's `schoolFunding`, or null. */
export function toSchoolFunding(row: unknown): SchoolFunding | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Row;
  if (!isFundingSource(r.flights_funding) || !isFundingSource(r.lodging_funding)) return null;
  return { flightsFunding: r.flights_funding, lodgingFunding: r.lodging_funding, version: Number(r.version) };
}

/**
 * The admin embed `school_funding:pasantias_nomina_school_funding(...)`.
 * PostgREST answers a one-to-one embed as an object, older versions as a
 * one-element array, and no row as null or `[]` — all handled.
 */
export function schoolFundingFromEmbed(embedded: unknown): SchoolFunding | null {
  if (Array.isArray(embedded)) return embedded.length > 0 ? toSchoolFunding(embedded[0]) : null;
  return toSchoolFunding(embedded);
}

export interface CoordinatorRosterRow extends Omit<CoordinatorRoster, 'schoolFunding'> {
  /** Internal; never sent to the coordinator. */
  id: string;
}

export function toCoordinatorRoster(row: Row): CoordinatorRosterRow {
  const program = str(row.program);
  return {
    id: str(row.id),
    schoolName: str(row.school_name),
    program: program as ProgramId,
    programName: programName(program),
    status: str(row.status) as RosterStatus,
    version: Number(row.version),
    submittedAt: strOrNull(row.submitted_at),
    lastSubmittedAt: strOrNull(row.last_submitted_at),
    expiresAt: str(row.expires_at),
  };
}

/** The coordinator view: the internal id stays on the server; funding always present (C4). */
export function publicRoster(roster: CoordinatorRosterRow, schoolFunding: SchoolFunding | null): CoordinatorRoster {
  return {
    schoolName: roster.schoolName,
    program: roster.program,
    programName: roster.programName,
    status: roster.status,
    version: roster.version,
    submittedAt: roster.submittedAt,
    lastSubmittedAt: roster.lastSubmittedAt,
    expiresAt: roster.expiresAt,
    schoolFunding,
  };
}

export function toAdminRoster(row: Row): AdminRoster {
  const base = toCoordinatorRoster(row);
  const embedded = row.participants;
  const participantCount =
    Array.isArray(embedded) && embedded.length > 0 && typeof (embedded[0] as Row).count === 'number'
      ? ((embedded[0] as Row).count as number)
      : 0;
  return {
    ...base,
    schoolFunding: schoolFundingFromEmbed(row.school_funding),
    cohort: str(row.cohort),
    revokedAt: strOrNull(row.revoked_at),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    participantCount,
  };
}

/**
 * Effective focus (corrections §2): `todos` when the side table says
 * `all_levels`, otherwise the DB-01 column (a level, or null = Sin indicar).
 */
export function toParticipant(row: Row, allLevels = false): IntakeParticipant {
  return {
    id: str(row.id),
    version: Number(row.version),
    firstNames: str(row.first_names),
    lastNames: str(row.last_names),
    rut: str(row.rut),
    passportNumber: strOrNull(row.passport_number),
    arrivalDate: strOrNull(row.arrival_date),
    departureDate: strOrNull(row.departure_date),
    focus: allLevels ? 'todos' : (strOrNull(row.focus) as FocusCode | null),
    dietaryRestrictions: (Array.isArray(row.dietary_restrictions)
      ? row.dietary_restrictions
      : []) as DietaryCode[],
    dietaryOther: strOrNull(row.dietary_other),
    updatedAt: str(row.updated_at),
  };
}

export function toAdminParticipant(row: Row, allLevels = false): AdminIntakeParticipant {
  return {
    ...toParticipant(row, allLevels),
    createdAt: str(row.created_at),
    acknowledgedAt: str(row.acknowledged_at),
    noticeVersion: str(row.notice_version),
  };
}

/* ------------------------------------------------------------------ HTTP */

export function setNoStore(res: NextApiResponse): void {
  res.setHeader('Cache-Control', 'no-store');
}

const ERROR_MESSAGES: Record<IntakeErrorCode, string> = {
  LINK_UNAVAILABLE: 'Enlace incompleto o no disponible — contacta a FNE.',
  VALIDATION: 'Revisa los campos marcados.',
  DUPLICATE_RUT: MESSAGES.rutDuplicate,
  ROSTER_FULL: `La nómina ya tiene ${ROSTER_MAX_PARTICIPANTS} personas, el máximo permitido.`,
  STALE: 'Estos datos cambiaron mientras los editabas. Revisa la versión guardada.',
  NOT_FOUND: 'No encontramos esa ficha en esta nómina.',
  EMPTY_ROSTER: 'Agrega al menos una persona antes de enviar la nómina.',
  SCHOOL_DATA_MISSING: 'Primero guarda los datos del colegio (Pasajes y Estadía).',
  PAYLOAD_TOO_LARGE: 'La solicitud es demasiado grande.',
  METHOD_NOT_ALLOWED: 'Método no permitido.',
  UNAVAILABLE: 'El formulario no está disponible por ahora. Inténtalo más tarde.',
  INTERNAL: 'No pudimos completar la operación. Inténtalo de nuevo.',
};

const ERROR_STATUS: Record<IntakeErrorCode, number> = {
  LINK_UNAVAILABLE: 401,
  VALIDATION: 422,
  DUPLICATE_RUT: 409,
  ROSTER_FULL: 422,
  STALE: 409,
  NOT_FOUND: 404,
  EMPTY_ROSTER: 422,
  SCHOOL_DATA_MISSING: 422,
  PAYLOAD_TOO_LARGE: 413,
  METHOD_NOT_ALLOWED: 405,
  UNAVAILABLE: 503,
  INTERNAL: 500,
};

export function sendIntakeError(
  res: NextApiResponse,
  code: IntakeErrorCode,
  extra: Record<string, unknown> = {}
): void {
  res.status(ERROR_STATUS[code]).json({ code, error: ERROR_MESSAGES[code], ...extra });
}

/** Serialized size of the parsed body; the route config also caps it at 8 kB. */
export function isBodyTooLarge(req: NextApiRequest): boolean {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return true;
  if (req.body === undefined || req.body === null || req.body === '') return false;
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  return Buffer.byteLength(raw ?? '', 'utf8') > MAX_BODY_BYTES;
}

/**
 * The shared coordinator preamble, in FIRST §4 order: method, rate limit, the
 * `Intake` header, then SHA-256 of the token. Returns the hash, or null when a
 * response has already been sent.
 *
 * A malformed or missing header is refused here without any database call.
 * An unknown, expired or revoked token cannot be told apart from a live one
 * without the database: the caller's lookup (or the RPC) answers the same
 * `401 LINK_UNAVAILABLE` for each of them.
 */
export async function beginIntakeRequest(
  req: NextApiRequest,
  res: NextApiResponse,
  methods: readonly string[]
): Promise<string | null> {
  setNoStore(res);
  if (!req.method || !methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    sendIntakeError(res, 'METHOD_NOT_ALLOWED');
    return null;
  }
  const allowed = await intakeRateLimit(req, res);
  if (!allowed) return null; // 429 already sent by the limiter
  const token = parseIntakeAuthorization(req.headers.authorization);
  if (!token) {
    sendIntakeError(res, 'LINK_UNAVAILABLE');
    return null;
  }
  if (req.method !== 'GET' && isBodyTooLarge(req)) {
    sendIntakeError(res, 'PAYLOAD_TOO_LARGE');
    return null;
  }
  return hashIntakeToken(token);
}

export function logIntakeFailure(stage: string, error: unknown): void {
  console.error(`[${LOG_PREFIX}] ${stage}:`, loggableError(error));
}

/* ------------------------------------------------------------------ reads */

export type ReadResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * The live roster for a token hash: unrevoked and unexpired by the app clock.
 * The RPCs re-check with the database clock under a lock (db-contract §7.8).
 */
export async function findLiveRoster(
  supabase: Service,
  tokenHash: string
): Promise<ReadResult<CoordinatorRosterRow | null>> {
  const { data, error } = await supabase
    .from(ROSTERS_TABLE)
    .select(COORDINATOR_ROSTER_COLUMNS)
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) return { ok: false, error };
  return { ok: true, value: data ? toCoordinatorRoster(data as unknown as Row) : null };
}

/**
 * The roster a token hash names, live or not. Used only for the read that
 * follows an RPC which has just verified the same hash under its lock, so the
 * response reports the state actually stored even if a revoke lands between
 * the write and this read.
 */
export async function findRosterByHash(
  supabase: Service,
  tokenHash: string
): Promise<ReadResult<CoordinatorRosterRow | null>> {
  const { data, error } = await supabase
    .from(ROSTERS_TABLE)
    .select(COORDINATOR_ROSTER_COLUMNS)
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) return { ok: false, error };
  return { ok: true, value: data ? toCoordinatorRoster(data as unknown as Row) : null };
}

/** F01: the roster's "Datos del colegio", or null when the school has not saved them yet. */
export async function readSchoolFunding(
  supabase: Service,
  rosterId: string
): Promise<ReadResult<SchoolFunding | null>> {
  const { data, error } = await supabase
    .from(SCHOOL_FUNDING_TABLE)
    .select(SCHOOL_FUNDING_COLUMNS)
    .eq('roster_id', rosterId)
    .maybeSingle();
  if (error) return { ok: false, error };
  return { ok: true, value: toSchoolFunding(data) };
}

/**
 * F04: the ids among `participantIds` whose focus is "Todos". Callers pass
 * only ids that came from a roster-scoped participant read, so this never
 * reaches another roster's rows. A missing focus row counts as not-all-levels.
 */
export async function readAllLevelsIds(
  supabase: Service,
  participantIds: string[]
): Promise<ReadResult<Set<string>>> {
  if (participantIds.length === 0) return { ok: true, value: new Set() };
  const { data, error } = await supabase
    .from(PARTICIPANT_FOCUS_TABLE)
    .select('participant_id, all_levels')
    .in('participant_id', participantIds);
  if (error) return { ok: false, error };
  const ids = new Set<string>();
  for (const row of (data ?? []) as unknown as Row[]) {
    if (row.all_levels === true && typeof row.participant_id === 'string') ids.add(row.participant_id);
  }
  return { ok: true, value: ids };
}

async function listParticipantRows(
  supabase: Service,
  rosterId: string,
  columns: string
): Promise<ReadResult<Row[]>> {
  const { data, error } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select(columns)
    .eq('roster_id', rosterId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(ROSTER_MAX_PARTICIPANTS);
  if (error) return { ok: false, error };
  return { ok: true, value: (data ?? []) as unknown as Row[] };
}

/** The roster's participants (creation order, at most 60) with their effective focus. */
export async function listParticipants(
  supabase: Service,
  rosterId: string
): Promise<ReadResult<IntakeParticipant[]>> {
  const rows = await listParticipantRows(supabase, rosterId, PARTICIPANT_COLUMNS);
  if (rows.ok === false) return rows;
  const todos = await readAllLevelsIds(supabase, rows.value.map((row) => str(row.id)));
  if (todos.ok === false) return todos;
  return { ok: true, value: rows.value.map((row) => toParticipant(row, todos.value.has(str(row.id)))) };
}

/** The admin detail list: as above plus the acknowledgement evidence. */
export async function listAdminParticipants(
  supabase: Service,
  rosterId: string
): Promise<ReadResult<AdminIntakeParticipant[]>> {
  const rows = await listParticipantRows(supabase, rosterId, ADMIN_PARTICIPANT_COLUMNS);
  if (rows.ok === false) return rows;
  const todos = await readAllLevelsIds(supabase, rows.value.map((row) => str(row.id)));
  if (todos.ok === false) return todos;
  return { ok: true, value: rows.value.map((row) => toAdminParticipant(row, todos.value.has(str(row.id)))) };
}

/** One participant, scoped to the roster the token resolved to — never by id alone. */
export async function readParticipant(
  supabase: Service,
  rosterId: string,
  participantId: string
): Promise<ReadResult<IntakeParticipant | null>> {
  const { data, error } = await supabase
    .from(PARTICIPANTS_TABLE)
    .select(PARTICIPANT_COLUMNS)
    .eq('id', participantId)
    .eq('roster_id', rosterId)
    .maybeSingle();
  if (error) return { ok: false, error };
  if (!data) return { ok: true, value: null };
  const row = data as unknown as Row;
  // Focus only for an id the roster-scoped read just returned.
  const todos = await readAllLevelsIds(supabase, [str(row.id)]);
  if (todos.ok === false) return todos;
  return { ok: true, value: toParticipant(row, todos.value.has(str(row.id))) };
}

/**
 * The coordinator `roster` for a response: the roster plus its school funding
 * (C4). A failed funding read fails the whole read — a roster is never sent
 * with a guessed `schoolFunding`.
 */
export async function rosterWithFunding(
  supabase: Service,
  roster: CoordinatorRosterRow
): Promise<ReadResult<CoordinatorRoster>> {
  const funding = await readSchoolFunding(supabase, roster.id);
  if (funding.ok === false) return funding;
  return { ok: true, value: publicRoster(roster, funding.value) };
}

/* ------------------------------------------------------------------ RPCs */

const SAVE_REFUSALS = [
  'invalid_argument',
  'invalid_first_names',
  'invalid_last_names',
  'invalid_rut',
  'invalid_passport_number',
  'invalid_dates',
  'invalid_focus',
  'invalid_dietary',
  'invalid_notice_version',
  'link_unavailable',
  'school_data_missing',
  'roster_full',
  'duplicate_rut',
  'unknown_participant',
  'stale_version',
] as const;
export type SaveRefusal = (typeof SAVE_REFUSALS)[number];

const FUNDING_REFUSALS = [
  'invalid_argument',
  'invalid_flights_funding',
  'invalid_lodging_funding',
  'link_unavailable',
  'stale_version',
] as const;
export type FundingRefusal = (typeof FUNDING_REFUSALS)[number];

const FINALIZE_REFUSALS = ['invalid_argument', 'link_unavailable', 'stale_version', 'empty_roster'] as const;
export type FinalizeRefusal = (typeof FINALIZE_REFUSALS)[number];

/** PostgREST answers for "the objects are not deployed" (as `pages/api/pasantias/lead.ts`). */
const UNAVAILABLE_CODES = new Set(['PGRST202', '42883', '42P01']);

/** The frozen refusal code, matched on the EXACT message (db-contract §4), or null. */
function refusalCode<T extends string>(error: unknown, fn: string, codes: readonly T[]): T | null {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  if (code !== '22023' || typeof message !== 'string') return null;
  return codes.find((candidate) => message === `${fn}: ${candidate}`) ?? null;
}

export function isUnavailable(error: unknown): boolean {
  const { code } = (error ?? {}) as { code?: unknown };
  return typeof code === 'string' && UNAVAILABLE_CODES.has(code);
}

export interface SaveRow {
  participant_id: string;
  participant_version: number;
  replayed: boolean;
  roster_status: string;
  roster_version: number;
}

export type SaveMode =
  | { kind: 'create'; clientRequestId: string }
  | { kind: 'update'; participantId: string; expectedVersion: number };

export type RpcOutcome<TRow, TRefusal> =
  | { ok: true; row: TRow }
  | { ok: false; refusal: TRefusal | null; error: unknown };

function firstRow<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as T | null;
}

/**
 * Every one of the fourteen named arguments of `pasantias_nomina_save_participant`,
 * always: PostgREST resolves a function by argument names, and a missing key is
 * PGRST202, not a default. No funding argument exists (F01).
 */
export function saveArgs(
  tokenHash: string,
  mode: SaveMode,
  fields: ParticipantFields,
  noticeVersion: string
): Record<string, unknown> {
  return {
    p_token_hash: tokenHash,
    p_participant_id: mode.kind === 'update' ? mode.participantId : null,
    p_expected_version: mode.kind === 'update' ? mode.expectedVersion : null,
    p_client_request_id: mode.kind === 'create' ? mode.clientRequestId : null,
    p_first_names: fields.firstNames,
    p_last_names: fields.lastNames,
    p_rut: fields.rut,
    p_passport_number: fields.passportNumber,
    p_arrival_date: fields.arrivalDate,
    p_departure_date: fields.departureDate,
    p_focus: fields.focus,
    p_dietary_restrictions: fields.dietaryRestrictions,
    p_dietary_other: fields.dietaryOther,
    p_notice_version: noticeVersion,
  };
}

export async function callSave(
  supabase: Service,
  args: Record<string, unknown>
): Promise<RpcOutcome<SaveRow, SaveRefusal>> {
  const { data, error } = await supabase.rpc(SAVE_RPC, args);
  if (error) return { ok: false, refusal: refusalCode(error, SAVE_RPC, SAVE_REFUSALS), error };
  const row = firstRow<SaveRow>(data);
  if (!row?.participant_id) return { ok: false, refusal: null, error: { code: 'EMPTY_RESULT' } };
  return { ok: true, row };
}

export interface FundingRow {
  funding_flights: string;
  funding_lodging: string;
  funding_version: number;
  replayed: boolean;
  roster_status: string;
  roster_version: number;
}

export async function callSaveSchoolFunding(
  supabase: Service,
  tokenHash: string,
  request: { flightsFunding: FundingSource; lodgingFunding: FundingSource; expectedFundingVersion: number | null }
): Promise<RpcOutcome<FundingRow, FundingRefusal>> {
  const { data, error } = await supabase.rpc(FUNDING_RPC, {
    p_token_hash: tokenHash,
    p_expected_funding_version: request.expectedFundingVersion,
    p_flights_funding: request.flightsFunding,
    p_lodging_funding: request.lodgingFunding,
  });
  if (error) return { ok: false, refusal: refusalCode(error, FUNDING_RPC, FUNDING_REFUSALS), error };
  const row = firstRow<FundingRow>(data);
  if (!row?.roster_status) return { ok: false, refusal: null, error: { code: 'EMPTY_RESULT' } };
  return { ok: true, row };
}

export interface FinalizeRow {
  roster_status: string;
  roster_version: number;
  submitted_at: string | null;
}

export async function callFinalize(
  supabase: Service,
  tokenHash: string,
  expectedRosterVersion: number
): Promise<RpcOutcome<FinalizeRow, FinalizeRefusal>> {
  const { data, error } = await supabase.rpc(FINALIZE_RPC, {
    p_token_hash: tokenHash,
    p_expected_roster_version: expectedRosterVersion,
  });
  if (error) return { ok: false, refusal: refusalCode(error, FINALIZE_RPC, FINALIZE_REFUSALS), error };
  const row = firstRow<FinalizeRow>(data);
  if (!row?.roster_status) return { ok: false, refusal: null, error: { code: 'EMPTY_RESULT' } };
  return { ok: true, row };
}

/** SQL field refusals → the form field they belong to (validator drift). */
const REFUSAL_FIELDS: Partial<Record<SaveRefusal, keyof ParticipantFields>> = {
  invalid_first_names: 'firstNames',
  invalid_last_names: 'lastNames',
  invalid_rut: 'rut',
  invalid_passport_number: 'passportNumber',
  invalid_dates: 'departureDate',
  invalid_focus: 'focus',
  invalid_dietary: 'dietaryRestrictions',
};

/**
 * Answers a refused or failed participant save, except `stale_version`, which
 * the caller handles because its 409 carries the current row.
 */
export function sendSaveFailure(
  res: NextApiResponse,
  outcome: { refusal: SaveRefusal | null; error: unknown }
): void {
  const { refusal } = outcome;
  if (refusal === 'link_unavailable') return sendIntakeError(res, 'LINK_UNAVAILABLE');
  if (refusal === 'school_data_missing') return sendIntakeError(res, 'SCHOOL_DATA_MISSING');
  if (refusal === 'roster_full') return sendIntakeError(res, 'ROSTER_FULL');
  if (refusal === 'duplicate_rut') {
    return sendIntakeError(res, 'DUPLICATE_RUT', { fields: { rut: MESSAGES.rutDuplicate } });
  }
  if (refusal === 'unknown_participant') return sendIntakeError(res, 'NOT_FOUND');
  const field = refusal ? REFUSAL_FIELDS[refusal] : undefined;
  if (field) {
    // The SQL refused a value this validator accepted: the two drifted. The
    // code names a field, never a value, so it is safe to log.
    console.error(`[${LOG_PREFIX}] save refused by the database:`, { code: refusal });
    const fields: FieldErrors = { [field]: ERROR_MESSAGES.VALIDATION };
    return sendIntakeError(res, 'VALIDATION', { fields });
  }
  if (refusal) {
    // invalid_argument / invalid_notice_version / stale_version reaching here:
    // a caller bug. Fail closed.
    console.error(`[${LOG_PREFIX}] save refused (caller bug):`, { code: refusal });
    return sendIntakeError(res, 'INTERNAL');
  }
  if (isUnavailable(outcome.error)) {
    logIntakeFailure('save unavailable', outcome.error);
    return sendIntakeError(res, 'UNAVAILABLE');
  }
  logIntakeFailure('save failed', outcome.error);
  return sendIntakeError(res, 'INTERNAL');
}

/**
 * Answers a refused or failed school-funding save, except `stale_version`
 * (its 409 carries the current roster, so the route handles it).
 */
export function sendFundingFailure(
  res: NextApiResponse,
  outcome: { refusal: FundingRefusal | null; error: unknown }
): void {
  const { refusal } = outcome;
  if (refusal === 'link_unavailable') return sendIntakeError(res, 'LINK_UNAVAILABLE');
  if (refusal === 'invalid_flights_funding' || refusal === 'invalid_lodging_funding') {
    console.error(`[${LOG_PREFIX}] funding refused by the database:`, { code: refusal });
    const field = refusal === 'invalid_flights_funding' ? 'flightsFunding' : 'lodgingFunding';
    return sendIntakeError(res, 'VALIDATION', { fields: { [field]: ERROR_MESSAGES.VALIDATION } });
  }
  if (refusal) {
    console.error(`[${LOG_PREFIX}] funding refused (caller bug):`, { code: refusal });
    return sendIntakeError(res, 'INTERNAL');
  }
  if (isUnavailable(outcome.error)) {
    logIntakeFailure('funding unavailable', outcome.error);
    return sendIntakeError(res, 'UNAVAILABLE');
  }
  logIntakeFailure('funding failed', outcome.error);
  return sendIntakeError(res, 'INTERNAL');
}
