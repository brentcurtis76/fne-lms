// Dates of a Pasantías quote (`valid_until`, `early_bird_payment_date`) are
// date columns: the routes store a real calendar date or nothing.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The value when it is a real calendar date written YYYY-MM-DD, otherwise null. */
export function cleanQuoteDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return value;
}

/** The date in Chile (America/Santiago) at `now`, plus 30 days, as YYYY-MM-DD. */
export function defaultValidUntil(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const date = new Date(Date.UTC(part('year'), part('month') - 1, part('day') + 30));
  return date.toISOString().slice(0, 10);
}
