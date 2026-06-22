// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { conversionSourceAmount } from '../../../components/expenses/ExpenseReportForm';

describe('conversionSourceAmount (currency-switch corruption guard)', () => {
  it('converts the ORIGINAL foreign amount, not the stored CLP value, when switching currency', () => {
    // Existing GBP item: original £12.50, stored as 15375 CLP. Switch to EUR.
    const prev = { currency: 'GBP' as const, amount: 15375, original_amount: 12.5 };
    expect(conversionSourceAmount(prev, 'currency', 0)).toBe(12.5); // 12.5, never 15375
  });

  it('uses the CLP amount as the source when the prior currency is CLP', () => {
    const prev = { currency: 'CLP' as const, amount: 12990 };
    expect(conversionSourceAmount(prev, 'currency', 0)).toBe(12990);
  });

  it('uses the freshly typed value when entering a new amount', () => {
    const prev = { currency: 'GBP' as const, amount: 15375, original_amount: 12.5 };
    expect(conversionSourceAmount(prev, 'amount', 20)).toBe(20);
  });

  it('falls back to the stored amount when a foreign original is absent', () => {
    const prev = { currency: 'GBP' as const, amount: 15375 };
    expect(conversionSourceAmount(prev, 'currency', 0)).toBe(15375);
  });
});
