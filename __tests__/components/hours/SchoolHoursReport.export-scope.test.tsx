// @vitest-environment jsdom
/**
 * SM-03 + SM-04 / A14-4-F02 — both downloads export the contract actually on screen, and
 * the CSV states that contract's own totals once.
 *
 * Before this unit the CSV button looped every program and contract in the school and the
 * PDF button passed only `school_id`, so a school with two contracts got the same
 * whole-school file whichever contract the selector showed. These tests drive the real
 * component through the real `ReportExporter.exportToCSV`, capture the Blob it hands to
 * the browser and parse the emitted cells; only the Supabase-free boundaries the component
 * touches are stubbed (fetch, `window.open`, the anchor click, toasts and the lazily
 * imported Recharts pieces, which draw nothing assertable in jsdom — the browser journey
 * renders those for real).
 *
 * SM-04 adds the summary row: the file now opens with one `Resumen del contrato` row
 * carrying the four totals rendered beside the ring chart, followed by the unchanged detail
 * rows. Every assertion below reads the emitted file through a quoting-aware reader, so a
 * cell holding a comma, a quote or a newline is compared as the value a spreadsheet sees.
 *
 * SM-05 adds the seventeenth column `Tipo de contrato`: the summary row says `Anexo` or
 * `Contrato` for the contract the selector shows, read from the same `is_annexo` flag the
 * selector labels its options with. Detail rows leave the cell blank, and neither the
 * contract number nor a bucket's `annex_hours` contribution may decide the label.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import type { SchoolReportData } from '../../../lib/types/hour-tracking.types';

const { mockToast } = vi.hoisted(() => ({ mockToast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: mockToast, toast: mockToast }));

// The ring chart is `next/dynamic(..., { ssr: false })` over recharts; it renders an
// <svg> in a real browser and nothing measurable in jsdom. Export scope does not read it.
vi.mock('next/dynamic', () => ({
  default: () => function DynamicStub() {
    return null;
  },
}));

import SchoolHoursReport from '../../../components/hours/SchoolHoursReport';

// ============================================================
// Synthetic report fixtures (UUID ids, as `contratos.id` is a UUID)
// ============================================================

const SCHOOL_ID = 42;
const SCHOOL_NAME = 'Colegio Sintetico Los Arrayanes';

const PROGRAMA_A = '11111111-1111-4111-8111-111111111111';
const PROGRAMA_B = '22222222-2222-4222-8222-222222222222';
const PARENT_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const ANNEX_ID = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const SIBLING_ID = 'cccccccc-3333-4333-8333-cccccccccccc';
const NO_BUCKETS_ID = 'dddddddd-4444-4444-8444-dddddddddddd';

const PARENT_NUMERO = 'SIN-2026-001';
const ANNEX_NUMERO = 'SIN-2026-001-A1';
const SIBLING_NUMERO = 'SIN-2026-002';
const NO_BUCKETS_NUMERO = 'SIN-2026-003';

/** Titles that must never appear in an export scoped to another contract. */
const SIBLING_SESSION_TITLE = 'Taller del contrato hermano';

/**
 * The eleven pre-existing detail columns, the five SM-04 summary columns, then the SM-05
 * contract-type column. The first sixteen keep their order, so a reader's existing columns
 * do not move.
 */
const CSV_COLUMNS = [
  'Programa', 'Contrato', 'Categoría', 'Fecha', 'Título', 'Consultor', 'Horas de sesión', 'Estado',
  'Sobre Presupuesto', 'Asistencia Esperada', 'Asistencia Real',
  'Tipo de fila', 'Horas contratadas', 'Horas consumidas', 'Horas reservadas', 'Horas disponibles',
  'Tipo de contrato',
] as const;

const CSV_HEADER = CSV_COLUMNS.join(',');

function makeReport(schoolName = SCHOOL_NAME): SchoolReportData {
  return {
    school_id: SCHOOL_ID,
    school_name: schoolName,
    school_summary: {
      total_contracted_hours: 82,
      total_allocated: 80,
      total_reserved: 2,
      total_consumed: 4.25,
      total_available: 73.75,
    },
    programs: [
      {
        programa_id: PROGRAMA_A,
        programa_name: 'Programa Sintetico Alfa',
        contracts: [
          {
            contrato_id: PARENT_ID,
            numero_contrato: PARENT_NUMERO,
            is_annexo: false,
            total_contracted_hours: 52,
            total_reserved: 2,
            total_consumed: 4.25,
            // Negative availability: the school is over its budget on this bucket.
            total_available: -1.25,
            buckets: [
              {
                hour_type_key: 'asesoria_tecnica_presencial',
                display_name: 'Asesoria Tecnica',
                allocated: 5,
                reserved: 2,
                consumed: 4.25,
                available: -1.25,
                is_fixed: false,
                annex_hours: 10,
                sessions: [
                  {
                    session_id: 's0000000-0000-4000-8000-000000000001',
                    title: 'Sesion consumida',
                    date: '2026-04-15',
                    consultant_name: 'Consultora Sintetica',
                    hours: 3,
                    status: 'consumida',
                    is_over_budget: false,
                    attendance: null,
                  },
                  {
                    session_id: 's0000000-0000-4000-8000-000000000002',
                    title: 'Sesion reservada',
                    date: '2026-06-08',
                    consultant_name: 'Consultora Sintetica',
                    hours: 2,
                    status: 'reservada',
                    is_over_budget: false,
                    attendance: null,
                  },
                  {
                    // §11 admin override: 75 effective minutes -> 1.25 h.
                    session_id: 's0000000-0000-4000-8000-000000000003',
                    title: 'Sesion penalizada con override',
                    date: '2026-05-20',
                    consultant_name: 'Consultor Sintetico',
                    hours: 1.25,
                    status: 'penalizada',
                    is_over_budget: true,
                    attendance: null,
                  },
                  {
                    // Zero waiver: effective_minutes = 0, "Sesión eximida".
                    session_id: 's0000000-0000-4000-8000-000000000004',
                    title: 'Sesion devuelta eximida',
                    date: '2026-05-25',
                    consultant_name: 'Consultora Sintetica',
                    hours: 0,
                    status: 'devuelta',
                    is_over_budget: false,
                    attendance: null,
                  },
                ],
              },
            ],
          },
          {
            contrato_id: ANNEX_ID,
            numero_contrato: ANNEX_NUMERO,
            is_annexo: true,
            total_contracted_hours: 10,
            total_reserved: 0,
            total_consumed: 0,
            total_available: 10,
            buckets: [
              {
                hour_type_key: 'asesoria_tecnica_presencial',
                display_name: 'Asesoria Tecnica',
                allocated: 10,
                reserved: 0,
                consumed: 0,
                available: 10,
                is_fixed: false,
                annex_hours: 0,
                sessions: [],
              },
            ],
          },
        ],
      },
      {
        programa_id: PROGRAMA_B,
        programa_name: 'Programa Sintetico Beta',
        contracts: [
          {
            contrato_id: SIBLING_ID,
            numero_contrato: SIBLING_NUMERO,
            is_annexo: false,
            total_contracted_hours: 20,
            total_reserved: 0,
            total_consumed: 1.5,
            total_available: 18.5,
            buckets: [
              {
                hour_type_key: 'talleres_presenciales',
                display_name: 'Talleres Presenciales',
                allocated: 20,
                reserved: 0,
                consumed: 1.5,
                available: 18.5,
                is_fixed: false,
                annex_hours: 0,
                sessions: [
                  {
                    session_id: 's0000000-0000-4000-8000-000000000005',
                    title: SIBLING_SESSION_TITLE,
                    date: '2026-07-01',
                    consultant_name: 'Tallerista Sintetica',
                    hours: 1.5,
                    status: 'consumida',
                    is_over_budget: false,
                    attendance: null,
                  },
                ],
              },
            ],
          },
          {
            contrato_id: NO_BUCKETS_ID,
            numero_contrato: NO_BUCKETS_NUMERO,
            is_annexo: false,
            total_contracted_hours: 0,
            total_reserved: 0,
            total_consumed: 0,
            total_available: 0,
            buckets: [],
          },
        ],
      },
    ],
  };
}

// ============================================================
// Harness
// ============================================================

let capturedCsv: string | null;
let capturedBlob: Blob | null;
let capturedFilename: string | null;
let openedUrls: string[];
let exportThrows: boolean;

/** Resolves once the pending export's Blob has been read. */
const flushBlob = () => new Promise((r) => setTimeout(r, 0));

// jsdom 20's Blob has no `text()`, so the emitted file is read back through FileReader.
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

// jsdom 20 implements neither of these, so the blob download boundary has to exist
// before `vi.spyOn` can wrap it.
for (const name of ['createObjectURL', 'revokeObjectURL'] as const) {
  if (typeof URL[name] !== 'function') {
    Object.defineProperty(URL, name, { writable: true, configurable: true, value: () => '' });
  }
}

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  });
}

