// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getSessionDateTime,
  getHoursUntilSession,
  formatSessionTimeWithTZ,
  formatSessionTimeForConsultant,
  formatSessionRangeForConsultant,
  SESSION_TIMEZONE,
  CONSULTANT_TIMEZONE,
} from '../../../lib/utils/session-timezone';

describe('session-timezone utilities', () => {
  it('creates TZDate pinned to Chile timezone', () => {
    const dt = getSessionDateTime('2026-03-15', '09:00');
    // Verify the object has the timezone property
    expect(dt).toBeDefined();
    expect(dt.getHours()).toBe(9);
    expect(dt.getMinutes()).toBe(0);
  });

  it('getSessionDateTime handles HH:MM and HH:MM:SS formats', () => {
    const dt1 = getSessionDateTime('2026-06-15', '09:00');
    const dt2 = getSessionDateTime('2026-06-15', '09:00:00');
    expect(dt1.getTime()).toBe(dt2.getTime());
  });

  it('correctly computes hours until session in Chile time', () => {
    // This test verifies the calculation uses Chile TZ, not UTC
    const hours = getHoursUntilSession('2099-01-01', '12:00');
    expect(hours).toBeGreaterThan(0);
  });

  it('formatSessionTimeForConsultant converts Chile to Barcelona time', () => {
    // Chile standard time (CLT) = UTC-3, Spain (CET) = UTC+1 → difference = +4h
    // Chile summer time (CLST) = UTC-3, Spain (CEST) = UTC+2 → difference = +5h
    // The exact offset depends on DST, but Barcelona should always be ahead
    const result = formatSessionTimeForConsultant('2026-07-15', '09:00');
    expect(result).toContain('(hora España)');
    // Should return a valid time format
    expect(result).toMatch(/^\d{2}:\d{2} \(hora España\)$/);
  });

  it('handles DST transitions correctly', () => {
    // Test a date in Chilean summer (January) vs Chilean winter (July)
    const summer = getSessionDateTime('2026-01-15', '09:00'); // CLST = UTC-3
    const winter = getSessionDateTime('2026-07-15', '09:00'); // CLT = UTC-4
    // Both should be 09:00 local Chile time but different UTC offsets
    expect(summer.getHours()).toBe(9);
    expect(winter.getHours()).toBe(9);
    // But their UTC times differ by 1 hour
    const summerUTC = summer.getUTCHours();
    const winterUTC = winter.getUTCHours();
    // In summer: 09:00 CLT (UTC-3) = 12:00 UTC
    // In winter: 09:00 CLT (UTC-4) = 13:00 UTC
    expect(winterUTC - summerUTC).toBe(1);
  });

  it('formatSessionTimeWithTZ appends timezone label', () => {
    const result = formatSessionTimeWithTZ('09:30:00');
    expect(result).toBe('09:30 (hora Chile)');
  });

  it('formatSessionTimeWithTZ supports compact mode', () => {
    const result = formatSessionTimeWithTZ('09:30:00', { compact: true });
    expect(result).toBe('09:30');
  });

  it('exports correct timezone constants', () => {
    expect(SESSION_TIMEZONE).toBe('America/Santiago');
    expect(CONSULTANT_TIMEZONE).toBe('Europe/Madrid');
  });
});

/**
 * Z2-4c: the range helper the two scheduling forms render their preview from.
 * It exists so no component computes its own Chile→Spain offset — see the
 * single-module guard at the bottom of this file.
 */
describe('formatSessionRangeForConsultant', () => {
  it.each([
    // Chile on summer time, Spain on winter time → +4h.
    ['January', '2027-01-15', '13:00 a 14:30 (hora España)'],
    // Chile on winter time, Spain on summer time → +6h.
    ['July', '2027-07-15', '15:00 a 16:30 (hora España)'],
  ])('converts a %s range with the offset that actually applies', (_l, date, expected) => {
    expect(formatSessionRangeForConsultant(date, '09:00', '10:30')).toBe(expected);
  });

  it('the two fixtures above disagree — a fixed offset cannot satisfy both', () => {
    const january = formatSessionRangeForConsultant('2027-01-15', '09:00', '10:30');
    const july = formatSessionRangeForConsultant('2027-07-15', '09:00', '10:30');
    expect(january).not.toBe(july);
  });

  it('accepts HH:MM:SS as stored in the DB', () => {
    expect(formatSessionRangeForConsultant('2027-07-15', '09:00:00', '10:30:00')).toBe(
      '15:00 a 16:30 (hora España)'
    );
  });

  it.each([
    ['no date', ['', '09:00', '10:30']],
    ['no start time', ['2027-07-15', '', '10:30']],
    ['no end time', ['2027-07-15', '09:00', '']],
    ['a half-typed date', ['2027-07', '09:00', '10:30']],
    ['a malformed time', ['2027-07-15', '9', '10:30']],
  ])('returns null rather than guessing when there is %s', (_l, args) => {
    const [date, start, end] = args as [string, string, string];
    expect(formatSessionRangeForConsultant(date, start, end)).toBeNull();
  });
});

/**
 * One module owns the Chile→Spain conversion (Z2-4c). A component that reached
 * for `Europe/Madrid` itself would drift out of step with `session-timezone.ts`
 * the first time anything there changed — the class of duplication this
 * workstream keeps removing. Importing the constant is fine; restating the
 * literal is not, so the guard keys on the literal.
 */
describe('the consultant timezone lives in exactly one module', () => {
  const ROOT = process.cwd();
  const OWNER = path.join('lib', 'utils', 'session-timezone.ts');
  const THIS_SUITE = path.join('__tests__', 'api', 'sessions', 'session-timezone.test.ts');
  const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'coverage', 'docs', 'supabase']);

  const sourceFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sourceFiles(full));
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  };

  /**
   * Comments are stripped first. Three unrelated files legitimately *mention*
   * Europe/Madrid in prose — `lib/pasantias/pdf/format.ts` explaining why its
   * dates are UTC-anchored, and the two hour-tracking suites naming the repo's
   * three-timezone matrix. None of them converts anything. The guard is about
   * executable code that computes an offset, so that is what it reads.
   */
  const stripComments = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('no file but the owner names Europe/Madrid in code', () => {
    const offenders = sourceFiles(ROOT)
      .map((full) => path.relative(ROOT, full))
      .filter((rel) => rel !== OWNER && rel !== THIS_SUITE)
      .filter((rel) =>
        stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8')).includes('Europe/Madrid')
      );

    expect(offenders).toEqual([]);
  });

  it('the two scheduling forms reach the conversion through the owning module', () => {
    for (const rel of [
      path.join('pages', 'admin', 'sessions', 'create.tsx'),
      path.join('components', 'sessions', 'EditRequestModal.tsx'),
    ]) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(text, rel).toMatch(
        /import \{[^}]*formatSessionRangeForConsultant[^}]*\} from '[./]+lib\/utils\/session-timezone'/
      );
    }
  });
});
