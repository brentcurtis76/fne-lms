/**
 * SERVER ONLY. Data access for the Pasantías panel admin routes.
 *
 * Every table here grants nothing to anon or authenticated (admins included),
 * so every read and write runs on the service-role client AFTER
 * `authorizeIntakeAdmin` (global admin + forced-password hold). Writes that
 * must be atomic with their activity row go through the SQL functions of
 * `20261109210000_pasantias_logistics_panel.sql`.
 *
 * Table names are written as literals at each `.from(...)`: the ledger
 * production-consumer inventory resolves only statically provable targets.
 *
 * Logging (Ley 21.719): only `logIntakeFailure` (code + status) or a frozen
 * refusal code. Never a name, RUT, passport, note, file name or storage path.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isProgramId, programById, type ProgramId } from '../cohort-public';
import {
  ADMIN_PARTICIPANT_COLUMNS,
  schoolFundingFromEmbed,
  toAdminParticipant,
  type ReadResult,
  type RpcOutcome,
} from '../participants/server';
import { INTAKE_COHORT, type ParticipantFields, type RosterStatus } from '../participants/types';
import { activityActorIds, toPanelActivity } from './activity';
import {
  EMPTY_LOGISTICS,
  type ActivityAction,
  type DocumentKind,
  type FlightStatus,
  type LodgingStatus,
  type Logistics,
  type PanelActivity,
  type PanelDocument,
  type PanelRoster,
  type PanelRow,
  type RosterDetails,
  type Salutation,
} from './types';
import type { BulkRequest, LogisticsRequest, RosterDetailsRequest } from './validation';

type Row = Record<string, unknown>;
type Service = SupabaseClient;

export const DOCUMENTS_BUCKET = 'pasantias-documents';
export const SAVE_LOGISTICS_RPC = 'pasantias_panel_save_logistics';
export const BULK_RPC = 'pasantias_panel_bulk_set';
export const SAVE_PARTICIPANT_RPC = 'pasantias_panel_save_participant';

const PAGE_SIZE = 1000;
const ACTIVITY_LIMIT = 100;

const ROSTER_SELECT =
  'id, program, school_name, status, last_submitted_at, ' +
  'school_funding:pasantias_nomina_school_funding(flights_funding, lodging_funding, version)';
export const LOGISTICS_COLUMNS: string =
  'participant_id, flight_status, lodging_status, deposit_received, balance_received, salutation, notes, ' +
  'scl_departure_date, bcn_arrival_date, bcn_departure_date, scl_arrival_date, ' +
  'letter_sent_at, letter_sent_to, letter_send_error, version, updated_at';
export const PLATFORM_ACCOUNTS_RPC = 'pasantias_panel_platform_accounts';
export const CLAIM_LETTER_RPC = 'pasantias_panel_claim_letter_send';
export const FINISH_LETTER_RPC = 'pasantias_panel_finish_letter_send';
const DETAILS_COLUMNS = 'roster_id, letter_school_line, letter_lodging_line, version';
const DOCUMENT_COLUMNS = 'id, participant_id, kind, description, file_name, mime_type, size_bytes, created_at';

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/* ------------------------------------------------------------------ mappers */

export function toLogistics(row: Row | null | undefined): Logistics {
  if (!row) return { ...EMPTY_LOGISTICS };
  return {
    flightStatus: str(row.flight_status) as FlightStatus,
    lodgingStatus: str(row.lodging_status) as LodgingStatus,
    depositReceived: row.deposit_received === true,
    balanceReceived: row.balance_received === true,
    salutation: strOrNull(row.salutation) as Salutation | null,
    notes: strOrNull(row.notes),
    sclDepartureDate: strOrNull(row.scl_departure_date),
    bcnArrivalDate: strOrNull(row.bcn_arrival_date),
    bcnDepartureDate: strOrNull(row.bcn_departure_date),
    sclArrivalDate: strOrNull(row.scl_arrival_date),
    letterSentAt: strOrNull(row.letter_sent_at),
    letterSentTo: strOrNull(row.letter_sent_to),
    letterSendError: strOrNull(row.letter_send_error),
    version: Number(row.version),
    updatedAt: strOrNull(row.updated_at),
  };
}

