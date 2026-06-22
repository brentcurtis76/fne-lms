// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getAvailableCurrencies,
  getCurrencySymbol,
  formatCurrency,
  convertToCLP
} from '../../lib/currency-service';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('currency-service GBP support', () => {
  it('lists GBP among the available currencies', () => {
    const gbp = getAvailableCurrencies().find((c) => c.code === 'GBP');
    expect(gbp).toMatchObject({ symbol: '£', name: 'Libra Esterlina' });
  });

  it('maps GBP to the £ symbol', () => {
    expect(getCurrencySymbol('GBP')).toBe('£');
  });

  it('formats a GBP amount with the £ symbol', () => {
    expect(formatCurrency(12.5, 'GBP')).toContain('£');
  });

  it('converts GBP to CLP using the fallback rate when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await convertToCLP(10, 'GBP');
    expect(result.originalCurrency).toBe('GBP');
    expect(result.originalAmount).toBe(10);
    expect(result.conversionRate).toBe(1230); // FALLBACK_RATES.GBP
    expect(result.convertedAmount).toBe(12300); // 10 * 1230
  });
});
