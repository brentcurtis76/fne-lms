/**
 * SERVER ONLY. "Mi pasantía": what a traveller sees about their own January
 * 2027 pasantía once they sign in to GENERA.
 *
 * A traveller is recognised by email alone: the address their school (or FNE)
 * entered for them equals the CONFIRMED address of the signed-in account.
 * Nothing here trusts an id from the browser — every read starts from the
 * session's own email.
 *
 * Deliberately narrow: program, school, the flight dates and airfare/lodging
 * state FNE tracks, and the traveller's ticket and invitation letter. No RUT,
 * no passport number, no payments, no notes, no "other" documents.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { isProgramId, programById } from '../cohort-public';
import { INTAKE_COHORT } from '../participants/types';
import { letterDateRange } from './dates';
import { LOGISTICS_COLUMNS, toLogistics } from './server';
import {
  FLIGHT_LABELS,
  LODGING_LABELS,
  type DocumentKind,
  type FlightStatus,
  type LodgingStatus,
} from './types';

type Row = Record<string, unknown>;
type Service = SupabaseClient;

/** The document kinds a traveller may see and download. */
export const TRAVELLER_DOCUMENT_KINDS: readonly DocumentKind[] = ['ticket', 'invitation_letter'];

export interface MyPasantiaDocument {
  id: string;
  kind: DocumentKind;
  fileName: string;
  createdAt: string;
}

export interface MyPasantia {
  participantId: string;
  fullName: string;
  schoolName: string;
  programName: string;
  /** e.g. "entre el 18 y el 28 de enero de 2027". */
  programDates: string;
  flightStatus: FlightStatus;
  flightStatusLabel: string;
  lodgingStatus: LodgingStatus;
  lodgingStatusLabel: string;
  /** Where the traveller stays, as FNE wrote it for the letter; null until defined. */
  lodgingLine: string | null;
  sclDepartureDate: string | null;
  bcnArrivalDate: string | null;
  bcnDepartureDate: string | null;
  sclArrivalDate: string | null;
  documents: MyPasantiaDocument[];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** The account's confirmed email in the stored (lower-case) form, or null. */
export function confirmedEmail(user: Pick<User, 'email' | 'email_confirmed_at'> | null): string | null {
  if (!user || !user.email || !user.email_confirmed_at) return null;
  const email = user.email.trim().toLowerCase();
  return email.length > 0 ? email : null;
}

/** The ids of this cohort's travellers registered with exactly this (lower-case) email. */
export async function findMyParticipantIds(
  supabase: Service,
  email: string
): Promise<{ ok: true; value: string[] } | { ok: false; error: unknown }> {
  const { data, error } = await supabase
    .from('pasantias_panel_contacts')
    .select('participant_id')
    .eq('email', email)
    .order('participant_id', { ascending: true })
    .limit(10);
  if (error) return { ok: false, error };
  return { ok: true, value: ((data ?? []) as unknown as Row[]).map((row) => str(row.participant_id)).filter(Boolean) };
}

/** Everything "Mi pasantía" shows for one account. Empty when the email matches nobody. */
export async function loadMyPasantias(
  supabase: Service,
  email: string
): Promise<{ ok: true; value: MyPasantia[] } | { ok: false; error: unknown }> {
  const ids = await findMyParticipantIds(supabase, email);
  if (ids.ok === false) return ids;
  if (ids.value.length === 0) return { ok: true, value: [] };

  const [people, tracking, documents] = await Promise.all([
    supabase
      .from('pasantias_intake_participants')
      .select('id, roster_id, first_names, last_names, created_at')
      .in('id', ids.value)
      .order('created_at', { ascending: true }),
    supabase.from('pasantias_panel_logistics').select(LOGISTICS_COLUMNS).in('participant_id', ids.value),
    supabase
      .from('pasantias_panel_documents')
      .select('id, participant_id, kind, file_name, created_at')
      .in('participant_id', ids.value)
      .in('kind', TRAVELLER_DOCUMENT_KINDS as string[])
      .is('removed_at', null)
      .order('created_at', { ascending: false }),
  ]);
  const failed = [people, tracking, documents].find((answer) => answer.error);
  if (failed) return { ok: false, error: failed.error };
  const personRows = (people.data ?? []) as unknown as Row[];
  if (personRows.length === 0) return { ok: true, value: [] };

  const rosterIds = Array.from(new Set(personRows.map((row) => str(row.roster_id))));
  const [rosters, details] = await Promise.all([
    supabase
      .from('pasantias_intake_rosters')
      .select('id, program, school_name')
      .in('id', rosterIds)
      .eq('cohort', INTAKE_COHORT),
    supabase.from('pasantias_panel_roster_details').select('roster_id, letter_lodging_line').in('roster_id', rosterIds),
  ]);
  if (rosters.error) return { ok: false, error: rosters.error };
  if (details.error) return { ok: false, error: details.error };
  const rosterRows = (rosters.data ?? []) as unknown as Row[];
  const detailRows = (details.data ?? []) as unknown as Row[];
  const trackingRows = (tracking.data ?? []) as unknown as Row[];
  const documentRows = (documents.data ?? []) as unknown as Row[];

  const value: MyPasantia[] = [];
  for (const person of personRows) {
    const id = str(person.id);
    const roster = rosterRows.find((row) => str(row.id) === str(person.roster_id));
    if (!roster) continue; // not this cohort
    const program = str(roster.program);
    if (!isProgramId(program)) continue;
    const logistics = toLogistics(trackingRows.find((row) => str(row.participant_id) === id));
    const detail = detailRows.find((row) => str(row.roster_id) === str(roster.id));
    value.push({
      participantId: id,
      fullName: `${str(person.first_names)} ${str(person.last_names)}`.trim(),
      schoolName: str(roster.school_name),
      programName: programById(program).name,
      programDates: letterDateRange(program),
      flightStatus: logistics.flightStatus,
      flightStatusLabel: FLIGHT_LABELS[logistics.flightStatus],
      lodgingStatus: logistics.lodgingStatus,
      lodgingStatusLabel: LODGING_LABELS[logistics.lodgingStatus],
      lodgingLine: typeof detail?.letter_lodging_line === 'string' ? detail.letter_lodging_line : null,
      sclDepartureDate: logistics.sclDepartureDate,
      bcnArrivalDate: logistics.bcnArrivalDate,
      bcnDepartureDate: logistics.bcnDepartureDate,
      sclArrivalDate: logistics.sclArrivalDate,
      documents: documentRows
        .filter((row) => str(row.participant_id) === id)
        .map((row) => ({
          id: str(row.id),
          kind: str(row.kind) as DocumentKind,
          fileName: str(row.file_name),
          createdAt: str(row.created_at),
        })),
    });
  }
  return { ok: true, value };
}