beforeEach(() => {
  capturedCsv = null;
  capturedBlob = null;
  capturedFilename = null;
  openedUrls = [];
  exportThrows = false;
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  global.fetch = vi.fn();
  vi.spyOn(window, 'open').mockImplementation((url?: string | URL) => {
    openedUrls.push(String(url));
    return null;
  });
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob) => {
    if (exportThrows) throw new Error('synthetic exporter failure');
    capturedBlob = blob;
    return 'blob:synthetic';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    capturedFilename = this.getAttribute('download');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderReport(report: SchoolReportData | null, schoolId = SCHOOL_ID) {
  mockFetchOnce({ data: report });
  render(<SchoolHoursReport schoolId={schoolId} isAdmin={false} />);
  await screen.findByRole('heading', { level: 1 });
}

async function downloadCsv(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Descargar CSV' }));
  await flushBlob();
  // Read the Blob the component actually handed to the browser. It is captured
  // synchronously above, so `capturedCsv` stays null while no CSV was emitted.
  capturedCsv = capturedBlob === null ? null : await readBlob(capturedBlob);
  return capturedCsv;
}

type CsvRow = Record<string, string>;

/**
 * RFC 4180 reader. Quoted cells may hold commas, doubled quotes and newlines, so splitting
 * the file on ',' or '\n' would not see what a spreadsheet sees.
 */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const ch = csv[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (csv[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

/** The emitted data rows, header asserted and dropped, each keyed by column name. */
function csvRows(csv: string | null): CsvRow[] {
  const [header, ...rest] = parseCsv(csv ?? '');
  expect(header).toEqual([...CSV_COLUMNS]);
  return rest.map((cells) => {
    // One rectangular table: seventeen cells on every row, never a ragged tail.
    expect(cells).toHaveLength(CSV_COLUMNS.length);
    return Object.fromEntries(CSV_COLUMNS.map((column, i) => [column, cells[i]])) as CsvRow;
  });
}

/** An expected row: every column not named here must come back exactly empty. */
function expectedRow(overrides: Partial<Record<(typeof CSV_COLUMNS)[number], string>>): CsvRow {
  return Object.fromEntries(CSV_COLUMNS.map((column) => [column, overrides[column] ?? ''])) as CsvRow;
}

/** The pre-existing header line, checked as raw text (no column name needs quoting). */
const csvHeaderLine = (csv: string | null) => (csv ?? '').split('\n')[0];

const SUMMARY_ROW = 'Resumen del contrato';
const TYPE_COLUMN = 'Tipo de contrato';
const TYPE_ORDINARY = 'Contrato';
const TYPE_ANNEX = 'Anexo';

// ============================================================
// D1 — the selected contract, and only it
// ============================================================

describe('D1 selected-contract export scope', () => {
  it('D1 exports only the selected parent contract rows, preserving billing and session values', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    const csv = await downloadCsv(user);
    expect(csvHeaderLine(csv)).toBe(CSV_HEADER);
    const rows = csvRows(csv);
    expect(rows).toHaveLength(5); // one contract summary + the parent contract's four sessions

    // Exactly one summary, first, and no other contract's.
    expect(rows.filter((r) => r['Tipo de fila'] === SUMMARY_ROW)).toHaveLength(1);
    expect(rows[0]).toEqual(expectedRow({
      Programa: 'Programa Sintetico Alfa',
      Contrato: PARENT_NUMERO,
      'Tipo de fila': SUMMARY_ROW,
      // An ordinary contract, even though a +10 h annex contributes hours to its bucket.
      [TYPE_COLUMN]: TYPE_ORDINARY,
      // 52 h contracted for this contract (the +10 h annex contribution is already inside
      // it), 4.25 h consumed, 2 h reserved and negative availability — all at one decimal.
      'Horas contratadas': '52.0',
      'Horas consumidas': '4.3',
      'Horas reservadas': '2.0',
      'Horas disponibles': '-1.3',
    }));

    // The four totals are the ones on screen, cell for cell.
    const screenTotals = [
      ['Horas contratadas', 'Contratadas:'],
      ['Horas consumidas', 'Consumidas:'],
      ['Horas reservadas', 'Reservadas:'],
      ['Horas disponibles', 'Disponibles:'],
    ] as const;
    for (const [column, label] of screenTotals) {
      const line = screen.getByText(label).closest('div') as HTMLElement;
      expect(within(line).getByText(`${rows[0][column]} h`)).toBeInTheDocument();
    }

    // Never derived from the rows below: the four sessions add up to 6.25 h while the
    // contract's own consumed total is 4.25 h.
    expect(rows.slice(1).reduce((sum, r) => sum + Number(r['Horas de sesión']), 0)).toBeCloseTo(6.25, 5);
    expect(rows[0]['Horas consumidas']).not.toBe('6.3');

    // The eleven original detail cells are unchanged and carry no totals of their own.
    const detail = (over: Partial<Record<(typeof CSV_COLUMNS)[number], string>>) => expectedRow({
      Programa: 'Programa Sintetico Alfa',
      Contrato: PARENT_NUMERO,
      'Categoría': 'Asesoria Tecnica',
      Consultor: 'Consultora Sintetica',
      'Sobre Presupuesto': 'No',
      'Tipo de fila': 'Sesión',
      ...over,
    });
    expect(rows[1]).toEqual(detail({ Fecha: '2026-04-15', 'Título': 'Sesion consumida', 'Horas de sesión': '3.00', Estado: 'consumida' }));
    expect(rows[2]).toEqual(detail({ Fecha: '2026-06-08', 'Título': 'Sesion reservada', 'Horas de sesión': '2.00', Estado: 'reservada' }));
    // Fractional §11 override survives verbatim, with its over-budget flag.
    expect(rows[3]).toEqual(detail({
      Fecha: '2026-05-20', 'Título': 'Sesion penalizada con override', Consultor: 'Consultor Sintetico',
      'Horas de sesión': '1.25', Estado: 'penalizada', 'Sobre Presupuesto': 'Sí',
    }));
    // Zero waiver stays 0.00 rather than being dropped or re-derived.
    expect(rows[4]).toEqual(detail({ Fecha: '2026-05-25', 'Título': 'Sesion devuelta eximida', 'Horas de sesión': '0.00', Estado: 'devuelta' }));

    // No sibling contract, annex section or other-program row leaked in.
    expect(csv).not.toContain(ANNEX_NUMERO);
    expect(csv).not.toContain(SIBLING_NUMERO);
    expect(csv).not.toContain(SIBLING_SESSION_TITLE);
    expect(csv).not.toContain('Programa Sintetico Beta');
    expect(mockToast.success).toHaveBeenCalledWith('CSV descargado correctamente');
  });

  it('D1 exports the annex contract alone once it is selected, and the PDF targets the same id', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    await user.selectOptions(screen.getByLabelText('Contrato:'), ANNEX_ID);
    expect(screen.getByRole('heading', { level: 3, name: ANNEX_NUMERO })).toBeInTheDocument();

    const rows = csvRows(await downloadCsv(user));
    expect(rows).toHaveLength(2);
    // The annex's own totals — zeros survive as 0.0 rather than collapsing to blank cells.
    expect(rows[0]).toEqual(expectedRow({
      Programa: 'Programa Sintetico Alfa',
      Contrato: ANNEX_NUMERO,
      'Tipo de fila': SUMMARY_ROW,
      [TYPE_COLUMN]: TYPE_ANNEX,
      'Horas contratadas': '10.0',
      'Horas consumidas': '0.0',
      'Horas reservadas': '0.0',
      'Horas disponibles': '10.0',
    }));
    // Its one empty category keeps the identifying row it already had.
    expect(rows[1]).toEqual(expectedRow({
      Programa: 'Programa Sintetico Alfa',
      Contrato: ANNEX_NUMERO,
      'Categoría': 'Asesoria Tecnica',
      'Tipo de fila': 'Categoría sin sesiones',
    }));
    expect(capturedCsv).not.toContain('Sesion consumida');
    expect(capturedCsv).not.toContain(`,${PARENT_NUMERO},`);

    await user.click(screen.getByRole('button', { name: 'Descargar Reporte PDF' }));
    expect(openedUrls).toEqual([`/api/school-hours-report/${SCHOOL_ID}/pdf?contrato_id=${ANNEX_ID}`]);
  });

  it('D1 keeps the annex contribution inside the selected parent contract on screen', async () => {
    await renderReport(makeReport());
    // The parent's own bucket keeps its +10 h annex contribution and negative availability.
    expect(screen.getByText('+10.0 h Anexo')).toBeInTheDocument();
    expect(screen.getByText('Agotado')).toBeInTheDocument();
    expect(screen.getByText('-1.3')).toBeInTheDocument();
    // But the annex's own section is not rendered beside it.
    expect(screen.queryByRole('heading', { level: 3, name: ANNEX_NUMERO })).not.toBeInTheDocument();
  });
});

// ============================================================
// D2 — empty and absent selections
// ============================================================

describe('D2 empty and absent selections', () => {
  it('D2 keeps an identifying row with blank session cells for a contract with no buckets', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    await user.click(screen.getByRole('button', { name: 'Programa Sintetico Beta' }));
    await user.selectOptions(screen.getByLabelText('Contrato:'), NO_BUCKETS_ID);
    expect(screen.getByText('No hay categorías de horas para este contrato.')).toBeInTheDocument();

    const rows = csvRows(await downloadCsv(user));
    expect(rows).toHaveLength(2);
    // A contract with nothing consumed still states its zeros, so the reader can tell an
    // untouched contract from a missing one.
    expect(rows[0]).toEqual(expectedRow({
      Programa: 'Programa Sintetico Beta',
      Contrato: NO_BUCKETS_NUMERO,
      'Tipo de fila': SUMMARY_ROW,
      [TYPE_COLUMN]: TYPE_ORDINARY,
      'Horas contratadas': '0.0',
      'Horas consumidas': '0.0',
      'Horas reservadas': '0.0',
      'Horas disponibles': '0.0',
    }));
    expect(rows[1]).toEqual(expectedRow({
      Programa: 'Programa Sintetico Beta',
      Contrato: NO_BUCKETS_NUMERO,
      'Tipo de fila': 'Contrato sin categorías',
    }));
    expect(capturedCsv).not.toContain(SIBLING_SESSION_TITLE);
  });

  it('D2 offers no download and a clear es-CL empty state when the school has no programs', async () => {
    await renderReport({
      school_id: SCHOOL_ID,
      school_name: SCHOOL_NAME,
      programs: [],
      school_summary: { total_contracted_hours: 0, total_allocated: 0, total_reserved: 0, total_consumed: 0, total_available: 0 },
    });

    expect(screen.getByText('Esta escuela no tiene programas activos')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar Reporte PDF' })).not.toBeInTheDocument();
  });

  it('D2 offers no download and says so when the active program has no contracts', async () => {
    const report = makeReport();
    report.programs[0].contracts = [];
    await renderReport(report);

    expect(screen.getByText('Este programa no tiene contratos activos')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar Reporte PDF' })).not.toBeInTheDocument();
  });
});

// ============================================================
// D3 — failures and late responses never widen or stale the export
// ============================================================

describe('D3 failures and late responses', () => {
  it('D3 shows the API error and offers no download after an HTTP failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Error inesperado al obtener el reporte de horas' }),
    });
    render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);

    expect(await screen.findByText('Error al cargar el reporte')).toBeInTheDocument();
    expect(screen.getByText('Error inesperado al obtener el reporte de horas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar Reporte PDF' })).not.toBeInTheDocument();
  });

  it('D3 shows the network error and offers no download when fetch rejects', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'));
    render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);

    expect(await screen.findByText('Error de red al cargar el reporte.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).not.toBeInTheDocument();
  });

  it('D3 ignores a delayed old-school success, so no wrong-school download is possible', async () => {
    let resolveOld: (value: unknown) => void = () => {};
    const oldReport = makeReport('Escuela Antigua');
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveOld = () => resolve({ ok: true, status: 200, json: async () => ({ data: oldReport }) });
      })
    );

    const { rerender } = render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);

    const newReport = makeReport('Escuela Nueva');
    newReport.programs[0].contracts[0].numero_contrato = 'NUEVA-2026-001';
    newReport.programs[0].contracts[0].contrato_id = '99999999-9999-4999-8999-999999999999';
    mockFetchOnce({ data: newReport });
    rerender(<SchoolHoursReport schoolId={7} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1, name: 'Escuela Nueva' });

    // The first school's response lands only now.
    resolveOld(undefined);
    await flushBlob();

    expect(screen.getByRole('heading', { level: 1, name: 'Escuela Nueva' })).toBeInTheDocument();
    expect(screen.queryByText('Escuela Antigua')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Descargar Reporte PDF' }));
    expect(openedUrls).toEqual(['/api/school-hours-report/7/pdf?contrato_id=99999999-9999-4999-8999-999999999999']);
    const rows = csvRows(await downloadCsv(user));
    // Summary and details alike name the school now on screen; nothing stale is exportable.
    expect(rows[0]['Tipo de fila']).toBe(SUMMARY_ROW);
    expect(rows[0].Contrato).toBe('NUEVA-2026-001');
    expect(rows[0][TYPE_COLUMN]).toBe(TYPE_ORDINARY);
    expect(rows.every((r) => r.Contrato === 'NUEVA-2026-001')).toBe(true);
    expect(capturedCsv).not.toContain(PARENT_NUMERO);
    expect(rows.length).toBeGreaterThan(1);
  });

  it('D3 ignores a delayed old-school error, leaving the new school usable', async () => {
    let rejectOld: () => void = () => {};
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise((_resolve, reject) => {
        rejectOld = () => reject(new Error('old school offline'));
      })
    );
    const { rerender } = render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);

    mockFetchOnce({ data: makeReport('Escuela Nueva') });
    rerender(<SchoolHoursReport schoolId={7} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1, name: 'Escuela Nueva' });

    rejectOld();
    await flushBlob();

    expect(screen.queryByText('Error de red al cargar el reporte.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar CSV' })).toBeInTheDocument();
  });

  it('D3 reports a CSV exporter failure and never claims success', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    exportThrows = true;
    await user.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    await flushBlob();

    expect(mockToast.error).toHaveBeenCalledWith('No se pudo generar el CSV.');
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(capturedFilename).toBeNull();
  });
});

