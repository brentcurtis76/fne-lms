/**
 * Strict Chilean RUT handling for the participant intake (FIRST-B4).
 *
 * The shared `validateRut` in `utils/rutValidation.ts` strips every character
 * that is not a digit or K, so `1x2.3a45.678-5` passes as `12345678-5`, and it
 * accepts `0-0` and one-digit bodies. It is shared with bulk import and
 * licitaciones, so it is not edited; this wrapper refuses instead of cleaning:
 *
 * - only digits, dots, hyphens, spaces and k/K may appear at all;
 * - the body is 7–8 digits with no leading zero (1.000.000 to 99.999.999);
 * - the check digit must be the modulo-11 digit `calculateVerificationDigit`
 *   computes — the database RPC verifies the same digit (db-contract §7.3).
 *
 * Stored as `12345678-5` (the table's `^[1-9][0-9]{6,7}-[0-9K]$`), displayed
 * with `formatRut` (`12.345.678-5`).
 */
import { calculateVerificationDigit, formatRut } from '../../../utils/rutValidation';

const ALLOWED_INPUT = /^[0-9.\-kK ]+$/;
const COMPACT = /^([1-9][0-9]{6,7})([0-9K])$/;

/** The stored form, or null when the input is not a valid RUT. */
export function normalizeStrictRut(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 20) return null;
  if (!ALLOWED_INPUT.test(trimmed)) return null;

  // At most one hyphen, and only directly before the check digit.
  const hyphens = trimmed.split('-').length - 1;
  if (hyphens > 1) return null;
  const compact = trimmed.replace(/[.\s-]/g, '').toUpperCase();
  if (hyphens === 1 && !/-\s*[0-9kK]$/.test(trimmed)) return null;
  // K is only ever a check digit.
  if (compact.slice(0, -1).includes('K')) return null;

  const match = COMPACT.exec(compact);
  if (!match) return null;
  const [, body, digit] = match;
  if (calculateVerificationDigit(body) !== digit) return null;
  return `${body}-${digit}`;
}

/** `12345678-5` → `12.345.678-5`; anything else is returned unchanged. */
export function displayRut(stored: string): string {
  return COMPACT.test(stored.replace('-', '')) ? formatRut(stored) : stored;
}
