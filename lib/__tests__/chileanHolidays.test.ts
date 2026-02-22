// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { getChileanHolidays } from '../chileanHolidays';

// Known Easter Sunday dates for verification (from official sources):
//   2025: April 20
//   2026: April 5
//   2027: March 28
//   2028: April 16
//
// Viernes Santo = Easter - 2 days
// Sabado Santo  = Easter - 1 day

describe('getChileanHolidays', () => {
  it('returns 16 holidays for a given year', () => {
    const holidays = getChileanHolidays(2026);
    expect(holidays).toHaveLength(16);
  });

  it('returns holidays sorted by date ascending', () => {
    const holidays = getChileanHolidays(2026);
    for (let i = 1; i < holidays.length; i++) {
      expect(holidays[i].fecha >= holidays[i - 1].fecha).toBe(true);
    }
  });

  it('returns correct fixed holidays for 2026', () => {
    const holidays = getChileanHolidays(2026);
    const byFecha = Object.fromEntries(holidays.map(h => [h.fecha, h.nombre]));

    expect(byFecha['2026-01-01']).toBe('Año Nuevo');
    expect(byFecha['2026-05-01']).toBe('Día del Trabajo');
    expect(byFecha['2026-05-21']).toBe('Glorias Navales');
    expect(byFecha['2026-06-29']).toBe('San Pedro y San Pablo');
    expect(byFecha['2026-07-16']).toBe('Virgen del Carmen');
    expect(byFecha['2026-08-15']).toBe('Asunción de la Virgen');
    expect(byFecha['2026-09-18']).toBe('Fiestas Patrias');
    expect(byFecha['2026-09-19']).toBe('Día de las Glorias del Ejército');
    expect(byFecha['2026-10-12']).toBe('Encuentro de Dos Mundos');
    expect(byFecha['2026-10-31']).toBe('Día de las Iglesias Evangélicas y Protestantes');
    expect(byFecha['2026-11-01']).toBe('Día de Todos los Santos');
    expect(byFecha['2026-12-08']).toBe('Inmaculada Concepción');
    expect(byFecha['2026-12-25']).toBe('Navidad');
  });

  it('computes Viernes Santo and Sabado Santo correctly for 2025 (Easter April 20)', () => {
    const holidays = getChileanHolidays(2025);
    const byFecha = Object.fromEntries(holidays.map(h => [h.fecha, h.nombre]));

    // Easter 2025: April 20
    // Viernes Santo: April 18
    // Sabado Santo:  April 19
    expect(byFecha['2025-04-18']).toBe('Viernes Santo');
    expect(byFecha['2025-04-19']).toBe('Sábado Santo');
  });

  it('computes Viernes Santo and Sabado Santo correctly for 2026 (Easter April 5)', () => {
    const holidays = getChileanHolidays(2026);
    const byFecha = Object.fromEntries(holidays.map(h => [h.fecha, h.nombre]));

    // Easter 2026: April 5
    // Viernes Santo: April 3
    // Sabado Santo:  April 4
    expect(byFecha['2026-04-03']).toBe('Viernes Santo');
    expect(byFecha['2026-04-04']).toBe('Sábado Santo');
  });

  it('computes Viernes Santo and Sabado Santo correctly for 2027 (Easter March 28)', () => {
    const holidays = getChileanHolidays(2027);
    const byFecha = Object.fromEntries(holidays.map(h => [h.fecha, h.nombre]));

    // Easter 2027: March 28
    // Viernes Santo: March 26
    // Sabado Santo:  March 27
    expect(byFecha['2027-03-26']).toBe('Viernes Santo');
    expect(byFecha['2027-03-27']).toBe('Sábado Santo');
  });

  it('computes Viernes Santo and Sabado Santo correctly for 2028 (Easter April 16)', () => {
    const holidays = getChileanHolidays(2028);
    const byFecha = Object.fromEntries(holidays.map(h => [h.fecha, h.nombre]));

    // Easter 2028: April 16
    // Viernes Santo: April 14
    // Sabado Santo:  April 15
    expect(byFecha['2028-04-14']).toBe('Viernes Santo');
    expect(byFecha['2028-04-15']).toBe('Sábado Santo');
  });

  it('uses lookup table for Pueblos Indigenas day — 2025 should be June 20', () => {
    const holidays = getChileanHolidays(2025);
    const byFecha = Object.fromEntries(holidays.map(h => [h.fecha, h.nombre]));
    expect(byFecha['2025-06-20']).toBe('Día Nacional de los Pueblos Indígenas');
  });

  it('uses lookup table for Pueblos Indigenas day — 2026 should be June 21', () => {
    const holidays = getChileanHolidays(2026);
    const byFecha = Object.fromEntries(holidays.map(h => [h.fecha, h.nombre]));
    expect(byFecha['2026-06-21']).toBe('Día Nacional de los Pueblos Indígenas');
  });

  it('all fecha values are valid YYYY-MM-DD format', () => {
    const holidays = getChileanHolidays(2026);
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    for (const h of holidays) {
      expect(h.fecha).toMatch(dateRegex);
    }
  });

  it('all holiday names are non-empty strings', () => {
    const holidays = getChileanHolidays(2026);
    for (const h of holidays) {
      expect(typeof h.nombre).toBe('string');
      expect(h.nombre.length).toBeGreaterThan(0);
    }
  });

  it('returns fecha values prefixed with the correct year', () => {
    for (const year of [2025, 2026, 2027, 2028]) {
      const holidays = getChileanHolidays(year);
      for (const h of holidays) {
        expect(h.fecha.startsWith(String(year))).toBe(true);
      }
    }
  });

  it('falls back to June 21 for unknown years outside the lookup table', () => {
    // Year 2099 is not in the lookup table
    const holidays = getChileanHolidays(2099);
    const byFecha = Object.fromEntries(holidays.map(h => [h.fecha, h.nombre]));
    expect(byFecha['2099-06-21']).toBe('Día Nacional de los Pueblos Indígenas');
  });
});