// ============================================================
// D4 — every transition keeps display, selector, CSV and PDF in agreement
// ============================================================

describe('D4 selection transitions', () => {
  it('D4 invalidates the old contract when the program changes', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    await user.selectOptions(screen.getByLabelText('Contrato:'), ANNEX_ID);
    await user.click(screen.getByRole('button', { name: 'Programa Sintetico Beta' }));

    // The new program's first contract is both shown and selected.
    expect(screen.getByRole('heading', { level: 3, name: SIBLING_NUMERO })).toBeInTheDocument();
    expect(screen.getByLabelText('Contrato:')).toHaveValue(SIBLING_ID);

    await user.click(screen.getByRole('button', { name: 'Descargar Reporte PDF' }));
    expect(openedUrls).toEqual([`/api/school-hours-report/${SCHOOL_ID}/pdf?contrato_id=${SIBLING_ID}`]);
    expect(capturedCsv).toBeNull();
    const rows = csvRows(await downloadCsv(user));
    expect(rows[0]).toEqual(expectedRow({
      Programa: 'Programa Sintetico Beta',
      Contrato: SIBLING_NUMERO,
      'Tipo de fila': SUMMARY_ROW,
      [TYPE_COLUMN]: TYPE_ORDINARY,
      'Horas contratadas': '20.0',
      'Horas consumidas': '1.5',
      'Horas reservadas': '0.0',
      'Horas disponibles': '18.5',
    }));
    expect(capturedCsv).not.toContain(ANNEX_NUMERO);
  });

  it('D4 falls back to a contract that still exists when refreshed data removes the selection', async () => {
    const user = userEvent.setup();
    mockFetchOnce({ data: makeReport() });
    const { rerender } = render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1 });

    await user.selectOptions(screen.getByLabelText('Contrato:'), ANNEX_ID);
    expect(screen.getByLabelText('Contrato:')).toHaveValue(ANNEX_ID);

    // Navigate away and back. The refreshed report for the same school no longer has the
    // annex, so the selector, the display and both exports must agree on what is left
    // instead of pointing at a contract that no longer exists.
    mockFetchOnce({ data: makeReport('Escuela Intermedia') });
    rerender(<SchoolHoursReport schoolId={7} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1, name: 'Escuela Intermedia' });

    const refreshed = makeReport();
    refreshed.programs[0].contracts = [refreshed.programs[0].contracts[0]];
    mockFetchOnce({ data: refreshed });
    rerender(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);
    await screen.findByRole('heading', { level: 3, name: PARENT_NUMERO });

    // Only one contract is left in this program, so the selector is not rendered at all.
    expect(screen.queryByLabelText('Contrato:')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Descargar Reporte PDF' }));
    expect(openedUrls).toEqual([`/api/school-hours-report/${SCHOOL_ID}/pdf?contrato_id=${PARENT_ID}`]);

    const rows = csvRows(await downloadCsv(user));
    expect(rows[0]['Tipo de fila']).toBe(SUMMARY_ROW);
    expect(rows[0].Contrato).toBe(PARENT_NUMERO);
    expect(rows[0][TYPE_COLUMN]).toBe(TYPE_ORDINARY);
    expect(rows[0]['Horas contratadas']).toBe('52.0');
    expect(capturedCsv).not.toContain(ANNEX_NUMERO);
  });

  it('D4 quotes and neutralizes an identity with commas, quotes, newlines and formula text', async () => {
    const user = userEvent.setup();
    const report = makeReport();
    report.programs[0].programa_name = 'Programa "Beta", con coma\ny salto';
    report.programs[0].contracts = [report.programs[0].contracts[0]];
    report.programs[0].contracts[0].numero_contrato = '=SUM(A1,A9)';
    await renderReport(report);

    const csv = await downloadCsv(user);
    // csvRows asserts seventeen cells per row through the quoting reader, so a newline or a
    // stray comma inside a cell cannot silently shift the summary or type columns.
    const rows = csvRows(csv);
    expect(rows).toHaveLength(5);
    // The exporter's existing protection is untouched: formula text keeps its apostrophe
    // and the whole cell is quoted.
    expect(csv).toContain('"\'=SUM(A1,A9)"');
    expect(rows[0]).toEqual(expectedRow({
      Programa: 'Programa "Beta", con coma\ny salto',
      Contrato: "'=SUM(A1,A9)",
      'Tipo de fila': SUMMARY_ROW,
      [TYPE_COLUMN]: TYPE_ORDINARY,
      'Horas contratadas': '52.0',
      'Horas consumidas': '4.3',
      'Horas reservadas': '2.0',
      'Horas disponibles': '-1.3',
    }));
    expect(rows[1]['Tipo de fila']).toBe('Sesión');
    expect(rows[1]['Horas contratadas']).toBe('');
    expect(rows[1][TYPE_COLUMN]).toBe('');
  });
});

// ============================================================
// D5 — the emitted artefacts and the on-screen text
// ============================================================

describe('D5 emitted CSV and selected-contract UI text', () => {
  it('D5 keeps the legacy CSV file name and the es-CL columns', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    const csv = await downloadCsv(user);
    expect(csvHeaderLine(csv)).toBe(CSV_HEADER);
    expect(csvHeaderLine(csv).split(',')).toHaveLength(17);
    // The file name is the pre-existing school/date one: naming the contract inside it
    // was outside this unit's scope, so contract identity lives in the cells instead.
    expect(capturedFilename).toMatch(
      new RegExp('^reporte-horas-Colegio_Sintetico_Los_Arrayanes-\\d{4}-\\d{2}-\\d{2}\\.csv$')
    );
    expect(capturedFilename).not.toContain(PARENT_NUMERO);
    // No raw identifiers, paths or query strings leak into the emitted cells.
    expect(csv).not.toContain(PARENT_ID);
    expect(csv).not.toContain(PROGRAMA_A);
    expect(csv).not.toContain('/api/');
  });

  it('D5 shows the selected contract, not a school-wide total, beside the download controls', async () => {
    await renderReport(makeReport());

    const selector = screen.getByLabelText('Contrato:');
    expect(selector).toHaveValue(PARENT_ID);
    expect(screen.getByRole('heading', { level: 3, name: PARENT_NUMERO })).toBeInTheDocument();

    const summary = screen.getByText('Contratadas:').closest('div.grid') as HTMLElement;
    // 52 h contracted for this contract, not the school's 82 h.
    expect(within(summary).getByText('52.0 h')).toBeInTheDocument();
    expect(within(summary).queryByText('82.0 h')).not.toBeInTheDocument();
    expect(screen.queryByText(SIBLING_SESSION_TITLE)).not.toBeInTheDocument();
  });

  it('D5 waits for a selection before opening any PDF', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());
    await user.click(screen.getByRole('button', { name: 'Descargar Reporte PDF' }));

    await waitFor(() => expect(openedUrls).toHaveLength(1));
    expect(openedUrls[0]).toContain('contrato_id=');
    expect(openedUrls[0].endsWith('/pdf')).toBe(false);
  });
});

