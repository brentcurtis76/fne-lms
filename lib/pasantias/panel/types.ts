/**
 * PASANTÍAS PANEL — shared vocabulary for FNE's logistics panel over the
 * January 2027 participant intake.
 *
 * Browser-safe: no Node built-ins, no Supabase. The value sets mirror the
 * CHECKs of `supabase/migrations/20261109210000_pasantias_logistics_panel.sql`
 * exactly; a unit test reads the migration and compares.
 */
import type { ProgramId } from '../cohort-public';
import type {
  AdminIntakeParticipant,
  RosterStatus,
  SchoolFunding,
} from '../participants/types';

export const FLIGHT_STATUSES = ['pending', 'purchased', 'paid'] as const;
export type FlightStatus = (typeof FLIGHT_STATUSES)[number];
export const FLIGHT_LABELS: Record<FlightStatus, string> = {
  pending: 'Pendiente',
  purchased: 'Comprado',
  paid: 'Pagado',
};

export const LODGING_STATUSES = ['pending', 'reserved', 'paid'] as const;
export type LodgingStatus = (typeof LODGING_STATUSES)[number];
export const LODGING_LABELS: Record<LodgingStatus, string> = {
  pending: 'Pendiente',
  reserved: 'Reservado',
  paid: 'Pagado',
};

export const SALUTATIONS = ['estimado', 'estimada'] as const;
export type Salutation = (typeof SALUTATIONS)[number];
export const SALUTATION_LABELS: Record<Salutation, string> = {
  estimado: 'Estimado',
  estimada: 'Estimada',
};

export const NOTES_MAX = 2000;
export const LETTER_LINE_MAX = 300;
export const DESCRIPTION_MAX = 200;
export const BULK_MAX = 200;

/** What an admin may upload by hand. `invitation_letter` is only ever generated. */
export const UPLOAD_KINDS = ['ticket', 'other'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];
export const DOCUMENT_KINDS = ['ticket', 'invitation_letter', 'other'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  ticket: 'Pasaje aéreo',
  invitation_letter: 'Carta de invitación',
  other: 'Otro',
};

/**
 * What an admin may upload: 4 MB. The hosting platform refuses a request body
 * over 4.5 MB before this code runs, so a higher limit here would only turn a
 * clear message into an opaque platform error.
 */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
/** The ceiling the table CHECK and the bucket enforce for any stored file. */
export const STORED_FILE_MAX_BYTES = 10 * 1024 * 1024;
/** MIME type → the extension the stored object gets (the path CHECK pins these four). */
export const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
export const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';

/** The two images the invitation letter prints; kept in the private bucket, never in the repo. */
export const LETTER_ASSET_KINDS = ['logo', 'signature'] as const;
export type LetterAssetKind = (typeof LETTER_ASSET_KINDS)[number];
export const LETTER_ASSET_LABELS: Record<LetterAssetKind, string> = {
  logo: 'Logo del Instituto Relacional',
  signature: 'Firma',
};
export const LETTER_ASSET_MAX_BYTES = 2 * 1024 * 1024;

/** The traveller's four real flight dates, entered by FNE (ISO `YYYY-MM-DD` or null). */
export const FLIGHT_DATE_FIELDS = ['sclDepartureDate', 'bcnArrivalDate', 'bcnDepartureDate', 'sclArrivalDate'] as const;
export type FlightDateField = (typeof FLIGHT_DATE_FIELDS)[number];
export const FLIGHT_DATE_LABELS: Record<FlightDateField, string> = {
  sclDepartureDate: 'Salida de SCL',
  bcnArrivalDate: 'Llegada a BCN',
  bcnDepartureDate: 'Salida de BCN',
  sclArrivalDate: 'Llegada a SCL',
};
/** Any flight date outside this window is a typing mistake for the January 2027 cohort. */
export const FLIGHT_DATE_MIN = '2026-12-01';
export const FLIGHT_DATE_MAX = '2027-03-31';

/** The letter is emailed this many days before the traveller leaves Santiago. */
export const LETTER_SEND_DAYS_BEFORE = 7;

/** The tracking values of one traveller. `version: null` = nothing saved yet (all pending). */
export interface Logistics {
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
  /** When the invitation letter was last emailed, and where to. Read-only in the panel. */
  letterSentAt: string | null;
  letterSentTo: string | null;
  /** Why the last attempt sent nothing (a code of `LETTER_SEND_ERRORS`), or null. */
  letterSendError: string | null;
  version: number | null;
  updatedAt: string | null;
}

export const EMPTY_LOGISTICS: Logistics = {
  flightStatus: 'pending',
  lodgingStatus: 'pending',
  depositReceived: false,
  balanceReceived: false,
  salutation: null,
  notes: null,
  sclDepartureDate: null,
  bcnArrivalDate: null,
  bcnDepartureDate: null,
  sclArrivalDate: null,
  letterSentAt: null,
  letterSentTo: null,
  letterSendError: null,
  version: null,
  updatedAt: null,
};

/** Why an attempt to email the letter sent nothing. Stored as the code. */
export const LETTER_SEND_ERRORS = {
  missing_data: 'faltan datos para generar la carta',
  missing_email: 'falta el correo de la persona',
  render_failed: 'no se pudo generar la carta',
  storage_failed: 'no se pudo guardar la carta',
  email_not_configured: 'el envío de correos no está configurado',
  email_suppressed: 'el envío de correos está desactivado para esta cuenta de prueba',
  email_rejected: 'el servicio de correo rechazó el mensaje',
  email_failed: 'el servicio de correo no respondió',
} as const;
export type LetterSendError = keyof typeof LETTER_SEND_ERRORS;

export function letterSendErrorText(code: string | null): string | null {
  if (!code) return null;
  return (LETTER_SEND_ERRORS as Record<string, string>)[code] ?? 'el envío falló';
}

