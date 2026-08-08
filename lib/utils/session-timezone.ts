import { TZDate } from '@date-fns/tz';

/**
 * All consultor sessions happen in Chile. Times in the DB are Chile local times.
 */
export const SESSION_TIMEZONE = 'America/Santiago';

/**
 * Consultant timezone (Barcelona) — used for optional local time display.
 */
export const CONSULTANT_TIMEZONE = 'Europe/Madrid';

/**
 * Build a timezone-aware Date from session_date + time string.
 * The returned TZDate is pinned to America/Santiago.
 *
 * @param sessionDate - DATE string "YYYY-MM-DD"
 * @param timeString - TIME string "HH:MM" or "HH:MM:SS"
 * @returns TZDate in Chile timezone
 */
export function getSessionDateTime(sessionDate: string, timeString: string): TZDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    throw new Error(`Invalid session date format: ${sessionDate}`);
  }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(timeString)) {
    throw new Error(`Invalid time format: ${timeString}`);
  }
  // Ensure time has seconds
  const time = timeString.length === 5 ? `${timeString}:00` : timeString;
  // TZDate constructor: new TZDate(year, month, day, hours, minutes, seconds, tz)
  const [year, month, day] = sessionDate.split('-').map(Number);
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return new TZDate(year, month - 1, day, hours, minutes, seconds, SESSION_TIMEZONE);
}

/**
 * Get hours until a session starts, calculated correctly in Chile timezone.
 * Compares against the current real time (UTC-based).
 */
export function getHoursUntilSession(sessionDate: string, startTime: string): number {
  const sessionDT = getSessionDateTime(sessionDate, startTime);
  const now = new Date(); // always UTC-based internally
  return (sessionDT.getTime() - now.getTime()) / (1000 * 60 * 60);
}

/**
 * Format the session time for display with timezone label.
 * Returns: "09:00 (hora Chile)" or just "09:00" if compact mode.
 */
export function formatSessionTimeWithTZ(
  timeString: string,
  options?: { compact?: boolean }
): string {
  const time = timeString.substring(0, 5);
  if (options?.compact) return time;
  return `${time} (hora Chile)`;
}

/**
 * Convert a Chile session time to the consultant's local time (Barcelona).
 * Returns formatted string like "14:00 (hora España)".
 */
export function formatSessionTimeForConsultant(
  sessionDate: string,
  timeString: string
): string {
  const chileDT = getSessionDateTime(sessionDate, timeString);
  // Get the equivalent time in Barcelona
  const barcelonaDT = new TZDate(chileDT.getTime(), CONSULTANT_TIMEZONE);
  const hours = String(barcelonaDT.getHours()).padStart(2, '0');
  const minutes = String(barcelonaDT.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes} (hora España)`;
}

/**
 * Format a Chile session time range as the consultant's local time (Barcelona).
 * Returns "13:00 a 14:00 (hora España)".
 *
 * Derived entirely from {@link formatSessionTimeForConsultant} — this module is
 * the only place the Chile→Spain conversion lives, so scheduling forms that want
 * a live preview call this instead of computing an offset of their own.
 *
 * Returns `null` — never a guess — when the inputs are not yet a real moment:
 * the offset is not constant (Chile and Spain observe DST in opposite
 * hemispheres, so the same 09:00 is 13:00 in January and 15:00 in July), so
 * without a date there is nothing truthful to show. A half-filled scheduling
 * form is the normal case, not an error, hence `null` rather than a throw.
 */
export function formatSessionRangeForConsultant(
  sessionDate: string,
  startTime: string,
  endTime: string
): string | null {
  if (!sessionDate || !startTime || !endTime) return null;
  try {
    // "13:00 (hora España)" → "13:00"; the label is carried once, on the end.
    const start = formatSessionTimeForConsultant(sessionDate, startTime).substring(0, 5);
    const end = formatSessionTimeForConsultant(sessionDate, endTime);
    return `${start} a ${end}`;
  } catch {
    // getSessionDateTime throws on a malformed date or time — a partially typed
    // input, not a bug worth taking the form down for.
    return null;
  }
}