// ============================================================
// SM-05 — the seventeenth column names the selected contract's type
// ============================================================

describe('SM-05 contract type column', () => {
  it('D1 labels the selected contract and leaves every detail row blank', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    // Parent first: an ordinary contract whose bucket receives +10 h from the annex.
    const parentRows = csvRows(await downloadCsv(user));
    expect(parentRows[0][TYPE_COLUMN]).toBe(TYPE_ORDINARY);
    expect(parentRows.slice(1).map((r) => r[TYPE_COLUMN])).toEqual(['', '', '', '']);

    // Same program, annex selected: only the summary carries the label, now `Anexo`.
    await user.selectOptions(screen.getByLabelText('Contrato:'), ANNEX_ID);
    const annexRows = csvRows(await downloadCsv(user));
    expect(annexRows[0][TYPE_COLUMN]).toBe(TYPE_ANNEX);
    expect(annexRows[1]['Tipo de fila']).toBe('Categoría sin sesiones');
    expect(annexRows[1][TYPE_COLUMN]).toBe('');

    // A sibling ordinary contract in the other program.
    await user.click(screen.getByRole('button', { name: 'Programa Sintetico Beta' }));
    const siblingRows = csvRows(await downloadCsv(user));
    expect(siblingRows[0][TYPE_COLUMN]).toBe(TYPE_ORDINARY);
    expect(siblingRows[1]['Tipo de fila']).toBe('Sesión');
    expect(siblingRows[1][TYPE_COLUMN]).toBe('');
  });

  it('D1 keeps the first sixteen cells identical to the pre-SM-05 file', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    const rows = parseCsv((await downloadCsv(user)) ?? '');
    expect(rows).toHaveLength(6); // header + summary + four sessions
    // Appending a column may not disturb what a reader already parses by position.
    expect(rows[0].slice(0, 16)).toEqual([
      'Programa', 'Contrato', 'Categoría', 'Fecha', 'Título', 'Consultor', 'Horas de sesión', 'Estado',
      'Sobre Presupuesto', 'Asistencia Esperada', 'Asistencia Real',
      'Tipo de fila', 'Horas contratadas', 'Horas consumidas', 'Horas reservadas', 'Horas disponibles',
    ]);
    expect(rows[0][16]).toBe(TYPE_COLUMN);
    expect(rows[1].slice(0, 16)).toEqual([
      'Programa Sintetico Alfa', PARENT_NUMERO, '', '', '', '', '', '', '', '', '',
      SUMMARY_ROW, '52.0', '4.3', '2.0', '-1.3',
    ]);
    expect(rows[2].slice(0, 16)).toEqual([
      'Programa Sintetico Alfa', PARENT_NUMERO, 'Asesoria Tecnica', '2026-04-15',
      'Sesion consumida', 'Consultora Sintetica', '3.00', 'consumida', 'No', '', '',
      'Sesión', '', '', '', '',
    ]);
    // Only the seventeenth cell is new, and only on the summary row.
    expect(rows.slice(1).map((cells) => cells[16])).toEqual([TYPE_ORDINARY, '', '', '', '']);
  });

  it('D2 labels an annex with no buckets at all, keeping its zeros and identifying row', async () => {
    const user = userEvent.setup();
    const report = makeReport();
    // The bucket-less contract in the other program is in fact an annex.
    report.programs[1].contracts[1].is_annexo = true;
    await renderReport(report);

    await user.click(screen.getByRole('button', { name: 'Programa Sintetico Beta' }));
    await user.selectOptions(screen.getByLabelText('Contrato:'), NO_BUCKETS_ID);

    const rows = csvRows(await downloadCsv(user));
    expect(rows).toHaveLength(2);
    // The label survives with no detail rows to carry it.
    expect(rows[0]).toEqual(expectedRow({
      Programa: 'Programa Sintetico Beta',
      Contrato: NO_BUCKETS_NUMERO,
      'Tipo de fila': SUMMARY_ROW,
      [TYPE_COLUMN]: TYPE_ANNEX,
      'Horas contratadas': '0.0',
      'Horas consumidas': '0.0',
      'Horas reservadas': '0.0',
      'Horas disponibles': '0.0',
    }));
    expect(rows[1]).toEqual(expectedRow({
      Programa: 'Programa Sintetico Beta',
      Contrato: NO_BUCKETS_NUMERO,
      'Tipo de fila': 'Contrato sin categorías',
    }));
  });

  it('D2 reads the flag, never the contract number or the bucket annex hours', async () => {
    const user = userEvent.setup();
    const report = makeReport();
    // Deliberately misleading identities: the ordinary contract is numbered like an annex
    // and receives annex hours, while the real annex has a plain sequential number.
    report.programs[0].contracts[0].numero_contrato = 'SIN-2026-009-A4';
    report.programs[0].contracts[1].numero_contrato = 'SIN-2026-010';
    // The real annex contributes nothing to its own bucket; the parent's shows +10 h.
    expect(report.programs[0].contracts[0].buckets[0].annex_hours).toBe(10);
    expect(report.programs[0].contracts[1].buckets[0].annex_hours).toBe(0);
    await renderReport(report);

    const parentRows = csvRows(await downloadCsv(user));
    expect(parentRows[0].Contrato).toBe('SIN-2026-009-A4');
    expect(parentRows[0][TYPE_COLUMN]).toBe(TYPE_ORDINARY);
    // Fractional and negative totals keep their one-decimal precision beside the new cell.
    expect(parentRows[0]['Horas consumidas']).toBe('4.3');
    expect(parentRows[0]['Horas disponibles']).toBe('-1.3');

    await user.selectOptions(screen.getByLabelText('Contrato:'), ANNEX_ID);
    const annexRows = csvRows(await downloadCsv(user));
    expect(annexRows[0].Contrato).toBe('SIN-2026-010');
    expect(annexRows[0][TYPE_COLUMN]).toBe(TYPE_ANNEX);
  });

  it('D3 relabels on every selection change and never emits a stale label', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    await user.selectOptions(screen.getByLabelText('Contrato:'), ANNEX_ID);
    expect(csvRows(await downloadCsv(user))[0][TYPE_COLUMN]).toBe(TYPE_ANNEX);

    // Back to the parent in the same program.
    await user.selectOptions(screen.getByLabelText('Contrato:'), PARENT_ID);
    expect(csvRows(await downloadCsv(user))[0][TYPE_COLUMN]).toBe(TYPE_ORDINARY);

    // And on to the other program, whose first contract is selected for us.
    await user.click(screen.getByRole('button', { name: 'Programa Sintetico Beta' }));
    const rows = csvRows(await downloadCsv(user));
    expect(rows[0].Contrato).toBe(SIBLING_NUMERO);
    expect(rows[0][TYPE_COLUMN]).toBe(TYPE_ORDINARY);
    expect(capturedCsv).not.toContain(ANNEX_NUMERO);
  });

  it('D4 emits no labelled file when the export throws, and quotes nothing it need not', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    exportThrows = true;
    await user.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    await flushBlob();
    expect(capturedBlob).toBeNull();
    expect(mockToast.error).toHaveBeenCalledWith('No se pudo generar el CSV.');
    expect(mockToast.success).not.toHaveBeenCalled();

    // The next successful export carries the exact es-CL labels, needing no quoting.
    exportThrows = false;
    const csv = await downloadCsv(user);
    expect(csvHeaderLine(csv)).toBe(CSV_HEADER);
    expect(csvHeaderLine(csv).endsWith(`,${TYPE_COLUMN}`)).toBe(true);
    const summary = csvRows(csv)[0];
    expect(summary[TYPE_COLUMN]).toBe(TYPE_ORDINARY);
    expect((csv ?? '').split('\n')[1].endsWith(`,${TYPE_ORDINARY}`)).toBe(true);
    expect(mockToast.success).toHaveBeenCalledWith('CSV descargado correctamente');
  });
});

// ============================================================
// SM-06 — the seventh column names the session measure
// ============================================================

const SESSION_HOURS_COLUMN = 'Horas de sesión';

/** The seventh heading before SM-06, which no longer belongs in the emitted file. */
const LEGACY_SESSION_HOURS_COLUMN = 'Horas';

