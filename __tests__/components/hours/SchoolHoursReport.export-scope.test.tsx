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
import { render, screen, waitFor, within } from '@testing-library/react';
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