export function toRosterDetails(row: Row | null | undefined): RosterDetails {
  if (!row) return { letterSchoolLine: null, letterLodgingLine: null, version: null };
  return {
    letterSchoolLine: strOrNull(row.letter_school_line),
    letterLodgingLine: strOrNull(row.letter_lodging_line),
    version: Number(row.version),
  };
}

export function toPanelRoster(row: Row, details: Row | null | undefined): PanelRoster {
  const program = str(row.program);
  return {
    id: str(row.id),
    schoolName: str(row.school_name),
    program: program as ProgramId,
    programName: isProgramId(program) ? programById(program).name : program,
    status: str(row.status) as RosterStatus,
    lastSubmittedAt: strOrNull(row.last_submitted_at),
    schoolFunding: schoolFundingFromEmbed(row.school_funding),
    details: toRosterDetails(details),
  };
}

export function toPanelDocument(row: Row): PanelDocument {
  return {
    id: str(row.id),
    kind: str(row.kind) as DocumentKind,
    description: strOrNull(row.description),
    fileName: str(row.file_name),
    mimeType: str(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    createdAt: str(row.created_at),
  };
}

/* -------------------------------------------------------------------- reads */

type PageAnswer = { data: unknown; error: unknown };

/** Reads every row of a stably ordered query, past PostgREST's per-request cap. */
export async function fetchAll(
  page: (from: number, to: number) => PromiseLike<PageAnswer>
): Promise<ReadResult<Row[]>> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { ok: false, error };
    const batch = (data ?? []) as Row[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { ok: true, value: rows };
  }
}

export interface PanelData {
  rosters: PanelRoster[];
  rows: PanelRow[];
}

/**
 * Everything the panel shows: every roster of the cohort and every traveller,
 * with FNE's tracking. Eight reads, none per row. School name, then creation
 * order inside a school.
 */