describe('SM-06 session-hours heading', () => {
  it('D1 names the seventh column Horas de sesión and leaves the other sixteen alone', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    const header = csvHeaderLine(await downloadCsv(user)).split(',');
    expect(header).toHaveLength(17);
    expect(header[6]).toBe(SESSION_HOURS_COLUMN);
    expect(header).not.toContain(LEGACY_SESSION_HOURS_COLUMN);
    // Every other heading, and every heading's position, is the pre-SM-06 one.
    expect(header.filter((_, i) => i !== 6)).toEqual(
      [...CSV_COLUMNS].filter((_, i) => i !== 6)
    );

    // The same heading on the annex and on the other program's contract.
    await user.selectOptions(screen.getByLabelText('Contrato:'), ANNEX_ID);
    expect(csvHeaderLine(await downloadCsv(user)).split(',')[6]).toBe(SESSION_HOURS_COLUMN);
    expect(csvRows(capturedCsv)[0][TYPE_COLUMN]).toBe(TYPE_ANNEX);

    await user.click(screen.getByRole('button', { name: 'Programa Sintetico Beta' }));
    expect(csvHeaderLine(await downloadCsv(user)).split(',')[6]).toBe(SESSION_HOURS_COLUMN);
  });

  it('D2 keeps every session value, including 0.00, under the renamed key', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    const rows = csvRows(await downloadCsv(user));
    // Consumed, reserved, the fractional §11 override and the zero waiver, cell for cell.
    expect(rows.slice(1).map((r) => r[SESSION_HOURS_COLUMN])).toEqual(['3.00', '2.00', '1.25', '0.00']);
    // The summary states the contract's four totals at one decimal and no session hours,
    // and those totals are still not the sum of the rows below them (4.25 h vs 6.25 h).
    expect(rows[0][SESSION_HOURS_COLUMN]).toBe('');
    expect([
      rows[0]['Horas contratadas'], rows[0]['Horas consumidas'],
      rows[0]['Horas reservadas'], rows[0]['Horas disponibles'],
    ]).toEqual(['52.0', '4.3', '2.0', '-1.3']);
    expect(rows.slice(1).reduce((sum, r) => sum + Number(r[SESSION_HOURS_COLUMN]), 0)).toBeCloseTo(6.25, 5);

    // A contract with no categories at all leaves the renamed cell blank, not absent.
    await user.click(screen.getByRole('button', { name: 'Programa Sintetico Beta' }));
    await user.selectOptions(screen.getByLabelText('Contrato:'), NO_BUCKETS_ID);
    const emptyRows = csvRows(await downloadCsv(user));
    expect(emptyRows.map((r) => r[SESSION_HOURS_COLUMN])).toEqual(['', '']);
  });

  it('D3 never blanks a session value through the old key, and offers no stale download', async () => {
    const user = userEvent.setup();
    mockFetchOnce({ data: makeReport() });
    const { rerender } = render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1 });

    // Had the header moved on without the row keys, the cells would silently go blank.
    const rows = csvRows(await downloadCsv(user));
    const details = rows.filter((r) => r['Tipo de fila'] === 'Sesión');
    expect(details).toHaveLength(4);
    expect(details.every((r) => r[SESSION_HOURS_COLUMN] !== '')).toBe(true);
    expect(details.every((r) => !(LEGACY_SESSION_HOURS_COLUMN in r))).toBe(true);

    // A school change re-keys the rows too: the new school's sessions carry their own
    // values, and none of the first school's rows remain exportable.
    const newReport = makeReport('Escuela Nueva');
    newReport.programs[0].contracts[0].numero_contrato = 'NUEVA-2026-001';
    mockFetchOnce({ data: newReport });
    rerender(<SchoolHoursReport schoolId={7} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1, name: 'Escuela Nueva' });

    const freshDetails = csvRows(await downloadCsv(user)).filter((r) => r['Tipo de fila'] === 'Sesión');
    expect(freshDetails.map((r) => r[SESSION_HOURS_COLUMN])).toEqual(['3.00', '2.00', '1.25', '0.00']);
    expect(capturedCsv).not.toContain(PARENT_NUMERO);
  });

  it('D4 emits the accented heading exactly once and still quotes a hostile identity', async () => {
    const user = userEvent.setup();
    const report = makeReport();
    report.programs[0].programa_name = 'Programa "Alfa", =1+1';
    await renderReport(report);

    // No file and no success claim when the exporter throws.
    exportThrows = true;
    await user.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    await flushBlob();
    expect(capturedBlob).toBeNull();
    expect(mockToast.success).not.toHaveBeenCalled();

    exportThrows = false;
    const csv = await downloadCsv(user);
    // The heading is written once, in the header line, and never as a data cell.
    expect((csv ?? '').split(SESSION_HOURS_COLUMN)).toHaveLength(2);
    expect(csvHeaderLine(csv)).toBe(CSV_HEADER);
    const rows = parseCsv(csv ?? '');
    expect(rows.every((cells) => cells.length === 17)).toBe(true);
    expect(rows[2][6]).toBe('3.00');
    expect(mockToast.success).toHaveBeenCalledWith('CSV descargado correctamente');
  });

  it('D5 leaves the on-screen heading, the file name and the PDF target untouched', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    // The drill-down table on screen still says Horas; only the CSV column was renamed.
    await user.click(screen.getAllByRole('button', { name: /Ver Detalle/ })[0]);
    expect(screen.getByRole('columnheader', { name: LEGACY_SESSION_HOURS_COLUMN })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: SESSION_HOURS_COLUMN })).not.toBeInTheDocument();

    const csv = await downloadCsv(user);
    expect(csvHeaderLine(csv).split(',')[6]).toBe(SESSION_HOURS_COLUMN);
    expect(capturedFilename).toMatch(
      new RegExp('^reporte-horas-Colegio_Sintetico_Los_Arrayanes-\\d{4}-\\d{2}-\\d{2}\\.csv$')
    );

    await user.click(screen.getByRole('button', { name: 'Descargar Reporte PDF' }));
    await waitFor(() => expect(openedUrls).toHaveLength(1));
    expect(openedUrls[0]).toBe(`/api/school-hours-report/${SCHOOL_ID}/pdf?contrato_id=${PARENT_ID}`);
  });
});

// ============================================================
// SM-07 / A14-4-F04 — sessions with no hours record
//
// A session the service could not find a `contract_hours_ledger` row for arrives as the
// report-only status `sin_registro`. On screen it gets a neutral badge and a caption
// naming where its number came from; in the CSV its `Estado` cell says both things in
// full. The four recorded statuses, the seventeen columns and every number are untouched.
// ============================================================

const SIN_REGISTRO_BADGE = 'Sin registro de horas';
const SIN_REGISTRO_CAPTION = 'Horas programadas';
const SIN_REGISTRO_CELL = 'Sin registro de horas (horas programadas)';

/** A very long title, to prove the status cell is not what truncates a row. */
const LONG_TITLE = 'Sesión de acompañamiento directivo con equipo ampliado y apoderados invitados';

/**
 * The parent contract with three unledgered sessions appended: a cancellation the old
 * fallback called `penalizada`, a finished session it called `consumida`, and a draft it
 * called `reservada`. Their hours are scheduled estimates, and the contract's own totals
 * deliberately stay at the pre-existing 4.25 h / 2 h, which no estimate may move.
 */
function makeReportWithUnrecorded(): SchoolReportData {
  const report = makeReport();
  const bucket = report.programs[0].contracts[0].buckets[0];
  bucket.sessions.push(
    {
      session_id: 's0000000-0000-4000-8000-00000000000a',
      title: 'Sesion cancelada sin registro',
      date: '2026-08-01',
      consultant_name: 'Consultora Sintetica',
      hours: 1.5,
      status: 'sin_registro',
      is_over_budget: false,
      attendance: null,
    },
    {
      session_id: 's0000000-0000-4000-8000-00000000000b',
      title: LONG_TITLE,
      date: '2026-08-02',
      consultant_name: 'Consultor Sintetico',
      hours: 2,
      status: 'sin_registro',
      is_over_budget: false,
      attendance: null,
    },
    {
      // No schedule at all: the pre-existing 0 fallback, which must not read as a waiver.
      session_id: 's0000000-0000-4000-8000-00000000000c',
      title: 'Sesion borrador sin horario',
      date: '2026-08-03',
      consultant_name: 'Consultora Sintetica',
      hours: 0,
      status: 'sin_registro',
      is_over_budget: false,
      attendance: null,
    }
  );
  return report;
}

const expandFirstBucket = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getAllByRole('button', { name: /Ver Detalle/ })[0]);
};

