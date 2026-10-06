/**
 * SM-H8: meeting date/time between `<input type="datetime-local">` and the
 * `community_meetings.meeting_date` timestamptz column.
 *
 * The input works in the person's local wall time with no zone ("2026-10-02T16:00").
 * The form used to send that string as-is, so PostgREST stored it as 16:00 UTC,
 * and reloaded it with `toISOString().slice(0, 16)` (UTC again). Cards format
 * in the browser zone, so in Chile a 16:00 meeting showed as 13:00 (12:00 in
 * winter). These two helpers convert through the browser zone both ways.
 */

const LOCAL_VALUE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** Stored timestamp → value for a datetime-local input, in the browser zone. */
export function toDatetimeLocalValue(stored: string | null | undefined): string {
  if (!stored) return '';
  const date = new Date(stored);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * datetime-local value (browser-zone wall time) → UTC ISO string for the DB.
 * Returns null for anything that is not a complete, real local date-time.
 *
 * A wall time that does not exist (the hour skipped when clocks go forward) is
 * resolved by the JavaScript engine, which moves it forward by the gap; an
 * ambiguous wall time (the repeated hour when clocks go back) resolves to the
 * earlier instant. Both are documented by the tests.
 */
export function datetimeLocalToIso(value: string | null | undefined): string | null {
  const match = LOCAL_VALUE.exec(value ?? '');
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  if (mo < 1 || mo > 12 || h > 23 || mi > 59) return null;
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (Number.isNaN(date.getTime()) || date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return null;
  }
  return date.toISOString();
}

/**
 * SM-H9: commitment/task due dates are calendar days (`date` column,
 * "2026-10-16"). `new Date("2026-10-16")` reads that as midnight UTC, which in
 * Chile is still the evening of the 15th — the details showed the day before
 * and the "days left" count was off by one. A date-only value is read as that
 * day in the local zone; anything else (a full timestamp) is parsed as before.
 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDueDate(value: string): Date {
  const match = DATE_ONLY.exec(value);
  if (!match) return new Date(value);
  const [, y, m, d] = match.map(Number);
  return new Date(y, m - 1, d);
}

/** "16-10-2026" (es-CL) for the calendar day stored, whatever the zone. */
export function formatDueDate(value: string): string {
  return parseDueDate(value).toLocaleDateString('es-CL');
}

/** Whole calendar days from today to the due day (0 = today, -1 = yesterday). */
export function daysUntilDueDate(value: string, now: Date = new Date()): number {
  const due = parseDueDate(value);
  const dueDay = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((dueDay - today) / 86_400_000);
}
