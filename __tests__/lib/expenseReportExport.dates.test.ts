// @vitest-environment node
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

/**
 * F21h (GES-3.25): the PDF and the Excel of a report show the dates of type
 * date (the period, each expense's date) as typed — «2026-11-01» reads
 * 01-11-2026 in Chile — while timestamps (created, sent) keep their present
 * formatting. jsPDF, its table and xlsx are recorded, nothing is written.
 */

const rec = vi.hoisted(() => ({ texts: [] as string[], tables: [] as unknown[][][], sheets: [] as unknown[][][] }));
vi.mock('jspdf', () => {
  class FakeDoc {
    internal = { pageSize: { width: 210, height: 297, getWidth: () => 210, getHeight: () => 297 } };
    lastAutoTable = { finalY: 100 };
    text(t: string | string[]) { rec.texts.push(Array.isArray(t) ? t.join(' ') : String(t)); return this; }
    save() { return this; }
    getNumberOfPages() { return 1; }
    splitTextToSize(t: string) { return [t]; }
    getTextWidth() { return 10; }
    addImage() { return this; }
    // anything else (setFont, setFontSize, setTextColor, rect, line, addPage, setPage, ...)
  }
  const proxied = new Proxy(FakeDoc, {
    construct(target, args) {
      const doc: any = Reflect.construct(target, args);
      return new Proxy(doc, { get: (o, p) => (p in o ? o[p] : () => doc) });
    },
  });
  return { default: proxied, jsPDF: proxied };
});
vi.mock('jspdf-autotable', () => ({
  default: (_doc: unknown, opts: { body: unknown[][] }) => { rec.tables.push(opts.body); },
}));
vi.mock('xlsx', () => ({
  utils: {
    book_new: () => ({}),
    aoa_to_sheet: (rows: unknown[][]) => { rec.sheets.push(rows); return {}; },
    book_append_sheet: () => undefined,
  },
  writeFile: () => undefined,
}));

import { ExpenseReportExporter } from '../../lib/expenseReportExport';

const REPORT: any = {
  id: 'r-1', report_name: 'Viaje sintético', start_date: '2026-11-01', end_date: '2026-11-10', status: 'approved',
  total_amount: 5000, submitted_by: 'u-1', created_at: '2026-11-01T02:00:00Z', submitted_at: '2026-11-12T12:00:00Z',
  updated_at: '2026-11-14T12:00:00Z', profiles: { first_name: 'Carla', last_name: 'Prueba', email: 'carla@f21h.test.local' },
  expense_items: [{ id: 'i-1', report_id: 'r-1', category_id: 'c', description: 'Taxi', amount: 5000, currency: 'CLP', expense_date: '2026-11-01' }],
};
const stamp = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });

let previousTz: string | undefined;
beforeAll(() => {
  previousTz = process.env.TZ;
  process.env.TZ = 'America/Santiago';
});
afterAll(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});
beforeEach(() => {
  rec.texts.length = 0;
  rec.tables.length = 0;
  rec.sheets.length = 0;
});

describe('F21h GES-3.25 the export shows dates as typed', () => {
  it('PDF: the period and the expense row read 01-11-2026; the creation timestamp is formatted as before', async () => {
    await ExpenseReportExporter.exportToPDF(REPORT);
    expect(rec.texts).toContain('Período: 01-11-2026 - 10-11-2026');
    expect(rec.tables[0][0][0]).toBe('01-11-2026');
    expect(rec.texts).toContain(`Fecha de creación: ${stamp('2026-11-01T02:00:00Z')}`);
    expect(stamp('2026-11-01T02:00:00Z')).toBe('31-10-2026');
  });

  it('Excel: the period and the expense row read 01-11-2026; the sent timestamp is formatted as before', async () => {
    await ExpenseReportExporter.exportToExcel(REPORT);
    const summary = rec.sheets[0];
    expect(summary).toContainEqual(['Período:', '01-11-2026 - 10-11-2026']);
    expect(summary).toContainEqual(['Fecha de Envío:', stamp('2026-11-12T12:00:00Z')]);
    expect(summary).toContainEqual(['Fecha de Creación:', '31-10-2026']);
    expect(rec.sheets[1][1][0]).toBe('01-11-2026');
  });
});
