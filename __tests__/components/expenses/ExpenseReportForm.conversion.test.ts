// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { conversionSourceAmount } from '../../../components/expenses/ExpenseReportForm';

// The currency dropdown is a SOURCE-currency selector, not a display toggle: a
// switch always converts from the raw amount shown in the input (the foreign
// original, or the CLP amount), regardless of the target currency.
describe('conversionSourceAmount (source-currency selector)', () => {
  it('foreign -> foreign: uses the foreign original (12.5) as the source', () => {
    const prev = { currency: 'GBP' as const, amount: 15375, original_amount: 12.5 };
    expect(conversionSourceAmount(prev, 'currency')).toBe(12.5);
  });

  it('foreign -> CLP: uses the foreign original (12.5), NOT the converted 15375 CLP', () => {
    const prev = { currency: 'GBP' as const, amount: 15375, original_amount: 12.5 };
    expect(conversionSourceAmount(prev, 'currency')).toBe(12.5);
  });

  it('CLP -> foreign: uses the CLP amount (12990) as the source', () => {
    const prev = { currency: 'CLP' as const, amount: 12990 };
    expect(conversionSourceAmount(prev, 'currency')).toBe(12990);
  });

  it('GBP -> CLP -> GBP round-trip keeps the source at 12.5 (never inflates to 15375)', () => {
    const gbp = { currency: 'GBP' as const, amount: 15375, original_amount: 12.5 };
    // Switch GBP -> CLP: source is the £ original, so convertToCLP(12.5, 'CLP').
    expect(conversionSourceAmount(gbp, 'currency')).toBe(12.5);
    // Model the resulting CLP row after that conversion (identity for CLP).
    const clpRow = { currency: 'CLP' as const, original_amount: 12.5, amount: 12.5 };
    // Switch back CLP -> GBP: source must still be 12.5, never the old 15375.
    expect(conversionSourceAmount(clpRow, 'currency')).toBe(12.5);
  });

  it('uses the freshly typed value when entering a new amount', () => {
    const prev = { currency: 'GBP' as const, amount: 15375, original_amount: 12.5 };
    expect(conversionSourceAmount(prev, 'amount', 20)).toBe(20);
  });

  it('falls back to the stored amount when a foreign original is absent', () => {
    const prev = { currency: 'GBP' as const, amount: 15375 };
    expect(conversionSourceAmount(prev, 'currency')).toBe(15375);
  });
});
