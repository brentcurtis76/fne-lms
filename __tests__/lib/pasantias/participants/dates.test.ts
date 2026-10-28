// @vitest-environment node
/**
 * FIRST §6 / FIRST-B5 — per-program arrival and departure options, computed
 * with UTC calendar arithmetic. The expected weekdays were derived from
 * 2027-01-01 being a Friday and are pinned here.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { COHORT_SPAN, INSPIRA_PROGRAM, MIRADA_PROFUNDA_PROGRAM } from '../../../../lib/pasantias/cohort-public';
import {
  ARRIVAL_OFFSETS_DAYS,
  DEPARTURE_OFFSETS_DAYS,
  addCalendarDays,
  arrivalOptions,
  departureOptions,
  programDateRangeLabel,
  storedDateLabel,
} from '../../../../lib/pasantias/participants/dates';

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('addCalendarDays', () => {
  it('adds and subtracts calendar days across month and year ends', () => {
    expect(addCalendarDays('2027-01-18', -1)).toBe('2027-01-17');
    expect(addCalendarDays('2027-01-18', -7)).toBe('2027-01-11');
    expect(addCalendarDays('2027-01-28', 14)).toBe('2027-02-11');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('refuses anything but YYYY-MM-DD', () => {
    expect(() => addCalendarDays('2027-1-18', 1)).toThrow();
  });
});

describe('option sets', () => {
  it('pins the offsets FIRST §6 specifies', () => {
    expect(ARRIVAL_OFFSETS_DAYS).toEqual([-1, -7]);
    expect(DEPARTURE_OFFSETS_DAYS).toEqual([1, 7, 14]);
  });

  it('reads each program’s own dates', () => {
    expect(INSPIRA_PROGRAM.startDate).toBe('2027-01-18');
    expect(INSPIRA_PROGRAM.endDate).toBe('2027-01-28');
    expect(MIRADA_PROFUNDA_PROGRAM.startDate).toBe('2027-01-18');
    expect(MIRADA_PROFUNDA_PROGRAM.endDate).toBe('2027-01-29');
  });

  it('INSPIRA: exact arrival and departure options with weekday labels', () => {
    expect(arrivalOptions('inspira')).toEqual([
      { value: '2027-01-17', label: 'domingo 17 de enero de 2027 · un día antes del inicio' },
      { value: '2027-01-11', label: 'lunes 11 de enero de 2027 · una semana antes del inicio' },
    ]);
    expect(departureOptions('inspira')).toEqual([
      { value: '2027-01-29', label: 'viernes 29 de enero de 2027 · el día después del cierre' },
      { value: '2027-02-04', label: 'jueves 4 de febrero de 2027 · una semana después del cierre' },
      { value: '2027-02-11', label: 'jueves 11 de febrero de 2027 · dos semanas después del cierre' },
    ]);
  });

  it('Mirada Profunda: exact arrival and departure options with weekday labels', () => {
    expect(arrivalOptions('mirada-profunda')).toEqual([
      { value: '2027-01-17', label: 'domingo 17 de enero de 2027 · un día antes del inicio' },
      { value: '2027-01-11', label: 'lunes 11 de enero de 2027 · una semana antes del inicio' },
    ]);
    expect(departureOptions('mirada-profunda')).toEqual([
      { value: '2027-01-30', label: 'sábado 30 de enero de 2027 · el día después del cierre' },
      { value: '2027-02-05', label: 'viernes 5 de febrero de 2027 · una semana después del cierre' },
      { value: '2027-02-12', label: 'viernes 12 de febrero de 2027 · dos semanas después del cierre' },
    ]);
  });

  it('INSPIRA departures are NOT computed from the cohort span end (FIRST-B5 trap)', () => {
    // The span ends on Mirada's last day; computing from it would offer 2027-01-30.
    expect(COHORT_SPAN.endDate).toBe('2027-01-29');
    const fromSpan = DEPARTURE_OFFSETS_DAYS.map((offset) => addCalendarDays(COHORT_SPAN.endDate, offset));
    expect(departureOptions('inspira').map((o) => o.value)).not.toEqual(fromSpan);
    expect(departureOptions('inspira')[0].value).toBe('2027-01-29');
  });

  it('labels the program range from the program’s own end date', () => {
    expect(programDateRangeLabel('inspira')).toBe('lunes 18 de enero al jueves 28 de enero de 2027');
    expect(programDateRangeLabel('mirada-profunda')).toBe('lunes 18 de enero al viernes 29 de enero de 2027');
  });

  it('produces identical values and labels in Santiago and Kiritimati', () => {
    process.env.TZ = 'America/Santiago';
    const santiago = [arrivalOptions('inspira'), departureOptions('mirada-profunda')];
    process.env.TZ = 'Pacific/Kiritimati';
    const kiritimati = [arrivalOptions('inspira'), departureOptions('mirada-profunda')];
    expect(kiritimati).toEqual(santiago);
  });
});

describe('storedDateLabel', () => {
  it('labels null as "Sin indicar", an option with its label, anything else as a plain date', () => {
    expect(storedDateLabel('inspira', 'arrival', null)).toBe('Sin indicar');
    expect(storedDateLabel('inspira', 'arrival', '2027-01-17')).toBe(
      'domingo 17 de enero de 2027 · un día antes del inicio'
    );
    expect(storedDateLabel('inspira', 'departure', '2027-01-20')).toBe('miércoles 20 de enero de 2027');
  });
});
