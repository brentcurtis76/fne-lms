// @vitest-environment node
/**
 * LIC-B1 / LIC-B4 / LIC-B8 (GENERA fixes F20a): one helper writes a tender's
 * amounts and durations for every tender document and screen. Amounts follow
 * the contracts' convention (lib/contract-template.ts): UF with two decimals,
 * pesos with none, both with the Chilean thousands point.
 */
import { describe, expect, it } from 'vitest';
import { formatMonto, formatDuracion } from '@/lib/licitaciones/formato';

describe('formatMonto', () => {
  it('writes UF with two decimals', () => {
    expect(formatMonto(1200.5, 'UF')).toBe('UF 1.200,50');
    expect(formatMonto(400, 'UF')).toBe('UF 400,00');
  });

  it('writes pesos with the dollar sign and no decimals', () => {
    expect(formatMonto(35000000, 'CLP')).toBe('$35.000.000');
    expect(formatMonto(15000000.4, 'CLP')).toBe('$15.000.000');
  });

  it('writes zero as a formatted zero', () => {
    expect(formatMonto(0, 'UF')).toBe('UF 0,00');
    expect(formatMonto(0, 'CLP')).toBe('$0');
  });

  it('reads a numeric string (Postgres numeric) like a number', () => {
    expect(formatMonto('1200.5', 'UF')).toBe('UF 1.200,50');
  });

  it('returns the placeholder the caller passes, or an empty string, when there is no amount', () => {
    expect(formatMonto(null, 'UF')).toBe('');
    expect(formatMonto(undefined, 'CLP')).toBe('');
    expect(formatMonto(null, 'CLP', '[monto por confirmar]')).toBe('[monto por confirmar]');
    expect(formatMonto('', 'UF', '—')).toBe('—');
    expect(formatMonto('abc', 'UF', '—')).toBe('—');
  });

  it('writes an unknown currency code after the amount written the Chilean way', () => {
    expect(formatMonto(1234567.5, 'USD')).toBe('1.234.567,5 USD');
  });
});

describe('formatDuracion', () => {
  it('adds «meses» to a bare number', () => {
    expect(formatDuracion('6')).toBe('6 meses');
    expect(formatDuracion('12')).toBe('12 meses');
  });

  it('writes «1 mes» in the singular', () => {
    expect(formatDuracion('1')).toBe('1 mes');
  });

  it('leaves a text that already has its words as typed', () => {
    expect(formatDuracion('6 meses')).toBe('6 meses');
    expect(formatDuracion('6 a 12 meses')).toBe('6 a 12 meses');
  });

  it('returns an empty string for an empty value', () => {
    expect(formatDuracion('')).toBe('');
    expect(formatDuracion(null)).toBe('');
    expect(formatDuracion(undefined)).toBe('');
  });
});
