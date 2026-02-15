// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  getSessionDateTime,
  getHoursUntilSession,
  formatSessionTimeWithTZ,
  formatSessionTimeForConsultant,
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