export async function loadPanel(supabase: Service): Promise<ReadResult<PanelData>> {
  const rosterRows = await fetchAll((from, to) =>
    supabase
      .from('pasantias_intake_rosters')
      .select(ROSTER_SELECT)
      .eq('cohort', INTAKE_COHORT)
      .order('school_name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );
  if (rosterRows.ok === false) return rosterRows;

  const detailRows = await fetchAll((from, to) =>
    supabase
      .from('pasantias_panel_roster_details')
      .select(DETAILS_COLUMNS)
      .order('roster_id', { ascending: true })
      .range(from, to)
  );
  if (detailRows.ok === false) return detailRows;
  const detailsByRoster = new Map(detailRows.value.map((row) => [str(row.roster_id), row]));

  const rosters = rosterRows.value.map((row) => toPanelRoster(row, detailsByRoster.get(str(row.id))));
  const rosterOrder = new Map(rosters.map((roster, index) => [roster.id, index]));

  const participantRows = await fetchAll((from, to) =>
    supabase
      .from('pasantias_intake_participants')
      .select(`roster_id, ${ADMIN_PARTICIPANT_COLUMNS}`)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );
  if (participantRows.ok === false) return participantRows;

  const focusRows = await fetchAll((from, to) =>
    supabase
      .from('pasantias_nomina_participant_focus')
      .select('participant_id')
      .eq('all_levels', true)
      .order('participant_id', { ascending: true })
      .range(from, to)
  );
  if (focusRows.ok === false) return focusRows;
  const allLevels = new Set(focusRows.value.map((row) => str(row.participant_id)));

  const logisticsRows = await fetchAll((from, to) =>
    supabase
      .from('pasantias_panel_logistics')
      .select(LOGISTICS_COLUMNS)
      .order('participant_id', { ascending: true })
      .range(from, to)
  );
  if (logisticsRows.ok === false) return logisticsRows;
  const logisticsById = new Map(logisticsRows.value.map((row) => [str(row.participant_id), row]));

  const contactRows = await fetchAll((from, to) =>
    supabase
      .from('pasantias_panel_contacts')
      .select('participant_id, email')
      .order('participant_id', { ascending: true })
      .range(from, to)
  );
  if (contactRows.ok === false) return contactRows;
  const emailById = new Map(contactRows.value.map((row) => [str(row.participant_id), strOrNull(row.email)]));

  const accounts = await readPlatformAccounts(supabase);
  if (accounts.ok === false) return accounts;

  const documentRows = await fetchAll((from, to) =>
    supabase
      .from('pasantias_panel_documents')
      .select('id, participant_id, kind')
      .is('removed_at', null)
      .order('id', { ascending: true })
      .range(from, to)
  );
  if (documentRows.ok === false) return documentRows;
  const docCount = new Map<string, number>();
  const withLetter = new Set<string>();
  for (const row of documentRows.value) {
    const id = str(row.participant_id);
    docCount.set(id, (docCount.get(id) ?? 0) + 1);
    if (row.kind === 'invitation_letter') withLetter.add(id);
  }

  // One bucket per roster, in roster order; creation order is kept inside each.
  const buckets: PanelRow[][] = rosters.map(() => []);
  for (const row of participantRows.value) {
    const rosterId = str(row.roster_id);
    const index = rosterOrder.get(rosterId);
    if (index === undefined) continue; // another cohort's roster, if one ever exists
    const id = str(row.id);
    buckets[index].push({
      rosterId,
      participant: toAdminParticipant(row, allLevels.has(id), {
        email: emailById.get(id) ?? null,
        datesLocked: false,
      }),
      logistics: toLogistics(logisticsById.get(id)),
      documentCount: docCount.get(id) ?? 0,
      hasLetter: withLetter.has(id),
      hasAccount: accounts.value.has(id),
    });
  }
  const rows = buckets.flat();
  return { ok: true, value: { rosters, rows } };
}

/** The ids of the travellers whose email belongs to a GENERA account. */
export async function readPlatformAccounts(supabase: Service): Promise<ReadResult<Set<string>>> {
  const { data, error } = await supabase.rpc(PLATFORM_ACCOUNTS_RPC);
  if (error) return { ok: false, error };
  const rows = (Array.isArray(data) ? data : []) as Row[];
  return { ok: true, value: new Set(rows.map((row) => str(row.participant_id))) };
}

/** One traveller with their roster and tracking, or null when the id is unknown. */
export async function loadParticipant(
  supabase: Service,
  participantId: string
): Promise<ReadResult<{ row: PanelRow; roster: PanelRoster } | null>> {
  const { data: participant, error } = await supabase
    .from('pasantias_intake_participants')
    .select(`roster_id, ${ADMIN_PARTICIPANT_COLUMNS}`)
    .eq('id', participantId)
    .maybeSingle();
  if (error) return { ok: false, error };
  if (!participant) return { ok: true, value: null };
  const p = participant as unknown as Row;
  const rosterId = str(p.roster_id);

  const [roster, details, focus, logistics, documents, contact] = await Promise.all([
    supabase.from('pasantias_intake_rosters').select(ROSTER_SELECT).eq('id', rosterId).maybeSingle(),
    supabase.from('pasantias_panel_roster_details').select(DETAILS_COLUMNS).eq('roster_id', rosterId).maybeSingle(),
    supabase
      .from('pasantias_nomina_participant_focus')
      .select('all_levels')
      .eq('participant_id', participantId)
      .maybeSingle(),
    supabase.from('pasantias_panel_logistics').select(LOGISTICS_COLUMNS).eq('participant_id', participantId).maybeSingle(),
    supabase
      .from('pasantias_panel_documents')
      .select('id, participant_id, kind')
      .eq('participant_id', participantId)
      .is('removed_at', null),
    supabase.from('pasantias_panel_contacts').select('email').eq('participant_id', participantId).maybeSingle(),
  ]);
  const failed = [roster, details, focus, logistics, documents, contact].find((answer) => answer.error);
  if (failed) return { ok: false, error: failed.error };
  if (!roster.data) return { ok: true, value: null };

  const email = strOrNull((contact.data as unknown as Row | null)?.email);
  let hasAccount = false;
  if (email) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', email.replace(/[\\%_]/g, (character) => `\\${character}`))
      .limit(1);
    if (profileError) return { ok: false, error: profileError };
    hasAccount = ((profile ?? []) as unknown[]).length > 0;
  }

  const docs = (documents.data ?? []) as unknown as Row[];
  return {
    ok: true,
    value: {
      roster: toPanelRoster(roster.data as unknown as Row, details.data as unknown as Row | null),
      row: {
        rosterId,
        participant: toAdminParticipant(p, (focus.data as unknown as Row | null)?.all_levels === true, {
          email,
          datesLocked: false,
        }),
        logistics: toLogistics(logistics.data as unknown as Row | null),
        documentCount: docs.length,
        hasLetter: docs.some((doc) => doc.kind === 'invitation_letter'),
        hasAccount,
      },
    },
  };
}

export async function listDocuments(supabase: Service, participantId: string): Promise<ReadResult<PanelDocument[]>> {
  const { data, error } = await supabase
    .from('pasantias_panel_documents')
    .select(DOCUMENT_COLUMNS)
    .eq('participant_id', participantId)
    .is('removed_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(200);
  if (error) return { ok: false, error };
  return { ok: true, value: ((data ?? []) as unknown as Row[]).map(toPanelDocument) };
}

/* ----------------------------------------------------------------- activity */

/** The latest 100 activity rows of one traveller, newest first, with the admin's name. */
export async function listActivity(
  supabase: Service,
  participantId: string,
  program: ProgramId | null
): Promise<ReadResult<PanelActivity[]>> {
  const { data, error } = await supabase
    .from('pasantias_panel_activity')
    .select('id, actor_id, action, details, created_at')
    .eq('participant_id', participantId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(ACTIVITY_LIMIT);
  if (error) return { ok: false, error };
  const rows = (data ?? []) as unknown as Row[];

  const actorIds = activityActorIds(rows);
  let profileRows: Row[] = [];
  if (actorIds.length > 0) {
    const { data: found, error: profileError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, name')
      .in('id', actorIds);
    // A failed name lookup never hides the history: rows fall back to "Administrador".
    if (!profileError) profileRows = (found ?? []) as unknown as Row[];
  }
  return { ok: true, value: toPanelActivity(rows, profileRows, program) };
}

/** Appends one activity row. Returns false when the write failed (the caller logs). */
export async function recordActivity(
  supabase: Service,
  entry: { participantId: string; actorId: string | null; action: ActivityAction; details: Record<string, unknown> }
): Promise<{ ok: boolean; error?: unknown }> {
  const { error } = await supabase.from('pasantias_panel_activity').insert({
    participant_id: entry.participantId,
    actor_id: entry.actorId,
    action: entry.action,
    details: entry.details,
  });
  return error ? { ok: false, error } : { ok: true };
}

/* --------------------------------------------------------------------- RPCs */

function refusalCode<T extends string>(error: unknown, fn: string, codes: readonly T[]): T | null {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  if (code !== '22023' || typeof message !== 'string') return null;
  return codes.find((candidate) => message === `${fn}: ${candidate}`) ?? null;
}

function firstRow<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as T | null;
}

const LOGISTICS_REFUSALS = [
  'invalid_argument',
  'invalid_flight_status',
  'invalid_lodging_status',
  'invalid_payment',
  'invalid_salutation',
  'invalid_notes',
  'invalid_flight_dates',
  'unknown_participant',
  'stale_version',
] as const;
export type LogisticsRefusal = (typeof LOGISTICS_REFUSALS)[number];

export async function callSaveLogistics(
  supabase: Service,
  participantId: string,
  request: LogisticsRequest,
  actorId: string
): Promise<RpcOutcome<{ logistics_version: number; replayed: boolean }, LogisticsRefusal>> {
  const { data, error } = await supabase.rpc(SAVE_LOGISTICS_RPC, {
    p_participant_id: participantId,
    p_expected_version: request.expectedVersion,
    p_flight_status: request.flightStatus,
    p_lodging_status: request.lodgingStatus,
    p_deposit_received: request.depositReceived,
    p_balance_received: request.balanceReceived,
    p_salutation: request.salutation,
    p_notes: request.notes,
    p_scl_departure_date: request.sclDepartureDate,
    p_bcn_arrival_date: request.bcnArrivalDate,
    p_bcn_departure_date: request.bcnDepartureDate,
    p_scl_arrival_date: request.sclArrivalDate,
    p_actor: actorId,
  });
  if (error) return { ok: false, refusal: refusalCode(error, SAVE_LOGISTICS_RPC, LOGISTICS_REFUSALS), error };
  const row = firstRow<{ logistics_version: number; replayed: boolean }>(data);
  if (!row || typeof row.logistics_version !== 'number') {
    return { ok: false, refusal: null, error: { code: 'EMPTY_RESULT' } };
  }
  return { ok: true, row };
}

const BULK_REFUSALS = ['invalid_argument', 'invalid_field_value', 'unknown_participant'] as const;
export type BulkRefusal = (typeof BULK_REFUSALS)[number];

export async function callBulkSet(
  supabase: Service,
  request: BulkRequest,
  actorId: string
): Promise<RpcOutcome<{ changed: number }, BulkRefusal>> {
  const { data, error } = await supabase.rpc(BULK_RPC, {
    p_participant_ids: request.participantIds,
    p_field: request.field,
    p_value: request.value,
    p_actor: actorId,
  });
  if (error) return { ok: false, refusal: refusalCode(error, BULK_RPC, BULK_REFUSALS), error };
  if (typeof data !== 'number') return { ok: false, refusal: null, error: { code: 'EMPTY_RESULT' } };
  return { ok: true, row: { changed: data } };
}

const CORRECTION_REFUSALS = [
  'invalid_argument',
  'invalid_first_names',
  'invalid_last_names',
  'invalid_rut',
  'invalid_passport_number',
  'invalid_dates',
  'invalid_focus',
  'invalid_dietary',
  'invalid_email',
  'unknown_participant',
  'stale_version',
  'duplicate_rut',
] as const;
export type CorrectionRefusal = (typeof CORRECTION_REFUSALS)[number];

/** SQL field refusals → the form field they belong to (validator drift). */
export const CORRECTION_REFUSAL_FIELDS: Partial<Record<CorrectionRefusal, keyof ParticipantFields>> = {
  invalid_first_names: 'firstNames',
  invalid_last_names: 'lastNames',
  invalid_rut: 'rut',
  invalid_passport_number: 'passportNumber',
  invalid_dates: 'departureDate',
  invalid_focus: 'focus',
  invalid_dietary: 'dietaryRestrictions',
  invalid_email: 'email',
};

export async function callSaveParticipant(
  supabase: Service,
  participantId: string,
  expectedVersion: number,
  fields: ParticipantFields,
  actorId: string
): Promise<RpcOutcome<{ participant_version: number; replayed: boolean }, CorrectionRefusal>> {
  const { data, error } = await supabase.rpc(SAVE_PARTICIPANT_RPC, {
    p_participant_id: participantId,
    p_expected_version: expectedVersion,
    p_first_names: fields.firstNames,
    p_last_names: fields.lastNames,
    p_rut: fields.rut,
    p_passport_number: fields.passportNumber,
    p_arrival_date: fields.arrivalDate,
    p_departure_date: fields.departureDate,
    p_focus: fields.focus,
    p_dietary_restrictions: fields.dietaryRestrictions,
    p_dietary_other: fields.dietaryOther,
    p_email: fields.email,
    p_actor: actorId,
  });
  if (error) return { ok: false, refusal: refusalCode(error, SAVE_PARTICIPANT_RPC, CORRECTION_REFUSALS), error };
  const row = firstRow<{ participant_version: number; replayed: boolean }>(data);
  if (!row || typeof row.participant_version !== 'number') {
    return { ok: false, refusal: null, error: { code: 'EMPTY_RESULT' } };
  }
  return { ok: true, row };
}

/* ----------------------------------------------------------- roster details */

export type DetailsWrite =
  | { ok: true; details: RosterDetails }
  | { ok: false; reason: 'stale' | 'not_found' | 'failed'; error?: unknown };

/**
 * Saves the two letter lines of one roster with an optimistic version: a first
 * save inserts (a concurrent first save loses on the primary key → stale), an
 * edit updates only the row still at the expected version.
 */
export async function saveRosterDetails(
  supabase: Service,
  rosterId: string,
  request: RosterDetailsRequest,
  actorId: string
): Promise<DetailsWrite> {
  if (request.expectedVersion === null) {
    const { data, error } = await supabase
      .from('pasantias_panel_roster_details')
      .insert({
        roster_id: rosterId,
        letter_school_line: request.letterSchoolLine,
        letter_lodging_line: request.letterLodgingLine,
        updated_by: actorId,
      })
      .select(DETAILS_COLUMNS)
      .maybeSingle();
    if (error) {
      const code = (error as { code?: unknown }).code;
      if (code === '23505') return { ok: false, reason: 'stale' };
      if (code === '23503') return { ok: false, reason: 'not_found' };
      return { ok: false, reason: 'failed', error };
    }
    return { ok: true, details: toRosterDetails(data as unknown as Row) };
  }
  const { data, error } = await supabase
    .from('pasantias_panel_roster_details')
    .update({
      letter_school_line: request.letterSchoolLine,
      letter_lodging_line: request.letterLodgingLine,
      updated_by: actorId,
      version: request.expectedVersion + 1,
    })
    .eq('roster_id', rosterId)
    .eq('version', request.expectedVersion)
    .select(DETAILS_COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, reason: 'failed', error };
  if (!data) return { ok: false, reason: 'stale' };
  return { ok: true, details: toRosterDetails(data as unknown as Row) };
}

/* --------------------------------------------------------------- letter email */

/** True when this caller may email the letter now (see the migration's claim rules). */
export async function claimLetterSend(
  supabase: Service,
  participantId: string,
  force: boolean
): Promise<ReadResult<boolean>> {
  const { data, error } = await supabase.rpc(CLAIM_LETTER_RPC, { p_participant_id: participantId, p_force: force });
  if (error) return { ok: false, error };
  return { ok: true, value: data === true };
}

/** Records how an emailing attempt ended. `actorId` null = the automatic send. */
export async function finishLetterSend(
  supabase: Service,
  participantId: string,
  outcome: { sent: true; email: string } | { sent: false; error: string },
  actorId: string | null
): Promise<{ ok: boolean; error?: unknown }> {
  const { error } = await supabase.rpc(FINISH_LETTER_RPC, {
    p_participant_id: participantId,
    p_sent: outcome.sent,
    p_email: outcome.sent === true ? outcome.email : null,
    p_error: outcome.sent === false ? outcome.error : null,
    p_actor: actorId,
  });
  return error ? { ok: false, error } : { ok: true };
}
