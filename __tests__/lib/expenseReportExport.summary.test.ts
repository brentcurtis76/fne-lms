// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F23f (GES-3.30, total half): «Exportar todos» (PDF and Excel summary of all
 * loaded reports) headlines the approved money only, with one line per state
 * in the order Aprobado, Enviado, Borrador, Rechazado. Every report is still
 * listed. jsPDF, its table and xlsx are recorded, nothing is written.
 */

const rec = vi.hoisted(() => ({
  texts: [] as string[],
  tables: [] as Array<{ body: unknown[][]; foot?: unknown[][]; startY?: number }>,
  sheets: [] as unknown[][][],
}));
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
  default: (_doc: unknown, opts: { body: unknown[][]; foot?: unknown[][]; startY?: number }) => {
    rec.tables.push(opts);
  },
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

const report = (id: string, status: string, total: number | undefined): any => ({
  id, report_name: `Reporte sintético ${id}`, start_date: '2026-11-01', end_date: '2026-11-10', status,
  total_amount: total, submitted_by: 'u-1', created_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-02T12:00:00Z',
  profiles: { first_name: 'Ana', last_name: 'Prueba', email: 'ana@f23f.test.local' },
});

const REPORTS = [
  report('a1', 'approved', 100000),
  report('s1', 'submitted', 70000),
  report('a2', 'approved', 50000),
  report('d1', 'draft', 30000),
  report('r1', 'rejected', 20000),
];

const money = (n: number) => `$${n.toLocaleString('es-CL')}`;

beforeEach(() => {
  rec.texts.length = 0;
  rec.tables.length = 0;
  rec.sheets.length = 0;
});

describe('F23f GES-3.30 summaryByStatus', () => {
  it('totals approved money only and gives one line per state, in order', () => {
    const s = (ExpenseReportExporter as any).summaryByStatus(REPORTS);
    expect(s).toEqual({
      reportsCount: 5,
      approvedTotal: 150000,
      lines: [
        { label: 'Aprobado', count: 2, total: 150000 },
        { label: 'Enviado', count: 1, total: 70000 },
        { label: 'Borrador', count: 1, total: 30000 },
        { label: 'Rechazado', count: 1, total: 20000 },
      ],
    });
  });

  it('with no approved report the approved total is 0 and every state still has its line', () => {
    const s = (ExpenseReportExporter as any).summaryByStatus([report('d1', 'draft', 30000)]);
    expect(s.reportsCount).toBe(1);
    expect(s.approvedTotal).toBe(0);
    expect(s.lines).toEqual([
      { label: 'Aprobado', count: 0, total: 0 },
      { label: 'Enviado', count: 0, total: 0 },
      { label: 'Borrador', count: 1, total: 30000 },
      { label: 'Rechazado', count: 0, total: 0 },
    ]);
  });

  it('a report with a missing total counts 0', () => {
    const s = (ExpenseReportExporter as any).summaryByStatus([report('a1', 'approved', 100000), report('a2', 'approved', undefined)]);
    expect(s.approvedTotal).toBe(100000);
    expect(s.lines[0]).toEqual({ label: 'Aprobado', count: 2, total: 100000 });
  });
});

describe('F23f GES-3.30 the summary files headline approved money', () => {
  it('Excel: «Monto aprobado:», the four state lines, every report listed, last row «TOTAL APROBADO»', async () => {
    await ExpenseReportExporter.exportMultipleReportsToExcel(REPORTS);
    const rows = rec.sheets[0];
    expect(rows[2]).toEqual(['Total de reportes:', 5]);
    expect(rows[3]).toEqual(['Monto aprobado:', money(150000)]);
    expect(money(150000)).toBe('$150.000');
    expect(rows.slice(4, 8)).toEqual([
      ['Aprobado', '2 reportes', money(150000)],
      ['Enviado', '1 reporte', money(70000)],
      ['Borrador', '1 reporte', money(30000)],
      ['Rechazado', '1 reporte', money(20000)],
    ]);
    expect(rows[8][0]).toBe('Fecha de generación:');
    expect(rows[9]).toEqual(['']);
    expect(rows[10][0]).toBe('Nombre del Reporte');
    expect(rows.slice(11, 16).map(r => r[0])).toEqual(REPORTS.map(r => r.report_name));
    expect(rows[rows.length - 1]).toEqual(['TOTAL APROBADO', '', '', '', '', '150000']);
    expect(rows.flat()).not.toContain('Monto total:');
    expect(rows.flat()).not.toContain('TOTAL GENERAL');
  });

  it('PDF: «Monto aprobado: $150.000», the four state lines, every report listed, foot «TOTAL APROBADO»', async () => {
    await ExpenseReportExporter.exportMultipleReportsToPDF(REPORTS);
    expect(rec.texts).toContain('Total de reportes: 5');
    expect(rec.texts).toContain('Monto aprobado: $150.000');
    const i = rec.texts.indexOf('Monto aprobado: $150.000');
    expect(rec.texts.slice(i + 1, i + 5)).toEqual([
      'Aprobado: 2 reportes · $150.000',
      'Enviado: 1 reporte · $70.000',
      'Borrador: 1 reporte · $30.000',
      'Rechazado: 1 reporte · $20.000',
    ]);
    expect(rec.texts[i + 5]).toMatch(/^Fecha de generación: /);
    expect(rec.texts.some(t => t.startsWith('Monto total'))).toBe(false);
    const table = rec.tables[0];
    expect(table.body).toHaveLength(5);
    expect(table.foot).toEqual([['TOTAL APROBADO', '', '', '', '$150.000']]);
  });

  it('PDF: a state with no reports still has its line «0 reportes · $0»', async () => {
    await ExpenseReportExporter.exportMultipleReportsToPDF([report('d1', 'draft', 30000)]);
    expect(rec.texts).toContain('Monto aprobado: $0');
    expect(rec.texts).toContain('Aprobado: 0 reportes · $0');
    expect(rec.texts).toContain('Rechazado: 0 reportes · $0');
    expect(rec.tables[0].foot).toEqual([['TOTAL APROBADO', '', '', '', '$0']]);
  });
});

