// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { conversionSourceAmount } from '../../../components/expenses/ExpenseReportForm';

describe('conversionSourceAmount (currency-switch corruption guard)', () => {
  it('converts the ORIGINAL foreign amount, not the stored CLP value, on foreign->foreign', () => {
    // Existing GBP item: original £12.50, stored as 15375 CLP. Switch to EUR.
    const prev = { currency: 'GBP' as const, amount: 15375, original_amount: 12.5 };
    expect(conversionSourceAmount(prev, 'currency', 'EUR')).toBe(12.5); // 12.5, never 15375
  });

  it('keeps the existing CLP magnitude on foreign->CLP (never collapses to the tiny original)', () => {
    // Regression guard: GBP £12.50 (15375 CLP) -> CLP must stay 15375, not become 12.5.
    const prev = { currency: 'GBP' as const, amount: 15375, original_amount: 12.5 };
    expect(conversionSourceAmount(prev, 'currency', 'CLP')).toBe(15375);
  });

  it('reinterprets the CLP value as the new foreign amount on CLP->foreign', () => {
    const prev = { currency: 'CLP' as const, amount: 12990 };
    expect(conversionSourceAmount(prev, 'currency', 'GBP')).toBe(12990);
  });

  it('uses the freshly typed value when entering a new amount', () => {
    const prev = { currency: 'GBP' as const, amount: 15375, original_amount: 12.5 };
    expect(conversionSourceAmount(prev, 'amount', 20)).toBe(20);
  });

  it('falls back to the stored amount when a foreign original is absent', () => {
    const prev = { currency: 'GBP' as const, amount: 15375 };
    expect(conversionSourceAmount(prev, 'currency', 'EUR')).toBe(15375);
  });
});
