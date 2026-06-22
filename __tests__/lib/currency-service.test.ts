// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  getAvailableCurrencies,
  getCurrencySymbol,
  formatCurrency,
  convertToCLP,
  getExchangeRates,
  resetRatesCache
} from '../../lib/currency-service';

beforeEach(() => {
  resetRatesCache(); // module-level cache must not leak between fetch-stubbing tests
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetRatesCache();
});

function stubRates(rates: Record<string, number>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ rates })
  }));
}

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

describe('currency-service hardening', () => {
  it('returns a safe fallback symbol/format for non-canonical free-form currency codes', () => {
    // expense_items.currency is free-form text; legacy values must not throw.
    expect(getCurrencySymbol('GBp')).toBe('$');
    expect(() => formatCurrency(10, 'GBp')).not.toThrow();
    expect(formatCurrency(10, 'GBp')).toContain('GBp');
  });

  it('never lets a missing/zero API rate produce a NaN conversion (falls back per-currency)', async () => {
    // 200 OK but the payload omits GBP and gives a non-positive USD rate.
    stubRates({ USD: 0, EUR: 0.00097 });
    const gbp = await convertToCLP(10, 'GBP');
    expect(Number.isFinite(gbp.convertedAmount)).toBe(true);
    expect(gbp.conversionRate).toBe(1230); // FALLBACK_RATES.GBP, not NaN
    resetRatesCache();
    stubRates({ USD: 0 });
    const usd = await convertToCLP(10, 'USD');
    expect(usd.conversionRate).toBe(950); // FALLBACK_RATES.USD, not Infinity from 1/0
  });

  it('uses a valid live GBP rate when the API provides one', async () => {
    stubRates({ GBP: 0.0005 }); // 1 CLP = 0.0005 GBP → 1 GBP = 2000 CLP
    const result = await convertToCLP(2, 'GBP');
    expect(result.conversionRate).toBe(2000);
    expect(result.convertedAmount).toBe(4000);
  });

  it('does not pin fallback rates for the full hour after a transient failure', async () => {
    const t0 = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(t0);

    // First call fails → fallback cached with a SHORT ttl.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect((await getExchangeRates()).GBP).toBe(1230);

    // 2 minutes later (past the 1-min failure ttl, well within the 1-hr live ttl)
    // the API has recovered → we must re-fetch, not serve the stale fallback.
    nowSpy.mockReturnValue(t0 + 2 * 60 * 1000);
    stubRates({ GBP: 0.0005 });
    expect((await getExchangeRates()).GBP).toBe(2000);
  });
});