/** Per-roster wording for the invitation letter. `version: null` = nothing saved yet. */
export interface RosterDetails {
  letterSchoolLine: string | null;
  letterLodgingLine: string | null;
  version: number | null;
}

export interface PanelRoster {
  id: string;
  schoolName: string;
  program: ProgramId;
  programName: string;
  status: RosterStatus;
  lastSubmittedAt: string | null;
  schoolFunding: SchoolFunding | null;
  details: RosterDetails;
}

/** One line of the panel: a traveller, their roster and FNE's tracking. */
export interface PanelRow {
  rosterId: string;
  participant: AdminIntakeParticipant;
  logistics: Logistics;
  documentCount: number;
  hasLetter: boolean;
  /** The traveller's email belongs to a GENERA account: they can see "Mi pasantía". */
  hasAccount: boolean;
}

export interface PanelDocument {
  id: string;
  kind: DocumentKind;
  description: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export const ACTIVITY_ACTIONS = [
  'logistics_updated',
  'participant_corrected',
  'document_uploaded',
  'document_removed',
  'letter_generated',
  'letter_sent',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export interface PanelActivity {
  id: string;
  action: ActivityAction;
  actorName: string;
  createdAt: string;
  /** Plain es-CL sentences, built on the server from the stored details. */
  lines: string[];
}

export interface PanelDetail {
  row: PanelRow;
  roster: PanelRoster;
  documents: PanelDocument[];
  activity: PanelActivity[];
}

export const BULK_FIELDS = ['flightStatus', 'lodgingStatus', 'depositReceived', 'balanceReceived'] as const;
export type BulkField = (typeof BULK_FIELDS)[number];

export interface LetterAssetsState {
  logo: boolean;
  signature: boolean;
}

/** What the letter still lacks for one traveller, as short es-CL phrases; empty = ready. */
export function letterMissing(
  logistics: Pick<Logistics, 'salutation'>,
  details: Pick<RosterDetails, 'letterSchoolLine' | 'letterLodgingLine'>,
  assets: LetterAssetsState
): string[] {
  const missing: string[] = [];
  if (!logistics.salutation) missing.push('el tratamiento (Estimado/Estimada)');
  if (!details.letterSchoolLine) missing.push('el colegio como aparece en la carta');
  if (!details.letterLodgingLine) missing.push('el alojamiento como aparece en la carta');
  if (!assets.logo) missing.push('el logo de la carta');
  if (!assets.signature) missing.push('la firma de la carta');
  return missing;
}

/** `2027-01-10` minus 7 days → `2027-01-03`. Pure calendar arithmetic, no time zone. */
export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export type LetterSendState =
  | { kind: 'sent'; at: string; to: string }
  /** Nothing can be sent yet; `missing` says what an admin must complete. */
  | { kind: 'blocked'; missing: string[] }
  /** Everything is ready; the letter goes out on `on` (or today when that day has come). */
  | { kind: 'scheduled'; on: string }
  /** The traveller already left Santiago and no letter was sent. */
  | { kind: 'late' };

/**
 * Where the automatic email of one traveller's letter stands. `today` is the
 * date in Chile (`YYYY-MM-DD`).
 */
export function letterSendState(
  email: string | null,
  logistics: Pick<Logistics, 'salutation' | 'sclDepartureDate' | 'letterSentAt' | 'letterSentTo'>,
  details: Pick<RosterDetails, 'letterSchoolLine' | 'letterLodgingLine'>,
  assets: LetterAssetsState,
  today: string
): LetterSendState {
  if (logistics.letterSentAt && logistics.letterSentTo) {
    return { kind: 'sent', at: logistics.letterSentAt, to: logistics.letterSentTo };
  }
  const missing = letterMissing(logistics, details, assets);
  if (!email) missing.unshift('el correo de la persona');
  if (!logistics.sclDepartureDate) missing.unshift('la fecha de salida de SCL');
  if (missing.length > 0) return { kind: 'blocked', missing };
  const departure = logistics.sclDepartureDate as string;
  if (today > departure) return { kind: 'late' };
  return { kind: 'scheduled', on: addDays(departure, -LETTER_SEND_DAYS_BEFORE) };
}

export interface PanelSummary {
  travellers: number;
  schools: number;
  flightPurchased: number;
  flightPaid: number;
  lodgingReserved: number;
  lodgingPaid: number;
  depositReceived: number;
  balanceReceived: number;
}

/** Counts for the summary tiles. "Comprado" and "Reservado" include the paid ones. */
export function summarize(rows: readonly PanelRow[], rosters: readonly PanelRoster[]): PanelSummary {
  const schoolKeys = new Set<string>();
  const byId = new Map(rosters.map((roster) => [roster.id, roster]));
  const summary: PanelSummary = {
    travellers: rows.length,
    schools: 0,
    flightPurchased: 0,
    flightPaid: 0,
    lodgingReserved: 0,
    lodgingPaid: 0,
    depositReceived: 0,
    balanceReceived: 0,
  };
  for (const row of rows) {
    const roster = byId.get(row.rosterId);
    if (roster) schoolKeys.add(roster.schoolName.replace(/\s+/g, ' ').toLowerCase());
    const l = row.logistics;
    if (l.flightStatus !== 'pending') summary.flightPurchased += 1;
    if (l.flightStatus === 'paid') summary.flightPaid += 1;
    if (l.lodgingStatus !== 'pending') summary.lodgingReserved += 1;
    if (l.lodgingStatus === 'paid') summary.lodgingPaid += 1;
    if (l.depositReceived) summary.depositReceived += 1;
    if (l.balanceReceived) summary.balanceReceived += 1;
  }
  summary.schools = schoolKeys.size;
  return summary;
}