describe('SM-07 unrecorded session hours', () => {
  it('D1 badges every unrecorded row on screen and captions its number as scheduled', async () => {
    const user = userEvent.setup();
    await renderReport(makeReportWithUnrecorded());
    await expandFirstBucket(user);

    // One badge and one caption per unrecorded row, and none for the four recorded ones.
    expect(screen.getAllByText(SIN_REGISTRO_BADGE)).toHaveLength(3);
    expect(screen.getAllByText(SIN_REGISTRO_CAPTION)).toHaveLength(3);

    // The caption sits in the same row as the badge, beside that row's own number.
    const row = screen.getByText('Sesion cancelada sin registro').closest('tr') as HTMLElement;
    expect(within(row).getByText(SIN_REGISTRO_BADGE)).toBeInTheDocument();
    expect(within(row).getByText(SIN_REGISTRO_CAPTION)).toBeInTheDocument();
    expect(within(row).getByText('1.50')).toBeInTheDocument();
    // Never presented as a penalty, a consumption or a reservation anyone recorded.
    expect(within(row).queryByText('Penalizada')).not.toBeInTheDocument();
    expect(within(row).queryByText('Sobre presupuesto')).not.toBeInTheDocument();

    // The four recorded rows keep their own badges, unchanged.
    for (const label of ['Consumida', 'Reservada', 'Penalizada', 'Devuelta']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('D1/D4 writes the exact Estado cell for unrecorded rows and leaves the recorded four alone', async () => {
    const user = userEvent.setup();
    await renderReport(makeReportWithUnrecorded());

    const csv = await downloadCsv(user);
    // The file shape does not move: same header line, same seventeen columns.
    expect(csvHeaderLine(csv)).toBe(CSV_HEADER);
    const rows = csvRows(csv);
    expect(rows).toHaveLength(8); // summary + four recorded + three unrecorded

    expect(rows.slice(1, 5).map((r) => r.Estado)).toEqual([
      'consumida', 'reservada', 'penalizada', 'devuelta',
    ]);
    expect(rows.slice(5).map((r) => r.Estado)).toEqual([
      SIN_REGISTRO_CELL, SIN_REGISTRO_CELL, SIN_REGISTRO_CELL,
    ]);
    // The report-only key itself never reaches the file.
    expect(csv).not.toContain('sin_registro');

    // Numeric hours keep two decimals, including the 0.00 no-schedule fallback, and the
    // remaining sixteen cells of an unrecorded row are exactly what a recorded row has.
    expect(rows.slice(5).map((r) => r['Horas de sesión'])).toEqual(['1.50', '2.00', '0.00']);
    expect(rows[5]).toEqual(expectedRow({
      Programa: 'Programa Sintetico Alfa',
      Contrato: PARENT_NUMERO,
      'Categoría': 'Asesoria Tecnica',
      Fecha: '2026-08-01',
      'Título': 'Sesion cancelada sin registro',
      Consultor: 'Consultora Sintetica',
      'Horas de sesión': '1.50',
      Estado: SIN_REGISTRO_CELL,
      'Sobre Presupuesto': 'No',
      'Tipo de fila': 'Sesión',
    }));
  });

  it('D2 keeps the contract totals free of the scheduled estimates, on screen and in the file', async () => {
    const user = userEvent.setup();
    await renderReport(makeReportWithUnrecorded());

    const rows = csvRows(await downloadCsv(user));
    // Unchanged by the three added rows: the contract's own recorded figures.
    expect(rows[0]).toEqual(expectedRow({
      Programa: 'Programa Sintetico Alfa',
      Contrato: PARENT_NUMERO,
      'Tipo de fila': SUMMARY_ROW,
      [TYPE_COLUMN]: TYPE_ORDINARY,
      'Horas contratadas': '52.0',
      'Horas consumidas': '4.3',
      'Horas reservadas': '2.0',
      'Horas disponibles': '-1.3',
    }));
    // The session column now sums to 9.75 h while consumed stays 4.3 — the summary is not
    // a sum of the rows, and an estimate can never become a charge by being added up.
    expect(rows.slice(1).reduce((sum, r) => sum + Number(r['Horas de sesión']), 0)).toBeCloseTo(9.75, 5);
    expect(screen.getByText('4.3 h')).toBeInTheDocument();
  });

  it('D2/UI2 keeps an unrecorded 0.00 distinguishable from a recorded zero waiver', async () => {
    const user = userEvent.setup();
    await renderReport(makeReportWithUnrecorded());
    await expandFirstBucket(user);

    const waiver = screen.getByText('Sesion devuelta eximida').closest('tr') as HTMLElement;
    const unrecorded = screen.getByText('Sesion borrador sin horario').closest('tr') as HTMLElement;

    // Both show 0.00 hours; only their status text tells them apart, so it has to.
    expect(within(waiver).getByText('0.00')).toBeInTheDocument();
    expect(within(unrecorded).getByText('0.00')).toBeInTheDocument();
    expect(within(waiver).getByText('Devuelta')).toBeInTheDocument();
    expect(within(waiver).queryByText(SIN_REGISTRO_CAPTION)).not.toBeInTheDocument();
    expect(within(unrecorded).getByText(SIN_REGISTRO_BADGE)).toBeInTheDocument();
    expect(within(unrecorded).queryByText('Devuelta')).not.toBeInTheDocument();
  });

  it('D4 renders the badge as wrapping text, never clipped or truncated', async () => {
    const user = userEvent.setup();
    await renderReport(makeReportWithUnrecorded());
    await expandFirstBucket(user);

    // The long title keeps the component's pre-existing truncation; the status beside it
    // does not borrow it, so the label is readable in full at any width.
    const row = screen.getByText(LONG_TITLE).closest('tr') as HTMLElement;
    const badge = within(row).getByText(SIN_REGISTRO_BADGE);
    expect(badge.className).not.toMatch(/truncate|whitespace-nowrap|overflow-hidden/);
    expect(badge.textContent).toBe(SIN_REGISTRO_BADGE);
    // Its container is the pre-existing wrapping flex row, so a narrow column wraps it.
    expect((badge.parentElement as HTMLElement).className).toMatch(/flex-wrap/);
  });

  it('D3/D4 shows no badge, no caption and no file when the report itself failed', async () => {
    mockFetchOnce({ error: 'boom' }, { ok: false, status: 500 });
    render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);
    await screen.findByText(/Error/);

    // A failed read is never dressed up as a proven absence.
    expect(screen.queryByText(SIN_REGISTRO_BADGE)).not.toBeInTheDocument();
    expect(screen.queryByText(SIN_REGISTRO_CAPTION)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar CSV' })).not.toBeInTheDocument();
    expect(capturedBlob).toBeNull();
  });
});

// ============================================================
// SM-08 / A14-4-F05 — a category whose session list stops at 500 says so
// ============================================================

/** The exact notice, pinned here as a literal so a reworded constant fails this suite. */
const PARTIAL_NOTICE =
  'Detalle parcial: se muestran las 500 sesiones más recientes de esta categoría. ' +
  'Hay sesiones anteriores no incluidas. Los totales de horas corresponden al registro ' +
  'completo, no solo a estas filas.';
const PARTIAL_ROW = 'Aviso de detalle parcial';
const NOTICE_TESTID = 'bucket-partial-detail-notice';

/** A category name carrying a comma, a quote and accents — the file must survive all three. */
const AWKWARD_CATEGORY = 'Acompañamiento "intensivo", nivel 2';

/**
 * The parent contract with two categories: the first one truncated, the second complete.
 * Nothing about the four totals moves — they cover the whole record either way.
 */
function makeReportWithTruncatedBucket(categoryName = 'Asesoria Tecnica'): SchoolReportData {
  const report = makeReport();
  const parent = report.programs[0].contracts[0];
  parent.buckets[0].display_name = categoryName;
  parent.buckets[0].sessions_truncated = true;
  parent.buckets.push({
    hour_type_key: 'talleres_presenciales',
    display_name: 'Talleres Presenciales',
    allocated: 12,
    reserved: 0,
    consumed: 2,
    available: 10,
    is_fixed: false,
    annex_hours: 0,
    sessions_truncated: false,
    sessions: [
      {
        session_id: 's0000000-0000-4000-8000-00000000000d',
        title: 'Taller completo uno',
        date: '2026-09-01',
        consultant_name: 'Tallerista Sintetica',
        hours: 1,
        status: 'consumida',
        is_over_budget: false,
        attendance: null,
      },
      {
        session_id: 's0000000-0000-4000-8000-00000000000e',
        title: 'Taller completo dos',
        date: '2026-09-02',
        consultant_name: 'Tallerista Sintetica',
        hours: 1,
        status: 'consumida',
        is_over_budget: false,
        attendance: null,
      },
    ],
  });
  return report;
}

describe('SM-08 partial session detail', () => {
  it('UI1 shows the notice on the truncated category while the detail is collapsed', async () => {
    await renderReport(makeReportWithTruncatedBucket());

    // No row of the table is on screen yet — this is the reader who never expands, and
    // the one who would otherwise take the 500 rows for the whole record.
    expect(screen.queryByText('Sesion consumida')).not.toBeInTheDocument();

    const notices = screen.getAllByTestId(NOTICE_TESTID);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toHaveTextContent(PARTIAL_NOTICE);

    // On the truncated card, and not on the complete one beside it.
    const card = notices[0].closest('div.bg-white') as HTMLElement;
    expect(within(card).getByText('Asesoria Tecnica')).toBeInTheDocument();
    expect(within(card).queryByText('Talleres Presenciales')).not.toBeInTheDocument();
  });

  it('UI1 keeps the notice and the existing session count once the detail is expanded', async () => {
    const user = userEvent.setup();
    await renderReport(makeReportWithTruncatedBucket());
    await expandFirstBucket(user);

    expect(screen.getAllByTestId(NOTICE_TESTID)).toHaveLength(1);
    // The button still counts the rows it actually shows; the notice is not a session.
    expect(screen.getByRole('button', { name: /Ver Detalle \(4 sesiones\)|Ocultar \(4 sesiones\)/ }))
      .toBeInTheDocument();
    expect(screen.getByText('Sesion consumida')).toBeInTheDocument();
  });

  it('UI1/D5 shows no notice at all when every category is complete', async () => {
    const user = userEvent.setup();
    await renderReport(makeReport());

    expect(screen.queryByTestId(NOTICE_TESTID)).not.toBeInTheDocument();
    const rows = csvRows(await downloadCsv(user));
    expect(rows.some((r) => r['Tipo de fila'] === PARTIAL_ROW)).toBe(false);
    expect(rows).toHaveLength(5);
  });

  it('D4 writes exactly one notice row ahead of the truncated category, every other cell blank', async () => {
    const user = userEvent.setup();
    await renderReport(makeReportWithTruncatedBucket());

    const csv = await downloadCsv(user);
    // The file shape does not move: same header line, same seventeen columns.
    expect(csvHeaderLine(csv)).toBe(CSV_HEADER);
    const rows = csvRows(csv);
    // summary + notice + the truncated category's four sessions + the complete two.
    expect(rows).toHaveLength(8);
    expect(rows[0]['Tipo de fila']).toBe(SUMMARY_ROW);

    expect(rows.filter((r) => r['Tipo de fila'] === PARTIAL_ROW)).toHaveLength(1);
    expect(rows[1]).toEqual(expectedRow({
      Programa: 'Programa Sintetico Alfa',
      Contrato: PARENT_NUMERO,
      'Categoría': 'Asesoria Tecnica',
      'Título': PARTIAL_NOTICE,
      'Tipo de fila': PARTIAL_ROW,
    }));
    // It sits immediately before the rows it qualifies, and is never one of them.
    expect(rows[2]['Título']).toBe('Sesion consumida');
    expect(rows.filter((r) => r['Tipo de fila'] === 'Sesión')).toHaveLength(6);

    // No hour, status or total cell anywhere on it — nothing a spreadsheet can add up.
    for (const column of ['Horas de sesión', 'Estado', 'Sobre Presupuesto', 'Fecha',
      'Horas contratadas', 'Horas consumidas', 'Horas reservadas', 'Horas disponibles',
      TYPE_COLUMN] as const) {
      expect(rows[1][column]).toBe('');
    }
  });

  it('D4 adds no notice row for the complete category in the same file', async () => {
    const user = userEvent.setup();
    await renderReport(makeReportWithTruncatedBucket());

    const rows = csvRows(await downloadCsv(user));
    const talleres = rows.filter((r) => r['Categoría'] === 'Talleres Presenciales');
    expect(talleres).toHaveLength(2);
    expect(talleres.every((r) => r['Tipo de fila'] === 'Sesión')).toBe(true);
  });

  it('D4 keeps a comma, a quote and accents in the notice row readable as cells', async () => {
    const user = userEvent.setup();
    await renderReport(makeReportWithTruncatedBucket(AWKWARD_CATEGORY));

    const rows = csvRows(await downloadCsv(user));
    expect(rows[1]['Categoría']).toBe(AWKWARD_CATEGORY);
    expect(rows[1]['Título']).toBe(PARTIAL_NOTICE);
    // Read back through the quoting-aware reader, the table is still rectangular above.
    expect(rows[2]['Categoría']).toBe(AWKWARD_CATEGORY);
  });

  it('D5/UI2 drops the notice when the reader switches to a complete contract', async () => {
    const user = userEvent.setup();
    await renderReport(makeReportWithTruncatedBucket());
    expect(screen.getAllByTestId(NOTICE_TESTID)).toHaveLength(1);

    await user.selectOptions(screen.getByLabelText('Contrato:'), ANNEX_ID);
    expect(screen.queryByTestId(NOTICE_TESTID)).not.toBeInTheDocument();

    // And the annex's own export carries no notice row either.
    const rows = csvRows(await downloadCsv(user));
    expect(rows.some((r) => r['Tipo de fila'] === PARTIAL_ROW)).toBe(false);
    expect(rows[0].Contrato).toBe(ANNEX_NUMERO);
  });

  it('D5 shows no notice and emits no file when the report itself failed', async () => {
    mockFetchOnce({ error: 'boom' }, { ok: false, status: 500 });
    render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);
    await screen.findByText(/Error/);

    expect(screen.queryByTestId(NOTICE_TESTID)).not.toBeInTheDocument();
    expect(screen.queryByText(PARTIAL_NOTICE)).not.toBeInTheDocument();
    expect(capturedBlob).toBeNull();
  });
});

// ============================================================
// SM-09 — only the newest request may decide what is shown and what downloads
// ============================================================

/** A UUID-shaped id whose head is the generation tag, so a leaked id names its origin. */
function taggedUuid(tag: string, n: number) {
  const head = `${tag}000000`.slice(0, 8);
  const d = String(n).repeat(4);
  return `${head}-${d}-4${d.slice(0, 3)}-8${d.slice(0, 3)}-${head}${head.slice(0, 4)}`;
}

/**
 * A report whose every visible marker carries `tag`: school, program, contract number and
 * id, session title and the four totals. Two generations of the SAME school get different
 * tags, so a stale one that wins shows up in the heading, the selector, the CSV and the
 * PDF target alike — being "the school we are on" cannot disguise it.
 */
function markedReport(tag: string, base: number): SchoolReportData {
  const report = makeReport(`Escuela ${tag}`);
  report.programs.forEach((prog, pi) => {
    prog.programa_id = taggedUuid(tag, pi + 1);
    prog.programa_name = `Programa ${tag}${pi + 1}`;
    prog.contracts.forEach((contract, ci) => {
      const hours = base + pi * 10 + ci;
      contract.contrato_id = taggedUuid(tag, (pi + 1) * 4 + ci);
      contract.numero_contrato = `${tag}-2026-${hours}`;
      contract.total_contracted_hours = hours;
      contract.total_consumed = hours / 4;
      contract.total_reserved = 0;
      contract.total_available = hours - hours / 4;
      contract.buckets.forEach((bucket) => {
        bucket.sessions.forEach((session, si) => {
          session.title = `Sesion ${tag}${pi}${ci}${si}`;
        });
      });
    });
  });
  return report;
}

/** Every string of a generation that must never surface once that generation is stale. */
function markersOf(report: SchoolReportData): string[] {
  const out = [String(report.school_name)];
  for (const prog of report.programs) {
    out.push(prog.programa_name);
    for (const contract of prog.contracts) {
      out.push(contract.numero_contrato, contract.contrato_id);
      for (const bucket of contract.buckets) {
        for (const session of bucket.sessions) {
          out.push(session.title);
        }
      }
    }
  }
  return out;
}

function expectNoMarkers(haystack: string | null, report: SchoolReportData) {
  for (const marker of markersOf(report)) {
    expect(haystack ?? '').not.toContain(marker);
  }
}

/** `resolveHttp` lands the response; its JSON body stays in flight until `resolveBody`. */
type DeferredResponse = {
  resolveHttp: (init?: { ok?: boolean; status?: number }) => void;
  resolveBody: (body: unknown) => void;
  rejectBody: (error: unknown) => void;
};

/**
 * Queues one fetch whose two stages — the HTTP response and its JSON body — are released
 * by hand, so the completion orders below are exact rather than raced and a response can
 * be held open across a school change.
 */
function queueDeferredResponse(): DeferredResponse {
  let settleHttp: (value: unknown) => void = () => {};
  const http = new Promise((resolve) => { settleHttp = resolve; });
  let settleBody: (value: unknown) => void = () => {};
  let failBody: (error: unknown) => void = () => {};
  const body = new Promise((resolve, reject) => { settleBody = resolve; failBody = reject; });
  // The component consumes the rejection; this only keeps it from being reported unhandled.
  body.catch(() => {});
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(() => http);
  return {
    resolveHttp: (init = {}) => settleHttp({ ok: init.ok ?? true, status: init.status ?? 200, json: () => body }),
    resolveBody: settleBody,
    rejectBody: failBody,
  };
}

const CSV_BUTTON = 'Descargar CSV';
const PDF_BUTTON = 'Descargar Reporte PDF';
const ERROR_TITLE = 'Error al cargar el reporte';
const NETWORK_ERROR = 'Error de red al cargar el reporte.';
const EMPTY_STATE = 'Esta escuela no tiene programas activos';

const pdfUrl = (schoolId: number, contratoId: string) =>
  `/api/school-hours-report/${schoolId}/pdf?contrato_id=${contratoId}`;

describe('SM-09 D1 overlapping school switches', () => {
  it('D1 lets only the newest generation set report, selection and loading when A→B→A overlap', async () => {
    const user = userEvent.setup();
    const a1 = markedReport('a1', 100);
    const b0 = markedReport('b0', 200);
    const a2 = markedReport('a2', 300);

    // A1's HTTP response lands immediately; its JSON body stays in flight, so the request
    // is still running when the reader leaves and comes back to the same school.
    const first = queueDeferredResponse();
    const { rerender } = render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);
    first.resolveHttp();
    await flushBlob();

    const second = queueDeferredResponse();
    rerender(<SchoolHoursReport schoolId={7} isAdmin={false} />);

    const third = queueDeferredResponse();
    rerender(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);
    third.resolveHttp();
    third.resolveBody({ data: a2 });
    await screen.findByRole('heading', { level: 1, name: String(a2.school_name) });

    // Adversarial order: both stale generations finish last, A1 last of all and for the
    // school currently on screen.
    second.resolveHttp();
    second.resolveBody({ data: b0 });
    first.resolveBody({ data: a1 });
    await flushBlob();

    const parent = a2.programs[0].contracts[0];
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(String(a2.school_name));
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(parent.numero_contrato);
    expect(screen.getByLabelText('Contrato:')).toHaveValue(parent.contrato_id);

    await user.click(screen.getByRole('button', { name: PDF_BUTTON }));
    expect(openedUrls).toEqual([pdfUrl(SCHOOL_ID, parent.contrato_id)]);

    const rows = csvRows(await downloadCsv(user));
    expect(rows[0]['Tipo de fila']).toBe(SUMMARY_ROW);
    expect(rows[0]['Horas contratadas']).toBe(parent.total_contracted_hours.toFixed(1));
    expect(rows.every((r) => r.Contrato === parent.numero_contrato)).toBe(true);
    expectNoMarkers(capturedCsv, a1);
    expectNoMarkers(capturedCsv, b0);
    expectNoMarkers(document.body.textContent, a1);
    expectNoMarkers(document.body.textContent, b0);
  });

  it('D1 drops the annex and the program the reader had chosen when the school changes', async () => {
    const user = userEvent.setup();
    const a1 = markedReport('a1', 100);
    const b0 = markedReport('b0', 200);

    mockFetchOnce({ data: a1 });
    const { rerender } = render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1, name: String(a1.school_name) });

    // Both selections moved off their defaults before the switch.
    const annex = a1.programs[0].contracts[1];
    await user.selectOptions(screen.getByLabelText('Contrato:'), annex.contrato_id);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(annex.numero_contrato);
    await user.click(screen.getByRole('button', { name: a1.programs[1].programa_name }));
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(a1.programs[1].contracts[0].numero_contrato);

    mockFetchOnce({ data: b0 });
    rerender(<SchoolHoursReport schoolId={7} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1, name: String(b0.school_name) });

    const fresh = b0.programs[0].contracts[0];
    expect(screen.getByLabelText('Contrato:')).toHaveValue(fresh.contrato_id);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(fresh.numero_contrato);

    const rows = csvRows(await downloadCsv(user));
    expect(rows[0].Programa).toBe(b0.programs[0].programa_name);
    expect(rows[0].Contrato).toBe(fresh.numero_contrato);
    expect(rows[0][TYPE_COLUMN]).toBe(TYPE_ORDINARY);
    expectNoMarkers(capturedCsv, a1);
  });
});

