/**
 * Browser-side helpers of the Pasantías panel: filtering, the CSV rows and the
 * request body of a tracking save. Pure — unit tested without a DOM.
 */
import { displayRut } from '../participants/rut';
import {
  DIETARY_LABELS,
  FOCUS_LABELS,
  FUNDING_LABELS,
  type IntakeParticipant,
} from '../participants/types';
import {
  FLIGHT_LABELS,
  LODGING_LABELS,
  type FlightStatus,
  type LodgingStatus,
  type Logistics,
  type PanelRoster,
  type PanelRow,
} from './types';

export const PANEL_API = '/api/admin/pasantias-panel';

export type PaymentFilter = '' | 'deposit_pending' | 'balance_pending' | 'all_received';

export interface PanelFilters {
  search: string;
  /** A roster id, or '' for every school. */
  rosterId: string;
  /** A program id, or ''. */
  program: string;
  flight: '' | FlightStatus;
  lodging: '' | LodgingStatus;
  payment: PaymentFilter;
}

export const EMPTY_FILTERS: PanelFilters = {
  search: '',
  rosterId: '',
  program: '',
  flight: '',
  lodging: '',
  payment: '',
};

export function filtersActive(filters: PanelFilters): boolean {
  return Object.values(filters).some((value) => value !== '');
}

