/**
 * The usual spellings of one RUT, for finding a client however its STORED
 * value is written (F21b, GES-3.11 send-back 2): the formatted one
 * («76.123.456-0», utils/rutValidation.ts formatRut), without dots
 * («76123456-0») and bare («761234560»); when the check letter is a K, each
 * with «K» and with «k». Every lookup of a client by RUT asks for all of them
 * at once (`.in('rut', rutSpellings(rut))`); no stored row is rewritten.
 * Returns [] when there is no RUT to look for.
 */
import { formatRut } from '@/utils/rutValidation';

export function rutSpellings(rut: string): string[] {
  const cleaned = (rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleaned.length < 2) return [];
  const spellingsOf = (value: string) => {
    const formatted = formatRut(value);
    return [formatted, formatted.replace(/\./g, ''), formatted.replace(/[.-]/g, '')];
  };
  const upper = spellingsOf(cleaned);
  if (!cleaned.endsWith('K')) return upper;
  return [...upper, ...upper.map((s) => s.slice(0, -1) + 'k')];
}