describe('SM-09 D2 stale completion matrix', () => {
  it('D2 keeps the skeleton when a stale success lands while the newest request is loading', async () => {
    const a1 = markedReport('a1', 100);
    const b0 = markedReport('b0', 200);

    const first = queueDeferredResponse();
    const { container, rerender } = render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);
    first.resolveHttp();
    await flushBlob();

    const second = queueDeferredResponse();
    rerender(<SchoolHoursReport schoolId={7} isAdmin={false} />);

    first.resolveBody({ data: a1 });
    await flushBlob();

    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CSV_BUTTON })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: PDF_BUTTON })).not.toBeInTheDocument();
    expectNoMarkers(document.body.textContent, a1);

    // The newest request still finishes normally afterwards.
    second.resolveHttp();
    second.resolveBody({ data: b0 });
    await screen.findByRole('heading', { level: 1, name: String(b0.school_name) });
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });

  it('D2 keeps the newest report when a stale failure lands after it', async () => {
    // Two ways an abandoned request can fail late: an HTTP refusal, and a 200 whose body
    // is an HTML error page where JSON was promised.
    const failures: [string, (stale: DeferredResponse) => void][] = [
      ['403', (stale) => {
        stale.resolveHttp({ ok: false, status: 403 });
        stale.resolveBody({ error: 'No tiene permisos para ver el reporte de esta escuela' });
      }],
      ['non-JSON', (stale) => {
        stale.resolveHttp();
        stale.rejectBody(new SyntaxError('Unexpected token < in JSON at position 0'));
      }],
    ];
    for (const [, failStale] of failures) {
      const user = userEvent.setup();
      const a1 = markedReport('a1', 100);
      const b0 = markedReport('b0', 200);
      const stale = queueDeferredResponse();
      const { rerender } = render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);

      mockFetchOnce({ data: b0 });
      rerender(<SchoolHoursReport schoolId={7} isAdmin={false} />);
      await screen.findByRole('heading', { level: 1, name: String(b0.school_name) });

      failStale(stale);
      await flushBlob();

      expect(screen.queryByText(ERROR_TITLE)).not.toBeInTheDocument();
      expect(screen.queryByText(NETWORK_ERROR)).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(String(b0.school_name));

      const fresh = b0.programs[0].contracts[0];
      openedUrls = [];
      capturedBlob = null;
      await user.click(screen.getByRole('button', { name: PDF_BUTTON }));
      expect(openedUrls).toEqual([pdfUrl(7, fresh.contrato_id)]);
      expect(csvRows(await downloadCsv(user)).every((r) => r.Contrato === fresh.numero_contrato)).toBe(true);
      expectNoMarkers(capturedCsv, a1);
      cleanup();
    }
  });

  it('D2 keeps the newest error on screen when a stale success lands after it', async () => {
    const a1 = markedReport('a1', 100);

    const first = queueDeferredResponse();
    const { rerender } = render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Error inesperado al obtener el reporte de horas' }),
    });
    rerender(<SchoolHoursReport schoolId={7} isAdmin={false} />);
    await screen.findByText('Error inesperado al obtener el reporte de horas');

    first.resolveHttp();
    first.resolveBody({ data: a1 });
    await flushBlob();

    expect(screen.getByText(ERROR_TITLE)).toBeInTheDocument();
    expect(screen.getByText('Error inesperado al obtener el reporte de horas')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CSV_BUTTON })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: PDF_BUTTON })).not.toBeInTheDocument();
    expectNoMarkers(document.body.textContent, a1);
    expect(capturedCsv).toBeNull();
  });
});

