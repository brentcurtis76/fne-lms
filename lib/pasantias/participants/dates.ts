/**
 * Arrival and departure options for the participant intake (FIRST §6).
 *
 * The ONE place these option sets live. The database stores plain `date`
 * values with only a structural "departure after arrival" CHECK (FIRST-B3), so
 * if FNE settles different offsets this is a constant change plus test
 * updates, never a migration. Both the coordinator form and the API import it.
 *
 * Every computation is per program (FIRST-B5): INSPIRA ends on 2027-01-28 and
 * Mirada Profunda on 2027-01-29, so departures computed from the cohort span
 * would be wrong for INSPIRA. Dates are calendar dates, never instants:
 * `Date.UTC` in, UTC getters out, ISO strings on the wire and `formatDayLong`
 * for labels, so Santiago and Kiritimati render the same day.
 */
import { programById, type ProgramId } from '../cohort-public';
import { formatDayLong } from '../pdf/format';

/** Counted from the program's own start date. */
export const ARRIVAL_OFFSETS_DAYS = [-1, -7] as const;
/** Counted from the program's own end date. */
export const DEPARTURE_OFFSETS_DAYS = [1, 7, 14] as const;

export interface DateOption {
  /** ISO `YYYY-MM-DD`. */
  value: string;
  /** es-CL, e.g. `domingo 17 de enero de 2027 · un día antes del inicio`. */
  label: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Calendar arithmetic on an ISO date, immune to the runtime's time zone. */
export function addCalendarDays(iso: string, days: number): string {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error('addCalendarDays: expected YYYY-MM-DD');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** `domingo 17 de enero de 2027` — `formatDayLong` plus the year. */
export function formatIntakeDate(iso: string): string {
  return `${formatDayLong(iso)} de ${iso.slice(0, 4)}`;
}

function arrivalExplanation(offset: number): string {
  if (offset === -1) return 'un día antes del inicio';
  if (offset === -7) return 'una semana antes del inicio';
  return `${Math.abs(offset)} días antes del inicio`;
}

function departureExplanation(offset: number): string {
  if (offset === 1) return 'el día después del cierre';
  if (offset === 7) return 'una semana después del cierre';
  if (offset === 14) return 'dos semanas después del cierre';
  return `${offset} días después del cierre`;
}

export function arrivalOptions(programId: ProgramId): DateOption[] {
  const { startDate } = programById(programId);
  return ARRIVAL_OFFSETS_DAYS.map((offset) => {
    const value = addCalendarDays(startDate, offset);
    return { value, label: `${formatIntakeDate(value)} · ${arrivalExplanation(offset)}` };
  });
}

export function departureOptions(programId: ProgramId): DateOption[] {
  const { endDate } = programById(programId);
  return DEPARTURE_OFFSETS_DAYS.map((offset) => {
    const value = addCalendarDays(endDate, offset);
    return { value, label: `${formatIntakeDate(value)} · ${departureExplanation(offset)}` };
  });
}

/** `lunes 18 de enero al jueves 28 de enero de 2027`, from the program's own dates. */
export function programDateRangeLabel(programId: ProgramId): string {
  const { startDate, endDate } = programById(programId);
  return `${formatDayLong(startDate)} al ${formatIntakeDate(endDate)}`;
}

/** Label for a stored date: the option label when it is one, else the plain date. */
export function storedDateLabel(
  programId: ProgramId,
  kind: 'arrival' | 'departure',
  iso: string | null
): string {
  if (!iso) return 'Sin indicar';
  const options = kind === 'arrival' ? arrivalOptions(programId) : departureOptions(programId);
  const option = options.find((candidate) => candidate.value === iso);
  if (option) return option.label;
  return ISO_DATE.test(iso) ? formatIntakeDate(iso) : iso;
}
