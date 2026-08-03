/**
 * es-CL formatting helpers for the Pasantías PDFs.
 *
 * Deliberately free of cohort data: this module holds no facts, only the
 * rendering of facts the cohort modules own. That keeps it importable from the
 * ficha generator (which may never see a price) and from the brochure generator
 * (which may) without either dragging the other's data along.
 *
 * Dates are calendar dates, never instants — every value is parsed to UTC
 * midnight and read back with UTC getters, so a machine in America/Santiago and
 * one in Europe/Madrid render the same weekday.
 */

const WEEKDAY_NAMES_ES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

const MONTH_NAMES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Parse an ISO `YYYY-MM-DD` calendar date into UTC midnight. */
function toUtcDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** e.g. `lunes 5` — the compact form used inside a week's day list. */
export function formatDayShort(isoDate: string): string {
  const date = toUtcDate(isoDate);
  return `${WEEKDAY_NAMES_ES[date.getUTCDay()]} ${date.getUTCDate()}`;
}

/** e.g. `lunes 5 de octubre` — the form used when the day stands alone. */
export function formatDayLong(isoDate: string): string {
  const date = toUtcDate(isoDate);
  return `${formatDayShort(isoDate)} de ${MONTH_NAMES_ES[date.getUTCMonth()]}`;
}

/**
 * es-CL currency rendering: the thousands separator is a period, so €1.000 is
 * one thousand euros. Written by hand rather than through `Intl` because a
 * runtime built without full ICU silently falls back to `1,000`, which reads as
 * "one point zero" to a Chilean audience.
 */
export function formatEuro(amount: number): string {
  const whole = Math.trunc(Math.abs(amount)).toString();
  let grouped = '';
  for (let i = 0; i < whole.length; i += 1) {
    if (i > 0 && (whole.length - i) % 3 === 0) grouped += '.';
    grouped += whole[i];
  }
  return `${amount < 0 ? '-' : ''}€${grouped}`;
}

/** e.g. `€70 – €120`. */
export function formatEuroRange(min: number, max: number): string {
  return `${formatEuro(min)} – ${formatEuro(max)}`;
}