describe('SM-09 D3 newest-request failures and recovery', () => {
  it('D3 shows the API message and offers no download for 403, 404 and 500 alike', async () => {
    const cases: [number, string][] = [
      [403, 'No tiene permisos para ver el reporte de esta escuela'],
      [404, 'Escuela no encontrada'],
      [500, 'Error inesperado al obtener el reporte de horas'],
    ];
    for (const [status, message] of cases) {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status,
        json: async () => ({ error: message }),
      });
      render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);
      expect(await screen.findByText(ERROR_TITLE)).toBeInTheDocument();
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: CSV_BUTTON })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: PDF_BUTTON })).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('D3 reports a network error when the newest body is not JSON, and offers no download', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
    });
    render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);

    expect(await screen.findByText(NETWORK_ERROR)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CSV_BUTTON })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: PDF_BUTTON })).not.toBeInTheDocument();
  });

  it('D3 offers no download for null or programme-less data, and recovers on a valid school', async () => {
    const user = userEvent.setup();
    const empty = markedReport('a1', 100);
    empty.programs = [];
    const valid = markedReport('b0', 200);

    mockFetchOnce({ data: null });
    const { rerender } = render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);
    expect(await screen.findByText(EMPTY_STATE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CSV_BUTTON })).not.toBeInTheDocument();

    mockFetchOnce({ data: empty });
    rerender(<SchoolHoursReport schoolId={7} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1, name: String(empty.school_name) });
    expect(screen.getByText(EMPTY_STATE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: PDF_BUTTON })).not.toBeInTheDocument();

    mockFetchOnce({ data: valid });
    rerender(<SchoolHoursReport schoolId={9} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1, name: String(valid.school_name) });

    const fresh = valid.programs[0].contracts[0];
    expect(screen.queryByText(EMPTY_STATE)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: PDF_BUTTON }));
    expect(openedUrls).toEqual([pdfUrl(9, fresh.contrato_id)]);
    expect(csvRows(await downloadCsv(user)).every((r) => r.Contrato === fresh.numero_contrato)).toBe(true);
  });
});

describe('SM-09 D4 downloads at every stop of a switch cycle', () => {
  it('D4 keeps heading, selector, CSV and PDF in agreement through A → B → A', async () => {
    const user = userEvent.setup();
    const generations = [markedReport('a1', 100), markedReport('b0', 200), markedReport('a2', 300)];
    const schoolIds = [SCHOOL_ID, 7, SCHOOL_ID];
    const dateStr = new Date().toISOString().slice(0, 10);
    let rerender: (ui: React.ReactElement) => void = () => {};

    for (let step = 0; step < generations.length; step += 1) {
      const report = generations[step];
      const schoolId = schoolIds[step];
      mockFetchOnce({ data: report });
      if (step === 0) {
        ({ rerender } = render(<SchoolHoursReport schoolId={schoolId} isAdmin={false} />));
      } else {
        rerender(<SchoolHoursReport schoolId={schoolId} isAdmin={false} />);
      }
      await screen.findByRole('heading', { level: 1, name: String(report.school_name) });

      // The annex is chosen at the first stop, so the later stops also prove that the
      // choice did not survive the switch back to the same school id.
      if (step === 0) {
        await user.selectOptions(screen.getByLabelText('Contrato:'), report.programs[0].contracts[1].contrato_id);
      }
      const contract = report.programs[0].contracts[step === 0 ? 1 : 0];
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(contract.numero_contrato);
      expect(screen.getByLabelText('Contrato:')).toHaveValue(contract.contrato_id);

      openedUrls = [];
      capturedBlob = null;
      capturedFilename = null;
      await user.click(screen.getByRole('button', { name: PDF_BUTTON }));
      expect(openedUrls).toEqual([pdfUrl(schoolId, contract.contrato_id)]);

      const rows = csvRows(await downloadCsv(user));
      expect(rows[0]).toEqual(expectedRow({
        Programa: report.programs[0].programa_name,
        Contrato: contract.numero_contrato,
        'Tipo de fila': SUMMARY_ROW,
        [TYPE_COLUMN]: contract.is_annexo ? TYPE_ANNEX : TYPE_ORDINARY,
        'Horas contratadas': contract.total_contracted_hours.toFixed(1),
        'Horas consumidas': contract.total_consumed.toFixed(1),
        'Horas reservadas': contract.total_reserved.toFixed(1),
        'Horas disponibles': contract.total_available.toFixed(1),
      }));
      expect(rows.every((r) => r.Contrato === contract.numero_contrato)).toBe(true);
      expect(capturedFilename).toBe(`reporte-horas-${String(report.school_name).replace(/\s+/g, '_')}-${dateStr}.csv`);
      for (const other of generations) {
        if (other !== report) expectNoMarkers(capturedCsv, other);
      }
    }
  });
});

describe('SM-09 D5 copy and evidence hygiene across a switch cycle', () => {
  it('D5 keeps the es-CL copy and the seventeen columns, and reaches no other endpoint', async () => {
    const user = userEvent.setup();
    const a1 = markedReport('a1', 100);
    const a2 = markedReport('a2', 300);

    mockFetchOnce({ data: a1 });
    const { rerender } = render(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1, name: String(a1.school_name) });

    mockFetchOnce({ data: markedReport('b0', 200) });
    rerender(<SchoolHoursReport schoolId={7} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1, name: 'Escuela b0' });

    mockFetchOnce({ data: a2 });
    rerender(<SchoolHoursReport schoolId={SCHOOL_ID} isAdmin={false} />);
    await screen.findByRole('heading', { level: 1, name: String(a2.school_name) });

    const csv = await downloadCsv(user);
    expect(csvHeaderLine(csv)).toBe(CSV_HEADER);
    expect(csvHeaderLine(csv).split(',')).toHaveLength(17);
    expect(mockToast.success).toHaveBeenCalledWith('CSV descargado correctamente');
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(capturedFilename).toMatch(new RegExp('^reporte-horas-Escuela_a2-\\d{4}-\\d{2}-\\d{2}\\.csv$'));
    expect(csv).not.toContain('/api/');

    // The selector and both buttons keep the pre-existing strings; no error or empty copy.
    expect(screen.getByLabelText('Contrato:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: PDF_BUTTON })).toBeInTheDocument();
    expect(screen.queryByText(ERROR_TITLE)).not.toBeInTheDocument();

    // Every request went to this school report route and nowhere else.
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0])).toEqual([
      `/api/school-hours-report/${SCHOOL_ID}`,
      '/api/school-hours-report/7',
      `/api/school-hours-report/${SCHOOL_ID}`,
    ]);
    expectNoMarkers(document.body.textContent, a1);
  });
});
