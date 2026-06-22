// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ExpenseReportExporter } from '../../lib/expenseReportExport';

// Exercise the private audit/formatting helpers without driving full jsPDF/xlsx output.
const E = ExpenseReportExporter as unknown as {
  excelAuditCells: (item: any) => { moneda: string; montoOriginal: string; tasa: string };
  formatOriginalAmount: (item: any) => string;
  formatOriginalNumber: (amount: number, currency?: string) => string;
};

describe('export audit fields', () => {
  it('Excel: a full GBP row reports currency, locale-formatted original, and the real rate', () => {
    const cells = E.excelAuditCells({ currency: 'GBP', amount: 15375, original_amount: 12.5, conversion_rate: 1230 });
    expect(cells).toEqual({ moneda: 'GBP', montoOriginal: '12.50', tasa: '1230' });
  });

  it('Excel: a partial GBP row shows "-", never the converted CLP value at a fake rate of 1', () => {
    const cells = E.excelAuditCells({ currency: 'GBP', amount: 15375, original_amount: null, conversion_rate: null });
    expect(cells).toEqual({ moneda: 'GBP', montoOriginal: '-', tasa: '-' });
  });

  it('Excel: a CLP row reports its own value and rate 1', () => {
    const cells = E.excelAuditCells({ currency: 'CLP', amount: 12990, original_amount: 12990, conversion_rate: 1 });
    expect(cells).toEqual({ moneda: 'CLP', montoOriginal: '12990', tasa: '1' });
  });

  it('PDF: formatOriginalAmount returns "-" for CLP rows and foreign rows missing their original', () => {
    expect(E.formatOriginalAmount({ currency: 'GBP', amount: 15375, original_amount: null })).toBe('-');
    expect(E.formatOriginalAmount({ currency: 'CLP', amount: 12990, original_amount: 12990 })).toBe('-');
  });

  it('formats each foreign currency in its own locale (EUR de-DE, GBP/USD comma-grouped)', () => {
    expect(E.formatOriginalNumber(1234.5, 'GBP')).toBe('1,234.50');
    expect(E.formatOriginalNumber(1234.5, 'USD')).toBe('1,234.50');
    expect(E.formatOriginalNumber(1234.5, 'EUR')).toBe('1.234,50');
    expect(E.formatOriginalAmount({ currency: 'EUR', amount: 1, original_amount: 1234.5 })).toBe('€1.234,50 EUR');
  });
});