describe('F23f send-back 1: amounts are added as numbers and a missing amount shows zero', () => {
  const MIXED = [report('a1', 'approved', 100000), report('a2', 'approved', '50000' as any)];
  const MISSING = [report('a1', 'approved', 100000), report('a2', 'approved', undefined), report('s1', 'submitted', null as any)];

  it('Excel: a string amount is summed with a number amount (headline, state line, foot)', async () => {
    await ExpenseReportExporter.exportMultipleReportsToExcel(MIXED);
    const rows = rec.sheets[0];
    expect(rows[3]).toEqual(['Monto aprobado:', '$150.000']);
    expect(rows[4]).toEqual(['Aprobado', '2 reportes', '$150.000']);
    expect(rows[rows.length - 1]).toEqual(['TOTAL APROBADO', '', '', '', '', '150000']);
  });

  it('PDF: a string amount is summed with a number amount (headline, state line, foot)', async () => {
    await ExpenseReportExporter.exportMultipleReportsToPDF(MIXED);
    expect(rec.texts).toContain('Monto aprobado: $150.000');
    expect(rec.texts).toContain('Aprobado: 2 reportes · $150.000');
    expect(rec.tables[0].foot).toEqual([['TOTAL APROBADO', '', '', '', '$150.000']]);
  });

  it('Excel: undefined and null amounts do not throw, their rows show 0, totals are right', async () => {
    await ExpenseReportExporter.exportMultipleReportsToExcel(MISSING);
    const rows = rec.sheets[0];
    expect(rows[3]).toEqual(['Monto aprobado:', '$100.000']);
    expect(rows[5]).toEqual(['Enviado', '1 reporte', '$0']);
    expect(rows.slice(11, 14).map(r => r[5])).toEqual(['100000', '0', '0']);
    expect(rows[rows.length - 1]).toEqual(['TOTAL APROBADO', '', '', '', '', '100000']);
  });

  it('PDF: undefined and null amounts do not throw, their rows show $0, totals are right', async () => {
    await ExpenseReportExporter.exportMultipleReportsToPDF(MISSING);
    expect(rec.texts).toContain('Monto aprobado: $100.000');
    expect(rec.texts).toContain('Enviado: 1 reporte · $0');
    expect(rec.tables[0].body.map(r => r[4])).toEqual(['$100.000', '$0', '$0']);
    expect(rec.tables[0].foot).toEqual([['TOTAL APROBADO', '', '', '', '$100.000']]);
  });

  it('Excel: an empty list does not throw; approved $0 and the four state lines', async () => {
    await ExpenseReportExporter.exportMultipleReportsToExcel([]);
    const rows = rec.sheets[0];
    expect(rows[2]).toEqual(['Total de reportes:', 0]);
    expect(rows[3]).toEqual(['Monto aprobado:', '$0']);
    expect(rows.slice(4, 8)).toEqual([
      ['Aprobado', '0 reportes', '$0'],
      ['Enviado', '0 reportes', '$0'],
      ['Borrador', '0 reportes', '$0'],
      ['Rechazado', '0 reportes', '$0'],
    ]);
    expect(rows[rows.length - 1]).toEqual(['TOTAL APROBADO', '', '', '', '', '0']);
  });

  it('PDF: an empty list does not throw; approved $0 and the four state lines', async () => {
    await ExpenseReportExporter.exportMultipleReportsToPDF([]);
    expect(rec.texts).toContain('Monto aprobado: $0');
    const i = rec.texts.indexOf('Monto aprobado: $0');
    expect(rec.texts.slice(i + 1, i + 5)).toEqual([
      'Aprobado: 0 reportes · $0',
      'Enviado: 0 reportes · $0',
      'Borrador: 0 reportes · $0',
      'Rechazado: 0 reportes · $0',
    ]);
    expect(rec.tables[0].body).toHaveLength(0);
    expect(rec.tables[0].foot).toEqual([['TOTAL APROBADO', '', '', '', '$0']]);
  });
});