/** Lower-case, accents removed — "Pérez" is found by "perez". */
export function fold(value: string): string {
  const decomposed = typeof value.normalize === 'function' ? value.normalize('NFD') : value;
  return decomposed.replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Name, RUT (with or without dots), passport and email are searched; every word must match. */
export function matchesSearch(row: PanelRow, search: string): boolean {
  const words = fold(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const p = row.participant;
  const haystack = fold(
    [
      p.firstNames,
      p.lastNames,
      p.rut,
      p.rut.replace('-', ''),
      displayRut(p.rut),
      p.passportNumber ?? '',
      p.email ?? '',
    ].join(' ')
  );
  return words.every((word) => haystack.includes(word) || haystack.includes(word.replace(/\./g, '')));
}

export function filterRows(
  rows: readonly PanelRow[],
  rosters: readonly PanelRoster[],
  filters: PanelFilters
): PanelRow[] {
  const programByRoster = new Map(rosters.map((roster) => [roster.id, roster.program as string]));
  return rows.filter((row) => {
    const l = row.logistics;
    if (filters.rosterId && row.rosterId !== filters.rosterId) return false;
    if (filters.program && programByRoster.get(row.rosterId) !== filters.program) return false;
    if (filters.flight && l.flightStatus !== filters.flight) return false;
    if (filters.lodging && l.lodgingStatus !== filters.lodging) return false;
    if (filters.payment === 'deposit_pending' && l.depositReceived) return false;
    if (filters.payment === 'balance_pending' && l.balanceReceived) return false;
    if (filters.payment === 'all_received' && !(l.depositReceived && l.balanceReceived)) return false;
    return matchesSearch(row, filters.search);
  });
}

/** `2027-01-17` → `17-01-2027`; null → `—`. */
export function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : iso;
}

export function dietaryText(participant: Pick<IntakeParticipant, 'dietaryRestrictions' | 'dietaryOther'>): string {
  if (participant.dietaryRestrictions.length === 0) return 'Sin indicar';
  return participant.dietaryRestrictions
    .map((code) => (code === 'otra' && participant.dietaryOther ? `Otra: ${participant.dietaryOther}` : DIETARY_LABELS[code]))
    .join(' · ');
}

/** The full-replace body of a tracking save: the stored values with one change applied. */
export function logisticsBody(current: Logistics, change: Partial<Logistics> = {}): Record<string, unknown> {
  const next = { ...current, ...change };
  return {
    flightStatus: next.flightStatus,
    lodgingStatus: next.lodgingStatus,
    depositReceived: next.depositReceived,
    balanceReceived: next.balanceReceived,
    salutation: next.salutation,
    notes: next.notes,
    sclDepartureDate: next.sclDepartureDate,
    bcnArrivalDate: next.bcnArrivalDate,
    bcnDepartureDate: next.bcnDepartureDate,
    sclArrivalDate: next.sclArrivalDate,
    expectedVersion: current.version,
  };
}

/** Header names contain no dot: `ReportExporter` reads a dotted header as a nested path. */
export const PANEL_CSV_HEADERS = [
  'Colegio',
  'Programa',
  'Nombres',
  'Apellidos',
  'RUT',
  'Pasaporte',
  'Correo',
  'Cuenta en GENERA',
  'Llegada',
  'Regreso',
  'Salida de SCL',
  'Llegada a BCN',
  'Salida de BCN',
  'Llegada a SCL',
  'Foco',
  'Alimentación',
  'Pasajes a cargo de',
  'Estadía a cargo de',
  'Pasaje',
  'Alojamiento',
  'Abono 50%',
  'Saldo 50%',
  'Documentos',
  'Carta de invitación',
  'Carta enviada',
  'Notas',
] as const;

export function panelCsvRows(
  rows: readonly PanelRow[],
  rosters: readonly PanelRoster[]
): Record<(typeof PANEL_CSV_HEADERS)[number], string>[] {
  const byId = new Map(rosters.map((roster) => [roster.id, roster]));
  return rows.map((row) => {
    const roster = byId.get(row.rosterId);
    const p = row.participant;
    const l = row.logistics;
    return {
      Colegio: roster?.schoolName ?? '',
      Programa: roster?.programName ?? '',
      Nombres: p.firstNames,
      Apellidos: p.lastNames,
      RUT: displayRut(p.rut),
      Pasaporte: p.passportNumber ?? '',
      Correo: p.email ?? '',
      'Cuenta en GENERA': row.hasAccount ? 'Sí' : 'No',
      Llegada: p.arrivalDate ? shortDate(p.arrivalDate) : '',
      Regreso: p.departureDate ? shortDate(p.departureDate) : '',
      'Salida de SCL': l.sclDepartureDate ? shortDate(l.sclDepartureDate) : '',
      'Llegada a BCN': l.bcnArrivalDate ? shortDate(l.bcnArrivalDate) : '',
      'Salida de BCN': l.bcnDepartureDate ? shortDate(l.bcnDepartureDate) : '',
      'Llegada a SCL': l.sclArrivalDate ? shortDate(l.sclArrivalDate) : '',
      Foco: p.focus ? FOCUS_LABELS[p.focus] : '',
      Alimentación: p.dietaryRestrictions.length > 0 ? dietaryText(p) : '',
      'Pasajes a cargo de': roster?.schoolFunding ? FUNDING_LABELS[roster.schoolFunding.flightsFunding] : '',
      'Estadía a cargo de': roster?.schoolFunding ? FUNDING_LABELS[roster.schoolFunding.lodgingFunding] : '',
      Pasaje: FLIGHT_LABELS[l.flightStatus],
      Alojamiento: LODGING_LABELS[l.lodgingStatus],
      'Abono 50%': l.depositReceived ? 'Recibido' : 'Pendiente',
      'Saldo 50%': l.balanceReceived ? 'Recibido' : 'Pendiente',
      Documentos: String(row.documentCount),
      'Carta de invitación': row.hasLetter ? 'Generada' : 'No',
      'Carta enviada': l.letterSentAt ? shortDate(l.letterSentAt) : 'No',
      Notas: l.notes ?? '',
    };
  });
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function errorText(status: number, body: Record<string, unknown>, fallback: string): string {
  if (status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  if (status === 403) return typeof body.error === 'string' ? body.error : 'No tienes permiso para esta acción.';
  return typeof body.error === 'string' ? body.error : fallback;
}

/** Today's date in Chile, `YYYY-MM-DD` — the day the letter schedule is read against. */
export function todayInChile(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
